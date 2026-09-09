/**
 * Toast Notification Service
 *
 * Builds the toast DOM with createElement + textContent so the message is
 * rendered as text even if it contains HTML. Any string the caller passes
 * (including third-party-sourced values like game titles) is rendered safely.
 */
export function showToast(message, type = 'success') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = document.createElement('span');
  icon.textContent = type === 'success' ? '\u2713' : type === 'error' ? '\u2715' : '\u2139';

  const text = document.createElement('span');
  text.textContent = String(message ?? '');

  toast.append(icon, document.createTextNode(' '), text);
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}