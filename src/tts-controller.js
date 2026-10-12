import { SpeechCache, checkTtsSignal, ttsError } from './tts-providers.js';

export class TtsController {
  constructor({ synthesize, makeAudio, speech, makeUtterance, onChange = () => {} }) {
    Object.assign(this, { synthesize, makeAudio, speech, makeUtterance, onChange });
    this.cache = new SpeechCache(); this.pending = new Map(); this.generation = 0;
    this.state = 'idle'; this.index = 0; this.rate = 1; this.items = [];
  }
  emit() { this.onChange(this); }
  releasePlayer() {
    if (this.audio) { this.audio.onended = this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    if (this.utterance) { this.utterance.onend = this.utterance.onerror = null; this.speech?.cancel(); this.utterance = null; }
  }
  stop(owner) {
    if (owner && this.owner !== owner) return;
    ++this.generation; this.abort?.abort(); this.releasePlayer(); this.pending.clear();
    this.owner?.clearHighlight?.(); this.owner = null; this.items = []; this.nextSection = null;
    this.state = 'idle'; this.error = null; this.paused = false; this.deferred = false; this.emit();
  }
  start(owner, items, profile, { nextSection, index = 0, rate = 1, paused = false } = {}) {
    this.stop(); this.owner = owner; this.items = items; this.profile = { ...profile };
    this.nextSection = nextSection; this.index = Math.max(0, Math.min(index, items.length - 1));
    this.rate = Math.min(2, Math.max(0.5, rate));
    this.abort = new AbortController(); this.paused = paused; this.deferred = paused;
    this.state = paused ? 'paused' : 'loading';
    if (paused) this.emit(); else void this.playCurrent(this.generation);
  }
  async load(item, signal) {
    checkTtsSignal(signal);
    const { key: _key, ...publicProfile } = this.profile;
    const key = JSON.stringify([publicProfile, item.text]);
    const cached = this.cache.get(key); if (cached) return cached;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.synthesize(this.profile, item.text, signal).then(value => {
      checkTtsSignal(signal); this.cache.set(key, value); return value;
    });
    this.pending.set(key, promise);
    try { return await promise; } finally { if (this.pending.get(key) === promise) this.pending.delete(key); }
  }
  async playCurrent(generation) {
    if (generation !== this.generation) return;
    this.releasePlayer(); this.error = null;
    const item = this.items[this.index];
    if (!item) { this.owner?.clearHighlight?.(); this.state = 'ended'; this.emit(); return; }
    this.state = this.paused ? 'paused' : 'loading'; this.emit();
    try {
      const signal = this.abort.signal;
      if (this.profile.id === 'system') {
        if (!this.speech || !this.makeUtterance) throw ttsError('system');
        const utterance = this.makeUtterance(item.text);
        const voices = this.speech.getVoices();
        const voice = this.profile.voice ? voices.find(v => v.voiceURI === this.profile.voice) : null;
        if (this.profile.voice && !voice) throw ttsError('voice');
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || (/[\u3400-\u9fff]/u.test(item.text) ? 'zh-CN' : 'en-US');
        utterance.rate = this.rate;
        utterance.onend = () => { if (generation === this.generation) void this.advance(generation); };
        utterance.onerror = () => this.fail(ttsError('system'), generation);
        this.utterance = utterance;
        if (!this.paused) { this.speech.speak(utterance); this.utteranceStarted = true; }
        else this.utteranceStarted = false;
      } else {
        const result = await this.load(item, signal);
        if (generation !== this.generation) return;
        this.url = URL.createObjectURL(new Blob([result.bytes], { type: result.mime }));
        const audio = this.audio = this.makeAudio();
        audio.src = this.url; audio.playbackRate = this.rate;
        audio.onended = () => { if (generation === this.generation) void this.advance(generation); };
        audio.onerror = () => this.fail(ttsError('playback'), generation);
        if (!this.paused) await audio.play();
        if (generation !== this.generation) return;
      }
      this.state = this.paused ? 'paused' : 'playing';
      this.owner?.onSegment?.(item, this.index); this.emit();
      // At most one segment ahead. An unsuccessful speculative request never
      // skips text or disrupts the current segment; it is retried on demand.
      if (!this.paused && this.profile.id !== 'system' && this.items[this.index + 1]) {
        void this.load(this.items[this.index + 1], signal).catch(() => {});
      }
    } catch (error) { this.fail(error, generation); }
  }
  fail(error, generation) {
    if (generation !== this.generation || error?.name === 'AbortError') return;
    this.releasePlayer(); this.abort?.abort(); this.state = 'error'; this.error = error;
    this.owner?.clearHighlight?.(); this.emit();
  }
  async advance(generation) {
    if (generation !== this.generation) return;
    this.index++;
    if (this.index >= this.items.length && this.nextSection) {
      this.state = 'loading'; this.emit();
      try {
        const items = await this.nextSection(this.abort.signal);
        if (generation !== this.generation) return;
        this.items = items || []; this.index = 0;
      } catch (error) { this.fail(error, generation); return; }
    }
    await this.playCurrent(generation);
  }
  toggle() {
    if (this.deferred) { this.deferred = false; this.paused = false; void this.playCurrent(this.generation); return; }
    if (this.state === 'error' || this.state === 'ended') { this.retry(); return; }
    this.paused = !this.paused;
    if (this.paused) { this.audio?.pause(); if (this.utteranceStarted) this.speech?.pause(); this.state = 'paused'; }
    else {
      const generation = this.generation;
      if (this.audio) void this.audio.play().catch(() => this.fail(ttsError('playback'), generation));
      if (this.utterance) { if (this.utteranceStarted) this.speech.resume(); else { this.speech.speak(this.utterance); this.utteranceStarted = true; } }
      this.state = this.audio || this.utterance ? 'playing' : 'loading';
    }
    this.emit();
  }
  retry() {
    ++this.generation; this.abort?.abort(); this.pending.clear(); this.abort = new AbortController();
    this.paused = false; this.deferred = false; this.index = Math.min(this.index, Math.max(0, this.items.length - 1));
    void this.playCurrent(this.generation);
  }
  skip(delta) {
    const index = Math.max(0, Math.min(this.items.length - 1, this.index + delta));
    if (index === this.index) return;
    this.index = index; this.retry();
  }
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, Number(rate) || 1));
    if (this.audio) this.audio.playbackRate = this.rate;
    // Web Speech cannot reliably change an active utterance's rate. Apply to
    // the next utterance without restarting and repeating the current text.
    this.emit();
  }
  dispose() { this.stop(); this.cache.clear(); }
}
