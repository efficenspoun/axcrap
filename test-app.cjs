const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting axcrap Minimalist Verification ---');

// 1. Check games.json validity
const gamesPath = path.join(__dirname, 'public', 'data', 'games.json');
assert(fs.existsSync(gamesPath), 'games.json must exist');
const gamesData = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
assert(Array.isArray(gamesData) && gamesData.length >= 10, 'games.json should contain at least 10 games');
console.log(`✓ games.json valid: ${gamesData.length} games indexed.`);

// 2. Validate Game Object Structure (Title & Creator only, no ratings, no tags, no controls)
gamesData.forEach(game => {
  assert(game.id, `Game missing id`);
  assert(game.title, `Game ${game.id} missing title`);
  assert(game.creator, `Game ${game.id} missing creator`);
  assert(game.source, `Game ${game.id} missing source`);
  assert(game.sourceUrl, `Game ${game.id} missing sourceUrl`);
  assert(game.embedUrl, `Game ${game.id} missing embedUrl`);
  assert(game.aspectRatio, `Game ${game.id} missing aspectRatio`);
  assert(game.fallbackThumbnail, `Game ${game.id} missing fallbackThumbnail`);

  // Verify ratings are removed
  assert(game.rating === undefined, `Rating must be removed per user specification (found on ${game.id})`);
  assert(game.ratingCount === undefined, `RatingCount must be removed per user specification (found on ${game.id})`);
  // Verify tags and controls are removed
  assert(!game.tags, `Tags should not exist on ${game.id}`);
  assert(!game.controlsSummary, `Controls should not exist on ${game.id}`);
});
console.log('✓ Game data contracts validated: ratings, tags, and controls completely removed.');

// 3. Test Source Dropdown Extraction
const uniqueSources = Array.from(new Set(gamesData.map(g => g.source))).sort();
console.log(`✓ Sources detected (${uniqueSources.length}):`, uniqueSources);
assert(uniqueSources.includes('GitHub Open Source'), 'Should include GitHub Open Source');

// 4. Test Source Filter Logic
uniqueSources.forEach(source => {
  const filtered = gamesData.filter(g => g.source === source);
  assert(filtered.length > 0, `Filter for ${source} should return results`);
});
console.log('✓ Source filtering logic verified for all dropdown options.');

// 5. Test Title & Creator Search Simulation
const searchTitle = gamesData.filter(g => g.title.toLowerCase().includes('hextris'));
assert(searchTitle.length === 1 && searchTitle[0].id === 'hextris', 'Search by title failed');

const searchCreator = gamesData.filter(g => g.creator.toLowerCase().includes('cirulli'));
assert(searchCreator.length === 1 && searchCreator[0].id === '2048', 'Search by creator failed');
console.log('✓ Search matching verified for Title and Creator.');

// 6. Verify SVG Fallback Placeholders Exist on disk
const placeholderDir = path.join(__dirname, 'public', 'assets', 'placeholders');
assert(fs.existsSync(placeholderDir), 'Placeholders directory must exist');
const files = fs.readdirSync(placeholderDir);
assert(files.length >= 12, 'Must have at least 12 placeholder SVGs');
console.log(`✓ Minimalist Placeholders verified: ${files.length} vector assets present.`);

// 7. Verify Index.html Contains Required Modals and Elements
const htmlPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
assert(htmlContent.includes('id="source-select"'), 'Source dropdown missing in HTML');
assert(htmlContent.includes('id="search-input"'), 'Search input missing in HTML');
assert(htmlContent.includes('Report Game Broken'), 'Report Game Broken button text missing');
assert(htmlContent.includes('id="player-modal-overlay"'), 'Player modal missing in HTML');
assert(htmlContent.includes('id="report-modal-overlay"'), 'Report modal missing in HTML');
assert(!htmlContent.includes('modal-rating-container'), 'Rating container should be removed from HTML');
assert(htmlContent.includes('sandbox="allow-scripts'), 'Iframe sandbox missing');
// 8. Verify all static getElementById targets in main.js exist in index.html
const jsPath = path.join(__dirname, 'src', 'main.js');
const jsContent = fs.readFileSync(jsPath, 'utf-8');
const idMatches = [...jsContent.matchAll(/document\.getElementById\('([^']+)'\)/g)]
  .map(m => m[1])
  .filter(id => id !== 'btn-reset-filters'); // Dynamically created in empty state

idMatches.forEach(id => {
  assert(htmlContent.includes(`id="${id}"`), `Missing element with id="${id}" in index.html`);
});
console.log(`✓ All ${idMatches.length} static DOM IDs in main.js exist in index.html.`);

console.log('--- ALL MINIMALIST VERIFICATION CHECKS PASSED ---');


