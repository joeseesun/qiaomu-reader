import JSZip from 'jszip';
import { kindleError } from './kindle-config.js';
function webWorker(source) {
  const url = window.URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  try { return { worker: new window.Worker(url), release: () => window.URL.revokeObjectURL(url) }; }
  catch (error) { window.URL.revokeObjectURL(url); throw error; }
}
// The worker code is built from this repository and embedded in main.js.
// No executable downloads, package installation, remote content or file access.
export function createKindleConverter(archive = __KINDLE_CONVERTER_ARCHIVE__, { createWorker = webWorker } = {}) {
  let source;
  return async (bytes, { signal, timeout = 120000 } = {}) => {
    if (signal?.aborted) throw kindleError('cancelled');
    source ||= JSZip.loadAsync(archive, { base64: true }).then(zip => zip.file('kindle-converter.js').async('string'));
    const code = await source;
    if (signal?.aborted) throw kindleError('cancelled');
    return new Promise((resolve, reject) => {
      let instance;
      try { instance = createWorker(code); } catch { reject(kindleError('conversion')); return; }
      const { worker, release } = instance;
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        window.clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        worker.terminate(); release?.();
        if (error) reject(error); else resolve(value);
      };
      const cancel = () => finish(kindleError('cancelled'));
      const timer = window.setTimeout(() => finish(kindleError('conversion')), timeout);
      worker.onmessage = ({ data: result }) => {
        if (result.error) finish(kindleError(result.error));
        else if (!(result.bytes instanceof Uint8Array) || !result.bytes.length) finish(kindleError('conversion'));
        else finish(null, result);
      };
      worker.onerror = event => { event.preventDefault?.(); finish(kindleError('conversion')); };
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      const input = Uint8Array.from(bytes);
      try { worker.postMessage(input, [input.buffer]); } catch { finish(kindleError('conversion')); }
    });
  };
}
