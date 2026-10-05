// Foliate metadata grouping for older WebKit. Keep the helpers local to the
// bundled EPUB loader instead of adding globals shared with other plugins.
export function groupByObject(items, keyFor) {
  const groups = Object.create(null);
  let index = 0;
  for (const item of items) {
    const key = keyFor(item, index++);
    (groups[key] ??= []).push(item);
  }
  return groups;
}

export function groupByMap(items, keyFor) {
  const groups = new Map();
  let index = 0;
  for (const item of items) {
    const key = keyFor(item, index++);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
