import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { createPdfOcrQueue, parseOcrProgress, replacePdfAtomically, sameFileSnapshot, shouldAutoOcrPdf } from "../src/pdf-ocr.js";

test("automatic OCR targets scan-dominant PDFs only", () => {
  assert.equal(shouldAutoOcrPdf(["scan", "scan", "text"]), true);
  assert.equal(shouldAutoOcrPdf(["text", "text", "scan"]), false);
  assert.equal(shouldAutoOcrPdf(["text", "text"]), false);
  assert.equal(shouldAutoOcrPdf(["blank", "blank"]), false);
  assert.equal(shouldAutoOcrPdf([]), false);
});

test("OCR progress accepts OCRmyPDF percentage lines", () => {
  assert.equal(parseOcrProgress("OCR                   42%  21/50"), 42);
  assert.equal(parseOcrProgress("Rasterize              7.6%"), 8);
  assert.equal(parseOcrProgress("no progress here"), null);
});

test("source snapshot checks digest as well as metadata", () => {
  const before = { size: 100, mtimeMs: 1234, digest: "aaa" };
  assert.equal(sameFileSnapshot(before, { ...before }), true);
  assert.equal(sameFileSnapshot(before, { ...before, digest: "bbb" }), false);
});

test("OCR queue deduplicates paths, serializes files, and cancels", async () => {
  const starts = [], releases = new Map();
  const queue = createPdfOcrQueue(({ sourcePath, signal }) => new Promise((resolve, reject) => {
    starts.push(sourcePath);
    releases.set(sourcePath, resolve);
    signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { qiaomuReaderReason: "cancelled" })), { once: true });
  }));
  const first = queue.enqueue("a.pdf", { sourcePath: "a" });
  const duplicate = queue.enqueue("a.pdf", { sourcePath: "ignored" });
  const second = queue.enqueue("b.pdf", { sourcePath: "b" });
  assert.equal(first, duplicate);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, ["a"]);
  releases.get("a")("done");
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, ["a", "b"]);
  queue.cancel("b.pdf");
  await assert.rejects(second, /cancelled/);
  assert.equal(queue.has("b.pdf"), false);
});

test("failed validation and concurrent source changes never overwrite the PDF", async () => {
  globalThis.window = { process, setTimeout, clearTimeout };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qiaomu-ocr-test-"));
  const source = path.join(dir, "book.pdf"), prepared = path.join(dir, "ready.pdf");
  await fs.writeFile(source, "original"); await fs.writeFile(prepared, "recognized");
  const stat = await fs.stat(source);
  const before = { size: stat.size, mtimeMs: stat.mtimeMs, digest: crypto.createHash("sha256").update("original").digest("hex") };
  await assert.rejects(replacePdfAtomically(source, prepared, before, async () => { throw new Error("bad PDF"); }), /bad PDF/);
  assert.equal(await fs.readFile(source, "utf8"), "original");
  await fs.writeFile(source, "intruder");
  await assert.rejects(replacePdfAtomically(source, prepared, before, async () => ({ hasText: true })), /changed/);
  assert.equal(await fs.readFile(source, "utf8"), "intruder");
  await fs.rm(dir, { recursive: true, force: true });
});

test("validated replacement atomically installs the prepared bytes", async () => {
  globalThis.window = { process, setTimeout, clearTimeout };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qiaomu-ocr-test-"));
  const source = path.join(dir, "book.pdf"), prepared = path.join(dir, "ready.pdf");
  await fs.writeFile(source, "original"); await fs.writeFile(prepared, "recognized");
  const stat = await fs.stat(source);
  const before = { size: stat.size, mtimeMs: stat.mtimeMs, digest: crypto.createHash("sha256").update("original").digest("hex") };
  await replacePdfAtomically(source, prepared, before, async () => ({ hasText: true }));
  assert.equal(await fs.readFile(source, "utf8"), "recognized");
  assert.deepEqual((await fs.readdir(dir)).sort(), ["book.pdf", "ready.pdf"]);
  await fs.rm(dir, { recursive: true, force: true });
});
