/**
 * Shared JSON fetch with CORS fallback.
 *
 * Scraping strategy — a hedged direct request with a concurrent proxy race:
 *
 *   1. The direct request to the source fires immediately.
 *   2. If it settles quickly we are done: a success returns straight away,
 *      and a fast failure escalates to the proxies instantly.
 *   3. If it is still pending after HEDGE_DELAY_MS (e.g. a firewall silently
 *      blackholing packets instead of rejecting them), every public CORS
 *      proxy is started at once. The first candidate — the direct request
 *      included — to return valid JSON wins, and every losing in-flight
 *      request is aborted.
 *
 * This replaces both the old sequential chain (direct -> proxy 1 -> proxy 2
 * -> proxy 3), whose worst case added up to ~72s per source, and the old
 * bundled-snapshot fallback: live data is now the only data. Whatever a
 * scrape yields is cached in the browser by SourceManager (IndexedDB with a
 * localStorage mirror), which is what keeps the catalog usable while a
 * source is temporarily unreachable.
 */

const CORS_PROXIES = [
  {
    id: 'allorigins',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  },
  {
    id: 'corsproxy',
    build: (url) => `https://corsproxy.io/?key=3072d12a&url=${encodeURIComponent(url)}`
  },
  {
    id: 'codetabs',
    build: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  }
];

// Healthy CDNs answer well within a second; 8s only bites on genuinely
// broken routes. Public proxies are slower, so they get a larger budget.
const DIRECT_TIMEOUT_MS = 8000;
const PROXY_TIMEOUT_MS = 15000;

// Grace window the direct request gets before the CORS proxies join the
// race. Small enough that a blackholed network only delays a source by a
// couple of seconds, large enough that a healthy CDN is never raced against
// third-party proxies.
const HEDGE_DELAY_MS = 2500;

// Headers that must never leak to public CORS proxies. Public proxy services
// (allorigins.win, corsproxy.io, codetabs.com) have no SLA or privacy
// guarantees and may log request headers verbatim. Bearer tokens / API keys
// included here would be exposed to every proxy in the race.
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'apikey',
  'x-api-key',
  'cookie'
]);

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

function hasHeaderNamed(headers, name) {
  return Object.keys(headers || {}).some((k) => k.toLowerCase() === name);
}

/**
 * fetch() with a per-request timeout that can also be aborted from the
 * outside via `signal`, so the winner of the race can cancel every losing
 * request at once.
 */
async function fetchWithTimeout(url, headers, timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onOuterAbort, { once: true });
    }
  }
  try {
    // `referrerPolicy: 'no-referrer'` keeps the app's own URL from being
    // sent to third-party proxy services (matching the hardened iframes).
    return await fetch(url, {
      signal: controller.signal,
      headers,
      referrerPolicy: 'no-referrer'
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * One fetch candidate: resolves with the parsed JSON payload, rejects with a
 * labelled Error for anything else (network failure, timeout, HTTP error
 * status, or a 200 response whose body is not valid JSON — proxies have been
 * observed returning HTML error pages with a 200 status).
 */
async function attemptJson(candidate, signal) {
  const res = await fetchWithTimeout(candidate.url, candidate.headers, candidate.timeoutMs, signal);
  if (!res.ok) {
    throw new Error(`${candidate.label} returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error(`${candidate.label} returned a non-JSON payload`);
  }
}

/**
 * Resolve with the value of the first promise that fulfills; reject with the
 * array of rejection reasons once every promise has rejected. Losing
 * promises that settle later are ignored (the caller aborts them anyway).
 */
function firstSuccess(promises) {
  return new Promise((resolve, reject) => {
    let remaining = promises.length;
    const failures = [];
    if (remaining === 0) {
      reject([]);
      return;
    }
    for (const p of promises) {
      p.then(resolve, (err) => {
        failures.push(err);
        remaining -= 1;
        if (remaining === 0) reject(failures);
      });
    }
  });
}

/**
 * Fetch JSON from `target`, escalating to public CORS proxies when needed.
 *
 * @param {string} target - Absolute URL of the JSON endpoint.
 * @param {object} [options]
 * @param {object} [options.headers] - Headers for the direct request.
 *   Sensitive headers (authorization, apikey, x-api-key, cookie) are never
 *   forwarded to public CORS proxies.
 * @param {number} [options.directTimeoutMs] - Per-request timeout for the
 *   direct request (default 8000).
 * @param {number} [options.proxyTimeoutMs] - Per-request timeout for each
 *   proxy request (default 15000).
 * @param {number} [options.hedgeDelayMs] - How long the direct request gets
 *   before the proxies join the race (default 2500; mainly overridden in
 *   tests).
 * @returns {Promise<*>} Parsed JSON payload.
 */
export async function fetchJsonWithCorsFallback(target, options = {}) {
  const headers = options.headers || {};

  const directTimeoutMs = options.directTimeoutMs ?? DIRECT_TIMEOUT_MS;
  const proxyTimeoutMs = options.proxyTimeoutMs ?? PROXY_TIMEOUT_MS;
  const hedgeDelayMs = options.hedgeDelayMs ?? HEDGE_DELAY_MS;

  // Ask for JSON explicitly unless the caller already pinned an Accept
  // header. ("application/json" is a CORS-safelisted Accept value, so this
  // does not trigger a preflight.)
  const directHeaders = hasHeaderNamed(headers, 'accept')
    ? headers
    : { ...headers, Accept: 'application/json' };

  // Public CORS proxies must NEVER receive sensitive headers (auth tokens,
  // cookies, API keys). Build the sanitized copy once per call.
  const proxyHeaders = stripSensitiveHeaders(directHeaders);

  // Whatever candidate wins, every losing in-flight request is cancelled
  // through this signal so the sockets close immediately.
  const raceController = new AbortController();

  const directCandidate = {
    label: 'Direct request',
    url: target,
    headers: directHeaders,
    timeoutMs: directTimeoutMs
  };
  const proxyCandidates = CORS_PROXIES.map((proxy) => ({
    label: `CORS proxy ${proxy.id}`,
    url: proxy.build(target),
    headers: proxyHeaders,
    timeoutMs: proxyTimeoutMs
  }));

  let hedgeTimerId = null;
  try {
    const directPromise = attemptJson(directCandidate, raceController.signal);
    const directSettled = directPromise.then(
      (value) => ({ ok: true, value }),
      (err) => ({ ok: false, err })
    );
    const hedgeElapsed = new Promise((resolve) => {
      hedgeTimerId = setTimeout(() => resolve('hedge-elapsed'), hedgeDelayMs);
    });

    const first = await Promise.race([directSettled, hedgeElapsed]);

    if (first !== 'hedge-elapsed' && first.ok) {
      // Healthy network: the direct request answered within the grace
      // window and no proxy was ever contacted.
      return first.value;
    }

    if (first === 'hedge-elapsed') {
      console.warn(
        `Direct fetch for ${target} still pending after ${hedgeDelayMs}ms; ` +
        `racing ${proxyCandidates.length} CORS proxies`
      );
    } else {
      console.warn(`Direct fetch failed for ${target}: ${first.err?.message || first.err}`);
    }

    // Escalation: race every candidate — including the possibly-slow direct
    // request — and let the first valid JSON payload win.
    const inFlight = [
      directPromise,
      ...proxyCandidates.map((candidate) => attemptJson(candidate, raceController.signal))
    ];

    try {
      return await firstSuccess(inFlight);
    } catch (failures) {
      const reasons = [...new Set(
        (Array.isArray(failures) ? failures : [failures])
          .map((e) => (e && e.message) || String(e))
      )];
      throw new Error(
        `Unable to fetch ${target} (direct request and all ${proxyCandidates.length} ` +
        `CORS proxies failed): ${reasons.join('; ')}`
      );
    }
  } finally {
    if (hedgeTimerId !== null) clearTimeout(hedgeTimerId);
    raceController.abort();
  }
}
