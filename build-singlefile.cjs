/**
 * build-singlefile.cjs
 * Produces dist/single.html — a self-contained single-file version of axcrap.
 * CSS and JS are inlined; the SVG fallback thumbnail becomes a data URI.
 * External CDN deps (LuminSDK, Google Fonts) stay as <script>/<link> tags.
 *
 * Usage:  node build-singlefile.cjs
 * (Run after `vite build` so dist/ exists.)
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const ASSETS = path.join(DIST, 'assets');

// ── helpers ────────────────────────────────────────────────────────────
function toBase64DataUri(content, mime = 'image/svg+xml') {
  return `data:${mime};base64,${Buffer.from(content).toString('base64')}`;
}

// ── read assets ────────────────────────────────────────────────────────
const assetFiles = fs.readdirSync(ASSETS);
const jsFile  = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.css'));
if (!jsFile)  throw new Error('No index-*.js found in dist/assets/');
if (!cssFile) throw new Error('No index-*.css found in dist/assets/');

const jsContent  = fs.readFileSync(path.join(ASSETS, jsFile), 'utf-8');
const cssContent = fs.readFileSync(path.join(ASSETS, cssFile), 'utf-8');
const svgContent = fs.readFileSync(path.join(ASSETS, 'placeholders', 'default-game.svg'), 'utf-8');
const htmlTemplate = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

// ── build data URIs ────────────────────────────────────────────────────
const svgDataUri = toBase64DataUri(svgContent);

// Replace the SVG path reference in the JS so the fallback thumbnail works
// without the physical file.  The string appears as a literal in the bundle.
const patchedJs = jsContent.split('/assets/placeholders/default-game.svg').join(svgDataUri);

// ── assemble single HTML ──────────────────────────────────────────────
let html = htmlTemplate;

// 1. Remove the original external JS script tag
html = html.replace(
  /<script type="module" crossorigin src="\/assets\/index-[^"]+"><\/script>\s*/g,
  ''
);

// 2. Remove the original external CSS link tag
html = html.replace(
  /<link rel="stylesheet" crossorigin href="\/assets\/index-[^"]+">\s*/g,
  ''
);

// 3. Replace the favicon link with an inline data URI
html = html.replace(
  /<link rel="icon" type="image\/svg\+xml" href="\/assets\/placeholders\/default-game\.svg">/,
  `<link rel="icon" type="image/svg+xml" href="${svgDataUri}">`
);

// 4. Inject inline CSS before </head>
html = html.replace(
  '</head>',
  `<style>${cssContent}</style>\n</head>`
);

// 5. Inject inline JS before </body>
html = html.replace(
  '</body>',
  `<script>${patchedJs}</script>\n</body>`
);

// ── write output ───────────────────────────────────────────────────────
const outPath = path.join(DIST, 'single.html');
fs.writeFileSync(outPath, html, 'utf-8');

const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✓ dist/single.html written (${sizeKb} KB)`);
