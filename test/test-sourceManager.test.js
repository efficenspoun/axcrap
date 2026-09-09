/**
 * Unit tests for SourceManager with mocked sources.
 *
 * Run with: node --test test/test-sourceManager.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ────────────── Browser-API shims ──────────────
// localStorage
const _ls = new Map();
const localStorageShim = {
  getItem(k) { return _ls.has(k) ? _ls.get(k) : null; },
  setItem(k, v) { _ls.set(k, String(v)); },
  removeItem(k) { _ls.delete(k); },
  clear() { _ls.clear(); }
};

globalThis.window = {
  localStorage: localStorageShim,
  // IndexedDB stub that immediately fires the error callback so cacheStore
  // rejects its openDb promise. SourceManager.saveCache catches that and
  // falls back to localStorage.
  indexedDB: {
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        if (req.onerror) req.onerror({ target: req });
      });
      return req;
    }
  }
};
globalThis.localStorage = localStorageShim;
globalThis.indexedDB = globalThis.window.indexedDB;

// Importing cacheStore wires it to a stub IndexedDB (which rejects
// immediately). SourceManager.saveCache catches this rejection and falls
// back to localStorage; the test only cares about loadAllGames() behavior.
await import('../src/services/cacheStore.js');

// Import SourceManager but bypass the singleton side-effects. We grab only
// the class definition; we do NOT instantiate the singleton.
const sourceManagerModule = await import('../src/sources/sourceManager.js');
const { SourceManager } = sourceManagerModule;

// Build a fresh, isolated manager for each test by replacing the .sources map.
function makeFreshManager() {
  const mgr = new SourceManager();
  // The class constructor registers all real sources; clear them out so
  // each test gets a clean slate.
  mgr.sources = new Map();
  return mgr;
}

function makeSource(id, name, scrapeResult, { delay = 5, shouldThrow = false } = {}) {
  return {
    id,
    name,
    enabled: true,
    async scrape() {
      await new Promise((r) => setTimeout(r, delay));
      if (shouldThrow) throw new Error(`${name} failed`);
      return scrapeResult;
    }
  };
}

test('SourceManager.loadAllGames: runs sources concurrently (Promise.allSettled)', async () => {
  const mgr = makeFreshManager();
  mgr.registerSource(makeSource('a', 'A', [{ id: 'a1', title: 'A1' }], { delay: 50 }));
  mgr.registerSource(makeSource('b', 'B', [{ id: 'b1', title: 'B1' }], { delay: 50 }));
  mgr.registerSource(makeSource('c', 'C', [{ id: 'c1', title: 'C1' }], { delay: 50 }));

  const start = Date.now();
  const result = await mgr.loadAllGames(true);
  const elapsed = Date.now() - start;
  // Sequential would be ~150ms; concurrent should be ~50ms. Allow some slack.
  assert.ok(elapsed < 130, `Expected concurrent load <130ms, took ${elapsed}ms`);
  assert.equal(result.games.length, 3);
  assert.deepEqual(result.errors, []);
});

test('SourceManager.loadAllGames: returns games from successful sources even when others fail', async () => {
  const mgr = makeFreshManager();
  mgr.registerSource(makeSource('good', 'Good', [{ id: 'g1', title: 'Good' }]));
  mgr.registerSource(makeSource('bad', 'Bad', null, { shouldThrow: true }));
  const result = await mgr.loadAllGames(true);
  assert.equal(result.games.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].source, 'Bad');
  assert.match(result.errors[0].error, /Bad failed/);
});

test('SourceManager.loadAllGames: a non-array scrape result is reported as an error', async () => {
  const mgr = makeFreshManager();
  mgr.registerSource(makeSource('weird', 'Weird', 'not-an-array'));
  const result = await mgr.loadAllGames(true);
  assert.equal(result.games.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /non-array/);
});

test('SourceManager.loadAllGames: progress callback fires per source', async () => {
  const mgr = makeFreshManager();
  mgr.registerSource(makeSource('p1', 'P1', []));
  mgr.registerSource(makeSource('p2', 'P2', []));
  const events = [];
  await mgr.loadAllGames(true, (progress) => {
    events.push(progress.status);
  });
  assert.ok(events.includes('scraping'));
  assert.ok(events.filter((s) => s === 'scraping_source').length >= 2);
});