import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { probeCliAi } from '../src/ai-cli.js';

test('Codex login probe recognizes supported credentials and rejects unauthenticated states', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-cli-auth-'));
  const prior = globalThis.window;
  globalThis.window = { process, setTimeout, clearTimeout };
  t.after(() => {
    globalThis.window = prior;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const cases = [
    { name: 'API key configured on stdout', stdout: 'API key configured\n', ok: true },
    { name: 'API key configured on stderr', stderr: 'API key configured\n', ok: true },
    { name: 'case-insensitive API key status with ANSI colors', stderr: '\u001b[32mapi key configured\u001b[0m\n', ok: true },
    { name: 'ChatGPT login', stderr: 'Logged in using ChatGPT\n', ok: true },
    { name: 'legacy API key login', stderr: 'Logged in using an API key - test-key\n', ok: true },
    { name: 'not logged in despite successful exit', stderr: 'Not logged in\n', reason: 'cliauth' },
    { name: 'API key not configured', stdout: 'API key not configured\n', reason: 'cliauth' },
    { name: 'unrecognized status', stdout: 'Checking credentials\n', reason: 'cliauth' },
    { name: 'empty status', reason: 'cliauth' },
    { name: 'process failure cannot be overridden by API key status', stderr: 'API key configured\n', exitCode: 1 },
  ];
  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.name, async () => {
      const binaryPath = path.join(root, `codex-${index}`);
      fs.writeFileSync(binaryPath, `#!${process.execPath}
if (process.argv[2] === '--version') { console.log('codex 1.0'); }
else if (process.argv.slice(2).join(' ') === 'login status') {
  process.stdout.write(${JSON.stringify(fixture.stdout || '')});
  process.stderr.write(${JSON.stringify(fixture.stderr || '')});
  process.exitCode = ${fixture.exitCode || 0};
} else { process.exitCode = 2; }
`, { mode: 0o700 });
      if (fixture.ok) {
        const result = await probeCliAi('codex-cli', { binaryPath });
        assert.equal(result.loggedIn, true);
        assert.equal(result.binaryPath, binaryPath);
      } else {
        await assert.rejects(probeCliAi('codex-cli', { binaryPath }), error => {
          if (fixture.reason) assert.equal(error.qiaomuReaderReason, fixture.reason);
          if (fixture.exitCode) assert.equal(error.qiaomuReaderStatus, fixture.exitCode);
          return true;
        });
      }
    });
  }
});
