/**
 * build-singlefile.cjs
 *
 * Produces dist/single.html — a self-contained single-file version of axcrap.
 * CSS and JS are inlined; the SVG fallback thumbnail and source snapshots are
 * embedded so the result can be opened directly with file://.
 *
 * Usage: node build-singlefile.cjs
 * (Run after `npm run build` so dist/ exists.)
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const ASSETS = path.join(DIST, 'assets');
const PUBLIC_DATA = path.join(__dirname, 'public', 'data');

// Hard upper bound on the resulting single-file HTML size. The browser
// must be able to parse and render this synchronously when opened via
// file:// — anything > 5 MB will be slow to load and may exceed the
// practical limits for `data:` URL consumers like the cloak feature.
const SIZE_WARN_BYTES = 5 * 1024 * 1024;

function toBase64DataUri(content, mime = 'image/svg+xml') {
  return `data:${mime};base64,${Buffer.from(content).toString('base64')}`;
}

function readJsonOrThrow(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `build-singlefile: missing ${label} at ${path.relative(__dirname, file)}.\n`
      + `  Run \`npm run generate-snapshots\` (or similar) first.`
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    throw new Error(`build-singlefile: ${label} at ${file} is not valid JSON: ${err.message}`);
  }
}

if (!fs.existsSync(DIST)) {
  throw new Error(`build-singlefile: ${path.relative(__dirname, DIST)} not found. Run "npm run build" first.`);
}
if (!fs.existsSync(ASSETS)) {
  throw new Error(`build-singlefile: ${path.relative(__dirname, ASSETS)} not found. Run "npm run build" first.`);
}

const assetFiles = fs.readdirSync(ASSETS);
const jsFile  = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.css'));
const placeholderSvg = path.join(ASSETS, 'placeholders', 'default-game.svg');

if (!jsFile)  throw new Error('build-singlefile: no index-*.js found in dist/assets/.');
if (!cssFile) throw new Error('build-singlefile: no index-*.css found in dist/assets/.');
if (!fs.existsSync(placeholderSvg)) {
  throw new Error(
    `build-singlefile: ${path.relative(__dirname, placeholderSvg)} missing.\n`
    + `  Did placeholders copy to dist/assets/placeholders/? Check public/assets/placeholders/.`
  );
}

const jsContent    = fs.readFileSync(path.join(ASSETS, jsFile), 'utf-8');
const cssContent   = fs.readFileSync(path.join(ASSETS, cssFile), 'utf-8');
const svgContent   = fs.readFileSync(placeholderSvg, 'utf-8');
const htmlTemplate = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

const svgDataUri = toBase64DataUri(svgContent);

// Snapshot keys deliberately match the absolute paths used by the source
// modules, so normal builds and single-file builds share the same code.
// LuminSDK was removed in 2026 because the upstream SDK + CDN are dead —
// no live game URLs can be resolved.
const snapshots = {
  '/data/velara-games.snapshot.json':   readJsonOrThrow(path.join(PUBLIC_DATA, 'velara-games.snapshot.json'),   'velara snapshot'),
  '/data/truffled-games.snapshot.json': readJsonOrThrow(path.join(PUBLIC_DATA, 'truffled-games.snapshot.json'), 'truffled snapshot'),
  '/data/gnmath-games.snapshot.json':   readJsonOrThrow(path.join(PUBLIC_DATA, 'gnmath-games.snapshot.json'),   'gnmath snapshot'),
  '/data/duckmath-games.snapshot.json': readJsonOrThrow(path.join(PUBLIC_DATA, 'duckmath-games.snapshot.json'), 'duckmath snapshot')
};

// Substitute literal placeholder path references inside the JS bundle with
// the data URI so the resulting single-file build has zero external requests
// for the default thumbnail.
const patchedJs = jsContent.split('/assets/placeholders/default-game.svg').join(svgDataUri);

// Looser regex that works regardless of attribute order, the presence of
// `crossorigin`, or whether the base path is `./assets/...` or `/assets/...`.
const scriptRegex = /<script\b[^>]*src="[^"]*assets\/index-[^"]+\.js"[^>]*>\s*<\/script>/g;
const linkRegex   = /<link\b[^>]*href="[^"]*assets\/index-[^"]+\.css"[^>]*>/g;

let html = htmlTemplate;
html = html.replace(scriptRegex, '');
html = html.replace(linkRegex, '');
html = html.replace(
  /<link\b[^>]*rel="icon"[^>]*href="[^"]*assets\/placeholders\/default-game\.svg"[^>]*>/,
  `<link rel="icon" type="image/svg+xml" href="${svgDataUri}">`
);

const BUILD_VERSION = `v2-${Date.now()}`;
const snapshotScript =
  `<script>window.__AXCRAP_SNAPSHOTS__=${JSON.stringify(snapshots)};`
  + `window.__AXCRAP_VERSION__="${BUILD_VERSION}";</script>`;
html = html.replace('</head>', `${snapshotScript}\n<style>${cssContent}</style>\n</head>`);
html = html.replace('</body>', `<script>${patchedJs}</script>\n</body>`);

const outPath = path.join(DIST, 'single.html');
fs.writeFileSync(outPath, html, 'utf-8');

const sizeBytes = Buffer.byteLength(html);
const sizeKb = (sizeBytes / 1024).toFixed(1);
console.log(`\u2713 dist/single.html written (${sizeKb} KB) \u2014 version: ${BUILD_VERSION}`);

if (sizeBytes > SIZE_WARN_BYTES) {
  console.warn(`\u26a0 single.html exceeds ${SIZE_WARN_BYTES / 1024 / 1024} MB budget (${sizeKb} KB).`);
}

console.log('\nSnapshot sizes:');
for (const [key, value] of Object.entries(snapshots)) {
  const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(1);
  const shape = Array.isArray(value) ? `${value.length} games` : 'object';
  console.log(`  ${key.padEnd(40)} ${kb.padStart(8)} KB  (${shape})`);
}