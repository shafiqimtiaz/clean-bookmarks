import { OrganizeRun } from './run';
import { estimateCost } from '../core/cost';
import { getSettings, saveSettings } from '../core/storage';
import { send, type ApplyResult, type ReadScopeResult } from '../core/messaging';
import type { Assignment, RunState, Taxonomy } from '../core/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);

// Any unhandled error (bad API key, network, parse failure) must surface on
// the error screen — never leave the UI frozen on a hidden spinner.
const guard = (fn: () => Promise<void>) => () => {
  fn().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
};

const run = new OrganizeRun(onState);
let taxonomy: Taxonomy = [];

// Light/dark theme — persisted in localStorage, default follows the OS.
function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  $('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('cb.theme', theme);
}
applyTheme(
  (localStorage.getItem('cb.theme') as 'light' | 'dark' | null) ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);
$('themeToggle').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
);

$('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function boot() {
  const settings = await getSettings();
  if (!settings.consentAt || !settings.apiKey) {
    show('consent');
    return;
  }
  await showEstimate();
}

async function showEstimate() {
  show('consent', false);
  const read = await send<ReadScopeResult>({ type: 'READ_SCOPE' });
  if (!read.ok) return fail(read.error);
  const settings = await getSettings();
  const est = estimateCost(read.data.bookmarks, settings.model);
  $('estimateText').textContent =
    `${read.data.bookmarks.length} bookmarks · ~${est.calls} API calls · ` +
    `~${est.promptTokens + est.completionTokens} tokens · ≈ $${est.usd} on ${settings.model}`;
  show('estimate');
}

$('consentBtn').addEventListener('click', guard(async () => {
  const settings = await getSettings();
  if (!settings.apiKey) {
    chrome.runtime.openOptionsPage();
    return;
  }
  await saveSettings({ consentAt: Date.now() });
  await showEstimate();
}));

$('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('runBtn').addEventListener('click', guard(async () => {
  show('estimate', false);
  show('progress');
  taxonomy = await run.start();
  renderChips();
  show('progress', false);
  show('review');
}));

$('addCatBtn').addEventListener('click', () => {
  const input = $<HTMLInputElement>('addCat');
  const name = input.value.trim();
  if (name) {
    taxonomy.push({ name, children: [] });
    input.value = '';
    renderChips();
  }
});

$('assignBtn').addEventListener('click', guard(async () => {
  show('review', false);
  show('progress');
  const assignments = await run.assign(taxonomy);
  show('progress', false);
  renderPreview(assignments);
  show('preview');
}));

$('applyBtn').addEventListener('click', guard(async () => {
  show('preview', false);
  show('progress');
  $('progressTitle').textContent = 'Applying…';
  const res = await send<ApplyResult>({ type: 'APPLY', taxonomy, assignments: run.assignments });
  show('progress', false);
  if (!res.ok) return fail(res.error);
  $('resultTitle').textContent = 'Done';
  $('resultText').textContent = `Moved ${res.data.movedCount} bookmarks (${res.data.unsortedCount} unsorted).`;
  show('result');
}));

$('cancelBtn').addEventListener('click', () => location.reload());

$('doneBtn').addEventListener('click', () => {
  chrome.tabs.getCurrent((tab) => (tab?.id ? chrome.tabs.remove(tab.id) : window.close()));
});

$('undoBtn').addEventListener('click', guard(async () => {
  const res = await send<{ restored: number }>({ type: 'UNDO' });
  $('resultText').textContent = res.ok
    ? `Restored ${res.data.restored} bookmarks.`
    : `Error: ${res.error}`;
  ($('undoBtn') as HTMLButtonElement).hidden = res.ok;
}));

function renderChips() {
  const wrap = $('chips');
  wrap.innerHTML = '';
  taxonomy.forEach((cat, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = cat.name;
    label.contentEditable = 'true';
    label.addEventListener('blur', () => (cat.name = label.textContent?.trim() || cat.name));
    const del = document.createElement('button');
    del.textContent = '×';
    del.addEventListener('click', () => {
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
  $('previewSummary').textContent =
    `${assignments.length} sorted into ${counts.size} folders · ${unsorted} unsorted.`;
  const ul = document.createElement('ul');
  ul.className = 'tree';
  for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const li = document.createElement('li');
    li.innerHTML = `${name} <span class="count">(${n})</span>`;
    ul.appendChild(li);
  }
  if (unsorted) {
    const li = document.createElement('li');
    li.innerHTML = `Unsorted <span class="count">(${unsorted})</span>`;
    ul.appendChild(li);
  }
  const tree = $('tree');
  tree.innerHTML = '';
  tree.appendChild(ul);
}

function onState(s: RunState) {
  if (s.phase === 'error') return fail(s.error ?? 'Unknown error');
  const titles: Record<string, string> = {
    reading: 'Reading bookmarks…',
    pass1: 'Proposing categories…',
    pass2: 'Sorting bookmarks…',
    applying: 'Applying…',
  };
  $('progressTitle').textContent = titles[s.phase] ?? 'Working…';
  const pct = s.batchesTotal ? (s.batchesDone / s.batchesTotal) * 100 : s.phase === 'pass1' ? 30 : 5;
  ($('progressBar') as HTMLElement).style.width = `${pct}%`;
  $('progressText').textContent =
    s.phase === 'pass2'
      ? `batch ${s.batchesDone}/${s.batchesTotal} · ${s.done}/${s.total} sorted · ~${s.spentTokens} tokens`
      : `~${s.spentTokens} tokens used`;
}

function fail(error: string) {
  show('progress', false);
  $('resultTitle').textContent = 'Error';
  $('resultText').textContent = error;
  ($('undoBtn') as HTMLButtonElement).hidden = true;
  show('result');
}

guard(boot)();
