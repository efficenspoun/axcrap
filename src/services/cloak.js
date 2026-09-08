/**
 * Cloaked Tab Opener
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
 */

const REDIRECT_URL = 'https://www.google.com/';

function buildClonedHtml() {
  const baseHref = new URL(window.location.href).href.replace(/\/[^/]*$/, '/');
  const baseTag = `<base href="${baseHref}">`;
  let html = '<!DOCTYPE html>' + document.documentElement.outerHTML;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (match) => match + baseTag);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (match) => match + '<head>' + baseTag + '</head>');
  } else {
    html = baseTag + html;
  }
  return html;
}

function sendOriginalTabAway() {
  try {
    setTimeout(() => window.location.replace(REDIRECT_URL), 150);
  } catch {
    // Ignore navigations blocked by the host
  }
}

function openAboutBlank() {
  const win = window.open('about:blank', '_blank', 'noopener=no');
  if (!win) return false;
  const doc = win.document;
  doc.open();
  doc.write(buildClonedHtml());
  doc.close();
  return true;
}

function openBlob() {
  const blob = new Blob([buildClonedHtml()], { type: 'text/html' });
  const objectUrl = URL.createObjectURL(blob);
  const win = window.open(objectUrl, '_blank', 'noopener=no');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  return Boolean(win);
}

function openDataUrl() {
  const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(buildClonedHtml());
  const win = window.open(url, '_blank', 'noopener=no');
  return Boolean(win);
}

export function openCloaked(mode) {
  let opened = false;
  switch (mode) {
    case 'about_blank':
      opened = openAboutBlank();
      break;
    case 'blob':
      opened = openBlob();
      break;
    case 'data_url':
      opened = openDataUrl();
      break;
    default:
      return opened;
  }

  if (opened) {
    sendOriginalTabAway();
  }

  return opened;
}