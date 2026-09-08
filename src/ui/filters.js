/**
 * Filter and Search Controls UI
 */

export class FilterControls {
  constructor(options = {}) {
    this.onFilterChange = options.onFilterChange || null;
    this.onRefreshCache = options.onRefreshCache || null;

    this.searchInput = document.getElementById('search-input');
    this.searchClear = document.getElementById('search-clear');
    this.sourceSelect = document.getElementById('source-select');
    this.catalogCount = document.getElementById('catalog-count');
    this.activeSourceName = document.getElementById('active-source-name');
    this.btnRefresh = document.getElementById('btn-refresh-sources');

    this.currentSource = 'ALL';
    this.currentQuery = '';

    this.setupListeners();
  }

  setupListeners() {
    if (this.sourceSelect) {
      this.sourceSelect.addEventListener('change', (e) => {
        this.currentSource = e.target.value;
        this.triggerChange();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.currentQuery = e.target.value.trim().toLowerCase();
        if (this.searchClear) {
          this.searchClear.style.display = this.currentQuery ? 'block' : 'none';
        }
        this.triggerChange();
      });
    }

    if (this.searchClear) {
      this.searchClear.addEventListener('click', () => {
        this.resetSearch();
      });
    }

    if (this.btnRefresh) {
      this.btnRefresh.addEventListener('click', () => {
        if (this.onRefreshCache) this.onRefreshCache();
      });
    }
  }

  populateSources(sources) {
    if (!this.sourceSelect) return;
    const uniqueSources = Array.from(new Set(sources)).filter(Boolean).sort();
    
    this.sourceSelect.innerHTML = '<option value="ALL">All Sources</option>';
    uniqueSources.forEach(src => {
      const opt = document.createElement('option');
      opt.value = src;
      opt.textContent = src;
      this.sourceSelect.appendChild(opt);
    });
  }

  updateCount(count, sourceName = null) {
    if (this.catalogCount) {
      this.catalogCount.textContent = `${count} ${count === 1 ? 'game' : 'games'}`;
    }
    if (this.activeSourceName) {
      this.activeSourceName.textContent = sourceName || (this.currentSource === 'ALL' ? 'All Sources' : this.currentSource);
    }
  }

  resetSearch() {
    if (this.searchInput) this.searchInput.value = '';
    this.currentQuery = '';
    if (this.searchClear) this.searchClear.style.display = 'none';
    if (this.searchInput) this.searchInput.focus();
    this.triggerChange();
  }

  resetAll() {
    if (this.searchInput) this.searchInput.value = '';
    this.currentQuery = '';
    if (this.searchClear) this.searchClear.style.display = 'none';
    if (this.sourceSelect) this.sourceSelect.value = 'ALL';
    this.currentSource = 'ALL';
    this.triggerChange();
  }

  filterGames(allGames) {
    return allGames.filter(game => {
      // 1. Source filter
      if (this.currentSource !== 'ALL' && game.source !== this.currentSource) {
        return false;
      }
      // 2. Search query (title or author)
      if (this.currentQuery) {
        const titleMatch = (game.title || '').toLowerCase().includes(this.currentQuery);
        const authorMatch = (game.author || '').toLowerCase().includes(this.currentQuery);
        if (!titleMatch && !authorMatch) {
          return false;
        }
      }
      return true;
    });
  }

  triggerChange() {
    if (this.onFilterChange) {
      this.onFilterChange({
        source: this.currentSource,
        query: this.currentQuery
      });
    }
  }
}
