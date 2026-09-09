/**
 * Unit tests for toast rendering — specifically the XSS regression for the
 * high-severity Bug #1 fix.
 *
 * Run with: node --test test/test-toast.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM shim sufficient for toast.js.
// Store a single shared container so toast.js appends into it across calls
// (getElementById returns the SAME instance, instead of fresh per call).
const sharedContainer = (() => {
  const children = [];
  return {
    children,
    appendChild(c) { children.push(c); return c; },
    getElementById(_id) { return null; },
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    }
  };
})();

function makeEl() {
  const el = {
    children: [],
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    _textContent: '',
    _innerHTML: '',
    set textContent(v) { this._textContent = v; this.children = []; },
    get textContent() { return this._textContent; },
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
    appendChild(c) { this.children.push(c); return c; },
    append(...args) { for (const a of args) this.children.push(a); },
    remove() {}
  };
  return el;
}

globalThis.document = {
  getElementById(id) { return id === 'toast-container' ? sharedContainer : null; },
  createElement(_tag) { return makeEl(); },
  createTextNode(text) { return { textContent: text }; }
};
globalThis.requestAnimationFrame = (cb) => setImmediate(cb);
globalThis.setTimeout = setTimeout;

const { showToast } = await import('../src/ui/toast.js');

test('toast: renders textContent (no innerHTML interpolation of message)', () => {
  showToast('<img src=x onerror=alert(1)>', 'success');
  const toast = sharedContainer.children[sharedContainer.children.length - 1];
  // The toast itself never has innerHTML set; only the text node children get textContent.
  // If the buggy code path were used, toast.innerHTML would be a non-empty string.
  assert.ok(!toast.innerHTML || toast.innerHTML === '', 'toast.innerHTML should not be set');
});

test('toast: icon uses textContent (no raw HTML interpolation)', () => {
  showToast('hi', 'success');
  const toast = sharedContainer.children[sharedContainer.children.length - 1];
  const [icon, , text] = toast.children;
  assert.equal(icon.textContent, '\u2713');
  assert.equal(text.textContent, 'hi');
});

test('toast: error type uses error icon', () => {
  showToast('oops', 'error');
  const toast = sharedContainer.children[sharedContainer.children.length - 1];
  const [icon] = toast.children;
  assert.equal(icon.textContent, '\u2715');
});

test('toast: null/undefined message is treated as empty string', () => {
  showToast(null, 'info');
  const toast = sharedContainer.children[sharedContainer.children.length - 1];
  const [, , text] = toast.children;
  assert.equal(text.textContent, '');
});