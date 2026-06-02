// Runtime host-permission request for the user's chosen API endpoint.
// Locked: ship with no host perms; request the specific origin when the
// base URL is saved.

export function originPattern(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const origin = originPattern(baseUrl);
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

export async function requestHostPermission(baseUrl: string): Promise<boolean> {
  const origin = originPattern(baseUrl);
  if (!origin) return false;
  return chrome.permissions.request({ origins: [origin] });
}
