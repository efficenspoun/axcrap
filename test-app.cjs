/**
 * test-app.cjs — smoke test for the current axcrap architecture.
 *
 * Replaces the legacy smoke test which referenced the old monolithic
 * games.json schema. This version asserts:
 *
 *   1. Required DOM IDs referenced from main.js exist in index.html.
 *   2. The iframe sandbox + referrerpolicy are present.
 *   3. No inline event handlers remain (CSP-friendliness).
 *   4. CSP meta tag is in place.
 *   5. The source-error-banner markup exists.
 *   6. The placeholder directory contains at least 12 vector placeholders.
 *   7. main.js is "lean" (under 250 lines — was <200 in legacy, relaxed for new banner code).
 *
 * Run with: node test-app.cjs
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- axcrap smoke test ---');

const root = __dirname;
const htmlPath    = path.join(root, 'index.html');
const mainJsPath  = path.join(root, 'src', 'main.js');
const html        = fs.readFileSync(htmlPath, 'utf-8');
const mainContent = fs.readFileSync(mainJsPath, 'utf-8');

// 1. Every getElementById in main.js must resolve to a real element in index.html.
const idMatches = [...mainContent.matchAll(/document\.getElementById\('([^']+)'\)/g)]
  .map((m) => m[1])
  .filter((id) => id !== 'btn-reset-filters'); // dynamically created in empty state

let missing = [];
for (const id of idMatches) {
  if (!html.includes(`id="${id}"`)) missing.push(id);
}
assert.strictEqual(missing.length, 0, `Missing element ids in index.html: ${missing.join(', ')}`);
console.log(`\u2713 All ${idMatches.length} static getElementById targets exist in index.html.`);

// 2. Iframe hardening.
assert(/sandbox="[^"]*allow-scripts/i.test(html), 'iframe missing allow-scripts in sandbox');
assert(/referrerpolicy="no-referrer"/i.test(html), 'iframe missing referrerpolicy="no-referrer"');
console.log('\u2713 Iframe sandbox + referrerpolicy in place.');

// 3. No inline event handlers in the source HTML (CSP-friendliness).
const inlineHandlers = [
  /on(?:error|click|load|submit|focus|blur)\s*=\s*["'][^"']*["']/i,
];
for (const re of inlineHandlers) {
  assert(!re.test(html), `Inline event handler found in index.html: ${re}`);
}
console.log('\u2713 No inline event handlers in index.html.');

// 4. CSP meta tag.
assert(/http-equiv=["']Content-Security-Policy["']/i.test(html), 'CSP meta tag missing');
assert(/script-src/i.test(html), 'CSP script-src directive missing');
// blob: must be in script-src so the game iframe (loaded as a blob URL) can
// run scripts. Without this, GN-Math games render as a black screen because
// their inline <script> blocks are blocked by CSP.
assert(/script-src[^;]*\bblob:/i.test(html), 'CSP script-src missing blob: (causes GN-Math black screen)');
console.log('\u2713 Content-Security-Policy meta tag present (with blob: in script-src).');

// 5. Source-error-banner markup.
assert(/id=["']source-error-banner["']/.test(html), 'source-error-banner missing from index.html');
assert(/id=["']source-error-list["']/.test(html), 'source-error-list missing from index.html');
console.log('\u2713 Source-error-banner markup present.');

// 6. Placeholders.
const placeholderDir = path.join(root, 'public', 'assets', 'placeholders');
assert(fs.existsSync(placeholderDir), 'placeholders directory missing');
const placeholderFiles = fs.readdirSync(placeholderDir);
assert(placeholderFiles.length >= 12, `Expected \u226512 placeholder SVGs, got ${placeholderFiles.length}`);
console.log(`\u2713 Placeholders verified: ${placeholderFiles.length} vector assets present.`);

// 7. main.js line budget.
const mainLines = mainContent.split('\n').length;
assert(mainLines < 250, `main.js too large (${mainLines} lines; budget 250)`);
console.log(`\u2713 main.js is lean: ${mainLines} lines.`);

// 8. All listed sources exist as files.
const requiredSources = ['gnmathSource', 'duckmathSource', 'velaraSource', 'truffledSource'];
for (const name of requiredSources) {
  assert(
    fs.existsSync(path.join(root, 'src', 'sources', `${name}.js`)),
    `missing source module: ${name}.js`
  );
}
console.log(`\u2713 All ${requiredSources.length} source modules present.`);

// 9. Schema module is present.
assert(
  fs.existsSync(path.join(root, 'src', 'sources', 'schema.js')),
  'missing src/sources/schema.js'
);
console.log('\u2713 schema.js present.');

// 10. Pure cloak helpers extracted for testability.
assert(
  fs.existsSync(path.join(root, 'src', 'services', 'cloakPure.js')),
  'missing src/services/cloakPure.js'
);
console.log('\u2713 cloakPure.js present.');

// 11. Vite config pinned (not relying on implicit defaults).
assert(
  fs.existsSync(path.join(root, 'vite.config.js')),
  'missing vite.config.js'
);
console.log('\u2713 vite.config.js present.');

console.log('\n--- SMOKE TEST PASSED ---');