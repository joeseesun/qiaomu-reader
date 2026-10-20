import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { groupByObject, groupByMap } from '../src/epub-grouping.js';
import { patchFoliateEpubGrouping } from '../scripts/foliate-elements.mjs';

test('EPUB object groups accept iterable metadata and safe property keys', () => {
  const symbol = Symbol('metadata');
  const keys = ['__proto__', 'constructor', symbol, '__proto__'];
  const groups = groupByObject(new Set(['a', 'b', 'c', 'd']), (_, index) => keys[index]);
  assert.equal(Object.getPrototypeOf(groups), null);
  assert.deepEqual(groups.__proto__, ['a', 'd']);
  assert.deepEqual(groups.constructor, ['b']);
  assert.deepEqual(groups[symbol], ['c']);
  assert.deepEqual(Object.keys(groupByObject([], () => 'empty')), []);
});

test('EPUB refinement groups retain null keys, identity and item order', () => {
  const key = {};
  const keys = [null, '#title', key, null, key];
  const groups = groupByMap(keys.values(), (item, index) => {
    assert.equal(item, keys[index]);
    return item;
  });
  assert.deepEqual([...groups.keys()], [null, '#title', key]);
  assert.deepEqual(groups.get(null), [null, null]);
  assert.deepEqual(groups.get(key), [key, key]);
  assert.equal(groupByMap([], () => null).size, 0);
});

test('EPUB grouping patch replaces all calls and rejects upstream drift', () => {
  const code = 'Object.groupBy(a, f); Map.groupBy(b, f); Object.groupBy(c, f);';
  const patched = patchFoliateEpubGrouping(code);
  assert.doesNotMatch(patched, /(?:Object|Map)\.groupBy\(/);
  assert.equal(patched.match(/groupByObject\(/g).length, 2);
  assert.throws(() => patchFoliateEpubGrouping('Object.groupBy(a, f)'), /no longer matches/);
  assert.throws(() => patchFoliateEpubGrouping('Map.groupBy(a, f)'), /no longer matches/);
});

test('changing EPUB compatibility helpers cannot reuse a retained renderer after reload', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qbr-epub-reload-'));
  try {
    for (const file of ['package-lock.json', 'scripts/foliate-elements.mjs', 'src/engine-frame.js', 'src/epub-grouping.js']) {
      fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(temp, file));
    }
    const { foliateElements } = await import(pathToFileURL(path.join(temp, 'scripts/foliate-elements.mjs')));
    const tag = () => foliateElements(temp).define.__QBR_ENGINE_VIEW_TAG__;
    const before = tag();
    assert.equal(tag(), before, 'identical builds reuse their renderer');
    fs.appendFileSync(path.join(temp, 'src/epub-grouping.js'), '\n// Updated metadata compatibility helper.\n');
    assert.notEqual(tag(), before, 'updated helpers get a fresh renderer');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
