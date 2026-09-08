import { normalizeGame } from './schema.js';

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
    const response = await fetch(this.endpoint);
    if (!response.ok) {
      throw new Error(`Failed to scrape gnmath source: ${response.status} ${response.statusText}`);
    }

    const rawZones = await response.json();
    if (!Array.isArray(rawZones)) {
      throw new Error('Invalid scraped payload: expected array of games');
    }

    const games = [];

    for (const zone of rawZones) {
      // Filter out discord suggestions or invalid entries
      if (!zone || zone.id <= 0 || !zone.url || zone.url.includes('discord.gg')) {
        continue;
      }

      // Resolve asset templates
      const coverUrl = (zone.cover || '')
        .replace('{COVER_URL}', this.coverBase)
        .replace('{HTML_URL}', this.htmlBase);

      const embedUrl = (zone.url || '')
        .replace('{HTML_URL}', this.htmlBase)
        .replace('{COVER_URL}', this.coverBase);

      const normalized = normalizeGame({
        id: `gnmath_${zone.id}`,
        name: zone.name,
        author: zone.author,
        description: zone.description, // Will default to 'Not provided'
        source: this.name,
        authorLink: zone.authorLink || this.homepage,
        url: embedUrl,
        cover: coverUrl,
        fallbackThumbnail: '/assets/placeholders/default-game.svg',
        directEmbed: true,
        special: zone.special
      }, this.name);

      if (normalized) {
        games.push(normalized);
      }
    }

    return games;
  }
};
