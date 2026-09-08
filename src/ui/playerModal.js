/**
 * Game Player Modal
 * 3-Panel Theater View:
 * - Left: Game Title, Author, Description ("Not provided" fallback), Source link, Actions
 * - Center: Sandboxed Game Iframe
 * - Right: "Other Games" list to quickly switch games (only when not in fullscreen)
 */

import { luminSource } from '../sources/luminSource.js';
import { resolveUrl, isWispEnabled } from '../proxy/wispProxy.js';
import { escapeHtml } from '../utils/escapeHtml.js';

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

    window.addEventListener('message', (e) => {
      if (e.data === 'switch_mirror') {
        this.switchMirror();
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

  switchMirror() {
    if (!this.activeGame || !this.activeGame.mirrors || this.activeGame.mirrors.length <= 1) return;
    const available = this.activeGame.mirrors.filter(m => m !== this.currentActiveMirror);
    const nextMirror = available[Math.floor(Math.random() * available.length)] || this.activeGame.mirrors[0];
    this.currentActiveMirror = nextMirror;
    this._updateMirrorUi(nextMirror);
    this._loadGame(this.activeGame, nextMirror);
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

  open(gameId) {
    const game = this.allGames.find(g => String(g.id) === String(gameId));
    if (!game) return;

    this.activeGame = game;

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

    // Handle LuminSDK games - fetch game URL via LuminSDK API
    const isLuminGame = game.source === 'LuminSDK';
    
    if (isLuminGame) {
      // Hide mirror UI for LuminSDK games
      if (this.mirrorBox) this.mirrorBox.style.display = 'none';
      if (this.mirrorBadge) this.mirrorBadge.style.display = 'none';
      
      // Show loading state
      if (this.fallbackBanner) this.fallbackBanner.style.display = 'none';
      if (this.iframe) {
        this.iframe.style.display = 'block';
        this._loadLuminGame(game);
      }
    } else {
      // Mirror Selection (pick random mirror from pool if available)
      const hasMirrors = Array.isArray(game.mirrors) && game.mirrors.length > 0;
      if (hasMirrors) {
        if (this.mirrorBox) this.mirrorBox.style.display = 'flex';
        if (this.mirrorBadge) {
          this.mirrorBadge.style.display = 'inline-block';
          this.mirrorBadge.textContent = `${game.mirrors.length} Mirrors`;
        }
        const initialMirror = game.mirrors[Math.floor(Math.random() * game.mirrors.length)];
        this.currentActiveMirror = initialMirror;
        this._updateMirrorUi(initialMirror);
      } else {
        if (this.mirrorBox) this.mirrorBox.style.display = 'none';
        if (this.mirrorBadge) this.mirrorBadge.style.display = 'none';
        this.currentActiveMirror = game.embedUrl;
      }

      // Populate Center Iframe
      if (this.fallbackBanner) this.fallbackBanner.style.display = 'none';
      if (this.fallbackLink) {
        this.fallbackLink.href = this.currentActiveMirror || game.embedUrl || game.sourceUrl || '#';
      }
      if (this.iframe) {
        this.iframe.style.display = 'block';
        this._loadGame(game, this.currentActiveMirror);
      }
    }

    // Populate Right Panel ("Other Games")
    this.renderOtherGames(game.id);

    // Show modal
    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  async _loadLuminGame(game) {
    if (!this.iframe) return;

    // Show a loading indicator in the iframe
    this._writeToFrame(`
      <html><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">
        <div style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
          <div>Loading game...</div>
        </div>
      </body></html>
    `);

    try {
      const { url, meta } = await luminSource.getGameUrl(game.rawId || game.id);
      
      // Only update if this game is still the active one
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        this.currentActiveMirror = url;
        
        if (this.fallbackLink) {
          this.fallbackLink.href = url;
        }
        
        // For LuminSDK games, use direct iframe src since we have the playable URL
        this.iframe.src = await resolveSafely(url);
      }
    } catch (err) {
      console.error('Failed to load LuminSDK game:', err);
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        this._renderErrorScreen(game, '', err.message);
      }
    }
  }

  /**
   * Load game HTML into the iframe.
   *
   * Supports both:
   * 1. CORS fetch + baseURI injection + contentDocument.write() (works for GN-Math & DuckMath)
   * 2. Direct iframe.src fallback for third-party embeds
   */
  async _loadGame(game, targetUrl = null) {
    if (!this.iframe) return;

    let url = targetUrl || this.currentActiveMirror || game.embedUrl;
    if (!url) return;

    // Convert /pre.html to /index.html if present
    if (url.endsWith('/pre.html')) {
      url = url.replace(/\/pre\.html$/, '/index.html');
    }

    // Show a loading indicator in the iframe
    this._writeToFrame(`
      <html><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">
        <div style="text-align:center">
          <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
          <div>Loading game...</div>
        </div>
      </body></html>
    `);

    // jsdelivr serves ALL files as text/plain — the browser won't execute them
    // as HTML. We fetch the HTML, inject a <base> tag for relative URLs, and
    // load via blob URL so the browser renders it as proper HTML.
    if (typeof url === 'string' && url.startsWith('https://cdn.jsdelivr.net/')) {
      try {
        const baseUrl = url.replace(/\/[^/]*$/, '/');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let html = await response.text();

        if (!(this.activeGame && String(this.activeGame.id) === String(game.id))) return;

        // Only inject a <base> tag if the HTML doesn't already have one.
        // Many game HTML files (e.g. OvO) include their own <base> pointing
        // to the correct asset host. Injecting a second one would override
        // it and break relative URL resolution.
        if (!/<base\s/i.test(html)) {
          const baseTag = `<base href="${baseUrl}">`;
          if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head[^>]*>/i, match => match + baseTag);
          } else if (/<html[^>]*>/i.test(html)) {
            html = html.replace(/<html[^>]*>/i, match => match + '<head>' + baseTag + '</head>');
          } else {
            html = baseTag + html;
          }
        }

        const blob = new Blob([html], { type: 'text/html' });
        this.iframe.src = URL.createObjectURL(blob);
      } catch (err) {
        console.warn('Direct embed failed, falling back to raw src:', err);
        if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
          this.iframe.src = url;
        }
      }
      return;
    }

    // Other direct-embed hosts (DuckMath) render correctly from a plain iframe src.
    if (game.directEmbed === true || game.source === 'DuckMath') {
      this.iframe.src = url;
      return;
    }

    // If game explicitly doesn't support about:blank, use direct iframe src
    if (game.supportsAboutBlank === false) {
      this.iframe.src = await resolveSafely(url);
      return;
    }

    if (isWispEnabled()) {
      try {
        const proxied = await resolveUrl(url);
        this.iframe.src = proxied;
        return;
      } catch (e) {
        console.warn('Wisp proxy failed, falling back to direct load:', e);
      }
    }

    try {
      const response = await fetch(url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let html = await response.text();

      // Only update if this game is still the active one (user may have switched)
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        // Inject <base href="..."> into <head> so relative assets load correctly from the mirror
        const baseHref = url.replace(/\/[^/]*$/, '/');
        const baseTag = `<base href="${baseHref}">`;
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, match => match + baseTag);
        } else if (/<html[^>]*>/i.test(html)) {
          html = html.replace(/<html[^>]*>/i, match => match + '<head>' + baseTag + '</head>');
        } else {
          html = baseTag + html;
        }

        this._writeToFrame(html);
      }
    } catch (err) {
      console.warn('CORS fetch injection failed, falling back to direct iframe src:', err);
      if (this.activeGame && String(this.activeGame.id) === String(game.id)) {
        try {
          this.iframe.src = await resolveSafely(url);
        } catch (iframeErr) {
          this._renderErrorScreen(game, url, err.message);
        }
      }
    }
  }

  _renderErrorScreen(game, url, message) {
    if (!this.activeGame || String(this.activeGame.id) !== String(game.id)) return;
    const hasMultipleMirrors = Array.isArray(game.mirrors) && game.mirrors.length > 1;
    this._writeToFrame(`
      <html><body style="margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#e55;">
        <div style="text-align:center;padding:2rem">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">⚠️</div>
          <div style="font-size:1.1rem;margin-bottom:0.5rem;">Failed to load from this mirror</div>
          <div style="font-size:0.85rem;color:#888;">${escapeHtml(message)}</div>
          ${hasMultipleMirrors ? `
            <button onclick="parent.postMessage('switch_mirror', '*')"
              style="cursor:pointer;margin-top:1rem;margin-right:0.5rem;padding:0.5rem 1rem;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:0.9rem;">
              🎲 Try Another Mirror
            </button>
          ` : ''}
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;margin-top:1rem;padding:0.5rem 1rem;background:#1e3a5f;color:#7eb8f7;border-radius:6px;text-decoration:none;font-size:0.9rem;">
            Open in new tab ↗
          </a>
        </div>
      </body></html>
    `);
  }

  /**
   * Write HTML into the iframe via contentDocument.write().
   * This preserves the iframe's real origin context (unlike srcdoc which sets
   * baseURI to 'about:srcdoc'), allowing scripts like Ruffle to correctly
   * resolve relative URLs for .wasm and worker files.
   */
  _writeToFrame(html) {
    if (!this.iframe) return;
    try {
      // If contentDocument is null, replace the iframe element to reset it
      if (!this.iframe.contentDocument) {
        const newFrame = this.iframe.cloneNode(false);
        this.iframe.replaceWith(newFrame);
        this.iframe = newFrame;
      }
      this.iframe.contentDocument.open();
      this.iframe.contentDocument.write(html);
      this.iframe.contentDocument.close();
    } catch (e) {
      // Fallback to srcdoc if contentDocument is blocked
      this.iframe.srcdoc = html;
    }
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
    // Blank the iframe to stop audio/execution
    if (this.iframe) {
      try {
        this.iframe.contentDocument?.open();
        this.iframe.contentDocument?.write('<html><body></body></html>');
        this.iframe.contentDocument?.close();
      } catch (e) {
        this.iframe.src = 'about:blank';
      }
    }
    document.body.style.overflow = '';
    this.activeGame = null;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  }

  toggleFullscreen() {
    // Only the center frame container enters fullscreen, hiding sidebars!
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
    return this.overlay.classList.contains('active');
  }
}
