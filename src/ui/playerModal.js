/**
 * Game Player Modal
 * 3-Panel Theater View:
 * - Left: Game Title, Author, Description, Source link, Mirror Switcher, Embed Method Switcher, Actions
 * - Center: Sandboxed Game Iframe
 * - Right: "Other Games" list to quickly switch games (only when not in fullscreen)
 */

import { resolveUrl, isWispEnabled } from '../proxy/wispProxy.js';
import { settings, VALID_EMBED_METHODS } from '../settings/settingsManager.js';
import { prepareGameHtml } from '../utils/gameHtml.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { showToast } from './toast.js';

async function resolveSafely(url) {
  try {
    return await resolveUrl(url);
  } catch (e) {
    console.warn('Wisp proxy unavailable, using raw URL:', e);
    return url;
  }
}

export class PlayerModal {
  constructor(options = {}) {
    this.allGames = [];
    this.activeGame = null;
    this.onReportGame = options.onReportGame || null;
    this.currentBlobUrl = null;
    this.activeEmbedMethod = settings.embedMethod || 'document.write';

    // Cache elements
    this.overlay = document.getElementById('player-modal-overlay');
    this.frameContainer = document.getElementById('player-frame-container');
    this.iframe = document.getElementById('player-iframe');
    this.titleEl = document.getElementById('modal-game-title');
    this.authorEl = document.getElementById('modal-game-author');
    this.descEl = document.getElementById('modal-game-description');
    this.sourceBtn = document.getElementById('modal-source-btn');
    this.sourceTag = document.getElementById('modal-source-tag');
    this.btnClose = document.getElementById('btn-close-player');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnReport = document.getElementById('btn-report-game');
    this.fallbackLink = document.getElementById('embed-fallback-link');
    this.fallbackBanner = document.getElementById('embed-fallback');
    this.otherGamesContainer = document.getElementById('player-other-games-list');

    // Mirror UI elements
    this.mirrorBox = document.getElementById('player-mirror-box');
    this.mirrorBadge = document.getElementById('modal-mirror-badge');
    this.mirrorHostEl = document.getElementById('modal-mirror-host');
    this.btnSwitchMirror = document.getElementById('btn-switch-mirror');
    this.currentActiveMirror = null;

    // Embed method UI elements
    this.embedSelect = document.getElementById('player-embed-method-select');
    this.embedBadge = document.getElementById('modal-embed-badge');

    this.setupListeners();
  }

  setCatalog(games) {
    this.allGames = games || [];
  }

  setupListeners() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }

    if (this.btnReport) {
      this.btnReport.addEventListener('click', () => {
        if (this.activeGame && this.onReportGame) {
          this.onReportGame(this.activeGame);
        }
      });
    }

    if (this.btnSwitchMirror) {
      this.btnSwitchMirror.addEventListener('click', () => this.switchMirror());
    }

    if (this.embedSelect) {
      this.embedSelect.addEventListener('change', () => {
        const newMethod = this.embedSelect.value;
        if (VALID_EMBED_METHODS.includes(newMethod)) {
          this.activeEmbedMethod = newMethod;
          settings.setEmbedMethod(newMethod);
          this._updateEmbedBadge(newMethod);
          if (this.activeGame) {
            this._loadGame(this.activeGame, this.currentActiveMirror, newMethod);
          }
          const label = this.embedSelect.selectedOptions[0]?.text || newMethod;
          showToast(`Switched embed method: ${label}`, 'info');
        }
      });
    }

    window.addEventListener('message', (e) => {
      if (e.data === 'switch_mirror') {
        this.switchMirror();
      } else if (typeof e.data === 'string' && e.data.startsWith('set_embed_method:')) {
        const method = e.data.slice('set_embed_method:'.length);
        if (VALID_EMBED_METHODS.includes(method)) {
          this.switchEmbedMethod(method);
        }
      }
    });

    // Quick switch games delegation in the right panel
    if (this.otherGamesContainer) {
      this.otherGamesContainer.addEventListener('click', (e) => {
        const item = e.target.closest('[data-switch-game-id]');
        if (item) {
          const gameId = item.getAttribute('data-switch-game-id');
          this.open(gameId);
        }
      });
    }
  }

  switchEmbedMethod(method) {
    if (!VALID_EMBED_METHODS.includes(method)) return;
    this.activeEmbedMethod = method;
    if (this.embedSelect) {
      this.embedSelect.value = method;
    }
    this._updateEmbedBadge(method);
    settings.setEmbedMethod(method);
    if (this.activeGame) {
      this._loadGame(this.activeGame, this.currentActiveMirror, method);
    }
  }

  switchMirror() {
    if (!this.activeGame || !this.activeGame.mirrors || this.activeGame.mirrors.length <= 1) return;
    const available = this.activeGame.mirrors.filter(m => m !== this.currentActiveMirror);
    const nextMirror = available[Math.floor(Math.random() * available.length)] || this.activeGame.mirrors[0];
    this.currentActiveMirror = nextMirror;
    this._updateMirrorUi(nextMirror);
    this._loadGame(this.activeGame, nextMirror, this.activeEmbedMethod);
  }

  _updateMirrorUi(url) {
    if (!this.mirrorHostEl) return;
    try {
      const u = new URL(url);
      this.mirrorHostEl.textContent = u.hostname;
      this.mirrorHostEl.title = url;
    } catch {
      this.mirrorHostEl.textContent = 'Mirror';
    }
  }

  _updateEmbedBadge(method) {
    if (!this.embedBadge) return;
    const labels = {
      'document.write': 'doc.write',
      'srcdoc': 'srcdoc',
      'blob': 'blob URL',
      'data_url': 'data URL',
      'direct': 'direct URL',
      'cors_proxy': 'CORS proxy'
    };
    this.embedBadge.textContent = labels[method] || method;
  }

  open(gameId) {
    const game = this.allGames.find(g => String(g.id) === String(gameId));
    if (!game) return;

    this.activeGame = game;

    // Determine initial mirror
    if (Array.isArray(game.mirrors) && game.mirrors.length > 0) {
      this.currentActiveMirror = game.mirrors[0];
      if (this.mirrorBox) this.mirrorBox.style.display = 'flex';
      if (this.mirrorBadge) this.mirrorBadge.style.display = 'inline-block';
      this._updateMirrorUi(this.currentActiveMirror);
    } else {
      this.currentActiveMirror = game.embedUrl;
      if (this.mirrorBox) this.mirrorBox.style.display = 'none';
      if (this.mirrorBadge) this.mirrorBadge.style.display = 'none';
    }

    // Synchronize embed method with settings
    this.activeEmbedMethod = settings.embedMethod || 'document.write';
    if (this.embedSelect) {
      this.embedSelect.value = this.activeEmbedMethod;
    }
    this._updateEmbedBadge(this.activeEmbedMethod);

    // Populate Left Details Panel
    if (this.titleEl) this.titleEl.textContent = game.title || 'Not provided';
    if (this.authorEl) this.authorEl.textContent = `By ${game.author || 'Not provided'}`;
    if (this.descEl) this.descEl.textContent = game.description || 'Not provided';

    if (this.sourceTag) this.sourceTag.textContent = game.source || 'Not provided';
    if (this.sourceBtn) {
      const validLink = game.sourceUrl && game.sourceUrl !== 'Not provided' ? game.sourceUrl : '#';
      this.sourceBtn.href = validLink;
      this.sourceBtn.style.display = validLink !== '#' ? 'inline-flex' : 'none';
    }

    // Populate Right Panel ("Other Games")
    this.renderOtherGames(game.id);

    // Show modal
    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Load game
    this._loadGame(game, this.currentActiveMirror, this.activeEmbedMethod);
  }

  _revokeBlobUrl() {
    if (this.currentBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentBlobUrl);
      } catch (e) {
        // ignore
      }
      this.currentBlobUrl = null;
    }
  }

  _resetIframe() {
    if (!this.iframe) return;
    this._revokeBlobUrl();
    try {
      this.iframe.removeAttribute('srcdoc');
      // Test if contentDocument is accessible without cross-origin exceptions
      let accessible = false;
      try {
        accessible = Boolean(this.iframe.contentDocument);
      } catch {
        accessible = false;
      }
      if (!accessible) {
        const newFrame = this.iframe.cloneNode(false);
        this.iframe.replaceWith(newFrame);
        this.iframe = newFrame;
      }
    } catch (e) {
      // Fallback
    }
  }

  /**
   * Load game HTML or URL into the iframe using the specified embed method.
   *
   * Supported methods:
   * - 'document.write': CORS fetch + base tag injection + contentDocument.write()
   * - 'srcdoc': CORS fetch + base tag injection + iframe.srcdoc
   * - 'blob': CORS fetch + base tag injection + Blob URL (URL.createObjectURL)
   * - 'data_url': CORS fetch + base tag injection + Data URL
   * - 'direct': Direct iframe src navigation (resolved via Wisp if active)
   * - 'cors_proxy': CORS Proxy iframe src (corsproxy.io)
   */
  async _loadGame(game, targetUrl = null, preferredMethod = null) {
    if (!this.iframe) return;

    let url = targetUrl || this.currentActiveMirror || game.embedUrl;
    if (!url) return;

    if (url.endsWith('/pre.html')) {
      url = url.replace(/\/pre\.html$/, '/index.html');
    }

    const method = preferredMethod || this.activeEmbedMethod || settings.embedMethod || 'document.write';
    this._updateEmbedBadge(method);

    // Show loading state
    this._showLoadingIndicator();

    // 1. Direct embed method
    if (method === 'direct') {
      try {
        this._renderWithDirect(await resolveSafely(url));
      } catch (err) {
        this._renderErrorScreen(game, url, `Direct load failed: ${err.message}`, method);
      }
      return;
    }

    // 2. CORS Proxy embed method
    if (method === 'cors_proxy') {
      this._renderWithCorsProxy(url);
      return;
    }

    // 3. If Wisp proxy is enabled, use Ultraviolet proxified URL directly
    if (isWispEnabled()) {
      try {
        const proxied = await resolveUrl(url);
        this._renderWithDirect(proxied);
        return;
      } catch (e) {
        console.warn('Wisp proxy failed, continuing with selected embed method:', e);
      }
    }

    // 4. Methods requiring HTML fetch: document.write, srcdoc, blob, data_url
    try {
      const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const rawHtml = await response.text();

      // Ensure user hasn't switched to another game while fetch was running
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        const preparedHtml = prepareGameHtml(rawHtml, url);
        this._renderHtmlWithMethod(preparedHtml, method);
      }
    } catch (err) {
      console.warn(`HTML fetch for embed method "${method}" failed, attempting fallback:`, err);
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        // If HTML fetch failed (e.g. CORS not allowed on target mirror), fall back to direct embed
        try {
          const directUrl = await resolveSafely(url);
          this._renderWithDirect(directUrl);
          this._updateEmbedBadge('direct (fallback)');
        } catch (fallbackErr) {
          this._renderErrorScreen(game, url, err.message, method);
        }
      }
    }
  }

  _showLoadingIndicator() {
    this._resetIframe();
    try {
      const doc = this.iframe.contentDocument || this.iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"></head><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">
            <div style="text-align:center">
              <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
              <div>Loading game...</div>
            </div>
          </body></html>
        `);
        doc.close();
        return;
      }
    } catch {}
    this.iframe.srcdoc = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"></head><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">
        <div style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
          <div>Loading game...</div>
        </div>
      </body></html>
    `;
  }

  _renderHtmlWithMethod(html, method) {
    switch (method) {
      case 'srcdoc':
        this._renderWithSrcdoc(html);
        break;
      case 'blob':
        this._renderWithBlob(html);
        break;
      case 'data_url':
        this._renderWithDataUrl(html);
        break;
      case 'document.write':
      default:
        this._renderWithDocumentWrite(html);
        break;
    }
  }

  _renderWithDocumentWrite(html) {
    this._resetIframe();
    try {
      const doc = this.iframe.contentDocument || this.iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      } else {
        this.iframe.srcdoc = html;
      }
    } catch (e) {
      console.warn('document.write failed, falling back to srcdoc:', e);
      this.iframe.srcdoc = html;
    }
  }

  _renderWithSrcdoc(html) {
    this._resetIframe();
    this.iframe.removeAttribute('src');
    this.iframe.srcdoc = html;
  }

  _renderWithBlob(html) {
    this._resetIframe();
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      this.currentBlobUrl = URL.createObjectURL(blob);
      this.iframe.src = this.currentBlobUrl;
    } catch (e) {
      console.warn('Blob URL embedding failed, falling back to document.write:', e);
      this._renderWithDocumentWrite(html);
    }
  }

  _renderWithDataUrl(html) {
    this._resetIframe();
    try {
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      this.iframe.src = dataUrl;
    } catch (e) {
      console.warn('Data URL embedding failed, falling back to srcdoc:', e);
      this._renderWithSrcdoc(html);
    }
  }

  _renderWithDirect(url) {
    this._resetIframe();
    this.iframe.src = url;
  }

  _renderWithCorsProxy(url) {
    this._resetIframe();
    this.iframe.src = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  }

  _renderErrorScreen(game, url, message, activeMethod = '') {
    if (!this.activeGame || String(this.activeGame.id) !== String(game.id)) return;
    const hasMultipleMirrors = Array.isArray(game.mirrors) && game.mirrors.length > 1;
    const errorHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"></head><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#e55;">
        <div style="text-align:center;padding:2rem;max-width:540px;">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">⚠️</div>
          <div style="font-size:1.1rem;margin-bottom:0.5rem;color:#f87171;font-weight:600;">Failed to load game</div>
          <div style="font-size:0.85rem;color:#a1a1aa;margin-bottom:1rem;word-break:break-word;">${escapeHtml(message)}</div>
          <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:1rem;">
            ${hasMultipleMirrors ? `
              <button onclick="parent.postMessage('switch_mirror', '*')"
                style="cursor:pointer;padding:0.5rem 0.9rem;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:0.85rem;font-weight:500;">
                🎲 Try Another Mirror
              </button>
            ` : ''}
            <button onclick="parent.postMessage('set_embed_method:direct', '*')"
              style="cursor:pointer;padding:0.5rem 0.9rem;background:#27272a;color:#f4f4f5;border:1px solid rgba(255,255,255,0.15);border-radius:6px;font-size:0.85rem;">
              Direct Embed
            </button>
            <button onclick="parent.postMessage('set_embed_method:cors_proxy', '*')"
              style="cursor:pointer;padding:0.5rem 0.9rem;background:#27272a;color:#f4f4f5;border:1px solid rgba(255,255,255,0.15);border-radius:6px;font-size:0.85rem;">
              CORS Proxy
            </button>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:0.5rem 0.9rem;background:#1e3a5f;color:#7eb8f7;border-radius:6px;text-decoration:none;font-size:0.85rem;">
              Open in new tab ↗
            </a>
          </div>
        </div>
      </body></html>
    `;
    this._renderWithSrcdoc(errorHtml);
  }

  renderOtherGames(currentGameId) {
    if (!this.otherGamesContainer) return;

    // Pick other games from the catalog
    const others = this.allGames.filter(g => String(g.id) !== String(currentGameId));
    const sample = others.slice(0, 24);

    this.otherGamesContainer.innerHTML = sample.map(g => `
      <div class="other-game-card" data-switch-game-id="${escapeHtml(g.id)}" title="Switch to ${escapeHtml(g.title)}">
        <img 
          src="${escapeHtml(g.thumbnailUrl)}" 
          alt="${escapeHtml(g.title)}" 
          class="other-game-thumb"
          loading="lazy"
          onerror="window.handleCardImgError(this, '${escapeHtml(g.fallbackThumbnail || '/assets/placeholders/default-game.svg')}')"
        />
        <div class="other-game-meta">
          <div class="other-game-title">${escapeHtml(g.title)}</div>
          <div class="other-game-author">${escapeHtml(g.author)}</div>
        </div>
      </div>
    `).join('');
  }

  close() {
    this.overlay.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
    this._revokeBlobUrl();
    // Blank the iframe to stop audio/execution
    if (this.iframe) {
      try {
        this.iframe.removeAttribute('srcdoc');
        this.iframe.src = 'about:blank';
      } catch (e) {
        // ignore
      }
    }
    document.body.style.overflow = '';
    this.activeGame = null;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (this.frameContainer.requestFullscreen) {
        this.frameContainer.requestFullscreen();
      } else if (this.frameContainer.webkitRequestFullscreen) {
        this.frameContainer.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => { });
      }
    }
  }

  isOpen() {
    return this.overlay?.classList.contains('active') ?? false;
  }
}
