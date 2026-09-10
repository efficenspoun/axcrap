/**
 * Unit tests for fetchJsonWithCorsFallback (hedged CORS-proxy scraping).
 *
 * Run with: node --test test/test-fetchJson.test.js
 *
 * The global fetch is stubbed per test with a URL router, so no real network
 * access happens. "Hanging" responses honour init.signal aborts, mirroring
 * browser/undici fetch behaviour, which lets the tests assert that losing
 * requests are really cancelled once a winner is chosen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchJsonWithCorsFallback } from '../src/sources/fetchJson.js';

const TARGET = 'https://example.test/api/games.json';

/** A Response-like object with a JSON body. */
function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

/** A 200 response whose body is not valid JSON (proxy error pages do this). */
function nonJsonResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    }
  };
}

function makeAbortError() {
  const err = new Error('This operation was aborted');
  err.name = 'AbortError';
  return err;
}

/** Behaviour for a URL that never answers unless aborted. */
const HANG = Symbol('hang');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const delayed = (ms, response) => async () => {
  await delay(ms);
  return response;
};

/**
 * Install a global fetch stub. `handler(url)` returns a Response-like value,
 * a promise of one (e.g. `delayed(...)`), or HANG.
 * Returns `{ calls, restore }` where each call records url, headers, signal,
 * and whether its signal was aborted.
 */
function installFetchStub(handler) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => {
    const urlStr = String(url);
    const record = {
      url: urlStr,
      headers: { ...(init.headers || {}) },
      signal: init.signal || null,
      aborted: false
    };
    if (record.signal) {
      if (record.signal.aborted) record.aborted = true;
      record.signal.addEventListener('abort', () => { record.aborted = true; }, { once: true });
    }
    calls.push(record);

    let behaviour;
    try {
      behaviour = handler(urlStr);
    } catch (err) {
      return Promise.reject(err);
    }
    // Handlers may return a thunk (e.g. `delayed(...)`) for time-shifted
    // responses — invoke it so the caller sees the Response-like value.
    if (typeof behaviour === 'function') {
      behaviour = behaviour();
    }
    if (behaviour === HANG) {
      return new Promise((resolve, reject) => {
        if (!record.signal) return; // never settles
        if (record.signal.aborted) {
          reject(makeAbortError());
          return;
        }
        record.signal.addEventListener('abort', () => reject(makeAbortError()), { once: true });
      });
    }
    return Promise.resolve(behaviour);
  };
  return {
    calls,
    restore() { globalThis.fetch = originalFetch; }
  };
}

const isDirect = (call) => call.url === TARGET;
const isProxy = (call) => call.url !== TARGET;

test('direct success returns the payload without contacting any proxy', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return jsonResponse({ games: [1, 2, 3] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const data = await fetchJsonWithCorsFallback(TARGET, {
      hedgeDelayMs: 50,
      headers: { 'X-Custom': 'yes' }
    });
    assert.deepEqual(data, { games: [1, 2, 3] });
    assert.strictEqual(stub.calls.length, 1, 'only the direct request should fire');
    // Caller headers pass through and a JSON Accept is defaulted in.
    assert.strictEqual(stub.calls[0].headers['X-Custom'], 'yes');
    assert.strictEqual(stub.calls[0].headers.Accept, 'application/json');
  } finally {
    stub.restore();
  }
});

test('direct failure escalates instantly: every proxy races concurrently, first JSON wins', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return jsonResponse({ error: 'nope' }, 500);
    if (url.includes('api.allorigins.win')) return jsonResponse({ via: 'allorigins' });
    if (url.includes('corsproxy.io')) return delayed(15, jsonResponse({ via: 'corsproxy' }));
    if (url.includes('api.codetabs.com')) return delayed(15, jsonResponse({ via: 'codetabs' }));
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const data = await fetchJsonWithCorsFallback(TARGET, {
      hedgeDelayMs: 50,
      headers: {
        Authorization: 'Bearer secret',
        apikey: 'secret-key',
        'X-Keep': 'ok'
      }
    });
    assert.deepEqual(data, { via: 'allorigins' });
    // Direct request plus all three proxies were contacted — the proxies
    // all fire at once instead of one-after-another.
    assert.strictEqual(stub.calls.length, 4);
    const direct = stub.calls.find(isDirect);
    const proxies = stub.calls.filter(isProxy);
    assert.strictEqual(proxies.length, 3, 'all CORS proxies join the race');
    // Sensitive headers reach the source but never the public proxies.
    assert.strictEqual(direct.headers.Authorization, 'Bearer secret');
    assert.strictEqual(direct.headers.apikey, 'secret-key');
    for (const p of proxies) {
      assert.strictEqual(p.headers.Authorization, undefined);
      assert.strictEqual(p.headers.apikey, undefined);
      assert.strictEqual(p.headers['X-Keep'], 'ok');
    }
  } finally {
    stub.restore();
  }
});

test('hanging direct request triggers the hedge; winning proxy aborts the direct request', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return HANG; // blackholed — never answers
    if (url.includes('api.allorigins.win')) return delayed(5, jsonResponse({ via: 'allorigins' }));
    return HANG;
  });
  try {
    const data = await fetchJsonWithCorsFallback(TARGET, { hedgeDelayMs: 25 });
    assert.deepEqual(data, { via: 'allorigins' });

    const direct = stub.calls.find(isDirect);
    assert.ok(direct, 'direct request was attempted');
    assert.ok(direct.aborted, 'hanging direct request is aborted once a proxy wins');
    assert.strictEqual(stub.calls.filter(isProxy).length, 3, 'all proxies joined at hedge time');
  } finally {
    stub.restore();
  }
});

test('a slow but alive direct request still wins the escalated race over hanging proxies', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return delayed(60, jsonResponse({ via: 'direct' }));
    return HANG;
  });
  try {
    const data = await fetchJsonWithCorsFallback(TARGET, { hedgeDelayMs: 20 });
    assert.deepEqual(data, { via: 'direct' });
    // The proxies were launched at hedge time but got cancelled again.
    const proxies = stub.calls.filter(isProxy);
    assert.strictEqual(proxies.length, 3);
    for (const p of proxies) assert.ok(p.aborted, 'losing proxy requests are aborted');
  } finally {
    stub.restore();
  }
});

test('a 200 response that is not valid JSON loses to a candidate with valid JSON', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return nonJsonResponse(); // 200 + HTML body
    if (url.includes('api.allorigins.win')) return jsonResponse({ via: 'allorigins' });
    return HANG;
  });
  try {
    const data = await fetchJsonWithCorsFallback(TARGET, { hedgeDelayMs: 25 });
    assert.deepEqual(data, { via: 'allorigins' });
  } finally {
    stub.restore();
  }
});

test('rejects with an aggregate error when the direct request and every proxy fail', async () => {
  const stub = installFetchStub((url) => {
    if (url === TARGET) return jsonResponse({}, 503);
    return jsonResponse({}, 502);
  });
  try {
    await assert.rejects(
      fetchJsonWithCorsFallback(TARGET, { hedgeDelayMs: 25 }),
      (err) => {
        assert.match(err.message, /Unable to fetch/);
        assert.match(err.message, /Direct request returned HTTP 503/);
        assert.match(err.message, /allorigins returned HTTP 502/);
        assert.match(err.message, /codetabs returned HTTP 502/);
        return true;
      }
    );
    assert.strictEqual(stub.calls.length, 4, 'direct + all three proxies were tried');
  } finally {
    stub.restore();
  }
});
