import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../src/ai-account-modal.js', import.meta.url), 'utf8');
const Modal = vm.runInNewContext(source.slice(source.indexOf('export class AiAccountModal')).replace('export class', 'class') + '; AiAccountModal', {
  Modal: class { constructor(app) { this.app = app; } },
  crypto: webcrypto, AbortController, setAccountLanguage() {}, t: k => k,
});

function fixture(settings = {}) {
  const values = new Map([['legacy-secret', 'fixture-key']]);
  return { settings, app: { secretStorage: { getSecret: id => values.get(id) || '', setSecret: (id, value) => values.set(id, value) } }, _saveLocalData: async () => true };
}

test('managing the current legacy service keeps its shared secret and custom endpoint', () => {
  const plugin = fixture({ aiProvider: 'deepseek', aiSecret: 'legacy-secret', aiBase: 'https://proxy.example/v1' });
  const modal = new Modal(plugin, 'deepseek', { base: 'https://api.deepseek.com' });
  assert.equal(modal.secret, 'fixture-key');
  assert.equal(modal.secretId, 'legacy-secret');
  assert.equal(modal.base, 'https://proxy.example/v1');
});

test('adding another service never reuses the current service secret or endpoint', () => {
  const plugin = fixture({ aiProvider: 'deepseek', aiSecret: 'legacy-secret', aiBase: 'https://proxy.example/v1' });
  const modal = new Modal(plugin, 'openai', { base: 'https://api.openai.com/v1' });
  assert.equal(modal.secret, '');
  assert.notEqual(modal.secretId, 'legacy-secret');
  assert.equal(modal.base, 'https://api.openai.com/v1');
});

test('failed persistence restores the previous secret, service and model selection', async () => {
  const plugin = fixture({ aiProvider: 'deepseek', aiSecret: 'legacy-secret', aiModel: 'old-model' });
  plugin._saveLocalData = async () => false;
  const before = { ...plugin.settings };
  const modal = new Modal(plugin, 'deepseek', { base: 'https://api.deepseek.com', model: 'new-model' });
  modal.secret = 'new-fixture-key'; modal.models = [{ id: 'new-model' }]; modal.selected.add('new-model');
  await assert.rejects(modal.persist(), /saveFailed/);
  assert.deepEqual(plugin.settings, { ...before, aiModels: undefined, aiSecrets: undefined, aiBases: undefined, aiCatalogs: undefined, aiEnabled: undefined, aiNeedsVerification: undefined });
  assert.equal(plugin.app.secretStorage.getSecret('legacy-secret'), 'fixture-key');
});
