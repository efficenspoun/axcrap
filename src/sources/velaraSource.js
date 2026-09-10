import { normalizeGame } from './schema.js';
import { fetchJsonWithCorsFallback } from './fetchJson.js';
import { slugify } from '../utils/slugify.js';

const GAMES_ENDPOINT = 'https://velara.cc/data/games.json';
const THUMBNAIL_CDN = 'https://cdn.jsdelivr.net/gh/dragonx-astra/velara-assets@main/img';
const VELARA_ORIGIN = 'https://velara.cc';

/**
 * Convert a game location into an embeddable HTML URL.
 *
 * Rule set (from reverse-engineering velara.cc's own loader):
 * - Relative `assets/games/<file>.html` paths are served from velara.cc itself.
 * - Absolute URLs hosted on `cdn.jsdelivr.net/gh/...` are mirrored through
 *   cdn.statically.io (raw GitHub mirror) and pointed at `index.html` so the
 *   directory is served as the playable HTML page.
 * - Any other absolute directory-like URL gets `/index.html` appended; URLs
 *   that already end in a file are left untouched.
 */
export function toEmbeddableUrl(location) {
  if (!location || typeof location !== 'string') return '';
  const trimmed = location.trim();
  if (!trimmed || trimmed === '') return '';

  // External absolute URLs
  if (/^https?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return trimmed;
    }

    // jsDelivr GitHub hosting -> statically.io raw mirror + index.html
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/')) {
      const rest = url.pathname.slice('/gh/'.length); // user/repo@branch/path...
      let mirrored = `https://cdn.statically.io/gh/${rest}`.replace(/\/+$/, '');
      if (/\.html?$/i.test(mirrored)) return mirrored;
      return `${mirrored}/index.html`;
    }

    // Other external directory-like paths -> append index.html
    const path = (url.pathname || '').replace(/\/+$/, '') || '';
    if (path && !/\.[a-z0-9]+$/i.test(path.split('/').pop())) {
      url.pathname = `${path}/index.html`;
    }
    return url.href;
  }

  // Relative location -> served from velara.cc
  return `${VELARA_ORIGIN}/${trimmed.replace(/^\/+/, '')}`;
}

export const velaraSource = {
  id: 'velara',
  name: 'Velara',
  homepage: 'https://velara.cc',

  async scrape() {
    const rawGames = await fetchJsonWithCorsFallback(GAMES_ENDPOINT);
    if (!Array.isArray(rawGames)) {
      throw new Error('Invalid scraped payload: expected array of games');
    }

    const games = [];
    const seen = new Set();

    for (const raw of rawGames) {
      if (!raw || !raw.title || !raw.location) continue;

      const embedUrl = toEmbeddableUrl(raw.location);
      if (!embedUrl) continue;

      // Thumbnails are mirrored to the jsdelivr CDN keyed by image basename;
      // fall back to velara.cc's own origin path if a mirror is missing.
      const imageBasename = String(raw.image || '').split('/').pop();
      const thumbnailUrl = imageBasename
        ? `${THUMBNAIL_CDN}/${imageBasename}`
        : VELARA_ORIGIN;
      let fallbackThumbnail = '/assets/placeholders/default-game.svg';
      if (raw.image && typeof raw.image === 'string') {
        fallbackThumbnail = `${VELARA_ORIGIN}/${raw.image.replace(/^\/+/, '')}`;
      }

      const stableId = `${velaraSource.id}_${slugify(raw.location)}`;
      let id = stableId;
      let counter = 2;
      while (seen.has(id)) {
        id = `${stableId}-${counter++}`;
      }
      seen.add(id);

      const normalized = normalizeGame({
        id,
        name: raw.title,
        author: 'Not provided',
        description: `Play ${raw.title} - a browser game from Velara`,
        source: this.name,
        sourceUrl: this.homepage,
        url: embedUrl,
        cover: thumbnailUrl,
        fallbackThumbnail,
        // Velara does not send CORS headers, so skip the about:blank fetch path.
        supportsAboutBlank: false,
        rawId: raw.location
      }, this.name);

      if (normalized) {
        games.push(normalized);
      }
    }

    return games;
  }
};