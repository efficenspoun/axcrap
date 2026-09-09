import { storage } from '../services/storage.js';
import { showToast } from './toast.js';

export class ReportModal {
  constructor() {
    this.overlay = document.getElementById('report-modal-overlay');
    this.form = document.getElementById('report-form');
    this.gameNameEl = document.getElementById('report-game-name');
    this.detailsEl = document.getElementById('report-details');
    this.btnClose = document.getElementById('btn-close-report');
    this.btnCancel = document.getElementById('btn-cancel-report');
    this.currentGame = null;

    this.setupListeners();
  }

  setupListeners() {
    if (this.btnClose) this.btnClose.addEventListener('click', () => this.close());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.close());
    if (this.form) this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  open(game) {
    if (!game) return;
    this.currentGame = game;
    if (this.gameNameEl) {
      this.gameNameEl.textContent = `${game.title} (${game.source})`;
    }
    if (this.detailsEl) {
      this.detailsEl.value = '';
    }
    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');
  }

  close() {
    this.overlay.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.currentGame = null;
  }

  handleSubmit(e) {
    e.preventDefault();
    if (!this.currentGame) return;

    const selectedReason = this.form.querySelector('input[name="reportReason"]:checked')?.value || 'other';
    const details = this.detailsEl ? this.detailsEl.value.trim() : '';

    const report = {
      gameId: this.currentGame.id,
      gameTitle: this.currentGame.title,
      gameSource: this.currentGame.source,
      embedUrl: this.currentGame.embedUrl,
      reason: selectedReason,
      details: details
    };

    const saved = storage.submitReport(report);
    if (saved) {
      this.close();
      showToast(`Report submitted for "${this.currentGame.title}". Thank you!`, 'success');
    } else {
      // submitReport returns null on quota errors or storage unavailability.
      // Keep the modal open so the user can retry, and explain why.
      showToast('Could not save the report — your browser storage may be full or unavailable.', 'error');
    }
  }

  isOpen() {
    return this.overlay.classList.contains('active');
  }
}
