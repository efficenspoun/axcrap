import { normalizeGame } from './schema.js';
import { fetchJsonWithCorsFallback } from './fetchJson.js';

const GAMES_SNAPSHOT = '/data/gnmath-games.snapshot.json';

export const gnmathSource = {
  id: 'gnmath',
  name: 'GN-Math',
  homepage: 'https://ytolvtortud9wscnyyfs.gnmath.me/',
  endpoint: 'https://cdn.jsdelivr.net/gh/freebuisness/assets@f197f8edb9fa0bee74f1fdf582a0d17f5c6bd9a4/zones.json?t=1788737650575',
  coverBase: 'https://cdn.jsdelivr.net/gh/freebuisness/covers@main',
  htmlBase: 'https://cdn.jsdelivr.net/gh/freebuisness/html@main',

  /**
   * Scrape and parse games directly in the browser
   */
  async scrape() {
    const rawGames = await fetchJsonWithCorsFallback(this.endpoint, { snapshot: GAMES_SNAPSHOT });
    if (!Array.isArray(rawGames)) {
      throw new Error('Invalid scraped payload: expected array of games');
    }

    const games = [];

    for (const game of rawGames) {
      if (!game || !game.url) continue;

      // Filter out discord suggestions or invalid entries
      if (game.id <= 0 || game.url.includes('discord.gg')) continue;

      // Resolve asset templates (live data has {COVER_URL}/{HTML_URL}, snapshot has resolved URLs)
      const coverUrl = (game.cover || '')
        .replace('{COVER_URL}', this.coverBase)
        .replace('{HTML_URL}', this.htmlBase);

      const embedUrl = (game.url || '')
        .replace('{HTML_URL}', this.htmlBase)
        .replace('{COVER_URL}', this.coverBase);

      const normalized = normalizeGame({
        id: `gnmath_${game.id}`,
        name: game.name,
        author: game.author,
        description: game.description,
        source: this.name,
        authorLink: game.authorLink || this.homepage,
        url: embedUrl,
        cover: coverUrl,
        fallbackThumbnail: '/assets/placeholders/default-game.svg',
        directEmbed: false,
        supportsAboutBlank: true,
        special: game.special
      }, this.name);

      if (normalized) {
        games.push(normalized);
      }
    }

    return games;
  }
};
