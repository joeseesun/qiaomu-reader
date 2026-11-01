import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { readingPrompts, renderPromptEditor } from '../src/ai-prompts.js';
const defaults = [{ id: 'explain', name: '解释', prompt: '解释原文' }];
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(value = null, save = async () => {}) {
  const { window } = new JSDOM('<main></main>');
  const host = window.document.querySelector('main');
  let closed = 0;
  renderPromptEditor(host, { value, defaults, translate: x => x, save, close: () => closed++ });
  const click = key => [...host.querySelectorAll('button')].find(el => el.textContent === key).click();
  const input = (selector, value) => {
    const field = host.querySelector(selector); field.value = value;
    field.dispatchEvent(new window.Event('input')); return field;
  };
  return { host, click, input, closed: () => closed };
}
test('saved custom prompts replace defaults; absent data follows language and empty lists stay empty', () => {
  assert.deepEqual(readingPrompts(undefined, defaults), defaults);
  assert.deepEqual(readingPrompts([], defaults), []);
  const custom = [{ id: 'own', name: '反驳', prompt: '寻找反例' }];
  assert.deepEqual(readingPrompts(custom, defaults), custom);
  assert.deepEqual(readingPrompts([null, {}, { name: '', prompt: 'x' }], defaults), []);
});
test('edit/add/delete/save preserves the full prompt and stable identity without changing source before save', async () => {
  const original = structuredClone(defaults); let saved;
  const x = setup(original, async value => { saved = value; });
  x.input('input', '反例'); x.input('textarea', '<script>只是原文</script>\n寻找反例');
  assert.deepEqual(original, defaults);
  assert.equal(x.host.querySelector('script'), null);
  x.click('add-prompt');
  assert.equal(x.host.ownerDocument.activeElement, x.host.querySelectorAll('input')[1]);
  x.host.querySelectorAll('.qiaomu-reader-prompt-item button')[1].click();
  x.click('save'); await tick();
  assert.deepEqual(saved, [{ id: 'explain', name: '反例', prompt: '<script>只是原文</script>\n寻找反例' }]);
  assert.equal(x.closed(), 1);
});
test('validation and failed persistence retain editable drafts; retry succeeds', async () => {
  let attempts = 0;
  const x = setup([], async () => { if (++attempts === 1) throw Error('disk'); });
  x.click('add-prompt'); x.click('save'); await tick();
  assert.equal(attempts, 0);
  assert.equal(x.host.querySelector('[role=alert]').textContent, 'enter-both-a-name-and-prompt-text');
  x.input('input', '我的问题'); x.input('textarea', '解释一下');
  x.click('save'); await tick();
  assert.equal(x.closed(), 0); assert.equal(x.host.querySelector('textarea').value, '解释一下');
  assert.equal(x.host.querySelector('textarea').disabled, false);
  assert.match(x.host.querySelector('[role=alert]').textContent, /saving-failed/);
  x.click('save'); await tick(); assert.equal(x.closed(), 1);
});
test('restore persists null for translated defaults, deletion persists empty, cancel never saves', async () => {
  let saved = 'unset'; const x = setup([], async value => { saved = value; });
  x.click('restore-defaults'); x.click('save'); await tick(); assert.equal(saved, null);
  const y = setup(null, async value => { saved = value; });
  y.click('delete'); y.click('save'); await tick(); assert.deepEqual(saved, []);
  const z = setup(null, async () => { throw Error('must not save'); });
  z.input('input', 'discard'); z.click('cancel'); assert.equal(z.closed(), 1);
});
test('twenty prompt limit prevents extra drafts and all fields have labels without hover tooltips', () => {
  const x = setup(Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, name: `${i}`, prompt: 'body' })));
  x.click('add-prompt'); assert.equal(x.host.querySelectorAll('input').length, 20);
  assert.ok([...x.host.querySelectorAll('input,textarea')].every(el => el.closest('label')));
  assert.equal(x.host.querySelector('[aria-label],[title]'), null);
});
test('chat buttons and slash menu resolve saved prompts instead of the fixed defaults', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function aiQuickPrompts(');
  const code = source.slice(start, source.indexOf('function normalizeAiChatHistory', start));
  const read = vm.runInNewContext(`${code}; aiQuickPrompts`, { readingPrompts, defaultAiQuickPrompts: () => defaults });
  assert.deepEqual(read({ aiQuickPrompts: [{ name: '深入思考', prompt: '分析隐含假设' }] })[0].prompt, '分析隐含假设');
  assert.match(source, /const items = aiQuickPrompts\(chat.plugin.settings\)/);
  assert.match(source, /matches = contextualAiQuickPrompts\(chat\)/);
});
