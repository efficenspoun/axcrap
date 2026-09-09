/**
 * Pure helpers for the cloak feature.
 *
 * These are kept free of any DOM / window references so they can be unit
 * tested without a browser environment. The DOM-touching wrapper lives in
 * `cloak.js`.
 */

/** Maximum bytes for a data: URL we will produce. */
export const MAX_DATA_URL_BYTES = 1_500_000;

/**
 * Strip all <script>...</script> blocks from a cloned HTML document.
 *
 * The cloaked popup should NOT re-run the application: re-running causes
 * infinite cloaking recursion, double-charges the Wisp proxy quota, and
 * spawns a second instance of every modal. Inline `<script>` tags are
 * replaced with an HTML comment so the page's structure stays intact.
 *
 * The regex matches both `<script>...</script>` and self-closing variants
 * and tolerates attributes on the opening tag (`type="module"`, etc).
 */
export function stripScripts(html) {
  return html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    '<!-- script stripped for cloaked tab -->'
  );
}

/**
 * Inject a `<base href="...">` into the cloned HTML so relative asset
 * URLs in the cloaked popup still resolve to the parent app's origin.
 *
 * - If the document has a `<head>`, the `<base>` is appended to it.
 * - Otherwise if there's an `<html>`, a synthetic `<head>` is created.
 * - Otherwise the `<base>` is prepended to the document.
 *
 * Returns the modified HTML string. Does not mutate the input.
 */
export function injectBaseTag(html, baseHref) {
  const baseTag = `<base href="${baseHref}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => match + baseTag);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => match + '<head>' + baseTag + '</head>');
  }
  return baseTag + html;
}

/**
 * Estimate the byte length of a data: URL we'd build for `html`.
 *
 * The encoding uses `encodeURIComponent`, which expands most non-ASCII
 * characters into multi-byte UTF-8 escape sequences. We approximate the
 * final length as `html.length * 3` because every UTF-8 code point becomes
 * up to 3 escape characters (`%XX%XX%XX`).
 */
export function estimateDataUrlSize(html) {
  return html.length * 3;
}

/**
 * Decide whether a data: URL build should fall back to a blob: URL.
 */
export function shouldUseBlob(html) {
  return estimateDataUrlSize(html) > MAX_DATA_URL_BYTES;
}