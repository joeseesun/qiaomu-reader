import test from 'node:test';
import assert from 'node:assert/strict';
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
