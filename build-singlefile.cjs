/**
 * build-singlefile.cjs
 *
 * Produces dist/single.html — a self-contained single-file version of axcrap.
 * CSS, JS, and the SVG fallback thumbnail are inlined so the result makes no
 * external asset requests (game catalogs are always scraped live; there are
 * no bundled snapshots).
 *
 * Usage: node build-singlefile.cjs
 * (Run after `npm run build` so dist/ exists.)
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const ASSETS = path.join(DIST, 'assets');

// Hard upper bound on the resulting single-file HTML size. The browser
// must be able to parse and render this synchronously — anything > 5 MB
// will be slow to load and may exceed the practical limits for `data:`
// URL consumers like the cloak feature.
const SIZE_WARN_BYTES = 5 * 1024 * 1024;

function toBase64DataUri(content, mime = 'image/svg+xml') {
  return `data:${mime};base64,${Buffer.from(content).toString('base64')}`;
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
const versionScript = `<script>window.__AXCRAP_VERSION__="${BUILD_VERSION}";</script>`;
html = html.replace('</head>', `${versionScript}\n<style>${cssContent}</style>\n</head>`);
html = html.replace('</body>', `<script>${patchedJs}</script>\n</body>`);

const outPath = path.join(DIST, 'single.html');
fs.writeFileSync(outPath, html, 'utf-8');

const sizeBytes = Buffer.byteLength(html);
const sizeKb = (sizeBytes / 1024).toFixed(1);
console.log(`\u2713 dist/single.html written (${sizeKb} KB) \u2014 version: ${BUILD_VERSION}`);

if (sizeBytes > SIZE_WARN_BYTES) {
  console.warn(`\u26a0 single.html exceeds ${SIZE_WARN_BYTES / 1024 / 1024} MB budget (${sizeKb} KB).`);
}