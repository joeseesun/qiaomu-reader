// The public discovery flow never depends on this opt-in service.
export const EBOOK_API = 'https://ebook-mcp.qiaomu.ai/reader/api';
const LOCAL_KEY = 'qiaomu-reader-ebook-access';
const MAX_BYTES = 32 * 1024 * 1024;
const FORMATS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'txt', 'fb2']);
export const ebookError = code => Object.assign(new Error(code), { code });
const jobId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
function safeCover(value) {
  if (!value || value.match !== 'work' || value.source !== 'Open Library'
    || typeof value.url !== 'string' || !/^https:\/\/covers\.openlibrary\.org\/b\/id\/[1-9]\d{0,9}-M\.jpg\?default=false$/.test(value.url)
    || typeof value.sourceUrl !== 'string' || !/^https:\/\/openlibrary\.org\/works\/OL\d+W$/.test(value.sourceUrl)) return null;
  return Object.freeze({ url: value.url, sourceUrl: value.sourceUrl, source: value.source, match: 'work' });
}
const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(ebookError('cancelled'));
  const abort = () => { window.clearTimeout(timer); reject(ebookError('cancelled')); };
  const timer = window.setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

export async function verifyEbook(bytes, result, cryptoApi = window.crypto) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : null;
  const format = String(result?.format || '').toLowerCase();
  const name = result?.filename;
  if (!buffer || !FORMATS.has(format) || typeof name !== 'string' || !name || name.length > 180 || /[/\\]/.test(name) || [...name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || !name.toLowerCase().endsWith('.' + format)
    || !Number.isInteger(result.bytes) || result.bytes !== buffer.byteLength || !result.bytes || result.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(result.sha256 || '')) throw ebookError('file');
  const data = new Uint8Array(buffer), head = new TextDecoder().decode(data.subarray(0, 256));
  if (format === 'epub' && (data[0] !== 80 || data[1] !== 75 || data[2] !== 3 || data[3] !== 4)
    || format === 'pdf' && !head.startsWith('%PDF-')
    || ['mobi', 'azw3'].includes(format) && new TextDecoder().decode(data.subarray(60, 68)) !== 'BOOKMOBI'
    || format === 'fb2' && !new TextDecoder().decode(data.subarray(0, 4096)).includes('<FictionBook')
    || /^\s*(<!doctype html|<html)/i.test(head)) throw ebookError('file');
  const sha = Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
  if (sha !== result.sha256) throw ebookError('file');
  return { name, type: 'application/octet-stream', arrayBuffer: async () => buffer };
}

export function createEbookLibrary(plugin, request, { cryptoApi = window.crypto, delay = pause, now = Date.now } = {}) {
  let disposed = false, access = null, refreshing = null, downloading = false;
  const aborters = new Set();
  const alive = signal => { if (disposed || plugin._unloading || signal?.aborted) throw ebookError('cancelled'); };
  // Obsidian's vault-specific local storage stays on this installation. Syncing
  // data.json must not clone an installation ID onto another user's computer.
  const local = () => {
    try {
      const value = plugin.app.loadLocalStorage(LOCAL_KEY);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { throw ebookError('save'); }
  };
  const save = next => {
    alive();
    try {
      plugin.app.saveLocalStorage(LOCAL_KEY, next);
      if (JSON.stringify(local()) !== JSON.stringify(next)) throw Error('readback');
    } catch { throw ebookError('save'); }
  };
  const storeTokens = value => {
    alive();
    if (typeof value?.accessToken !== 'string' || value.accessToken.length < 32 || typeof value.refreshToken !== 'string' || value.refreshToken.length < 32 || !Number.isFinite(value.expiresAt)) throw ebookError('service');
    const storage = plugin.app.secretStorage, state = local();
    if (!storage || !state.secretId) throw ebookError('save');
    const encoded = JSON.stringify({ refreshToken: value.refreshToken });
    try { storage.setSecret(state.secretId, encoded); if (storage.getSecret(state.secretId) !== encoded) throw Error('readback'); }
    catch { access = null; throw ebookError('save'); }
    access = { token: value.accessToken, expires: value.expiresAt * 1000 };
  };
  const raw = async (path, body, token, signal) => {
    alive(signal);
    let response;
    try { response = await request({ url: EBOOK_API + path, method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), throw: false }); }
    catch { alive(signal); throw ebookError('network'); }
    alive(signal);
    if (response.status < 200 || response.status >= 300) {
      let code;
      try { code = response.json?.error; } catch { /* Non-JSON upstream failures stay generic. */ }
      throw Object.assign(ebookError(typeof code === 'string' ? code : 'service'), { status: response.status });
    }
    return response;
  };
  const token = async signal => {
    alive(signal);
    if (access?.expires > now() + 30000) return access.token;
    if (!refreshing) refreshing = (async () => {
      const state = local(); let value;
      try { value = state.secretId && JSON.parse(plugin.app.secretStorage.getSecret(state.secretId) || 'null'); } catch { throw ebookError('save'); }
      if (!value?.refreshToken) throw ebookError('unauthorized');
      const response = await raw('/refresh', { refreshToken: value.refreshToken });
      storeTokens(response.json); return access.token;
    })().finally(() => { refreshing = null; });
    const value = await refreshing; alive(signal); return value;
  };
  const api = async (path, body, signal) => {
    let value = await token(signal);
    try { return await raw(path, body, value, signal); }
    catch (error) {
      if (error.status !== 401) throw error;
      if (access?.token === value) access = null;
      value = await token(signal); return raw(path, body, value, signal);
    }
  };
  const run = async (fn, signal) => {
    const controller = new AbortController(); aborters.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try { alive(controller.signal); return await fn(controller.signal); }
    finally { signal?.removeEventListener('abort', abort); aborters.delete(controller); }
  };
  const controller = {
    isActivated() {
      try { return !!local().secretId && !!plugin.app.secretStorage?.getSecret(local().secretId); }
      catch { throw ebookError('save'); }
    },
    async activate(code, signal) {
      return run(async activeSignal => {
        if (typeof code !== 'string' || !/^QM-[A-F0-9]{32}$/.test(code.trim().toUpperCase())) throw ebookError('invalid-code');
        let state = local();
        if (!state.installationId || !state.secretId) {
          state = { ...state, installationId: cryptoApi.randomUUID(), secretId: 'qme-' + cryptoApi.randomUUID() };
          save(state); // Save identity before redemption, so a retry never consumes another slot.
        }
        if (!plugin.app.secretStorage) throw ebookError('save');
        const response = await raw('/activate', { code: code.trim().toUpperCase(), installationId: state.installationId, deviceName: String(plugin.app.vault.getName()).slice(0, 60) }, null, activeSignal);
        storeTokens(response.json); return controller.profile(activeSignal);
      }, signal);
    },
    async profile(signal) { return (await api('/me', undefined, signal)).json; },
    async logout(signal) {
      try { await api('/logout', {}, signal); }
      catch (error) { if (![401, 403].includes(error.status)) throw error; }
      alive(signal);
      const state = local(); if (state.secretId) plugin.app.secretStorage.setSecret(state.secretId, '');
      access = null;
    },
    async search(query, signal) {
      const value = String(query || '').trim(); if (!value || value.length > 160) throw ebookError('invalid-query');
      const result = (await api('/search', { query: value }, signal)).json;
      if (!Array.isArray(result?.results)) throw ebookError('service');
      return result.results.filter(x => jobId(x.id) && typeof x.title === 'string' && FORMATS.has(x.format)).map(x => Object.freeze({ ...x }));
    },
    async covers(books, signal) {
      const ids = [...new Set((Array.isArray(books) ? books : []).map(book => book?.id).filter(jobId))];
      if (!ids.length) return [];
      if (ids.length > 20) throw ebookError('service');
      const result = (await api('/covers', { candidateIds: ids }, signal)).json;
      if (!Array.isArray(result?.results)) throw ebookError('service');
      const allowed = new Set(ids);
      return result.results.filter(book => allowed.has(book?.id)).map(book => Object.freeze({
        id: book.id, cover: safeCover(book.cover), pending: book.pending === true
      }));
    },
    async jobs(signal) {
      const response = (await api('/jobs', undefined, signal)).json;
      const imported = new Set(local().importedJobs || []);
      return (response?.jobs || []).filter(x => jobId(x.id) && !imported.has(x.id) && x.availableUntil * 1000 > now() && ['queued', 'running', 'complete'].includes(x.state));
    },
    async download(candidate, importer, progress, signal, resumeId) {
      if (downloading) throw ebookError('busy'); downloading = true;
      try { return await run(async activeSignal => {
        let job;
        if (resumeId) {
          if (!jobId(resumeId)) throw ebookError('file');
          job = (await api('/jobs/' + resumeId, undefined, activeSignal)).json;
        } else {
          if (!jobId(candidate?.id)) throw ebookError('search-expired');
          job = (await api('/jobs', { candidateId: candidate.id, requestId: cryptoApi.randomUUID() }, activeSignal)).json;
        }
        const deadline = now() + 210000;
        while (job.state === 'queued' || job.state === 'running') {
          progress?.(job.state); if (now() > deadline) throw ebookError('pending');
          await delay(1500, activeSignal);
          job = (await api('/jobs/' + job.id, undefined, activeSignal)).json;
        }
        if (!jobId(job.id) || job.state !== 'complete' || !job.result) throw ebookError(job.error || 'download-failed');
        if ((local().importedJobs || []).includes(job.id)) throw ebookError('already-imported');
        progress?.('running');
        const response = await api('/jobs/' + job.id + '/file', undefined, activeSignal);
        progress?.('verifying');
        const file = await verifyEbook(response.arrayBuffer, job.result, cryptoApi); alive(activeSignal);
        file.bookMetadata = { title: candidate?.title || '', author: candidate?.author || '' };
        progress?.('importing');
        const imported = await importer([file]);
        if (!imported) throw ebookError('import');
        // Record the receipt even if the modal closed while the vault import ran.
        alive(); save({ ...local(), importedJobs: [...new Set([...(local().importedJobs || []), job.id])].slice(-200) });
        return file.name;
      }, signal); } finally { downloading = false; }
    },
    dispose() { disposed = true; access = null; for (const aborter of aborters) aborter.abort(); aborters.clear(); }
  };
  return controller;
}
