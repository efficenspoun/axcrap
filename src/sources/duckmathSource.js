import { normalizeGame } from './schema.js';

export const DB0_BASE = 'https://classroomlesson.github.io/basic-ruffle-player';
export const DB0_MIRRORS = [
  'https://classroomlesson.github.io/basic-ruffle-player',
  'https://d1pgfzxl8xljfg.cloudfront.net',
  'https://dosl6rc74a8u6.cloudfront.net',
  'https://d1wnrmoe2jrw0g.cloudfront.net',
  'https://dmg-db.pages.dev',
  'https://science-a1.cautinvestitor.ro.cdn.cloudflare.net/db',
  'https://science-v3.jok.ro.cdn.cloudflare.net/db',
  'https://class.timis.ro.cdn.cloudflare.net/db',
  'https://class2.timis.ro.cdn.cloudflare.net/db',
  'https://math-a1.b-cdn.net',
  'https://science-v1.b-cdn.net',
  'https://pub-8ba40c3fa5854d7490b82d9a8dd671d0.r2.dev'
];

export const DB1_BASE = 'https://db2.duckmath.org';
export const DB1_MIRRORS = [
  'https://db2.duckmath.org',
  'https://d1b8zsan60tues.cloudfront.net',
  'https://d1imv5hmyw4kfp.cloudfront.net',
  'https://db2.mathevolve.com',
  'https://d139khpwsw1rlp.cloudfront.net',
  'https://db2.englishteacherpro.com',
  'https://db2.statisticscontest.com',
  'https://science-a1.cautinvestitor.ro.cdn.cloudflare.net/db2',
  'https://science-v3.jok.ro.cdn.cloudflare.net/db2',
  'https://class.timis.ro.cdn.cloudflare.net/db2',
  'https://class2.timis.ro.cdn.cloudflare.net/db2',
  'https://math-a2.b-cdn.net',
  'https://science-v2.b-cdn.net'
];

const SUPABASE_ENDPOINT = 'https://hqlgppguxhqeaonjzinv.supabase.co/rest/v1/rpc/get_apps_ordered_by_title_v2?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbGdwcGd1eGhxZWFvbmp6aW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MjYwNDQsImV4cCI6MjA0ODIwMjA0NH0.4LuWk4qxp0NRZ5_erEIJq5BHq5qZiSE4zTUFS1ioZw8';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbGdwcGd1eGhxZWFvbmp6aW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2MjYwNDQsImV4cCI6MjA0ODIwMjA0NH0.4LuWk4qxp0NRZ5_erEIJq5BHq5qZiSE4zTUFS1ioZw8';

/**
 * Format slugified names into clean titles (e.g. 'eagle-duckcraft' -> 'Eagle Duckcraft')
 */
function formatTitle(slug) {
  if (!slug) return 'Not provided';
  return slug
    .split('-')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
    .join(' ');
}

export const duckmathSource = {
  id: 'duckmath',
  name: 'DuckMath',
  homepage: 'https://study.jok.ro/',
  endpoint: SUPABASE_ENDPOINT,

  /**
   * Scrape DuckMath database and generate mirror lists for all games
   */
  async scrape() {
    const response = await fetch(this.endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to scrape DuckMath: ${response.status} ${response.statusText}`);
    }

    const rawApps = await response.json();
    if (!Array.isArray(rawApps)) {
      throw new Error('Invalid DuckMath scraped payload: expected array of games');
    }

    const games = [];

    for (const app of rawApps) {
      if (!app || !app.link) continue;

      const rawLink = app.link.trim();
      const dataSource = app.url_data_source;
      const mirrors = [];

      // Resolve available mirrors based on data source and URL prefix
      if (dataSource === 0 || rawLink.startsWith(DB0_BASE)) {
        for (const mirror of DB0_MIRRORS) {
          mirrors.push(rawLink.replace(DB0_BASE, mirror));
        }
      } else if (dataSource === 1 || rawLink.startsWith(DB1_BASE)) {
        for (const mirror of DB1_MIRRORS) {
          mirrors.push(rawLink.replace(DB1_BASE, mirror));
        }
      } else {
        // Direct / external link (e.g., Scratch, Turbowarp)
        mirrors.push(rawLink);
      }

      // Pick a random mirror initially for load balancing
      const initialMirror = mirrors[Math.floor(Math.random() * mirrors.length)] || rawLink;

      // Clean title and description
      const cleanTitle = formatTitle(app.title);
      let desc = app.desc || app.top_message || null;
      if (app.controls) {
        desc = desc ? `${desc}\n\n**Controls:**\n${app.controls}` : `**Controls:**\n${app.controls}`;
      }

      const normalized = normalizeGame({
        id: `duckmath_${app.id || app.title}`,
        name: cleanTitle,
        author: app.developer_name,
        description: desc,
        source: this.name,
        sourceUrl: `https://study.jok.ro/class/${app.title}`,
        url: initialMirror,
        cover: app.icon,
        fallbackThumbnail: '/assets/placeholders/default-game.svg',
        mirrors,
        controls: app.controls,
        directEmbed: true,
        supportsAboutBlank: app.supports_about_blank !== false,
        special: app.categories ? app.categories.split(' ') : []
      }, this.name);

      if (normalized) {
        games.push(normalized);
      }
    }

    return games;
  }
};
