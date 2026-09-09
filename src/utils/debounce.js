/**
 * Trailing-edge debounce.
 *
 * Returns a function that delays invoking `fn` until `delay` ms have elapsed
 * since the last call. Useful for search inputs that trigger expensive
 * downstream work (e.g. re-rendering a 3000-card grid).
 *
 * The returned function also exposes:
 *   - `.cancel()` — discard any pending invocation.
 *   - `.flush()`  — invoke any pending call immediately.
 */
export function debounce(fn, delay = 150) {
  let timer = null;

  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn();
    }
  };

  return debounced;
}