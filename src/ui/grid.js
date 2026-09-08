/**
 * Games Grid Renderer
 */
import { escapeHtml } from '../utils/escapeHtml.js';

export class GamesGrid {
  constructor(containerElement, onPlayGame) {
    this.container = containerElement;
    this.onPlayGame = onPlayGame;
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
  }

  showError(message, onRetry) {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h2 class="empty-title">Failed to scrape catalog</h2>
        <p class="empty-desc">${escapeHtml(message)}</p>
        <button class="empty-reset-btn" id="btn-grid-retry">Retry Scraping</button>
      </div>
    `;
    const btn = document.getElementById('btn-grid-retry');
    if (btn && onRetry) btn.addEventListener('click', onRetry);
  }

  render(games, currentFilter = 'ALL', currentQuery = '', onResetFilters = null) {
    if (games.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⌕</div>
          <h2 class="empty-title">No games found</h2>
          <p class="empty-desc">
            No games match the current filter "${escapeHtml(currentFilter)}" with search "${escapeHtml(currentQuery)}".
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

    this.container.innerHTML = games.map(game => {
      const fallback = game.fallbackThumbnail || '/assets/placeholders/default-game.svg';
      const authorText = game.author || 'Not provided';
      const titleText = game.title || 'Not provided';

      return `
        <article class="game-card" data-game-id="${escapeHtml(game.id)}">
          <div class="card-thumbnail-wrapper">
            <img 
              src="${escapeHtml(game.thumbnailUrl)}" 
              alt="${escapeHtml(titleText)} Thumbnail"
              class="card-thumbnail"
              loading="lazy"
              decoding="async"
              onerror="window.handleCardImgError(this, '${escapeHtml(fallback)}')"
            />
            <span class="card-source-tag">
              ${escapeHtml(game.source)}
            </span>
          </div>

          <div class="card-body">
            <h2 class="card-title">${escapeHtml(titleText)}</h2>
            <div class="card-creator">
              By <span class="card-creator-name">${escapeHtml(authorText)}</span>
            </div>

            <button type="button" class="card-cta-btn" data-action="play" data-game-id="${escapeHtml(game.id)}">
              <span>Play</span>
              <span class="arrow">→</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }
}
