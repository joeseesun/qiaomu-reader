import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cliPathCandidates, acpPathCandidates, isNodeEntrypoint, resolveCliPath, resolveAcpPath, probeCliAcp, runCliAi, disposeCliAiSessions } from '../src/ai-cli.js';

test('all providers discover nvm versions with a GUI PATH, in numeric version order', () => {
  const fsApi = { readdirSync: () => ['v9.0.0', 'v24.9.0', 'v24.21.0', 'junk'].map(name => ({ name, isDirectory: () => true })) };
  const options = { home: '/home/test', envPath: '/usr/bin', fsApi, platform: 'linux', pathApi: path };
  for (const id of ['codex-cli', 'claude-cli', 'grok-cli', 'kimi-cli', 'zcode-cli']) {
    for (const get of [cliPathCandidates, acpPathCandidates]) {
      const nvm = get(id, options).filter(file => file.includes('/.nvm/'));
      assert.equal(nvm.length, 3);
      assert.match(nvm[0], /v24\.21\.0/); assert.match(nvm[2], /v9\.0\.0/);
    }
  }
});

test('npm adapter shims launch with sibling Node and stream with a GUI PATH', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-gui-path-'));
  const cli = path.join(root, 'codex'), adapter = path.join(root, 'codex-acp');
  const codexHome = path.join(root, 'codex-home');
  fs.mkdirSync(codexHome);
  fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'test-key' }), { mode: 0o600 });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), 'model_provider = "OpenAI"\n[model_providers.OpenAI]\nbase_url = "https://gateway.test"\n');
  fs.symlinkSync(process.execPath, path.join(root, 'node'));
  fs.writeFileSync(cli, '#!/usr/bin/env node\nconsole.log("codex 1.0");', { mode: 0o700 });
  fs.writeFileSync(adapter, `#!/usr/bin/env node
const readline = require('node:readline');
readline.createInterface({input: process.stdin}).on('line', line => {
 const m=JSON.parse(line); const send=o=>console.log(JSON.stringify(o));
 if(m.method==='initialize') {
  const config = require('node:fs').readFileSync(require('node:path').join(process.env.CODEX_HOME, 'config.toml'), 'utf8');
  if(process.env.OPENAI_API_KEY !== 'test-key' || !config.includes('https://gateway.test')) { send({id:m.id,error:{code:-32000,message:'Authentication required'}}); return; }
  send({id:m.id,result:{protocolVersion:1}});
 }
 if(m.method==='session/new')send({id:m.id,result:{sessionId:'test'}});
 if(m.method==='session/set_mode')send({id:m.id,result:{}});
 if(m.method==='session/prompt'){
  send({method:'session/update',params:{sessionId:'test',update:{sessionUpdate:'agent_message_chunk',content:{text:'CONNECTED'}}}});
  send({id:m.id,result:{stopReason:'end_turn'}});
 }
});`, { mode: 0o700 });
  const prior = globalThis.window;
  globalThis.window = { process: { platform: process.platform, env: { PATH: '/usr/bin:/bin', HOME: root, CODEX_HOME: codexHome }, getBuiltinModule: process.getBuiltinModule }, setTimeout, clearTimeout };
  try {
    assert.equal(isNodeEntrypoint(adapter, fs), true);
    assert.equal(isNodeEntrypoint(process.execPath, fs), false);
    assert.equal(await resolveCliPath('codex-cli', cli), cli);
    assert.equal(await resolveAcpPath('codex-cli', adapter), adapter);
    const probe = await probeCliAcp('codex-cli', { binaryPath: cli, acpPath: adapter });
    assert.equal(probe.sessionId, 'test');
    const answer = await runCliAi('codex-cli', { binaryPath: cli, acpPath: adapter, sessionKey: 'chat', messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(answer.answer, 'CONNECTED');
  } finally {
    disposeCliAiSessions(); globalThis.window = prior; fs.rmSync(root, { recursive: true, force: true });
  }
});
