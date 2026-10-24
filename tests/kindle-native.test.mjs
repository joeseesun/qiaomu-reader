import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import { createKindleNative } from "../src/kindle-native.js";
import { kindleConnection, kindleDeliveryFormat, kindleMode } from "../src/kindle-config.js";

const fsp = fs.promises;
const native = createKindleNative({ fs, os, path, randomUUID, childProcess, env: process.env });
async function temporary(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "kindle-native-test-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return fsp.realpath(root);
}
test("legacy configurations retain KOReader, and native format planning never sends raw EPUB", () => {
  assert.equal(kindleMode(undefined), "koreader");
  assert.equal(kindleConnection({ host: "192.168.1.4", mode: "native" }).port, 2223);
  assert.equal(kindleConnection({ host: "192.168.1.4" }).port, 2222);
  assert.deepEqual(kindleDeliveryFormat("道德经.EPUB", "native"), { name: "道德经.azw3", convert: true });
  assert.equal(kindleDeliveryFormat("notes.pdf", "native").convert, false);
  assert.equal(kindleDeliveryFormat("comic.cbz", "koreader").convert, false);
  assert.throws(() => kindleDeliveryFormat("comic.cbz", "native"), { code: "native-format" });
});
test("native USB pairing works without KOReader and preserves unrelated keys and source settings", async t => {
  const root = await temporary(t);
  await fsp.mkdir(path.join(root, "qiaomu-kindle"));
  await fsp.writeFile(path.join(root, "qiaomu-kindle/receiver.json"), JSON.stringify({ protocol: 1, port: 2223, prepared: true }));
  const dir = path.join(root, "usbnetlite/etc/dropbear"); await fsp.mkdir(dir, { recursive: true });
  const other = "ssh-ed25519 AAAATEST someone-else\n";
  await fsp.writeFile(path.join(dir, "authorized_keys"), other);
  const key = "ecdsa-sha2-nistp256 AAAAFIXTURE qiaomu-reader";
  const result = await native.pairNative(root, key);
  assert.equal(result.installPending, true);
  await native.pairNative(root, key);
  const keys = await fsp.readFile(path.join(dir, "authorized_keys"), "utf8");
  assert.ok(keys.startsWith(other)); assert.equal(keys.split("AAAAFIXTURE").length, 2);
  const outside = await temporary(t);
  await fsp.unlink(path.join(dir, "authorized_keys"));
  await fsp.symlink(path.join(outside, "keys"), path.join(dir, "authorized_keys"));
  await assert.rejects(native.pairNative(root, key));
  assert.deepEqual(await fsp.readdir(outside), []);
});
test("native pairing rejects unrecognized receiver protocols before modifying keys", async t => {
  const root = await temporary(t);
  await fsp.mkdir(path.join(root, "qiaomu-kindle"));
  await fsp.writeFile(path.join(root, "qiaomu-kindle/receiver.json"), '{"protocol":999,"prepared":true,"port":2223}');
  await assert.rejects(native.pairNative(root, "ecdsa-sha2-nistp256 AAAATEST"), { code: "receiver" });
  assert.equal(fs.existsSync(path.join(root, "usbnetlite")), false);
});
test("native PDF delivery needs no converter, and source symlinks cannot escape the vault", async t => {
  const root = await temporary(t), outside = await temporary(t);
  const book = path.join(root, "中文.pdf"); await fsp.writeFile(book, "%PDF-1.7");
  const result = await native.prepareFile(book, "中文.pdf", { mode: "native", vaultRoot: root, converterPath: "/missing" });
  assert.equal(result.path, book); assert.equal(result.converted, undefined); await result.cleanup();
  const external = path.join(outside, "secret.epub"); await fsp.writeFile(external, "private");
  await fsp.symlink(external, path.join(root, "linked.epub"));
  await assert.rejects(native.prepareFile(path.join(root, "linked.epub"), "linked.epub", { mode: "native", vaultRoot: root }), { code: "file" });
});
test("EPUB conversion never uses a shell, preserves the source, and deletes its output on cleanup", async t => {
  const root = await temporary(t), book = path.join(root, "书 $(echo nope).epub");
  await fsp.writeFile(book, "original EPUB");
  let options, args;
  const fake = createKindleNative({ fs, os, path, randomUUID, env: {}, childProcess: { execFile: (_bin, argv, opts, callback) => {
    options = opts; args = argv;
    const output = Buffer.alloc(100); output.write("BOOKMOBI", 60);
    void fsp.writeFile(argv[1], output).then(() => callback(null));
  } } });
  const result = await fake.prepareFile(book, path.basename(book), { mode: "native", vaultRoot: root, converterPath: process.execPath });
  assert.equal(options.shell, false); assert.equal(args[0], book); assert.equal(result.converted, true);
  assert.equal(result.name, "书 $(echo nope).azw3");
  assert.equal(await fsp.readFile(book, "utf8"), "original EPUB");
  assert.ok(fs.existsSync(result.path)); await result.cleanup(); assert.equal(fs.existsSync(result.path), false);
});
test("bad or cancelled conversion never returns a file for sending and removes temporary output", async t => {
  const root = await temporary(t), book = path.join(root, "book.epub"); await fsp.writeFile(book, "book");
  let output;
  const fake = createKindleNative({ fs, os, path, randomUUID, env: {}, childProcess: { execFile: (_bin, args, _opts, callback) => {
    output = args[1]; void fsp.writeFile(output, "not a Kindle file").then(() => callback(null));
  } } });
  await assert.rejects(fake.prepareFile(book, "book.epub", { mode: "native", vaultRoot: root, converterPath: process.execPath }), { code: "conversion" });
  assert.equal(fs.existsSync(path.dirname(output)), false);
  const aborter = new AbortController(); aborter.abort();
  await assert.rejects(native.prepareFile(book, "book.epub", { mode: "native", vaultRoot: root, signal: aborter.signal }), { code: "cancelled" });
  await assert.rejects(native.prepareFile(book, "book.epub", { mode: "native", vaultRoot: root, converterPath: "/missing/ebook-convert" }), { code: "converter-missing" });
});
