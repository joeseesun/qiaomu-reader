import { checkTtsSignal, ttsError } from './tts-providers.js';

function cancelled() { return Object.assign(new Error('Cancelled'), { name: 'AbortError' }); }
function waitFor(ms, signal) {
  checkTtsSignal(signal);
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = window.setTimeout(done, ms);
    const abort = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(cancelled()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
// One lane for playback, lookahead and audition. A server cooldown survives
// closing/reopening the player; this class never switches identities/endpoints.
export class EdgeSpeechClient {
  constructor(request, { now = Date.now, wait = waitFor, random = Math.random } = {}) {
    Object.assign(this, { request, now, wait, random });
    this.tail = Promise.resolve(); this.nextAt = 0; this.cooldownUntil = 0; this.clockOffset = 0;
  }
  synthesize(text, voice, { signal } = {}) {
    checkTtsSignal(signal);
    const task = this.tail.then(() => this.run(text, voice, signal));
    this.tail = task.catch(() => {});
    return new Promise((resolve, reject) => {
      const abort = () => { signal?.removeEventListener('abort', abort); reject(cancelled()); };
      signal?.addEventListener('abort', abort, { once: true });
      task.then(value => { signal?.removeEventListener('abort', abort); resolve(value); }, error => { signal?.removeEventListener('abort', abort); reject(error); });
    });
  }
  async run(text, voice, signal) {
    let corrected = false, retries = 0;
    for (;;) {
      checkTtsSignal(signal);
      if (this.cooldownUntil > this.now()) throw Object.assign(ttsError('http', 429), { retryAt: this.cooldownUntil });
      const delay = this.nextAt - this.now();
      if (delay > 0) await this.wait(delay, signal);
      checkTtsSignal(signal);
      this.nextAt = this.now() + 1000;
      try { return await this.request(text, voice, { signal, clockOffset: this.clockOffset }); }
      catch (error) {
        checkTtsSignal(signal);
        if (error.status === 429) {
          // Honor Retry-After; without one, choose a conservative local five
          // minute cooldown. This is our policy, not a Microsoft SLA.
          const duration = Number.isFinite(error.retryAfterMs) ? Math.max(1000, error.retryAfterMs) : 300000;
          this.cooldownUntil = this.now() + duration;
          throw Object.assign(error, { retryAt: this.cooldownUntil });
        }
        if (error.status === 403 && !corrected && Number.isFinite(error.serverTime)) {
          const offset = error.serverTime - this.now();
          if (Math.abs(offset - this.clockOffset) >= 5000) {
            this.clockOffset = offset; corrected = true; continue;
          }
        }
        const transient = error.code === 'network' || [500, 502, 503, 504].includes(error.status);
        if (!transient || retries >= 2) throw error;
        const backoff = 1500 * (2 ** retries++) + Math.floor(this.random() * 500);
        await this.wait(backoff, signal);
      }
    }
  }
}
