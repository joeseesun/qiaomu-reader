import { convertKindleEpub } from './kindle-epub.js';
// Browser worker: no Node runtime, vault paths, credentials or document access.
self.onmessage = async event => {
  try {
    const result = await convertKindleEpub(event.data);
    self.postMessage(result, [result.bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: ['conversion-size','conversion-resource'].includes(error.code) ? error.code : 'conversion' });
  }
};
