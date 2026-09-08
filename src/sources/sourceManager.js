import { gnmathSource } from './gnmathSource.js';
import { duckmathSource } from './duckmathSource.js';
import { luminSource } from './luminSource.js';
import { velaraSource } from './velaraSource.js';
import { truffledSource } from './truffledSource.js';
import { cacheStore } from '../services/cacheStore.js';

const CACHE_KEY = 'clean_arcade_scraped_cache_v5';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days cache validity

// Legacy localStorage mirror for small payloads (< 1MB) so the latest state
// is still recoverable if IndexedDB is unavailable.
const LEGACY_STORAGE_KEY = CACHE_KEY;

export class SourceManager {
  constructor() {
    this.sources = new Map();
    // Register default sources
    this.registerSource(gnmathSource);
    this.registerSource(duckmathSource);
    this.registerSource(luminSource);
    this.registerSource(velaraSource);
    this.registerSource(truffledSource);
  }

  /**
   * Register a source module
   */
  registerSource(sourceModule) {
    if (!sourceModule || !sourceModule.id || typeof sourceModule.scrape !== 'function') {
      console.warn('Invalid source module:', sourceModule);
      return;
    }
    this.sources.set(sourceModule.id, sourceModule);
  }

  /**
   * Get list of registered sources
   */
  getRegisteredSources() {
    return Array.from(this.sources.values()).map(s => ({
      id: s.id,
      name: s.name,
      homepage: s.homepage
    }));
  }

  /**
   * Read cached scraped games (IndexedDB first, localStorage fallback).
   */
  async getCachedData() {
    let parsed = null;
    try {
      parsed = await cacheStore.get(CACHE_KEY);
    } catch (e) {
      console.warn('Failed to read IndexedDB cache:', e);
    }

    if (!parsed) {
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) {
        console.warn('Failed to read legacy cache:', e);
      }
    }

    if (!parsed || !parsed.timestamp || !parsed.games) return null;

    // Check TTL (7 days)
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;
    if (isExpired) {
      console.info('Scraped game cache expired, refreshing...');
      return null;
    }

    return parsed;
  }

  /**
   * Save scraped games to browser cache (IndexedDB primary, localStorage mirror).
   * @param {Array} games - Normalized game objects from all sources
   * @param {string[]} sourceIds - IDs of sources that were successfully scraped
   */
  async saveCache(games, sourceIds = []) {
    const payload = {
      version: '5.0.0',
      timestamp: Date.now(),
      count: games.length,
      sourceIds,
      games
    };

    let idbOk = false;
    try {
      await cacheStore.set(CACHE_KEY, payload);
      idbOk = true;
    } catch (e) {
      console.warn('Failed to save to IndexedDB cache:', e);
    }

    // Only mirror to localStorage when small enough to fit the quota.
    try {
      const serialized = JSON.stringify(payload);
      if (serialized.length < 1_000_000) {
        localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
      } else if (!idbOk) {
        console.warn('Cache too large for localStorage fallback; IndexedDB must be used.');
      }
    } catch (e) {
      console.warn('Failed to save to legacy localStorage cache:', e);
    }
  }

  /**
   * Clear cache to force next scrape
   */
  async clearCache() {
    try {
      await cacheStore.remove(CACHE_KEY);
    } catch (e) {
      console.warn('Failed to clear IndexedDB cache:', e);
    }
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear legacy cache:', e);
    }
  }

  /**
   * Load games across all registered sources.
   * Checks browser cache first to avoid repeated requests.
   * 
   * @param {boolean} forceRefresh - If true, ignores cache and scrapes fresh data
   * @param {function} onProgress - Optional callback with status updates
   * @returns {Promise<{ games: Array, fromCache: boolean }>}
   */
  async loadAllGames(forceRefresh = false, onProgress = null) {
    // IDs of all enabled registered sources
    const expectedSourceIds = Array.from(this.sources.entries())
      .filter(([, s]) => s.enabled !== false)
      .map(([id]) => id);

    if (!forceRefresh) {
      const cached = await this.getCachedData();
      const cachedSourceIds = Array.isArray(cached?.sourceIds) ? cached.sourceIds : [];

      // Only trust the cache if every enabled source is represented in it.
      // Otherwise a newly registered source (e.g. LuminSDK) would never be scraped.
      const allSourcesCached = cached &&
        expectedSourceIds.every(id => cachedSourceIds.includes(id)) &&
        Array.isArray(cached.games) && cached.games.length > 0;

      if (allSourcesCached) {
        if (onProgress) onProgress({ status: 'cached', count: cached.games.length });
        return {
          games: cached.games,
          fromCache: true,
          timestamp: cached.timestamp
        };
      }
    }

    if (onProgress) onProgress({ status: 'scraping' });

    const allGames = [];
    const errors = [];
    const scrapedSourceIds = [];

    // Run active sources concurrently
    for (const [id, source] of this.sources.entries()) {
      if (source.enabled === false) continue;

      try {
        if (onProgress) onProgress({ status: 'scraping_source', source: source.name });
        const sourceGames = await source.scrape();
        if (Array.isArray(sourceGames)) {
          scrapedSourceIds.push(id);
          allGames.push(...sourceGames);
        }
      } catch (err) {
        console.error(`Error scraping source "${source.name}":`, err);
        errors.push({ source: source.name, error: err.message });
      }
    }

    if (allGames.length > 0) {
      await this.saveCache(allGames, scrapedSourceIds);
    }

    return {
      games: allGames,
      fromCache: false,
      timestamp: Date.now(),
      errors
    };
  }
}

export const sourceManager = new SourceManager();
