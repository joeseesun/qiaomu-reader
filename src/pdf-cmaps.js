import { EMBEDDED_PDF_CMAPS } from "./pdf-cmaps-data.js";
import JSZip from "jszip";
import { EMBEDDED_PDF_WASM_ARCHIVE } from "./pdf-wasm-data.js";

let wasmArchivePromise = null;
async function embeddedWasm(filename) {
  if (!wasmArchivePromise) {
    wasmArchivePromise = JSZip.loadAsync(EMBEDDED_PDF_WASM_ARCHIVE, { base64: true }).catch((error) => {
      wasmArchivePromise = null;
      throw error;
    });
  }
  const file = (await wasmArchivePromise).file(filename);
  if (!file) throw new Error(`Embedded PDF resource is unavailable: ${filename}`);
  // Return fresh bytes: pdf.js may transfer the buffer to its worker.
  return file.async("uint8array");
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class EmbeddedPdfBinaryDataFactory {
  async fetch({ kind, filename }) {
    if (kind === "wasmUrl") return embeddedWasm(filename);
    const resources = kind === "cMapUrl" ? EMBEDDED_PDF_CMAPS : null;
    if (!resources) throw new Error(`Unsupported embedded PDF resource kind: ${kind}`);
    const encoded = resources[filename];
    if (!encoded) throw new Error(`Embedded PDF resource is unavailable: ${filename}`);
    return decodeBase64(encoded);
  }
}

export const PDF_CMAP_OPTIONS = Object.freeze({
  cMapUrl: "qiaomu-cmaps:///",
  cMapPacked: true,
  wasmUrl: "qiaomu-wasm:///",
  useWasm: true,
  useWorkerFetch: false,
  BinaryDataFactory: EmbeddedPdfBinaryDataFactory,
});
