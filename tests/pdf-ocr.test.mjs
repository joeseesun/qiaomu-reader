import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createPdfOcrQueue, parseOcrProgress, pdfPixelsHaveInk, replacePdfAtomically, sameFileSnapshot, shouldAutoOcrPdf } from "../src/pdf-ocr.js";

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

function imageOnlyPdf(rgb, width, height) {
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgb.length} >>\nstream\n`), Buffer.from(rgb), Buffer.from("\nendstream")]),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1")], offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.concat(chunks).length); chunks.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")); });
  const xref = Buffer.concat(chunks).length;
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(chunks));
}

test("white image PDF stays blank while a real raster glyph page counts as content", async () => {
  const width = 32, height = 32;
  const white = new Uint8Array(width * height * 3).fill(255);
  const glyph = new Uint8Array(white);
  for (let y = 7; y < 26; y++) for (let x = 7; x < 11; x++) glyph.fill(0, (y * width + x) * 3, (y * width + x) * 3 + 3);
  for (const [bytes, expected] of [[imageOnlyPdf(white, width, height), false], [imageOnlyPdf(glyph, width, height), true]]) {
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    try {
      const page = await (await task.promise).getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      assert.equal(pdfPixelsHaveInk(canvas.getContext("2d").getImageData(0, 0, width, height).data), expected);
    } finally { await task.destroy(); }
  }
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

test("abort during delayed validation leaves the source untouched", async () => {
  globalThis.window = { process, setTimeout, clearTimeout };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qiaomu-ocr-test-"));
  const source = path.join(dir, "book.pdf"), prepared = path.join(dir, "ready.pdf");
  await fs.writeFile(source, "original"); await fs.writeFile(prepared, "recognized");
  const stat = await fs.stat(source);
  const before = { size: stat.size, mtimeMs: stat.mtimeMs, digest: crypto.createHash("sha256").update("original").digest("hex") };
  const controller = new AbortController();
  let finishValidation;
  const replacing = replacePdfAtomically(source, prepared, before, () => new Promise((resolve) => { finishValidation = resolve; }), controller.signal);
  while (!finishValidation) await new Promise((resolve) => setImmediate(resolve));
  controller.abort(); finishValidation({ hasText: true });
  await assert.rejects(replacing, /cancelled/);
  assert.equal(await fs.readFile(source, "utf8"), "original");
  await fs.rm(dir, { recursive: true, force: true });
});

test("shared OCR continues until its final view subscriber releases", async () => {
  let activeSignal;
  const queue = createPdfOcrQueue(({ signal }) => new Promise((resolve, reject) => {
    activeSignal = signal;
    signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { qiaomuReaderReason: "cancelled" })), { once: true });
  }));
  const first = queue.subscribe("shared.pdf", {});
  const second = queue.subscribe("shared.pdf", {});
  await new Promise((resolve) => setImmediate(resolve));
  first.release();
  assert.equal(activeSignal.aborted, false);
  second.release();
  assert.equal(activeSignal.aborted, true);
  await assert.rejects(first.promise, /cancelled/);
});
