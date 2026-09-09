/**
 * Games Grid Renderer
 *
 * Cards are built with createElement + textContent so user/scrape-derived
 * strings (title, author, source) are always rendered as text. Image error
 * handling uses a delegated event listener instead of an inline onerror
 * attribute, which keeps the markup CSP-friendly.
 */
export class GamesGrid {
  constructor(containerElement, onPlayGame) {
    this.container = containerElement;
    this.onPlayGame = onPlayGame;
    // Signature of the most recent successful render. Used to short-circuit
    // identical re-renders (e.g. typing a character then deleting it).
    this._lastSignature = '';
    this.setupListeners();
  }

  setupListeners() {
    this.container.addEventListener('click', (e) => {
      const playBtn = e.target.closest('[data-action="play"]');
      if (playBtn) {
        const gameId = playBtn.getAttribute('data-game-id');
        if (gameId && this.onPlayGame) this.onPlayGame(gameId);
        return;
      }

      const card = e.target.closest('.game-card');
      if (card) {
        const gameId = card.getAttribute('data-game-id');
        if (gameId && this.onPlayGame) this.onPlayGame(gameId);
      }
    });
  }

  showSkeleton(count = 12) {
    this.container.innerHTML = Array.from({ length: count }).map(() => `
      <div class="game-card skeleton-card">
        <div class="card-thumbnail-wrapper skeleton-box" style="height: 180px;"></div>
        <div class="card-body">
          <div class="skeleton-line" style="width: 70%; height: 18px; margin-bottom: 8px;"></div>
          <div class="skeleton-line" style="width: 45%; height: 14px; margin-bottom: 16px;"></div>
          <div class="skeleton-line" style="width: 100%; height: 36px; border-radius: 6px;"></div>
        </div>
      </div>
    `).join('');
    this._lastSignature = '';
  }

  showError(message, onRetry) {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u26a0\ufe0f</div>
        <h2 class="empty-title">Failed to scrape catalog</h2>
        <p class="empty-desc">${this._escapeHtml(message)}</p>
        <button class="empty-reset-btn" id="btn-grid-retry">Retry Scraping</button>
      </div>
    `;
    this._lastSignature = '';
    const btn = document.getElementById('btn-grid-retry');
    if (btn && onRetry) btn.addEventListener('click', onRetry);
  }

  render(games, currentFilter = 'ALL', currentQuery = '', onResetFilters = null) {
    // Empty state always re-renders (no expensive work anyway).
    if (games.length === 0) {
      this._lastSignature = '';
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">\u2315</div>
          <h2 class="empty-title">No games found</h2>
          <p class="empty-desc">
            No games match the current filter "${this._escapeHtml(currentFilter)}" with search "${this._escapeHtml(currentQuery)}".
          </p>
          <button class="empty-reset-btn" id="btn-reset-filters">Reset Filters</button>
        </div>
      `;
      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn && onResetFilters) {
        resetBtn.addEventListener('click', onResetFilters);
      }
      return;
    }

    // Signature includes the filter/query plus first/last ids so that
    // typing-then-deleting the same character (or rendering the same
    // filtered slice twice in a row) doesn't trigger a DOM rebuild.
    const sig = `${currentFilter}|${currentQuery}|${games.length}|${games[0]?.id || ''}|${games[games.length - 1]?.id || ''}`;
    if (sig === this._lastSignature) return;
    this._lastSignature = sig;

    const frag = document.createDocumentFragment();
    for (const game of games) {
      frag.appendChild(this._buildCard(game));
    }
    this.container.replaceChildren(frag);
  }

  _buildCard(game) {
    const fallback = game.fallbackThumbnail || '/assets/placeholders/default-game.svg';
    const authorText = game.author || 'Not provided';
    const titleText = game.title || 'Not provided';

    const card = document.createElement('article');
    card.className = 'game-card';
    card.dataset.gameId = String(game.id);

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'card-thumbnail-wrapper';

    const img = document.createElement('img');
    img.src = game.thumbnailUrl;
    img.alt = `${titleText} Thumbnail`;
    img.className = 'card-thumbnail';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Delegated error handler replaces the previous inline onerror attribute.
    // { once: true } prevents an infinite loop if the fallback itself 404s
    // (handleCardImgError nulls out its own onerror, but this is belt + braces).
    img.addEventListener('error', () => {
      window.handleCardImgError?.(img, fallback);
    }, { once: true });

    const sourceTag = document.createElement('span');
    sourceTag.className = 'card-source-tag';
    sourceTag.textContent = game.source;

    thumbWrap.append(img, sourceTag);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = titleText;

    const creator = document.createElement('div');
    creator.className = 'card-creator';
    const creatorName = document.createElement('span');
    creatorName.className = 'card-creator-name';
    creatorName.textContent = authorText;
    creator.append('By ', creatorName);

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'card-cta-btn';
    playBtn.dataset.action = 'play';
    playBtn.dataset.gameId = String(game.id);
    playBtn.innerHTML = '<span>Play</span><span class="arrow">\u2192</span>';

    body.append(title, creator, playBtn);
    card.append(thumbWrap, body);
    return card;
  }

  _escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}