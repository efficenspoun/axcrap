/**
 * generate-snapshots.cjs
 * Scrapes GN-Math, DuckMath, and LuminSDK and saves raw snapshots
 * to public/data/ for offline fallback in single-file builds.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DATA = path.join(__dirname, 'public', 'data');

// ─── GN-Math ────────────────────────────────────────────────────────────────

const GN_MATH_ENDPOINT = 'https://cdn.jsdelivr.net/gh/freebuisness/assets@f197f8edb9fa0bee74f1fdf582a0d17f5c6bd9a4/zones.json?t=1788737650575';
const GN_MATH_COVER_BASE = 'https://cdn.jsdelivr.net/gh/freebuisness/covers@main';
const GN_MATH_HTML_BASE = 'https://cdn.jsdelivr.net/gh/freebuisness/html@main';

async function scrapeGNMath() {
  console.log('Scraping GN-Math...');
  const res = await fetch(GN_MATH_ENDPOINT);
  if (!res.ok) throw new Error(`GN-Math fetch failed: ${res.status}`);
  const zones = await res.json();
  
  // Save raw zones as snapshot — the source module will reprocess them
  // We store the raw API response so gnmathSource.scrape() can work from snapshot
  const games = [];
  for (const zone of zones) {
    if (!zone || zone.id <= 0 || !zone.url || zone.url.includes('discord.gg')) continue;
    
    const coverUrl = (zone.cover || '')
      .replace('{COVER_URL}', GN_MATH_COVER_BASE)
      .replace('{HTML_URL}', GN_MATH_HTML_BASE);
    const embedUrl = (zone.url || '')
      .replace('{HTML_URL}', GN_MATH_HTML_BASE)
      .replace('{COVER_URL}', GN_MATH_COVER_BASE);
    
    games.push({
      id: zone.id,
      name: zone.name,
      author: zone.author,
      description: zone.description,
      authorLink: zone.authorLink,
      url: embedUrl,
      cover: coverUrl,
      special: zone.special
    });
  }
  
  console.log(`  Found ${games.length} games`);
  return games;
}

// ─── DuckMath ────────────────────────────────────────────────────────────────

const DB0_BASE = 'https://classroomlesson.github.io/basic-ruffle-player';
const DB0_MIRRORS = [
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

const DB1_BASE = 'https://db2.duckmath.org';
const DB1_MIRRORS = [
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

function formatTitle(slug) {
  if (!slug) return 'Not provided';
  return slug.split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
}

async function scrapeDuckMath() {
  console.log('Scraping DuckMath...');
  const res = await fetch(SUPABASE_ENDPOINT, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`DuckMath fetch failed: ${res.status}`);
  const rawApps = await res.json();
  
  const games = [];
  for (const app of rawApps) {
    if (!app || !app.link) continue;
    
    const rawLink = app.link.trim();
    const dataSource = app.url_data_source;
    const mirrors = [];
    
    if (dataSource === 0 || rawLink.startsWith(DB0_BASE)) {
      for (const mirror of DB0_MIRRORS) {
        mirrors.push(rawLink.replace(DB0_BASE, mirror));
      }
    } else if (dataSource === 1 || rawLink.startsWith(DB1_BASE)) {
      for (const mirror of DB1_MIRRORS) {
        mirrors.push(rawLink.replace(DB1_BASE, mirror));
      }
    } else {
      mirrors.push(rawLink);
    }
    
    games.push({
      id: app.id || app.title,
      title: app.title,
      developer_name: app.developer_name,
      desc: app.desc,
      top_message: app.top_message,
      controls: app.controls,
      icon: app.icon,
      categories: app.categories,
      supports_about_blank: app.supports_about_blank,
      link: rawLink,
      url_data_source: dataSource,
      mirrors
    });
  }
  
  console.log(`  Found ${games.length} games`);
  return games;
}

// ─── LuminSDK ────────────────────────────────────────────────────────────────

async function scrapeLumin() {
  console.log('Scraping LuminSDK...');
  if (typeof Lumin === 'undefined') {
    console.log('  LuminSDK not available (needs browser), generating minimal snapshot');
    return [];
  }
  
  await Lumin.init({ headless: true });
  
  const allRaw = [];
  let page = 1;
  while (true) {
    const result = await Lumin.getGames({ page, limit: 500, q: '' });
    const batch = result.games || [];
    allRaw.push(...batch);
    if (page >= (result.pages || 1) || allRaw.length >= (result.total || allRaw.length)) break;
    page++;
  }
  
  const games = allRaw.map(g => ({
    id: g.id,
    name: g.name,
    image_token: g.image_token,
    category: g.category
  }));
  
  console.log(`  Found ${games.length} games`);
  return games;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const [gnmath, duckmath] = await Promise.all([
      scrapeGNMath(),
      scrapeDuckMath()
    ]);
    
    // LuminSDK needs a browser environment, so we handle it separately
    let lumin = [];
    try {
      lumin = await scrapeLumin();
    } catch (e) {
      console.log('  LuminSDK scrape skipped (needs browser):', e.message);
    }
    
    fs.writeFileSync(
      path.join(PUBLIC_DATA, 'gnmath-games.snapshot.json'),
      JSON.stringify(gnmath, null, 2)
    );
    console.log(`✓ Saved gnmath-games.snapshot.json (${gnmath.length} games)`);
    
    fs.writeFileSync(
      path.join(PUBLIC_DATA, 'duckmath-games.snapshot.json'),
      JSON.stringify(duckmath, null, 2)
    );
    console.log(`✓ Saved duckmath-games.snapshot.json (${duckmath.length} games)`);
    
    fs.writeFileSync(
      path.join(PUBLIC_DATA, 'lumin-games.snapshot.json'),
      JSON.stringify(lumin, null, 2)
    );
    console.log(`✓ Saved lumin-games.snapshot.json (${lumin.length} games)`);
    
  } catch (err) {
    console.error('Failed to generate snapshots:', err);
    process.exit(1);
  }
}

main();
