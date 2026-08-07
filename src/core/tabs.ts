// Focus the existing app tab (any window) or create it.
//
// Primary: runtime.getContexts() finds live extension-page tabs and returns
// their tabId + windowId — permission-free. (tabs.query({url}) is NOT a
// substitute: without the "tabs" permission Chrome can't see a tab's URL,
// and extension pages are covered by no host permission.)
// Fallback: a discarded (Memory Saver) tab has no live context, so revive
// the last known tabId from storage instead.
function storageKey(url: string): string {
  const noHash = url.split("#")[0] ?? url;
  return "cb-tab:" + noHash.split("?")[0];
}

export async function focusOrCreate(url: string): Promise<void> {
  const key = storageKey(url);
  const [ctx] = await chrome.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [url],
  });
  if (ctx?.tabId) {
    await chrome.tabs.update(ctx.tabId, { active: true });
    if (ctx.windowId) await chrome.windows.update(ctx.windowId, { focused: true });
    await chrome.storage.local.set({ [key]: ctx.tabId });
    return;
  }

  // No live context — either the tab is discarded or never existed.
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
