import { getSettings } from '../core/storage';
import { send } from '../core/messaging';

// Honor the theme chosen in the main app (shared via localStorage), else OS.
document.documentElement.dataset.theme =
  localStorage.getItem('cb.theme') ??
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const undoBtn = $<HTMLButtonElement>('undo');

async function init() {
  const settings = await getSettings();
  if (!settings.apiKey) {
    status.textContent = 'Set your API key in Settings to begin.';
  }
  const snap = await send<{ has: boolean }>({ type: 'HAS_SNAPSHOT' });
  if (snap.ok && snap.data.has) undoBtn.hidden = false;
}

$('organize').addEventListener('click', async () => {
  const settings = await getSettings();
  // No key, or consent not yet given -> route to the full-page flow which
  // handles the first-run consent + settings prompt.
  await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  window.close();
});

undoBtn.addEventListener('click', async () => {
  status.textContent = 'Undoing…';
  const res = await send<{ restored: number }>({ type: 'UNDO' });
  status.textContent = res.ok ? `Restored ${res.data.restored} bookmarks.` : `Error: ${res.error}`;
  if (res.ok) undoBtn.hidden = true;
});

$('settings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

void init();
