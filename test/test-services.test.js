/**
 * Unit tests for storage + settingsManager with a localStorage shim.
 *
 * Run with: node --test test/test-services.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage shim for Node. IndexedDB shim is not required for
// these modules — storage.js only uses localStorage and settingsManager.js
// only uses localStorage.
const _store = new Map();
globalThis.localStorage = {
  getItem(k) { return _store.has(k) ? _store.get(k) : null; },
  setItem(k, v) { _store.set(k, String(v)); },
  removeItem(k) { _store.delete(k); },
  clear() { _store.clear(); }
};

const { storage } = await import('../src/services/storage.js');
const { settings, VALID_EMBED_METHODS } = await import('../src/settings/settingsManager.js');

// ───────────────────────── storage ─────────────────────────
test('storage.getReports: returns [] when no reports exist', () => {
  _store.clear();
  assert.deepEqual(storage.getReports(), []);
});

test('storage.submitReport: appends a new report with id and timestamp', () => {
  _store.clear();
  const result = storage.submitReport({
    gameId: 'g1',
    gameTitle: 'Test',
    reason: 'other',
    details: ''
  });
  assert.ok(result && result.id, 'report should have an id');
  assert.ok(result.timestamp, 'report should have a timestamp');
  const all = storage.getReports();
  assert.equal(all.length, 1);
  assert.equal(all[0].gameId, 'g1');
});

test('storage.submitReport: returns null on quota error', () => {
  _store.clear();
  // Replace localStorage.setItem with a quota-throwing version.
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const result = storage.submitReport({ gameId: 'g2', reason: 'other' });
  globalThis.localStorage.setItem = original;
  assert.equal(result, null);
});

// ───────────────────────── settingsManager ─────────────────────────
test('settings: defaults are applied on a clean localStorage', () => {
  _store.clear();
  assert.equal(settings.wisp.enabled, false);
  assert.ok(Array.isArray(settings.wisp.servers));
  assert.ok(settings.wisp.servers.length > 0);
  assert.equal(settings.cloak.mode, 'none');
  assert.equal(settings.embedMethod, 'document.write');
});

test('settings.setEmbedMethod: accepts all valid embed methods', () => {
  for (const method of VALID_EMBED_METHODS) {
    assert.equal(settings.setEmbedMethod(method), true);
    assert.equal(settings.embedMethod, method);
  }
});

test('settings.setEmbedMethod: rejects invalid embed methods', () => {
  const current = settings.embedMethod;
  assert.equal(settings.setEmbedMethod('invalid_method'), false);
  assert.equal(settings.setEmbedMethod(''), false);
  assert.equal(settings.setEmbedMethod(null), false);
  assert.equal(settings.embedMethod, current);
});

test('settings.addWispServer: rejects invalid URLs', () => {
  _store.clear();
  assert.equal(settings.addWispServer('not a url'), false);
  assert.equal(settings.addWispServer('http://example.com/'), false);
  assert.equal(settings.addWispServer(''), false);
});

test('settings.addWispServer: accepts wss:// URLs', () => {
  _store.clear();
  assert.equal(settings.addWispServer('wss://example.com/'), true);
});

test('settings.addWispServer: rejects duplicates', () => {
  _store.clear();
  settings.addWispServer('wss://example.com/');
  assert.equal(settings.addWispServer('wss://example.com/'), false);
});

test('settings.moveWispServer: reorders correctly', () => {
  _store.clear();
  while (settings.wisp.servers.length) settings.removeWispServer(0);
  settings.addWispServer('wss://a.example/');
  settings.addWispServer('wss://b.example/');
  settings.moveWispServer(1, -1);
  assert.equal(settings.wisp.servers[0], 'wss://b.example/');
  assert.equal(settings.wisp.servers[1], 'wss://a.example/');
});

test('settings.subscribe: notifies listeners on change', () => {
  _store.clear();
  let received = null;
  const unsubscribe = settings.subscribe((next) => { received = next; });
  settings.setCloakMode('blob');
  assert.ok(received);
  assert.equal(received.cloak.mode, 'blob');
  settings.setEmbedMethod('srcdoc');
  assert.equal(received.embed.method, 'srcdoc');
  unsubscribe();
});

test('settings.subscribe: unsubscribe stops further notifications', () => {
  _store.clear();
  let calls = 0;
  const unsubscribe = settings.subscribe(() => { calls += 1; });
  settings.setCloakMode('about_blank');
  const callsAfterFirst = calls;
  unsubscribe();
  settings.setCloakMode('blob');
  assert.equal(calls, callsAfterFirst);
});
