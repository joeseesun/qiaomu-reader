import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EmbeddedPdfBinaryDataFactory, PDF_CMAP_OPTIONS } from '../src/pdf-cmaps.js';

// Original one-page fixture: an eight-pixel black scan encoded as CCITT Group 3.
function ccittScan() {
  const image = String.fromCharCode(0x35, 0x14); // white run 0, black run 8
  const content = 'q 80 0 0 10 0 0 cm /Scan Do Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 80 10] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width 8 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K 0 /Columns 8 /Rows 1 /BlackIs1 true >> /Length 2 >>\nstream\n${image}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => { const offset = pdf.length; pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, c => c.charCodeAt(0));
}

test('embedded image/color decoders match the locked pdf.js resources', async () => {
  const factory = new EmbeddedPdfBinaryDataFactory();
  for (const filename of ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm']) {
    const bytes = await factory.fetch({ kind: 'wasmUrl', filename });
    assert.deepEqual(Buffer.from(bytes), fs.readFileSync(new URL(`../node_modules/pdfjs-dist/wasm/${filename}`, import.meta.url)));
    assert.equal(WebAssembly.validate(bytes), true);
  }
  await assert.rejects(factory.fetch({ kind: 'wasmUrl', filename: 'missing.wasm' }), /unavailable/);
  await assert.rejects(factory.fetch({ kind: 'font', filename: 'missing' }), /Unsupported/);
});

test('image-only CCITT PDF decodes offline without a text layer', async () => {
  const task = getDocument({ data: ccittScan(), ...PDF_CMAP_OPTIONS, isEvalSupported: false });
  try {
    const page = await (await task.promise).getPage(1);
    assert.equal((await page.getTextContent()).items.length, 0);
    const operators = await page.getOperatorList();
    const i = operators.fnArray.indexOf(OPS.paintImageXObject);
    assert.ok(i >= 0, 'the scan must survive decoding and reach the image painting operation');
    const image = await new Promise(resolve => page.objs.get(operators.argsArray[i][0], resolve));
    assert.equal(image.width, 8);
    assert.equal(image.height, 1);
    assert.ok(image.data || image.bitmap, 'decoded pixels must exist');
  } finally { await task.destroy(); }
});
