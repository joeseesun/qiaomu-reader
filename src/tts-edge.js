// Protocol interoperability based on rany2/edge-tts (LGPL-3.0).
// Attribution and license: licenses/edge-tts-LGPL.txt. Loaded on desktop only.
import WebSocket from 'ws';
import { checkTtsSignal, escapeSpeechXml, ttsError } from './tts-providers.js';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export async function synthesizeEdge(text, voice, { signal, crypto = window.crypto, Socket = WebSocket, clockOffset = 0 } = {}) {
  checkTtsSignal(signal);
  const ticks = (Math.floor(((Date.now() + clockOffset) / 1000 + 11644473600) / 300) * 300 * 10000000).toFixed(0);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ticks}${TOKEN}`));
  const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  checkTtsSignal(signal);
  const id = crypto.randomUUID().replace(/-/g, '');
  // Microsoft moved Read Aloud to this host. Protocol facts verified against
  // Readest PR #6722 (2026-10-11); no Readest implementation is bundled.
  const url = `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${TOKEN}&ConnectionId=${id}&Sec-MS-GEC=${hash}&Sec-MS-GEC-Version=1-143.0.3650.75`;
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let settled = false;
    const ws = new Socket(url, { handshakeTimeout: 10000, maxPayload: 4 * 1024 * 1024, headers: {
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      Cookie: `muid=${crypto.randomUUID().replace(/-/g, '').toUpperCase()};`,
    } });
    const finish = (error) => {
      if (settled) return; settled = true;
      window.clearTimeout(timer); signal?.removeEventListener('abort', abort);
      ws.terminate();
      if (error) { reject(error); return; }
      if (!size) { reject(ttsError('empty')); return; }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resolve({ bytes, mime: 'audio/mpeg' });
    };
    const abort = () => finish(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
    const timer = window.setTimeout(() => finish(ttsError('timeout')), 30000);
    signal?.addEventListener('abort', abort, { once: true });
    ws.on('error', () => finish(ttsError('network')));
    ws.on('unexpected-response', (_req, res) => {
      const error = ttsError('http', res.statusCode);
      const serverTime = Date.parse(res.headers?.date || '');
      if (Number.isFinite(serverTime)) error.serverTime = serverTime;
      const retry = res.headers?.['retry-after'];
      if (typeof retry === 'string' && retry.trim()) {
        const seconds = Number(retry), date = Date.parse(retry);
        const ms = Number.isFinite(seconds) ? seconds * 1000 : date - (Number.isFinite(serverTime) ? serverTime : Date.now());
        if (Number.isFinite(ms)) error.retryAfterMs = Math.max(0, ms);
      }
      res.resume(); finish(error);
    });
    ws.on('close', () => finish(ttsError('network')));
    ws.on('open', () => {
      if (settled) return;
      const stamp = new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (.*) GMT$/, '$1 $3 $2 $4 $5 GMT+0000 (Coordinated Universal Time)');
      ws.send(`X-Timestamp:${stamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'true', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })}`);
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${escapeSpeechXml(voice)}"><prosody pitch="+0Hz" rate="+0%" volume="+0%">${escapeSpeechXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${stamp}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });
    ws.on('message', (data, binary) => {
      if (settled) return;
      if (!binary) { if (data.toString().includes('Path:turn.end')) finish(); return; }
      const bytes = new Uint8Array(data);
      if (bytes.length < 2) { finish(ttsError('response')); return; }
      const headerLength = (bytes[0] << 8) | bytes[1];
      if (headerLength + 2 > bytes.length) { finish(ttsError('response')); return; }
      const header = new TextDecoder().decode(bytes.subarray(2, headerLength + 2));
      if (!header.includes('Path:audio')) { finish(ttsError('response')); return; }
      const payload = bytes.slice(headerLength + 2);
      size += payload.length;
      if (size > 8 * 1024 * 1024) { finish(ttsError('response')); return; }
      chunks.push(payload);
    });
  });
}
