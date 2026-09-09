import './style.css';
import { sourceManager } from './sources/sourceManager.js';
import { GamesGrid } from './ui/grid.js';
import { PlayerModal } from './ui/playerModal.js';
import { ReportModal } from './ui/reportModal.js';
import { SettingsModal } from './ui/settingsModal.js';
import { FilterControls } from './ui/filters.js';
import { showToast } from './ui/toast.js';
import { settings } from './settings/settingsManager.js';
import { openCloaked } from './services/cloak.js';

// Application State
let allGames = [];

// Global Image Error Handler for Cards & Quick-Switcher
window.handleCardImgError = function(imgElement, fallbackSrc) {
  imgElement.onerror = null;
  imgElement.src = fallbackSrc || '/assets/placeholders/default-game.svg';
  imgElement.classList.add('fallback-loaded');
};

// UI Component Instances
const gamesGridEl = document.getElementById('games-grid');
const reportModal = new ReportModal();
const playerModal = new PlayerModal({
  onReportGame: (game) => reportModal.open(game)
});

const filterControls = new FilterControls({
  onFilterChange: () => applyFilters(),
  onRefreshCache: () => loadGames(true)
});

const gamesGrid = new GamesGrid(gamesGridEl, (gameId) => {
  playerModal.open(gameId);
});

const settingsModal = new SettingsModal();

// Header cloak button → open a cloaked tab using the configured mode
const btnCloak = document.getElementById('btn-cloak');
if (btnCloak) {
  btnCloak.addEventListener('click', () => {
    const mode = settings.cloak.mode;
    if (!mode || mode === 'none') {
      showToast('Pick a cloak mode in Settings first', 'error');
      return;
    }
    const result = openCloaked(mode);
    if (result.ok) {
      showToast(`Opened in cloaked tab (${mode})`, 'success');
    } else if (result.reason === 'too_large') {
      // data: URL would exceed browser limits — silently fall back to blob.
      const fallback = openCloaked('blob');
      if (fallback.ok) {
        showToast('Page too large for data: URL — opened in blob mode instead', 'success');
      } else {
        showToast('Popup blocked — allow popups for this site', 'error');
      }
    } else if (result.reason === 'write_failed') {
      showToast('Could not write to the cloaked tab (browser denied access)', 'error');
    } else if (result.reason === 'unknown_mode') {
      showToast('Unknown cloak mode — check Settings', 'error');
    } else {
      showToast('Popup blocked — allow popups for this site', 'error');
    }
  });
}

/**
 * Filter and render current view
 */
function applyFilters() {
  const filtered = filterControls.filterGames(allGames);
  filterControls.updateCount(filtered.length);
  gamesGrid.render(
    filtered,
    filterControls.currentSource,
    filterControls.currentQuery,
    () => filterControls.resetAll()
  );
}

/**
 * Load games dynamically from modular sources (with browser cache)
 */
async function loadGames(forceRefresh = false) {
  gamesGrid.showSkeleton(12);
  hideSourceErrorBanner();

  try {
    const result = await sourceManager.loadAllGames(forceRefresh, (progress) => {
      if (progress.status === 'scraping_source') {
        filterControls.updateCount('', `Scraping ${progress.source}...`);
      }
    });

    allGames = result.games;
    playerModal.setCatalog(allGames);

    // LuminSDK images are resolved directly in luminSource.convertLuminGame
    // via the LUMIN_IMAGE_BASE URL pattern, so no async preloading needed.

    // Populate source dropdown options
    const sources = allGames.map(g => g.source);
    filterControls.populateSources(sources);

    applyFilters();

    // Surface per-source failures so silent partial outages are visible.
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      showSourceErrorBanner(result.errors);
    }

    if (forceRefresh) {
      showToast(`Scraped ${allGames.length} games from sources!`, 'success');
    } else if (result.fromCache) {
      console.info(`Loaded ${allGames.length} games from browser cache.`);
    }
  } catch (error) {
    console.error('Error loading game sources:', error);
    gamesGrid.showError(error.message || 'Failed to fetch games from source', () => loadGames(true));
  }
}

/**
 * Show a dismissible banner listing sources that failed to scrape.
 */
function showSourceErrorBanner(errors) {
  const banner = document.getElementById('source-error-banner');
  const list = document.getElementById('source-error-list');
  if (!banner || !list) return;

  // Use createElement / textContent so any error messages from upstream
  // can't inject markup into the page.
  list.replaceChildren();
  for (const { source, error } of errors) {
    const li = document.createElement('li');
    li.className = 'source-error-item';
    const nameEl = document.createElement('strong');
    nameEl.textContent = source;
    const colon = document.createTextNode(': ');
    const msgEl = document.createElement('span');
    msgEl.className = 'source-error-message';
    msgEl.textContent = error || 'Unknown error';
    li.append(nameEl, colon, msgEl);
    list.appendChild(li);
  }

  banner.hidden = false;

  const dismissBtn = document.getElementById('source-error-dismiss');
  if (dismissBtn && !dismissBtn.dataset.bound) {
    dismissBtn.dataset.bound = '1';
    dismissBtn.addEventListener('click', hideSourceErrorBanner);
  }
}

function hideSourceErrorBanner() {
  const banner = document.getElementById('source-error-banner');
  if (banner) banner.hidden = true;
}

/**
 * Compliance & Static Dialog Delegation
 */
function setupComplianceModals() {
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById(btn.getAttribute('data-open-modal'));
      if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
      }
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.getAttribute('data-close-modal'));
      if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // Close overlays on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.id === 'player-modal-overlay') playerModal.close();
        else if (overlay.id === 'report-modal-overlay') reportModal.close();
        else {
          overlay.classList.remove('active');
          overlay.setAttribute('aria-hidden', 'true');
        }
      }
    });
  });

  // Global Keybindings
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (reportModal.isOpen()) reportModal.close();
      else if (playerModal.isOpen()) playerModal.close();
      else {
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
          m.classList.remove('active');
          m.setAttribute('aria-hidden', 'true');
        });
      }
    }

    if ((e.key === 'f' || e.key === 'F') && playerModal.isOpen()) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        playerModal.toggleFullscreen();
      }
    }

    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && document.activeElement !== filterControls.searchInput)) {
      const active = document.activeElement;
      if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        filterControls.searchInput?.focus();
      }
    }
  });
}

// Initialize Application
setupComplianceModals();
loadGames(false);
