import { getSettings, saveSettings } from '../core/storage';
import { hasHostPermission, requestHostPermission } from '../core/permissions';
import { PROVIDERS, CUSTOM_PROVIDER, providerForBaseUrl } from '../core/providers';

// Light/dark theme — shared with the main app via localStorage, default OS.
function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('cb.theme', theme);
}
applyTheme(
  (localStorage.getItem('cb.theme') as 'light' | 'dark' | null) ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);
document.getElementById('themeToggle')?.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
);

document.getElementById('backBtn')?.addEventListener('click', async () => {
  const appUrl = chrome.runtime.getURL('app.html');
  const tabs = await chrome.tabs.query({ url: appUrl });
  if (tabs.length && tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    await chrome.tabs.create({ url: appUrl });
  }
  window.close();
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const provider = $<HTMLSelectElement>('provider');
const baseUrl = $<HTMLInputElement>('baseUrl');
const editBaseUrl = $<HTMLButtonElement>('editBaseUrl');
const apiKey = $<HTMLInputElement>('apiKey');
const modelSelect = $<HTMLSelectElement>('modelSelect');
const modelCustom = $<HTMLInputElement>('modelCustom');

const ALL = [...PROVIDERS, CUSTOM_PROVIDER];
const CUSTOM_MODEL = '__custom__';

// Remembered key per provider id; the input always reflects the selected one.
let keys: Record<string, string> = {};
let currentProvider = 'openai';

function fillProviders() {
  provider.innerHTML = '';
  for (const p of ALL) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    provider.appendChild(opt);
  }
}

// Populate the model dropdown for the selected provider, plus a "Custom…"
// escape hatch that reveals the free-text input.
function fillModels(providerId: string, selected?: string) {
  const preset = ALL.find((p) => p.id === providerId) ?? CUSTOM_PROVIDER;
  modelSelect.innerHTML = '';
  for (const m of preset.models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = CUSTOM_MODEL;
  custom.textContent = 'Custom…';
  modelSelect.appendChild(custom);

  const known = selected && preset.models.includes(selected);
  modelSelect.value = known ? selected! : CUSTOM_MODEL;
  modelCustom.value = known ? '' : (selected ?? '');
  syncModelInput();
}

function syncModelInput() {
  modelCustom.hidden = modelSelect.value !== CUSTOM_MODEL;
}

function chosenModel(): string {
  return modelSelect.value === CUSTOM_MODEL ? modelCustom.value.trim() : modelSelect.value;
}

async function init() {
  fillProviders();
  const s = await getSettings();
  const p = providerForBaseUrl(s.baseUrl);
  keys = { ...s.apiKeys };
  // Migrate a pre-existing single key onto the active provider.
  if (s.apiKey && !keys[p.id]) keys[p.id] = s.apiKey;
  currentProvider = p.id;
  provider.value = p.id;
  baseUrl.value = s.baseUrl;
  apiKey.value = keys[p.id] ?? '';
  fillModels(p.id, s.model);
  lockBaseUrl(p.id !== 'custom');
}

// Custom endpoint needs a typed URL -> unlocked; presets stay locked behind
// the pencil so the auto-filled value isn't edited by accident.
function lockBaseUrl(locked: boolean) {
  baseUrl.disabled = locked;
  editBaseUrl.hidden = !locked;
}

editBaseUrl.addEventListener('click', () => {
  lockBaseUrl(false);
  baseUrl.focus();
});

provider.addEventListener('change', () => {
  // Stash the key typed for the old provider, then show the new one's key.
  keys[currentProvider] = apiKey.value.trim();
  const preset = ALL.find((p) => p.id === provider.value) ?? CUSTOM_PROVIDER;
  currentProvider = preset.id;
  apiKey.value = keys[preset.id] ?? '';
  if (preset.id !== 'custom') baseUrl.value = preset.baseUrl;
  fillModels(preset.id, preset.models[0]);
  lockBaseUrl(preset.id !== 'custom');
});

modelSelect.addEventListener('change', syncModelInput);

$('save').addEventListener('click', async () => {
  const url = baseUrl.value.trim();
  if (!(await hasHostPermission(url))) {
    const granted = await requestHostPermission(url);
    if (!granted) {
      alert('Permission for that endpoint was denied. The organizer cannot call it without access.');
      return;
    }
  }
  const key = apiKey.value.trim();
  keys[currentProvider] = key;
  await saveSettings({
    baseUrl: url,
    apiKey: key, // active key for the selected provider
    apiKeys: keys,
    model: chosenModel() || 'gpt-4o-mini',
  });
  const saved = $('saved');
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
});

void init();
