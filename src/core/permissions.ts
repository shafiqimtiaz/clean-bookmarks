// Runtime host-permission request for the user's chosen API endpoint.
// The stored Settings.baseUrl is the source of truth (the UI keeps it
// in sync with the chosen provider). Ship with no host perms; request
// the specific origin when settings are saved.

import type { Settings } from "./types";

// Returns the origin pattern to request. The user's stored baseUrl is the
// source of truth — the UI pre-fills it from the provider registry when
// a built-in is selected, but the user can override via "Edit base URL".
export function originForSettings(settings: Settings): string | null {
  const base = settings.baseUrl;
  if (!base) return null;
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

export function originPattern(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

export async function hasHostPermission(settings: Settings): Promise<boolean> {
  const origin = originForSettings(settings);
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

export async function requestHostPermission(
  settings: Settings,
): Promise<boolean> {
  const origin = originForSettings(settings);
  if (!origin) return false;
  return chrome.permissions.request({ origins: [origin] });
}
