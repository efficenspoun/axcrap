/**
 * Wisp Proxy
 * Routes game URLs through a Wisp server using the Ultraviolet v3 rewrite
 * proxy engine with the epoxy (TLS over Wisp) transport for bare-mux.
 *
 * Vendored client files live in /public:
 *   /uv/*         Ultraviolet @titaniumnetwork-dev/ultraviolet@3.2.6
 *   /baremux/*    @mercuryworkshop/bare-mux@2.1.3
 *   /epoxy/*      @mercuryworkshop/epoxy-transport@2.1.28
 *
 * Flow:
 *   1. Load /uv/uv.bundle.js + /uv/uv.config.js on the page (lazy).
 *   2. Register the stock Ultraviolet service worker at /uv/sw.js.
 *   3. Tell bare-mux (page-side) to use /epoxy/... as its transport and
 *      connect it to the highest-priority reachable Wisp server from settings.
 *   4. Proxified URLs become <prefix> + encoded(original), e.g. /uv/service/<enc>
 *      which the service worker intercepts and rewrites.
 */

import { settings } from '../settings/settingsManager.js';

const SW_URL = '/uv/sw.js';
const BARE_MUX_WORKER = '/baremux/worker.js';
const EPOXY_TRANSPORT = '/epoxy/index.mjs';

let connection = null;
let readyPromise = null;
let activeServer = null;
let lastError = null;
let lastConnectFailAt = 0;
const CONNECT_RETRY_COOLDOWN_MS = 60000;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureUvContext() {
  if (typeof window.BareMux === 'undefined') {
    await loadScript('/baremux/index.js');
  }
  if (typeof window.Ultraviolet === 'undefined') {
    await loadScript('/uv/uv.bundle.js');
  }
  if (typeof window.__uv$config === 'undefined') {
    await loadScript('/uv/uv.config.js');
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }
  await navigator.serviceWorker.register(SW_URL);
}

export function isWispEnabled() {
  return settings.wisp.enabled;
}

export function getActiveWispServer() {
  return activeServer;
}

export function getLastError() {
  return lastError;
}

export function isWispReady() {
  return Boolean(activeServer);
}

function proxifyUrl(url) {
  if (typeof window.__uv$config?.encodeUrl !== 'function') return url;
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url;
  return window.__uv$config.prefix + window.__uv$config.encodeUrl(url);
}

/**
 * Establish the proxy connection using the highest-priority reachable server.
 * Cached until the connection is reset (e.g. server list edits or disable).
 */
async function connectToServer(conn, transport, server) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Wisp server timed out (${server})`)), 8000);
  });
  await Promise.race([
    (async () => {
      const current = await conn.getTransport();
      if (current !== transport) {
        await conn.setTransport(transport, [{ wisp: server }]);
      }
    })(),
    timeout
  ]);
}

export async function connect() {
  if (!settings.wisp.enabled) {
    lastError = 'Wisp proxy is disabled in settings.';
    return null;
  }
  if (Date.now() - lastConnectFailAt < CONNECT_RETRY_COOLDOWN_MS) {
    throw new Error('Wisp proxy is unavailable (recent connect failure).');
  }
  if (activeServer) return activeServer;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const servers = settings.wisp.servers.slice();
    if (servers.length === 0) throw new Error('No wisp servers configured.');

    lastError = null;
    await ensureUvContext();
    await registerServiceWorker();

    const conn = connection || (connection = new BareMux.BareMuxConnection(BARE_MUX_WORKER));
    let lastErr = null;

    for (const server of servers) {
      try {
        await connectToServer(conn, EPOXY_TRANSPORT, server);
        activeServer = server;
        lastConnectFailAt = 0;
        return server;
      } catch (err) {
        lastErr = err;
        console.warn(`Wisp server unreachable (${server}):`, err);
      }
    }

    throw lastErr || new Error('No usable wisp server.');
  })();

  readyPromise = readyPromise.catch((err) => {
    lastError = err?.message || String(err);
    lastConnectFailAt = Date.now();
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}

/**
 * Reset the cached connection so the next connect() retries with the
 * current server list / priority order.
 */
export function resetConnection() {
  readyPromise = null;
  activeServer = null;
  lastConnectFailAt = 0;
}

export async function disable() {
  resetConnection();
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    for (const registration of registrations || []) {
      await registration.unregister();
    }
  } catch (err) {
    console.warn('Failed to unregister service worker:', err);
  }
}

/**
 * Resolve a raw game URL to its final embed URL.
 * Returns the Ultraviolet-proxified URL when the wisp proxy is enabled and
 * reachable, otherwise returns the original URL unchanged.
 */
export async function resolveUrl(url) {
  if (!settings.wisp.enabled || !url) return url;
  if (!isWispReady()) {
    try {
      await connect();
    } catch {
      return url;
    }
  }
  return isWispReady() ? proxifyUrl(url) : url;
}