export async function focusOrCreate(url: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length && tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    await chrome.tabs.create({ url });
  }
}
