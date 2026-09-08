/**
 * Shared JSON fetch with CORS fallback.
 *
 * Game sources behind strict origins (e.g. velara.cc, truffled.lol) do not send
 * `Access-Control-Allow-Origin`, so a direct browser fetch is blocked. This
 * tries the direct request first, then falls back to public CORS proxies, and
 * finally to a bundled same-origin snapshot when every network path fails so
 * the source can never be lost to a proxy outage.
 */

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?key=3072d12a&url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

const DIRECT_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT_MS = 20000;

export async function fetchJsonWithCorsFallback(target, options = {}) {
  const directController = new AbortController();
  const directTimer = setTimeout(() => directController.abort(), DIRECT_TIMEOUT_MS);
  try {
    const res = await fetch(target, { signal: directController.signal });
    if (res.ok) return await res.json();
    console.warn(`Direct fetch returned ${res.status} for ${target}`);
  } catch (err) {
    console.warn(`Direct fetch failed for ${target}:`, err);
  } finally {
    clearTimeout(directTimer);
  }

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxiedUrl = CORS_PROXIES[i](target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(proxiedUrl, { signal: controller.signal });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn(`CORS proxy ${i + 1} failed for ${target}:`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  // Last resort: a bundled snapshot of the source's catalog so the game list
  // is never unavailable when every remote path is blocked or down.
  if (options.snapshot) {
    try {
      const res = await fetch(options.snapshot);
      if (res.ok) {
        console.warn(`Falling back to bundled snapshot for ${target}`);
        return await res.json();
      }
    } catch (err) {
      console.warn(`Snapshot fetch failed for ${target}:`, err);
    }
  }

  throw new Error(`Unable to fetch ${target} (direct request and CORS proxies blocked)`);
}