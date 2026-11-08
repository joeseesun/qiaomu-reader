import pako from "pako";

// Build-time compressed JSON only; no executable payload or external resources.
// Language and PDF CMap dictionaries share this codec. Keep decode buffers
// local so only the ordinary dictionaries remain resident.
export function decodePackedJson(payload) {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(pako.inflateRaw(bytes, { to: "string" }));
}

export function decodeTranslationData(payload) {
  const { keys, locales } = decodePackedJson(payload);
  const translations = {};
  for (const [id, values] of Object.entries(locales)) {
    const dictionary = translations[id] = {};
    for (let i = 0; i < keys.length; i++) {
      if (values[i] !== null) Object.defineProperty(dictionary, keys[i], { value: values[i], enumerable: true, writable: true, configurable: true });
    }
  }
  return translations;
}
