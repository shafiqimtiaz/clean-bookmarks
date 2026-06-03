import { STORAGE_KEYS, type Settings, type Snapshot } from './types';

const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiKeys: {},
  model: 'gpt-4o-mini',
  seedCategories: [],
  taxonomyPrompt: '',
  consentAt: null,
};

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.settings] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function getSnapshot(): Promise<Snapshot | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
  return (res[STORAGE_KEYS.snapshot] as Snapshot | undefined) ?? null;
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.snapshot]: snapshot });
}

export async function clearSnapshot(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.snapshot);
}
