/**
 * Unit tests for cloak pure helpers.
 *
 * Run with: node --test test/test-cloak.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stripScripts,
  injectBaseTag,
  estimateDataUrlSize,
  shouldUseBlob,
  MAX_DATA_URL_BYTES
} from '../src/services/cloakPure.js';

// ───────────────────────── stripScripts ─────────────────────────
test('stripScripts: removes inline <script> blocks', () => {
  const html = `<html><head><script>alert(1)</script></head><body>x</body></html>`;
  const out = stripScripts(html);
  assert.ok(!/<script/i.test(out), 'script tag still present');
  assert.ok(!out.includes('alert(1)'), 'script body still present');
  assert.ok(out.includes('<!-- script stripped for cloaked tab -->'), 'replacement comment missing');
});

test('stripScripts: removes module scripts with attributes', () => {
  const html = `<script type="module" src="/main.js"></script><body></body>`;
  const out = stripScripts(html);
  assert.ok(!/<script/i.test(out));
});

test('stripScripts: tolerates multiple scripts', () => {
  const html = `<script>a</script>middle<script>b</script>end`;
  const out = stripScripts(html);
  assert.ok(!/<script/i.test(out));
  assert.ok(out.includes('middle'));
  assert.ok(out.includes('end'));
});

test('stripScripts: leaves <noscript> alone', () => {
  const html = `<noscript>fallback</noscript>`;
  const out = stripScripts(html);
  assert.equal(out, html);
});

test('stripScripts: returns input unchanged when there are no scripts', () => {
  const html = `<html><body>x</body></html>`;
  assert.equal(stripScripts(html), html);
});

// ───────────────────────── injectBaseTag ─────────────────────────
test('injectBaseTag: appends to existing <head>', () => {
  const html = `<html><head><title>x</title></head><body></body></html>`;
  const out = injectBaseTag(html, 'https://example.com/app/');
  // The base tag is inserted immediately after the <head> opening tag, so
  // it appears BEFORE the existing <title>.
  assert.ok(out.includes('<head><base href="https://example.com/app/"><title>x</title>'));
});

test('injectBaseTag: wraps in synthetic <head> when only <html> exists', () => {
  const html = `<html><body>x</body></html>`;
  const out = injectBaseTag(html, 'https://example.com/');
  assert.ok(out.includes('<head><base href="https://example.com/"></head>'));
});

test('injectBaseTag: prepends when no <html> at all', () => {
  const html = `just a fragment`;
  const out = injectBaseTag(html, 'https://example.com/');
  assert.ok(out.startsWith('<base href="https://example.com/">'));
});

// ───────────────────────── estimateDataUrlSize / shouldUseBlob ─────────────────────────
test('estimateDataUrlSize: returns html.length * 3', () => {
  assert.equal(estimateDataUrlSize('hello'), 15);
});

test('shouldUseBlob: small input returns false', () => {
  assert.equal(shouldUseBlob('<html></html>'), false);
});

test('shouldUseBlob: large input returns true', () => {
  const huge = 'x'.repeat(MAX_DATA_URL_BYTES);
  assert.equal(shouldUseBlob(huge), true);
});

test('MAX_DATA_URL_BYTES: is a positive finite number', () => {
  assert.equal(typeof MAX_DATA_URL_BYTES, 'number');
  assert.ok(MAX_DATA_URL_BYTES > 0);
  assert.ok(Number.isFinite(MAX_DATA_URL_BYTES));
});