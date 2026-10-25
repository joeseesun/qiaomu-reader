import { bookDigest } from './library-data.js';

export async function compactThumbnail(source, document) {
  const view = document.defaultView;
  const image = document.createElement('img');
  const objectUrl = source instanceof view.Blob ? view.URL.createObjectURL(source) : null;
  image.src = objectUrl || source;
  let timer;
  try {
    await Promise.race([image.decode(), new Promise((_, reject) => { timer = view.setTimeout(() => reject(new Error('cover-decode-timeout')), 5000); })]);
    const scale = Math.min(1, 240 / image.naturalWidth, 360 / image.naturalHeight);
    if (!Number.isFinite(scale) || !image.naturalWidth || !image.naturalHeight) throw new Error('invalid-cover');
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff';ctx.fillRect(0, 0, canvas.width, canvas.height);ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .78));
    canvas.width = canvas.height = 0;
    if (!blob || blob.size > 100000) throw new Error('cover-thumbnail-too-large');
    return blob.arrayBuffer();
  } finally { view.clearTimeout(timer); if (objectUrl) view.URL.revokeObjectURL(objectUrl); image.src = ''; }
}

// Deterministic per-book files need no monolithic JSON index. The versioned key
// invalidates changed books and permits concurrent writes to different covers.
export class ThumbnailStore {
  constructor(adapter, root, encode, cryptoApi = crypto) {
    this.adapter = adapter; this.root = root; this.encode = encode; this.cryptoApi = cryptoApi; this.pending = new Map(); this.closed = false; this.epoch = 0;
  }
  async path(file) {
    const key = await bookDigest(new TextEncoder().encode(JSON.stringify([file.path, file.stat?.mtime || 0, file.stat?.size || 0])), this.cryptoApi);
    return this.root + '/' + key + '.jpg';
  }
  async get(file) {
    const path = await this.path(file);
    return !this.closed && await this.adapter.exists(path) ? this.adapter.getResourcePath(path) : null;
  }
  async put(file, source) {
    const path = await this.path(file), epoch = this.epoch;
    if (this.closed) return null;
    if (!this.pending.has(path)) {
      const work = (async () => {
        const bytes = await this.encode(source);
        if (this.closed || this.epoch !== epoch) return null;
        if (!await this.adapter.exists(this.root)) {
          try { await this.adapter.mkdir(this.root); } catch (error) { if (!await this.adapter.exists(this.root)) throw error; }
        }
        if (this.closed || this.epoch !== epoch) return null;
        await this.adapter.writeBinary(path, bytes);
        return this.adapter.getResourcePath(path);
      })();
      this.pending.set(path, work);
      void work.finally(() => { if (this.pending.get(path) === work) this.pending.delete(path); }).catch(() => {});
    }
    return this.pending.get(path);
  }
  async clear() {
    this.epoch++;
    await Promise.allSettled([...this.pending.values()]);
    if (await this.adapter.exists(this.root)) await this.adapter.rmdir(this.root, true);
  }
  close() { this.closed = true; this.epoch++; }
}
