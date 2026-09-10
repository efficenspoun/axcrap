/**
 * Pure helper for preparing game HTML before injection into an iframe.
 *
 * Tasks:
 * 1. Computes the base URL from the game URL (directory path).
 * 2. Strips any existing <base> tags so they don't override or conflict with
 *    the correct base URL (per HTML spec, only the first <base> tag is used).
 * 3. Injects <base href="..."> at the top of <head> so all relative assets
 *    (scripts, styles, wasm, images, audio, data) resolve correctly against the host/mirror.
 * 4. Ensures <meta charset="utf-8"> is present in <head>.
 */

/**
 * Calculate the base directory URL from a game URL.
 * @param {string} url
 * @returns {string}
 */
export function getBaseHref(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    // Strip query and hash before getting directory
    const parsed = new URL(url, 'https://axcrap.local/');
    const cleanPath = parsed.pathname.replace(/\/[^/]*$/, '/');
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `${parsed.origin}${cleanPath}`;
    }
    return cleanPath;
  } catch {
    return url.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/[^/]*$/, '/');
  }
}

/**
 * Prepare game HTML for embedding with base tag injection and cleanup.
 *
 * @param {string} html Raw game HTML
 * @param {string} gameUrl The URL where the game HTML was fetched from
 * @returns {string} Prepared HTML string
 */
export function prepareGameHtml(html, gameUrl) {
  if (typeof html !== 'string') return '';
  if (!gameUrl) return html;

  const baseHref = getBaseHref(gameUrl);
  if (!baseHref) return html;

  // 1. Strip any existing <base ...> tags so only our accurate base tag takes effect
  let cleaned = html.replace(/<base\b[^>]*\/?>/gi, '');

  const baseTag = `<base href="${baseHref}">`;
  const charsetTag = !/<meta\b[^>]*charset\b/i.test(cleaned) ? '<meta charset="utf-8">' : '';
  const injection = `${charsetTag}${baseTag}`;

  // 2. Inject into <head> (or wrap if missing)
  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
  }
  if (/<html[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<html[^>]*>/i, (match) => `${match}<head>${injection}</head>`);
  }
  return `<head>${injection}</head>${cleaned}`;
}
