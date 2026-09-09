/**
 * Settings Modal
 * - First setting: Wisp proxy toggle.
 * - Maintains an ordered list of Wisp servers (priority = list order).
 *   Servers can be added, removed, and moved up/down.
 */

import { settings } from '../settings/settingsManager.js';
import * as wispProxy from '../proxy/wispProxy.js';
import { showToast } from '../ui/toast.js';

export class SettingsModal {
  constructor() {
    this.overlay = document.getElementById('settings-modal-overlay');
    this.btnClose = document.getElementById('btn-close-settings');
    this.btnSettings = document.getElementById('btn-settings');
    this.enabledToggle = document.getElementById('setting-wisp-enabled');
    this.serversSection = document.getElementById('wisp-servers-section');
    this.serversList = document.getElementById('wisp-servers-list');
    this.addForm = document.getElementById('wisp-add-server-form');
    this.addInput = document.getElementById('wisp-add-server-input');
    this.statusEl = document.getElementById('wisp-status');
    this.cloakSelect = document.getElementById('setting-cloak-mode');

    this.setupListeners();

    // Subscribe to settings changes so external mutations (e.g. server-list
    // mutations from other modules) are reflected in the UI.
    this._unsubscribe = settings.subscribe((next) => {
      if (!this.overlay?.classList.contains('active')) return;
      if (this.enabledToggle && this.enabledToggle.checked !== next.wisp.enabled) {
        this.enabledToggle.checked = next.wisp.enabled;
        this.serversSection.style.display = next.wisp.enabled ? 'block' : 'none';
      }
      if (this.cloakSelect && this.cloakSelect.value !== next.cloak.mode) {
        this.cloakSelect.value = next.cloak.mode;
      }
      this.renderServers();
    });
  }

  setupListeners() {
    if (this.btnSettings) {
      this.btnSettings.addEventListener('click', () => this.open());
    }
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.enabledToggle) {
      this.enabledToggle.addEventListener('change', async () => {
        const enabled = this.enabledToggle.checked;
        settings.setWispEnabled(enabled);
        this.renderServers();
        this.serversSection.style.display = enabled ? 'block' : 'none';
        if (enabled) {
          await this.reconnect();
        } else {
          await wispProxy.disable();
          this.renderStatus();
        }
      });
    }

    if (this.addForm) {
      this.addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = this.addInput.value.trim();
        if (!settings.addWispServer(value)) {
          showToast('Enter a valid wss:// or ws:// server URL', 'error');
          return;
        }
        this.addInput.value = '';
        this.renderServers();
        await this.reconnect();
      });
    }

    if (this.cloakSelect) {
      this.cloakSelect.addEventListener('change', () => {
        settings.setCloakMode(this.cloakSelect.value);
        showToast(`Cloaked tab: ${this.cloakSelect.selectedOptions[0].text}`, 'success');
      });
    }

    if (this.serversList) {
      this.serversList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const index = parseInt(btn.dataset.index, 10);
        const action = btn.dataset.action;

        if (action === 'remove') {
          settings.removeWispServer(index);
          this.renderServers();
          await this.reconnect();
        } else if (action === 'move') {
          const direction = parseInt(btn.dataset.direction, 10);
          settings.moveWispServer(index, direction);
          this.renderServers();
          await this.reconnect();
        }
      });
    }
  }

  async reconnect() {
    wispProxy.resetConnection();
    await this.refreshStatus();
  }

  async refreshStatus() {
    if (!this.statusEl) return;
    if (!settings.wisp.enabled) {
      this.renderStatus();
      return;
    }
    this.statusEl.textContent = 'Connecting to wisp server...';
    this.statusEl.classList.remove('status-error', 'status-ok');
    try {
      const server = await wispProxy.connect();
      this.statusEl.textContent = server
        ? `Active: ${server}`
        : 'No active wisp server.';
      this.statusEl.classList.add('status-ok');
    } catch (err) {
      const message = wispProxy.getLastError() || err?.message || String(err);
      this.statusEl.textContent = `Connection failed: ${message}`;
      this.statusEl.classList.add('status-error');
    }
  }

  renderStatus() {
    if (!this.statusEl) return;
    this.statusEl.classList.remove('status-error', 'status-ok');
    if (!settings.wisp.enabled) {
      this.statusEl.textContent = 'Wisp proxy is off.';
      return;
    }
    const server = wispProxy.getActiveWispServer();
    if (server) {
      this.statusEl.textContent = `Active: ${server}`;
      this.statusEl.classList.add('status-ok');
    } else if (wispProxy.getLastError()) {
      this.statusEl.textContent = `Last error: ${wispProxy.getLastError()}`;
      this.statusEl.classList.add('status-error');
    } else {
      this.statusEl.textContent = 'Idle.';
    }
  }

  renderServers() {
    if (!this.serversList) return;
    const servers = settings.wisp.servers;

    if (servers.length === 0) {
      this.serversList.innerHTML = '<div class="wisp-empty">No servers configured.</div>';
      return;
    }

    // Build each row with createElement + textContent so any server URL
    // containing HTML-meaningful characters is rendered safely. The previous
    // regex-strip approach removed characters (degrading URLs) rather than
    // encoding them, and left the title attribute unencoded.
    const frag = document.createDocumentFragment();
    servers.forEach((server, index) => {
      const row = document.createElement('div');
      row.className = 'wisp-server-row';

      const rank = document.createElement('span');
      rank.className = 'wisp-server-rank';
      rank.textContent = String(index + 1);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'wisp-server-url';
      input.value = server;
      input.readOnly = true;
      input.spellcheck = false;
      input.title = server;

      const actions = document.createElement('div');
      actions.className = 'wisp-server-actions';

      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.className = 'wisp-btn';
      moveUp.dataset.action = 'move';
      moveUp.dataset.index = String(index);
      moveUp.dataset.direction = '-1';
      moveUp.title = 'Move up (higher priority)';
      moveUp.disabled = index === 0;
      moveUp.textContent = '\u25b2';

      const moveDown = document.createElement('button');
      moveDown.type = 'button';
      moveDown.className = 'wisp-btn';
      moveDown.dataset.action = 'move';
      moveDown.dataset.index = String(index);
      moveDown.dataset.direction = '1';
      moveDown.title = 'Move down (lower priority)';
      moveDown.disabled = index === servers.length - 1;
      moveDown.textContent = '\u25bc';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'wisp-btn wisp-btn-danger';
      remove.dataset.action = 'remove';
      remove.dataset.index = String(index);
      remove.title = 'Remove server';
      remove.textContent = '\u2715';

      actions.append(moveUp, moveDown, remove);
      row.append(rank, input, actions);
      frag.appendChild(row);
    });

    this.serversList.replaceChildren(frag);
  }

  open() {
    if (!this.overlay) return;
    if (this.enabledToggle) {
      this.enabledToggle.checked = settings.wisp.enabled;
    }
    this.serversSection.style.display = settings.wisp.enabled ? 'block' : 'none';
    this.renderServers();
    this.renderStatus();
    if (this.cloakSelect) {
      this.cloakSelect.value = settings.cloak.mode;
    }
    this.overlay.classList.add('active');
    this.overlay.setAttribute('aria-hidden', 'false');
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
  }

  isOpen() {
    return this.overlay?.classList.contains('active') ?? false;
  }
}