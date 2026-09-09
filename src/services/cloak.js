/**
 * Cloaked Tab Opener
 *
 * Opens a copy of the current site in a fresh tab using one of three
 * "cloaking" methods that hide the real URL from the address bar:
 *
 * - about_blank: writes the page into an <about:blank> tab (inherits the
 *   origin/base URL of this page, so relative assets resolve correctly).
 * - blob: hosts the page as a Blob URL (needs an injected <base> tag).
 * - data_url: hosts the page as a data: URL (needs an injected <base> tag).
 *
 * After opening the cloaked tab, the current tab is sent to a benign page so
 * only the cloaked tab remains in view.
 *
 * DOM-touching logic lives here; pure string transforms live in cloakPure.js
 * so they can be unit tested without a browser.
 */

import {
  injectBaseTag,
  shouldUseBlob,
  stripScripts
} from './cloakPure.js';

const REDIRECT_URL = 'https://www.google.com/';

function ok() { return { ok: true, reason: null }; }
function fail(reason) { return { ok: false, reason }; }

/**
 * Build the HTML payload for the cloaked tab.
 *
 * - Strips <script> tags (prevents re-running the app, no infinite cloak recursion).
 * - Injects a <base> tag so relative asset URLs resolve to the parent origin.
 */
function buildClonedHtml() {
  const baseHref = new URL(window.location.href).href.replace(/\/[^/]*$/, '/');
  const cloned = '<!DOCTYPE html>' + document.documentElement.outerHTML;
  return injectBaseTag(stripScripts(cloned), baseHref);
}

function sendOriginalTabAway() {
  try {
    setTimeout(() => window.location.replace(REDIRECT_URL), 150);
  } catch {
    // Ignore navigations blocked by the host.
  }
}

function openAboutBlank() {
  const win = window.open('about:blank', '_blank', 'noopener=no');
  if (!win) return fail('blocked');
  try {
    const doc = win.document;
    doc.open();
    doc.write(buildClonedHtml());
    doc.close();
    return ok();
  } catch (e) {
    return fail('write_failed');
  }
}

function openBlob() {
  const blob = new Blob([buildClonedHtml()], { type: 'text/html' });
  const objectUrl = URL.createObjectURL(blob);
  const win = window.open(objectUrl, '_blank', 'noopener=no');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  return win ? ok() : fail('blocked');
}

function openDataUrl() {
  const html = buildClonedHtml();
  if (shouldUseBlob(html)) {
    return fail('too_large');
  }
  const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  const win = window.open(url, '_blank', 'noopener=no');
  return win ? ok() : fail('blocked');
}

/**
 * Open a cloaked tab using the given mode.
 *
 * @param {'about_blank'|'blob'|'data_url'} mode
 * @returns {{ ok: boolean, reason: string|null }}
 *   reason values:
 *     - null          on success
 *     - 'unknown_mode' if mode is not one of the supported values
 *     - 'too_large'   if data_url mode exceeds MAX_DATA_URL_BYTES (the caller
 *                     may retry with 'blob' mode as a fallback)
 *     - 'blocked'     if the popup was blocked by the browser
 *     - 'write_failed' if document.write() into about:blank was denied
 */
export function openCloaked(mode) {
  let result;
  switch (mode) {
    case 'about_blank': result = openAboutBlank(); break;
    case 'blob':        result = openBlob();        break;
    case 'data_url':    result = openDataUrl();     break;
    default:            return fail('unknown_mode');
  }

  if (result.ok) sendOriginalTabAway();
  return result;
}