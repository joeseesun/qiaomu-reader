import test from 'node:test';
import assert from 'node:assert/strict';
import { EdgeSpeechClient } from '../src/tts-edge-client.js';
const tick = () => new Promise(r => setImmediate(r));
function clock() { let time = 0; const delays = []; return { now: () => time, advance: n => { time += n; }, wait: async n => { delays.push(n); time += n; }, random: () => 0, delays }; }
test('Edge serializes simultaneous requests and spaces new handshakes', async () => {
  const t = clock(), calls = []; let release;
  const client = new EdgeSpeechClient(async text => { calls.push(text); if(text==='first')await new Promise(r=>{release=r;}); return text; }, t);
  const a=client.synthesize('first','voice'),b=client.synthesize('second','voice');await tick();
  assert.deepEqual(calls,['first']);release();assert.deepEqual(await Promise.all([a,b]),['first','second']);assert.deepEqual(t.delays,[1000]);
});
test('429 never retries automatically; server cooldown blocks subsequent new connections', async () => {
  const t=clock();let calls=0;
  const client=new EdgeSpeechClient(async()=>{calls++;throw {code:'http',status:429,retryAfterMs:7000};},t);
  await assert.rejects(client.synthesize('a','v'),{status:429,retryAt:7000});
  await assert.rejects(client.synthesize('b','v'),{status:429,retryAt:7000});assert.equal(calls,1);
  t.advance(7000);await assert.rejects(client.synthesize('c','v'),{status:429,retryAt:14000});assert.equal(calls,2);
});
test('transient errors back off twice and 403 retries only for a measured clock discrepancy', async () => {
  const t=clock();let calls=0;const offsets=[];
  const client=new EdgeSpeechClient(async(_text,_voice,opts)=>{offsets.push(opts.clockOffset);if(++calls===1)throw {status:403,serverTime:60000};return 'audio';},t);
  assert.equal(await client.synthesize('a','v'),'audio');assert.deepEqual(offsets,[0,60000]);
  calls=0;const failing=new EdgeSpeechClient(async()=>{calls++;throw {code:'network'};},t);
  await assert.rejects(failing.synthesize('a','v'),{code:'network'});assert.equal(calls,3);
  const forbidden=new EdgeSpeechClient(async()=>{throw {status:403,serverTime:t.now()};},t);
  await assert.rejects(forbidden.synthesize('a','v'),{status:403});assert.equal(forbidden.clockOffset,0);
});
test('queued cancellation resolves immediately and never opens a later socket', async () => {
  const t=clock(),calls=[];let release;
  const client=new EdgeSpeechClient(async text=>{calls.push(text);await new Promise(r=>{release=r;});},t);
  const a=client.synthesize('a','v');await tick();const abort=new AbortController();
  const b=client.synthesize('b','v',{signal:abort.signal});abort.abort();await assert.rejects(b,{name:'AbortError'});
  release();await a;await tick();assert.deepEqual(calls,['a']);
});
test('abort during a retry wait prevents further network attempts', async () => {
  globalThis.window=globalThis;
  let calls=0;const abort=new AbortController();
  const client=new EdgeSpeechClient(async()=>{calls++;throw {code:'network'};});
  const request=client.synthesize('a','v',{signal:abort.signal});await tick();abort.abort();
  await assert.rejects(request,{name:'AbortError'});await tick();assert.equal(calls,1);
});
