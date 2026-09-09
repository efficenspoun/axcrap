/**
 * Shared JSON fetch with CORS fallback.
 *
 * In a normal web deployment, try the source directly and then public CORS
 * proxies.  In a `file://` build, remote JSON fetches may be blocked by the
 * browser's opaque/null origin, so callers can provide a bundled snapshot.
 */

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?key=3072d12a&url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

const DIRECT_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT_MS = 20000;

// Headers that must never leak to public CORS proxies. Public proxy services
// (allorigins.win, corsproxy.io, codetabs.com) have no SLA or privacy
// guarantees and may log request headers verbatim. Bearer tokens / API keys
// included here would be exposed to every proxy in the fallback chain.
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'apikey',
  'x-api-key',
  'cookie'
]);

function isFileProtocol() {
  return typeof location !== 'undefined' && location.protocol === 'file:';
}

function stripSensitiveHeaders(headers) {
  if (!headers) return {};
  const safe = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!SENSITIVE_HEADER_NAMES.has(k.toLowerCase())) {
      safe[k] = v;
    }
  }
  return safe;
}

async function readBundledSnapshot(snapshot) {
  if (!snapshot) return null;
  try {
    // fetch(file://...) is browser-dependent.  The single-file builder replaces
    // the marker below with an inline JSON object, avoiding a local fetch.
    if (typeof window !== 'undefined' && window.__AXCRAP_SNAPSHOTS__?.[snapshot]) {
      return window.__AXCRAP_SNAPSHOTS__[snapshot];
    }

    const res = await fetch(snapshot);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn(`Snapshot fetch failed for ${snapshot}:`, err);
  }
  return null;
}

export async function fetchJsonWithCorsFallback(target, options = {}) {
  const headers = options.headers || {};

  // For local single-file builds, use the bundled snapshot first.  This makes
  // the catalog independent of CORS/proxy availability while preserving live
  // network refreshes for normal http(s) deployments.
  if (isFileProtocol() && options.snapshot) {
    const snapshot = await readBundledSnapshot(options.snapshot);
    if (snapshot != null) {
      console.info(`Using bundled snapshot for ${target} (file:// mode)`);
      return snapshot;
    }
  }

  const directController = new AbortController();
  const directTimer = setTimeout(() => directController.abort(), DIRECT_TIMEOUT_MS);
  try {
    const res = await fetch(target, { signal: directController.signal, headers });
    if (res.ok) return await res.json();
    console.warn(`Direct fetch returned ${res.status} for ${target}`);
  } catch (err) {
    console.warn(`Direct fetch failed for ${target}:`, err);
  } finally {
    clearTimeout(directTimer);
  }

  // Public CORS proxies must NEVER receive sensitive headers (auth tokens,
  // cookies, api keys). Build a sanitized copy once per call.
  const proxyHeaders = stripSensitiveHeaders(headers);

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxiedUrl = CORS_PROXIES[i](target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(proxiedUrl, { signal: controller.signal, headers: proxyHeaders });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn(`CORS proxy ${i + 1} failed for ${target}:`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  if (options.snapshot) {
    const snapshot = await readBundledSnapshot(options.snapshot);
    if (snapshot != null) {
      console.warn(`Falling back to bundled snapshot for ${target}`);
      return snapshot;
    }
  }

  throw new Error(`Unable to fetch ${target} (direct request and CORS proxies blocked)`);
}
