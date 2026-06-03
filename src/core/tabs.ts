function storageKey(url: string): string {
  const noHash = url.split("#")[0] ?? url;
  return "cb-tab:" + noHash.split("?")[0];
}

export async function focusOrCreate(url: string): Promise<void> {
  const key = storageKey(url);
  const data = await chrome.storage.local.get(key);
  const existing = data[key] as number | undefined;

  if (existing) {
    try {
      await chrome.tabs.update(existing, { active: true });
      return;
    } catch {
      // Tab was closed, stale entry — remove and fall through to create.
      await chrome.storage.local.remove(key);
    }
  }

  const tab = await chrome.tabs.create({ url });
  if (tab.id) {
    await chrome.storage.local.set({ [key]: tab.id });
  }
}

// Clean up when a tracked tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const all = await chrome.storage.local.get(null);
  for (const [key, val] of Object.entries(all)) {
    if (key.startsWith("cb-tab:") && val === tabId) {
      await chrome.storage.local.remove(key);
    }
  }
});
