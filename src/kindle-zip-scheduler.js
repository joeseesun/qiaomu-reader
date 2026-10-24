// Modern worker timers only; no legacy DOM/script scheduling in the bundle.
function schedule(callback, ...args) {
  if (typeof callback !== 'function') throw new TypeError('Expected a callback');
  return self.setTimeout(callback, 0, ...args);
}
if (typeof self.setImmediate !== 'function') {
  self.setImmediate = schedule;
  self.clearImmediate = id => self.clearTimeout(id);
}
export default schedule;
