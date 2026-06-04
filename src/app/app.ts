import { OrganizeRun } from "./run";
import { estimateCost } from "../core/cost";
import { getSettings, saveSettings } from "../core/storage";
import {
  send,
  type ApplyResult,
  type CountScopeResult,
  type ReadScopeResult,
} from "../core/messaging";
import { hasHostPermission, requestHostPermission } from "../core/permissions";
import {
  getProviders,
  getProvider,
  getModel,
  CUSTOM_PROVIDER_ID,
} from "../core/providers";
import { complete } from "../core/ai/provider";
import { DEFAULT_TAXONOMY_PROMPT } from "../core/ai/pass1-taxonomy";
import type { Assignment, RunState, Settings, Taxonomy } from "../core/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);

// Any unhandled error (bad API key, network, parse failure) must surface on
// the error screen — never leave the UI frozen on a hidden spinner.
const guard = (fn: () => Promise<void>) => () => {
  fn().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
};

const run = new OrganizeRun(onState);
let taxonomy: Taxonomy = [];

// Provider registry + custom fallback, used by both the picker and the
// status strip.
const ALL = [
  ...getProviders(),
  {
    id: CUSTOM_PROVIDER_ID,
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    models: [],
  },
];

// Two-letter monogram for the status strip + provider tiles. Multi-word
// labels -> initials; single word -> first two letters.
function monogram(label: string): string {
  const clean = label.replace(/\(.*?\)/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const m =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
      : clean.slice(0, 2);
  return m.toUpperCase() || "··";
}

// ── Theme ─────────────────────────────────────────────────────
const sunSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="var(--themeicon)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"></path></svg>';
const moonSVG =
  '<svg viewBox="0 0 24 24" fill="var(--themeicon)" stroke="var(--themeicon)" stroke-width="1.5" stroke-linejoin="round" style="width:22px;height:22px"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>';

function applyTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  const html = theme === "dark" ? sunSVG : moonSVG;
  document
    .querySelectorAll<HTMLElement>(".theme-icon")
    .forEach((el) => (el.innerHTML = html));
  localStorage.setItem("cb.theme", theme);
}
applyTheme(
  (localStorage.getItem("cb.theme") as "light" | "dark" | null) ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
);
document
  .querySelectorAll<HTMLElement>(".theme-toggle")
  .forEach((btn) =>
    btn.addEventListener("click", () =>
      applyTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
      ),
    ),
  );

// Version badge.
$("version").textContent = "v" + chrome.runtime.getManifest().version;

// ── Settings page navigation ──────────────────────────────────
const sview = $("settingsView");
function openSettingsView() {
  sview.classList.add("open");
  sview.scrollTop = 0;
  document.body.style.overflow = "hidden";
  initSettings();
}
function closeSettingsView() {
  sview.classList.remove("open");
  document.body.style.overflow = "";
}
$("settingsBtn").addEventListener("click", openSettingsView);
$("changeProvider").addEventListener("click", openSettingsView);
$("openSettings").addEventListener("click", openSettingsView);
$("backHome").addEventListener("click", closeSettingsView);
$("cancelSettings").addEventListener("click", closeSettingsView);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sview.classList.contains("open"))
    closeSettingsView();
});

// ── Boot / home ───────────────────────────────────────────────
async function boot() {
  const settings = await getSettings();
  await renderStatus(settings);
  if (!settings.consentAt || !settings.apiKey) {
    show("consent");
    return;
  }
  await showHome();
}

async function renderStatus(s: Settings) {
  const matched = ALL.find((p) => p.id === s.provider);
  const label = matched?.label ?? s.provider;
  const modelName = getModel(s.provider, s.model)?.name || s.model || "—";
  $("statusMark").textContent = s.apiKey ? monogram(label) : "··";
  $("statusProvider").textContent = s.apiKey ? label : "Not configured";
  $("statusModel").textContent = s.apiKey ? modelName : "—";
  const pill = $("statusPill");
  const txt = $("statusPillText");
  const connected = !!s.apiKey && (await hasHostPermission(s));
  if (connected) {
    pill.classList.remove("off");
    txt.textContent = "Connected";
  } else {
    pill.classList.add("off");
    txt.textContent = s.apiKey ? "No access" : "No key";
  }
}

async function showHome() {
  show("consent", false);
  const read = await send<ReadScopeResult>({ type: "READ_SCOPE" });
  if (!read.ok) return fail(read.error);
  const settings = await getSettings();

  // Current Situation composition.
  const counts = await send<CountScopeResult>({ type: "COUNT_SCOPE" });
  if (counts.ok) renderSituation(counts.data, settings);
  show("situation");

  // Estimate.
  const est = estimateCost(read.data.bookmarks, settings);
  $("estBookmarks").textContent = String(read.data.bookmarks.length);
  $("estCalls").textContent = String(est.calls);
  $("estTokens").textContent = fmtTokens(
    est.promptTokens + est.completionTokens,
  );
  $("estCost").textContent = est.usd.toFixed(3);
  $("estModel").textContent = settingsLabel(settings);
  show("estimate");
}

function renderSituation(c: CountScopeResult, s: Settings) {
  const loose = c.looseBar + c.looseOther;
  $("segJunkNum").textContent = String(loose);
  $("segOrgNum").textContent = String(c.foldered);
  $("segJunk").style.flex = String(Math.max(loose, 1));
  $("segOrg").style.flex = String(Math.max(c.foldered, 1));
  $("legJunk").textContent = String(loose);
  $("legOrg").textContent = String(c.foldered);
  $("bdOther").textContent = String(c.looseOther);
  $("bdBar").textContent = String(c.looseBar);
  $("bdTotal").textContent = String(c.total);
  $("lastrunText").textContent = lastCleanupLabel(s.lastCleanupAt);
}

function lastCleanupLabel(at: number | null): string {
  if (!at) return "No cleanup yet.";
  const date = new Date(at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const days = Math.floor((Date.now() - at) / 86_400_000);
  const ago =
    days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `Last cleanup ${date} · ${ago}`;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function settingsLabel(s: Settings): string {
  if (s.provider === CUSTOM_PROVIDER_ID) return s.model || "custom";
  const p = getProvider(s.provider);
  const m = getModel(s.provider, s.model);
  return m ? `${p ? LABEL_OF(p.id) : s.provider} / ${m.name}` : s.model;
}
function LABEL_OF(id: string): string {
  return ALL.find((p) => p.id === id)?.label ?? id;
}

$("consentBtn").addEventListener(
  "click",
  guard(async () => {
    const settings = await getSettings();
    if (!settings.apiKey) {
      openSettingsView();
      return;
    }
    await saveSettings({ consentAt: Date.now() });
    await showHome();
  }),
);

// ── Run flow ──────────────────────────────────────────────────
$("runBtn").addEventListener(
  "click",
  guard(async () => {
    show("situation", false);
    show("estimate", false);
    show("progress");
    taxonomy = await run.start();
    renderChips();
    show("progress", false);
    show("review");
  }),
);

$("addCatBtn").addEventListener("click", () => {
  const input = $<HTMLInputElement>("addCat");
  const name = input.value.trim();
  if (name) {
    taxonomy.push({ name, children: [] });
    input.value = "";
    renderChips();
  }
});

$("assignBtn").addEventListener(
  "click",
  guard(async () => {
    show("review", false);
    show("progress");
    const assignments = await run.assign(taxonomy);
    show("progress", false);
    renderPreview(assignments);
    show("preview");
  }),
);

$("applyBtn").addEventListener(
  "click",
  guard(async () => {
    show("preview", false);
    show("progress");
    $("progressTitle").textContent = "Applying…";
    const res = await send<ApplyResult>({
      type: "APPLY",
      taxonomy,
      assignments: run.assignments,
    });
    show("progress", false);
    if (!res.ok) return fail(res.error);
    await saveSettings({ lastCleanupAt: Date.now() });
    setResultIcon("ok");
    $("resultTitle").textContent = "Done";
    $("resultText").textContent =
      `Moved ${res.data.movedCount} bookmarks (${res.data.unsortedCount} unsorted).`;
    ($("undoBtn") as HTMLButtonElement).hidden = false;
    show("result");
  }),
);

$("cancelBtn").addEventListener("click", () => location.reload());

$("doneBtn").addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) =>
    tab?.id ? chrome.tabs.remove(tab.id) : window.close(),
  );
});

$("undoBtn").addEventListener(
  "click",
  guard(async () => {
    const res = await send<{ restored: number }>({ type: "UNDO" });
    $("resultText").textContent = res.ok
      ? `Restored ${res.data.restored} bookmarks.`
      : `Error: ${res.error}`;
    ($("undoBtn") as HTMLButtonElement).hidden = res.ok;
  }),
);

function renderChips() {
  const wrap = $("chips");
  wrap.innerHTML = "";
  taxonomy.forEach((cat, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const label = document.createElement("span");
    label.textContent = cat.name;
    label.contentEditable = "true";
    label.addEventListener(
      "blur",
      () => (cat.name = label.textContent?.trim() || cat.name),
    );
    const del = document.createElement("button");
    del.textContent = "×";
    del.addEventListener("click", () => {
      taxonomy.splice(i, 1);
      renderChips();
    });
    chip.append(label, del);
    wrap.appendChild(chip);
  });
}

function renderPreview(assignments: Assignment[]) {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    const key = a.sub ? `${a.cat} / ${a.sub}` : a.cat;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const unsorted = run.bookmarks.length - assignments.length;
  $("previewSummary").textContent =
    `${assignments.length} sorted into ${counts.size} folders · ${unsorted} unsorted.`;
  const ul = document.createElement("ul");
  ul.className = "tree";
  for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const li = document.createElement("li");
    li.innerHTML = `${name} <span class="count">(${n})</span>`;
    ul.appendChild(li);
  }
  if (unsorted) {
    const li = document.createElement("li");
    li.innerHTML = `Unsorted <span class="count">(${unsorted})</span>`;
    ul.appendChild(li);
  }
  const tree = $("tree");
  tree.innerHTML = "";
  tree.appendChild(ul);
}

function onState(s: RunState) {
  if (s.phase === "error") return fail(s.error ?? "Unknown error");
  const titles: Record<string, string> = {
    reading: "Reading bookmarks…",
    pass1: "Proposing categories…",
    pass2: "Sorting bookmarks…",
    applying: "Applying…",
  };
  $("progressTitle").textContent = titles[s.phase] ?? "Working…";
  const pct = s.batchesTotal
    ? (s.batchesDone / s.batchesTotal) * 100
    : s.phase === "pass1"
      ? 30
      : 5;
  ($("progressBar") as HTMLElement).style.width = `${pct}%`;
  $("progressText").textContent =
    s.phase === "pass2"
      ? `batch ${s.batchesDone}/${s.batchesTotal} · ${s.done}/${s.total} sorted · ~${s.spentTokens} tokens`
      : `~${s.spentTokens} tokens used`;
}

function fail(error: string) {
  show("progress", false);
  setResultIcon("err");
  $("resultTitle").textContent = "Error";
  $("resultText").textContent = error;
  ($("undoBtn") as HTMLButtonElement).hidden = true;
  show("result");
}

// ── Settings panel ────────────────────────────────────────────
let keys: Record<string, string> = {};
let currentProvider = "openai";

const provGrid = $("provGrid");
const provSearch = $<HTMLInputElement>("provSearch");
const baseUrl = $<HTMLInputElement>("baseUrl");
const editBaseUrl = $<HTMLButtonElement>("editBaseUrl");
const apiKeyInput = $<HTMLInputElement>("apiKey");
const modelSelect = $<HTMLSelectElement>("modelSelect");
const modelCustom = $<HTMLInputElement>("modelCustom");
const prompt = $<HTMLTextAreaElement>("prompt");

const OTHER_MODEL = "__other__";

const checkSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
const alertSVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>';

function setResultIcon(kind: "ok" | "err") {
  const el = $("resultIcon");
  el.className = "resicon " + kind;
  el.innerHTML = kind === "ok" ? checkSVG : alertSVG;
}
const saved = $("saved");
const testStatus = $("testStatus");

function lockBaseUrl(locked: boolean) {
  baseUrl.disabled = locked;
  editBaseUrl.hidden = !locked;
  editBaseUrl.classList.toggle("on", !locked);
}

function fillModels(providerId: string, selected?: string) {
  const preset = getProvider(providerId);
  const models = preset?.models ?? [];
  modelSelect.innerHTML = "";
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id;
    modelSelect.appendChild(opt);
  }
  const other = document.createElement("option");
  other.value = OTHER_MODEL;
  other.textContent = "Other (type manually)…";
  modelSelect.appendChild(other);

  // Selected model present in the list -> pick it; otherwise fall into the
  // free-text "Other" path (custom providers, unlisted ids).
  const inList = selected && models.some((m) => m.id === selected);
  if (inList) {
    modelSelect.value = selected!;
    modelCustom.value = "";
  } else {
    modelSelect.value = OTHER_MODEL;
    modelCustom.value = selected ?? "";
  }
  syncCustomModel();
}

function syncCustomModel() {
  modelCustom.hidden = modelSelect.value !== OTHER_MODEL;
}

modelSelect.addEventListener("change", () => {
  syncCustomModel();
  if (modelSelect.value === OTHER_MODEL) modelCustom.focus();
});

function chosenModel(): string {
  return (
    modelSelect.value === OTHER_MODEL ? modelCustom.value : modelSelect.value
  ).trim();
}

function renderProviderGrid(filter = "") {
  const f = filter.toLowerCase();
  provGrid.innerHTML = "";
  for (const p of ALL.filter((x) => x.label.toLowerCase().includes(f))) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile" + (p.id === currentProvider ? " sel" : "");
    const mark = p.id === CUSTOM_PROVIDER_ID ? "{}" : monogram(p.label);
    tile.innerHTML = `<span class="mark">${mark}</span><span class="nm">${p.label}</span>`;
    tile.addEventListener("click", () => selectProvider(p.id));
    provGrid.appendChild(tile);
  }
}

function selectProvider(id: string) {
  if (id === currentProvider) return;
  keys[currentProvider] = apiKeyInput.value.trim();
  currentProvider = id;
  apiKeyInput.value = keys[id] ?? "";
  if (id !== CUSTOM_PROVIDER_ID) {
    const preset = getProvider(id);
    if (preset) baseUrl.value = preset.baseUrl;
  } else {
    baseUrl.value = "";
  }
  fillModels(id, getProvider(id)?.models[0]?.id);
  lockBaseUrl(id !== CUSTOM_PROVIDER_ID);
  renderProviderGrid(provSearch.value);
  resetTestStatus();
}

provSearch.addEventListener("input", () =>
  renderProviderGrid(provSearch.value),
);

editBaseUrl.addEventListener("click", () => {
  lockBaseUrl(false);
  baseUrl.focus();
});

$("toggleKey").addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

function resetTestStatus() {
  testStatus.className = "teststatus";
  testStatus.textContent = "";
}

function formSettings(base: Settings): Settings {
  return {
    ...base,
    provider: currentProvider,
    model: chosenModel() || base.model,
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };
}

$("testBtn").addEventListener("click", async () => {
  const tentative = formSettings(await getSettings());
  if (!tentative.apiKey && tentative.provider !== CUSTOM_PROVIDER_ID) {
    testStatus.className = "teststatus err show";
    testStatus.textContent = "✗ Enter an API key first";
    return;
  }
  testStatus.className = "teststatus run show";
  testStatus.innerHTML = '<span class="spin"></span> Testing…';
  try {
    if (!(await hasHostPermission(tentative))) {
      const granted = await requestHostPermission(tentative);
      if (!granted) throw new Error("Origin permission denied");
    }
    const t0 = performance.now();
    await complete(
      tentative,
      {
        systemPrompt: "Reply with the single word OK.",
        messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
      },
      { maxTokens: 8 },
    );
    const ms = Math.round(performance.now() - t0);
    testStatus.className = "teststatus ok show";
    testStatus.textContent = `✓ Connected · ${ms}ms`;
  } catch (e) {
    testStatus.className = "teststatus err show";
    testStatus.textContent =
      "✗ " + (e instanceof Error ? e.message : String(e));
  }
});

$("resetTax").addEventListener("click", () => {
  prompt.value = DEFAULT_TAXONOMY_PROMPT;
});

$("clearKey").addEventListener("click", () => {
  apiKeyInput.value = "";
  apiKeyInput.type = "text";
  apiKeyInput.placeholder = "Key cleared — enter a new one";
  keys[currentProvider] = "";
  apiKeyInput.focus();
});

async function initSettings() {
  resetTestStatus();
  const s = await getSettings();
  const providerId = s.provider;
  const p = getProvider(providerId);
  keys = { ...s.apiKeys };
  if (s.apiKey && !keys[providerId]) keys[providerId] = s.apiKey;
  currentProvider = providerId;
  provSearch.value = "";
  renderProviderGrid();
  baseUrl.value =
    providerId === CUSTOM_PROVIDER_ID ? s.baseUrl : (p?.baseUrl ?? s.baseUrl);
  apiKeyInput.value = keys[providerId] ?? "";
  apiKeyInput.type = "password";
  fillModels(providerId, s.model);
  prompt.value = s.taxonomyPrompt || DEFAULT_TAXONOMY_PROMPT;
  lockBaseUrl(providerId !== CUSTOM_PROVIDER_ID);
}

$("saveSettings").addEventListener("click", async () => {
  const url = baseUrl.value.trim();
  const id = currentProvider;
  const model = chosenModel() || "MiniMax-M3";
  const tentative: Settings = {
    ...(await getSettings()),
    provider: id,
    model,
    baseUrl: url,
  };
  if (!(await hasHostPermission(tentative))) {
    const granted = await requestHostPermission(tentative);
    if (!granted) {
      alert("Permission denied. The organizer cannot call that endpoint.");
      return;
    }
  }
  const key = apiKeyInput.value.trim();
  keys[id] = key;
  const next = await saveSettings({
    provider: id,
    model,
    baseUrl: url,
    apiKey: key,
    apiKeys: keys,
    taxonomyPrompt:
      prompt.value.trim() === DEFAULT_TAXONOMY_PROMPT
        ? ""
        : prompt.value.trim(),
  });
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
  await renderStatus(next);
});

guard(boot)();
