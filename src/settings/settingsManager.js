/**
 * Settings Manager
 * Persists app settings in localStorage.
 *
 * Storage key: clean_arcade_settings_v1
 * Shape:
 * {
 *   wisp: {
 *     enabled: boolean,
 *     servers: string[]           // ordered by priority (index 0 = first choice)
 *   },
 *   cloak: {
 *     mode: string
 *   },
 *   embed: {
 *     method: string              // 'document.write' | 'srcdoc' | 'blob' | 'data_url' | 'direct' | 'cors_proxy'
 *   }
 * }
 */

const STORAGE_KEY = 'clean_arcade_settings_v1';

export const VALID_EMBED_METHODS = [
  'document.write',
  'srcdoc',
  'blob',
  'data_url',
  'direct',
  'cors_proxy'
];

const DEFAULTS = {
  wisp: {
    enabled: false,
    servers: ['wss://wisp.mercurywork.shop/']
  },
  cloak: {
    mode: 'none'
  },
  embed: {
    method: 'document.write'
  }
};

const listeners = new Set();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    // Merge with defaults so newly added settings always exist
    const merged = clone(DEFAULTS);
    if (parsed?.wisp) {
      merged.wisp.enabled = parsed.wisp.enabled === true;
      merged.wisp.servers = Array.isArray(parsed.wisp.servers)
        ? parsed.wisp.servers.filter(s => typeof s === 'string' && s.trim() !== '')
        : [];
    }
    if (parsed?.cloak && ['none', 'about_blank', 'blob', 'data_url'].includes(parsed.cloak.mode)) {
      merged.cloak.mode = parsed.cloak.mode;
    }
    if (parsed?.embed && VALID_EMBED_METHODS.includes(parsed.embed.method)) {
      merged.embed.method = parsed.embed.method;
    }
    return merged;
  } catch (e) {
    console.warn('Failed to read settings, using defaults:', e);
    return clone(DEFAULTS);
  }
}

const state = load();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to persist settings (storage may be unavailable):', e);
  }
  notify();
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(clone(state));
    } catch (e) {
      console.warn('Settings listener failed:', e);
    }
  }
}

export const settings = {
  get wisp() {
    return state.wisp;
  },

  get cloak() {
    return state.cloak;
  },

  get embed() {
    return state.embed;
  },

  get embedMethod() {
    return state.embed.method;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setWispEnabled(enabled) {
    state.wisp.enabled = Boolean(enabled);
    if (!state.wisp.enabled && state.wisp.servers.length === 0) {
      state.wisp.servers.push(...DEFAULTS.wisp.servers);
    }
    persist();
  },

  setCloakMode(mode) {
    const clean = String(mode || 'none');
    if (!['none', 'about_blank', 'blob', 'data_url'].includes(clean)) return false;
    state.cloak.mode = clean;
    persist();
    return true;
  },

  setEmbedMethod(method) {
    if (!method || typeof method !== 'string' || !VALID_EMBED_METHODS.includes(method.trim())) {
      return false;
    }
    state.embed.method = method.trim();
    persist();
    return true;
  },

  addWispServer(url) {
    const clean = String(url || '').trim();
    if (!/^(wss?|ws):\/\/\S+$/i.test(clean)) return false;
    if (state.wisp.servers.includes(clean)) return false;
    state.wisp.servers.push(clean);
    persist();
    return true;
  },

  removeWispServer(index) {
    if (index < 0 || index >= state.wisp.servers.length) return;
    state.wisp.servers.splice(index, 1);
    if (state.wisp.enabled && state.wisp.servers.length === 0) {
      state.wisp.servers.push(...DEFAULTS.wisp.servers);
    }
    persist();
  },

  /**
   * Move a server up/down in priority (up = earlier in the list = preferred).
   * @param {number} index
   * @param {-1|1} direction -1 moves toward index 0, +1 moves toward end
   */
  moveWispServer(index, direction) {
    const target = index + direction;
    if (index < 0 || index >= state.wisp.servers.length) return;
    if (target < 0 || target >= state.wisp.servers.length) return;
    const [item] = state.wisp.servers.splice(index, 1);
    state.wisp.servers.splice(target, 0, item);
    persist();
  }
};
