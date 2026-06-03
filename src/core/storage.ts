import { STORAGE_KEYS, type Settings, type Snapshot } from "./types";
import { getProvider, providerForBaseUrl } from "./providers";

const DEFAULT_PROVIDER_ID = "minimax";
const DEFAULT_MODEL_ID = "MiniMax-M3";
const DEFAULT_BASE_URL =
  getProvider(DEFAULT_PROVIDER_ID)?.baseUrl ?? "https://api.minimax.io/anthropic";

const DEFAULT_SETTINGS: Settings = {
  provider: DEFAULT_PROVIDER_ID,
  model: DEFAULT_MODEL_ID,
  apiKey: "",
  apiKeys: {},
  baseUrl: DEFAULT_BASE_URL,
  seedCategories: [],
  taxonomyPrompt: "",
  consentAt: null,
};

// One-shot migration from the pre-pi-ai settings shape (top-level baseUrl +
// model, no provider). v0.1.x stored that; v0.2+ derives provider from
// baseUrl and keeps baseUrl only for the "custom" case. Idempotent: safe to
// run on every read.
function migrate(raw: Partial<Settings> & Record<string, unknown>): Settings {
  // Already migrated.
  if (typeof raw.provider === "string" && raw.provider) {
    return { ...DEFAULT_SETTINGS, ...raw } as Settings;
  }
  const baseUrl =
    typeof raw.baseUrl === "string" && raw.baseUrl
      ? raw.baseUrl
      : DEFAULT_SETTINGS.baseUrl;
  const p = providerForBaseUrl(baseUrl);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    provider: p.id,
    baseUrl,
  } as Settings;
}

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return migrate((res[STORAGE_KEYS.settings] ?? {}) as Partial<Settings>);
}

export async function saveSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
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
