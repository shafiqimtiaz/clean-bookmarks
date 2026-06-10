import { getSettings } from "../core/storage";
import { send } from "../core/messaging";
import { focusOrCreate } from "../core/tabs";
import { CHROME_AI_PROVIDER_ID } from "../core/ai/chrome-ai";

// Honor the theme chosen in the main app (shared via localStorage), else OS.
document.documentElement.dataset.theme =
  localStorage.getItem("cb.theme") ??
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = $("status");
const undoBtn = $<HTMLButtonElement>("undo");

// A provider is ready to run when: an API key is set (cloud) or the
// Chrome browser AI is selected (on-device, no key needed).
function isProviderReady(s: Awaited<ReturnType<typeof getSettings>>): boolean {
  if (s.provider === CHROME_AI_PROVIDER_ID) return true;
  return !!s.apiKey;
}

async function init() {
  const settings = await getSettings();
  if (!isProviderReady(settings)) {
    status.textContent = "Pick a model in Settings to begin.";
  }
  const snap = await send<{ has: boolean }>({ type: "HAS_SNAPSHOT" });
  if (snap.ok && snap.data.has) undoBtn.hidden = false;
}

$("organize").addEventListener("click", async () => {
  const settings = await getSettings();
  // No key, or consent not yet given -> route to the full-page flow which
  // handles the first-run consent + settings prompt.
  await focusOrCreate(chrome.runtime.getURL("app.html"));
  window.close();
});

undoBtn.addEventListener("click", async () => {
  status.textContent = "Undoing…";
  const res = await send<{ restored: number }>({ type: "UNDO" });
  status.textContent = res.ok
    ? `Restored ${res.data.restored} bookmarks.`
    : `Error: ${res.error}`;
  if (res.ok) undoBtn.hidden = true;
});

$("settings").addEventListener("click", (e) => {
  e.preventDefault();
  focusOrCreate(chrome.runtime.getURL("options.html"));
});

void init();
