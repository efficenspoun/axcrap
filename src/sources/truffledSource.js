import { normalizeGame } from './schema.js';
import { fetchJsonWithCorsFallback } from './fetchJson.js';
import { slugify } from '../utils/slugify.js';

const GAMES_ENDPOINT = 'https://truffled.lol/js/json/g.json';
const GAMES_SNAPSHOT = '/data/truffled-games.snapshot.json';
const PRIMARY_ORIGIN = 'https://truffled.lol';

/**
 * All of these domains are hosted on the same origin server (205.209.125.106),
 * so any game path is reachable from every domain. If one host is blocked or
 * unreachable the player can flip to another via the in-app mirror switcher.
 * Order matters: the primary origin is used for the default embed URL.
 */
const MIRROR_ORIGINS = [
  PRIMARY_ORIGIN,
  'https://gucci-morty.americansolidarityparty.net',
  'https://shar.centrodiagnosticogenetico.com'
];

/**
 * Build the playable URLs for a game.
 *
 * - External absolute URLs (`frameType: "proxy"` entries) are served from
 *   another site and are used as-is on every mirror.
 * - Relative paths (`/games/<id>/index.html`, `/gamefile/<id>.html`) are
 *   served from every mirror origin.
 */
export function toEmbeddableUrls(location) {
  if (!location || typeof location !== 'string') return [];
  const trimmed = location.trim();
  if (!trimmed) return [];

  if (/^https?:\/\//i.test(trimmed)) {
    return [trimmed];
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return MIRROR_ORIGINS.map((origin) => `${origin}${path}`);
}

/**
 * Thumbnails are relative paths like `/png/games/<id>.webp` (some entries omit
 * the leading slash); all are served from the primary origin.
 */
export function toThumbnailUrl(thumbnail) {
  if (!thumbnail || typeof thumbnail !== 'string') return '';
  if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
  const path = thumbnail.startsWith('/') ? thumbnail : `/${thumbnail}`;
  return `${PRIMARY_ORIGIN}${path}`;
}

export const truffledSource = {
  id: 'truffled',
  name: 'Truffled',
  homepage: PRIMARY_ORIGIN,

  async scrape() {
    const payload = await fetchJsonWithCorsFallback(GAMES_ENDPOINT, { snapshot: GAMES_SNAPSHOT });
    const rawGames = Array.isArray(payload) ? payload : payload?.games;
    if (!Array.isArray(rawGames)) {
      throw new Error('Invalid scraped payload: expected { games: [...] }');
    }

    const games = [];
    const seen = new Set();

    for (const raw of rawGames) {
      if (!raw || !raw.name || !raw.url) continue;

      const urls = toEmbeddableUrls(raw.url);
      if (urls.length === 0) continue;

      const embedUrl = urls[0];
      const thumbnailUrl = toThumbnailUrl(raw.thumbnail);

      const stableId = `${truffledSource.id}_${slugify(raw.url)}`;
      let id = stableId;
      let counter = 2;
      while (seen.has(id)) {
        id = `${stableId}-${counter++}`;
      }
      seen.add(id);

      const normalized = normalizeGame({
        id,
        name: raw.name,
        author: 'Not provided',
        description: `Play ${raw.name} - a browser game from Truffled`,
        source: this.name,
        sourceUrl: this.homepage,
        url: embedUrl,
        cover: thumbnailUrl,
        fallbackThumbnail: thumbnailUrl || '/assets/placeholders/default-game.svg',
        mirrors: urls,
        // No CORS headers on truffled.lol, so skip the about:blank fetch path.
        supportsAboutBlank: false,
        rawId: raw.url
      }, this.name);

      if (normalized) {
        games.push(normalized);
      }
    }

    return games;
  }
};