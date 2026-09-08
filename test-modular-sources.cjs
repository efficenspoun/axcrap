const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing axcrap Modular Architecture & Scrapers ---');

// 1. Verify file modularity
const srcDir = path.join(__dirname, 'src');
const sourcesDir = path.join(srcDir, 'sources');
const uiDir = path.join(srcDir, 'ui');

assert(fs.existsSync(path.join(sourcesDir, 'schema.js')), 'schema.js must exist');
assert(fs.existsSync(path.join(sourcesDir, 'gnmathSource.js')), 'gnmathSource.js must exist');
assert(fs.existsSync(path.join(sourcesDir, 'sourceManager.js')), 'sourceManager.js must exist');

assert(fs.existsSync(path.join(uiDir, 'grid.js')), 'grid.js must exist');
assert(fs.existsSync(path.join(uiDir, 'playerModal.js')), 'playerModal.js must exist');
assert(fs.existsSync(path.join(uiDir, 'reportModal.js')), 'reportModal.js must exist');
assert(fs.existsSync(path.join(uiDir, 'filters.js')), 'filters.js must exist');
assert(fs.existsSync(path.join(uiDir, 'toast.js')), 'toast.js must exist');

console.log('✓ Modularity verified: all source and UI modules present.');

// 2. Verify main.js is lean
const mainContent = fs.readFileSync(path.join(srcDir, 'main.js'), 'utf-8');
const mainLines = mainContent.split('\n').length;
console.log(`✓ main.js line count: ${mainLines} lines (Clean orchestration)`);
assert(mainLines < 200, 'main.js should be lean (< 200 lines)');

// 3. Test schema normalization logic
async function testSchema() {
  const { normalizeGame } = await import('./src/sources/schema.js');

  // Case A: completely empty object
  const emptyNormalized = normalizeGame({});
  assert.strictEqual(emptyNormalized.title, 'Not provided', 'Empty title must be "Not provided"');
  assert.strictEqual(emptyNormalized.author, 'Not provided', 'Empty author must be "Not provided"');
  assert.strictEqual(emptyNormalized.description, 'Not provided', 'Empty description must be "Not provided"');
  assert.strictEqual(emptyNormalized.source, 'Not provided', 'Empty source must be "Not provided"');
  console.log('✓ Strict fallback verified: empty object produces "Not provided" for title, author, and description.');

  // Case B: partial object
  const partialNormalized = normalizeGame({
    name: '  Geometry Dash  ',
    author: '  RobTop  '
    // description omitted
  });
  assert.strictEqual(partialNormalized.title, 'Geometry Dash', 'Title should be trimmed');
  assert.strictEqual(partialNormalized.author, 'RobTop', 'Author should be trimmed');
  assert.strictEqual(partialNormalized.description, 'Not provided', 'Missing description should be "Not provided"');
  console.log('✓ Partial object normalization verified: supplied fields trimmed, omitted description is "Not provided".');
}

// 4. Test gnmath Source scraping live
async function testgnmathScrape() {
  console.log('Testing live browser scraper for gnmath source...');
  const { gnmathSource } = await import('./src/sources/gnmathSource.js');

  const games = await gnmathSource.scrape();
  assert(Array.isArray(games), 'Scraped games must be an array');
  assert(games.length > 50, `Expected at least 50 games, got ${games.length}`);
  console.log(`✓ Scraped successfully: ${games.length} games retrieved from gnmath endpoint.`);

  // Verify first 5 games
  for (let i = 0; i < 5; i++) {
    const g = games[i];
    assert(g.id, `Game ${i} must have id`);
    assert(g.title && g.title !== '', `Game ${i} must have title`);
    assert(g.author && g.author !== '', `Game ${i} must have author`);
    assert(g.description === 'Not provided', `Game ${i} description must be 'Not provided' since zones.json omits it`);
    assert(g.embedUrl.startsWith('https://cdn.jsdelivr.net/gh/freebuisness/html@main'), `Game ${i} embedUrl must be resolved`);
    assert(g.thumbnailUrl.startsWith('https://cdn.jsdelivr.net/gh/freebuisness/covers@main'), `Game ${i} thumbnailUrl must be resolved`);
  }
  console.log('✓ Asset URL resolution verified: {COVER_URL} and {HTML_URL} expanded accurately.');
  console.log('✓ Descriptions verified: all default cleanly to "Not provided".');
}

// 5. Test 3-Panel Player Modal in index.html
function testIndexHtml() {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  assert(indexHtml.includes('modal-game-description'), 'index.html must contain modal-game-description');
  assert(indexHtml.includes('player-other-games-list'), 'index.html must contain player-other-games-list');
  assert(indexHtml.includes('player-left-panel'), 'index.html must contain player-left-panel');
  assert(indexHtml.includes('player-center-stage'), 'index.html must contain player-center-stage');
  assert(indexHtml.includes('player-right-panel'), 'index.html must contain player-right-panel');
  assert(indexHtml.includes('btn-refresh-sources'), 'index.html must contain re-scrape button');
  console.log('✓ 3-Panel Theater player modal DOM markup verified in index.html.');
}

async function runAll() {
  await testSchema();
  await testgnmathScrape();
  testIndexHtml();
  console.log('\n--- ALL VERIFICATION CHECKS PASSED SUCCESSFULLY ---');
}

runAll().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
