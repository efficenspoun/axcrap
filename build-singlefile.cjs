/**
 * build-singlefile.cjs
 * Produces dist/single.html — a self-contained single-file version of axcrap.
 * CSS and JS are inlined; the SVG fallback thumbnail and source snapshots are
 * embedded so the result can be opened directly with file://.
 * LuminSDK remains external because its live API is not a static catalog.
 *
 * Usage: node build-singlefile.cjs
 * (Run after `vite build` so dist/ exists.)
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const ASSETS = path.join(DIST, 'assets');
const PUBLIC_DATA = path.join(__dirname, 'public', 'data');

function toBase64DataUri(content, mime = 'image/svg+xml') {
  return `data:${mime};base64,${Buffer.from(content).toString('base64')}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const assetFiles = fs.readdirSync(ASSETS);
const jsFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.css'));
if (!jsFile) throw new Error('No index-*.js found in dist/assets/');
if (!cssFile) throw new Error('No index-*.css found in dist/assets/');

const jsContent = fs.readFileSync(path.join(ASSETS, jsFile), 'utf-8');
const cssContent = fs.readFileSync(path.join(ASSETS, cssFile), 'utf-8');
const svgContent = fs.readFileSync(path.join(ASSETS, 'placeholders', 'default-game.svg'), 'utf-8');
const htmlTemplate = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

const svgDataUri = toBase64DataUri(svgContent);
const velaraSnapshot = readJson(path.join(PUBLIC_DATA, 'velara-games.snapshot.json'));
const truffledSnapshot = readJson(path.join(PUBLIC_DATA, 'truffled-games.snapshot.json'));

const patchedJs = jsContent.split('/assets/placeholders/default-game.svg').join(svgDataUri);

let html = htmlTemplate;

html = html.replace(
  /<script type="module" crossorigin src="\/assets\/index-[^"]+"><\/script>\s*/g,
  ''
);
html = html.replace(
  /<link rel="stylesheet" crossorigin href="\/assets\/index-[^"]+">\s*/g,
  ''
);
html = html.replace(
  /<link rel="icon" type="image\/svg\+xml" href="\/assets\/placeholders\/default-game\.svg">/,
  `<link rel="icon" type="image/svg+xml" href="${svgDataUri}">`
);

// Snapshot keys deliberately match the absolute paths used by the source
// modules, so normal builds and single-file builds share the same code.
const snapshotScript = `<script>window.__AXCRAP_SNAPSHOTS__ = ${JSON.stringify({
  '/data/velara-games.snapshot.json': velaraSnapshot,
  '/data/truffled-games.snapshot.json': truffledSnapshot
})};</script>`;

html = html.replace('</head>', `${snapshotScript}\n<style>${cssContent}</style>\n</head>`);
html = html.replace('</body>', `<script>${patchedJs}</script>\n</body>`);

const outPath = path.join(DIST, 'single.html');
fs.writeFileSync(outPath, html, 'utf-8');

const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ dist/single.html written (${sizeKb} KB)`);
