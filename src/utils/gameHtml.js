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

  // 0. Strip anti-embed / ad-logic obfuscated scripts that replace the
  // document with raw HTML source when the game detects it is embedded
  // outside its expected host (e.g. via about:blank / blob: / data: URLs).
  // These scripts are present in ~776 of the 843 GN-Math HTML wrappers and
  // contain identifiers like UravPbGESYjDUNqxKcf$Vqza, ykJYJgqRQvLQ,
  // c$uljJUCGCQHFqM and sFfEkK$fMziBAJZwZbkuvp. They dynamically inject
  // https://cdn.r9x.in/ailogic_*.js which then shows the HTML source as
  // text inside a <pre> when location is not whitelisted.
  let cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (match) => {
    if (
      match.includes('UravPbGESYj') ||
      match.includes('ykJYJgqRQvLQ') ||
      match.includes('c$uljJUCGCQHFqM') ||
      match.includes('sFfEkK$fMziBAJZwZbkuvp') ||
      // The string table itself contains these markers; the loader is the
      // only script that defines both tables, so matching any of them is
      // sufficient to identify the anti-embed payload without touching
      // legitimate game scripts (c2runtime.js, bundle.js, etc.).
      (match.includes('_0xe8c3') && match.includes('_0x257e') && match.includes('UravPb'))
    ) {
      return '<!-- anti-embed script removed -->';
    }
    return match;
  });

  // 1. Handle <base> intelligently:
  //    - If the HTML already contains an absolute base (https://...), it is
  //      almost certainly the correct asset base authored for the game
  //      (e.g. https://cdn.jsdelivr.net/gh/Replku/Ovo@.../ or
  //      https://cdn.jsdelivr.net/gh/taskmaster773/google-class/temple-run-2/).
  //      In that case we preserve it and do NOT inject a new one derived
  //      from the wrapper URL (which would point at .../html@main/ and 404).
  //    - If the only base(s) are relative ("/", "./", "assets/") or there
  //      is no base at all, we strip them and inject the accurate base
  //      derived from gameUrl so relative assets resolve correctly.
  const baseTags = [...cleaned.matchAll(/<base\b[^>]*>/gi)];
  const hasAbsoluteBase = baseTags.some((m) => /href\s*=\s*["']\s*https?:\/\//i.test(m[0]));

  const hasCharset = /<meta\b[^>]*charset\b/i.test(cleaned);
  const charsetTag = hasCharset ? '' : '<meta charset="utf-8">';

  if (hasAbsoluteBase) {
    // Preserve the existing absolute base. Only ensure charset is present.
    if (!charsetTag) return cleaned;
    if (/<head[^>]*>/i.test(cleaned)) {
      return cleaned.replace(/<head[^>]*>/i, (match) => `${match}${charsetTag}`);
    }
    if (/<html[^>]*>/i.test(cleaned)) {
      return cleaned.replace(/<html[^>]*>/i, (match) => `${match}<head>${charsetTag}</head>`);
    }
    return `<head>${charsetTag}</head>${cleaned}`;
  }

  // No absolute base — strip any relative bases and inject the computed one.
  cleaned = cleaned.replace(/<base\b[^>]*\/?>/gi, '');

  const baseHref = getBaseHref(gameUrl);
  if (!baseHref) {
    // No base to inject, just ensure charset
    if (!charsetTag) return cleaned;
    if (/<head[^>]*>/i.test(cleaned)) {
      return cleaned.replace(/<head[^>]*>/i, (match) => `${match}${charsetTag}`);
    }
    if (/<html[^>]*>/i.test(cleaned)) {
      return cleaned.replace(/<html[^>]*>/i, (match) => `${match}<head>${charsetTag}</head>`);
    }
    return `<head>${charsetTag}</head>${cleaned}`;
  }

  const baseTag = `<base href="${baseHref}">`;
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
