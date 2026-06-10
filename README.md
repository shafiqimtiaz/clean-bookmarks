<div align="center">
  <img src="public/promo/Generated%20Promo.png" alt="Clean Bookmarks" width="800" />

  [![Node.js](https://img.shields.io/badge/Node.js-%23339933.svg?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Chrome MV3](https://img.shields.io/badge/Chrome%20MV3-4285F4.svg?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

  [Overview](#overview) • [Features](#features) • [How it works](#how-it-works) • [Get started](#get-started) • [Project layout](#project-layout) • [Privacy](#privacy)

  **[▶ Try it online](https://shafiqimtiaz.github.io/clean-bookmarks/)** • **[⬇ Install from Chrome Web Store](https://chromewebstore.google.com/detail/akjmeddnbohjephmppkmifnljehfhkpb)**
</div>

---

## Overview

Clean Bookmarks turns a messy bookmark collection into a clean, categorized folder tree. It scans the bookmarks piled into `Other Bookmarks` and the loose items on the `Bookmarks Bar`, asks an AI to propose a category structure, lets you tune it, then sorts everything into place. One click and it's all back the way it was.

No backend. No account. No data store. Your bookmarks stay in your browser; the only thing that ever leaves your device is bookmark titles and URLs, sent to the AI endpoint **you** configure.

> [!NOTE]
> Ships with a curated catalog of 13 first-party, key-based providers — Anthropic, OpenAI, Google Gemini, Mistral, DeepSeek, Groq, Cerebras, xAI, Together, Fireworks, Moonshot (Kimi), MiniMax, and Z.AI — across 5 native APIs (Anthropic Messages, Google Generative AI, Mistral, OpenAI Responses, and OpenAI-compatible). Aggregators and OAuth-only services are intentionally excluded.
>
> When loaded in Chrome, a "Browser Model" tile is added to the provider grid — it uses Chrome's on-device Gemini Nano via the Prompt API, so no API key or host permission is required. Aggregator-style local runtimes (Ollama, LM Studio) are still excluded since they need a wildcard host permission.

---

## Features

- **Two-pass AI categorization** — the first pass proposes a taxonomy of 8–12 top-level categories (sub-categories only when 10+ bookmarks share a clear sub-theme); the second pass assigns every bookmark to the fixed taxonomy. Categories stay consistent across thousands of bookmarks.
- **Editable taxonomy** — review the proposed categories in the UI. Rename, remove, or add categories before anything is moved.
- **Custom prompt** — the prompt the AI uses to propose a taxonomy is editable in Settings. Override the default to bias the structure toward your work, hobbies, or folder shape. Reset with one click.
- **Non-destructive** — the Bookmarks Bar and Other Bookmarks roots are never moved. Named folders inside them are flattened into the new structure (and emptied); folders you mark as "exclude" are left exactly as they were.
- **One-click undo** — the current bookmark layout is snapshotted before any change. A single click restores it.
- **Bring your own key** — your API key is stored in `chrome.storage.local` and is never synced. No install-time host permissions; access to your endpoint is granted per-origin on first use.
- **Browser Chrome AI** — on Chrome, pick "Browser Model" and the on-device Gemini Nano runs the organize pass locally. No key, no endpoint, no per-run cost. The tile only shows up when the Prompt API is available; status (`available` / `downloadable` / etc.) is shown in Settings.
- **Cost estimate** — see the expected number of API calls, tokens, and dollar cost before you spend anything.
- **Resilient execution** — requests are batched with bounded concurrency, automatic retries, and a safe `Unsorted` fallback for anything the model can't confidently place.

---

## How it works

The organize job runs as a small state machine inside a full-page extension tab. The service worker only brokers fast `chrome.bookmarks` API calls.

```
Toolbar popup ──"Organize"──▶ Full-page tab (runs the long job)
                                  │  READ_SCOPE / APPLY / UNDO
                                  ▼
                          Service worker ──▶ chrome.bookmarks
                                  │
                                  ▼
                          Your configured AI provider
```

> [!IMPORTANT]
> The AI job runs in a full-page extension tab, not the service worker. MV3 service workers are killed after ~30 seconds of idle, which would interrupt a multi-minute run. The tab context stays alive for the duration; the service worker only handles fast `chrome.bookmarks` operations.

### Pipeline

1. **Read scope** — collect everything in `Other Bookmarks` and loose items on the `Bookmarks Bar`. Named folders are left untouched.
2. **Estimate** — compute batch count, expected tokens, and dollar cost; show it to the user before proceeding.
3. **Propose taxonomy** — batched call to the model using a TypeBox-typed `propose_taxonomy` tool, so the taxonomy comes back as validated structured args — no JSON parsing.
4. **Review** — the user edits the proposed categories.
5. **Assign** — every bookmark is matched to the fixed taxonomy in parallel batches. Each bookmark is referenced by a numeric index, so the model never echoes or corrupts your data. Responses are parsed and validated against a Zod schema.
6. **Apply** — a snapshot of the current layout is taken, then category folders are created inside the Bookmarks Bar and Other Bookmarks roots, and bookmarks are moved into them.
7. **Undo** — restore the snapshot at any time.

---

## Get started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- A Chromium-based browser (Chrome, Edge, Brave, etc.)
- An API key for any supported provider

### Build and load

```bash
git clone https://github.com/shafiqimtiaz/clean-bookmarks.git
cd clean-bookmarks
npm install
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

### Configure your provider

1. Click the toolbar icon, then **Settings**
2. Pick a provider, enter your **API key**, and choose a **model**
3. Save — Chrome will ask you to grant the extension access to **only that origin**

Then click the toolbar icon and select **Organize bookmarks**.

> [!TIP]
> No host permissions are granted at install time. The first time the extension contacts your provider's origin, Chrome prompts you to approve that specific origin. Nothing is granted silently, and origins you never use are never touched.

### Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Bundle the extension into `dist/` (esbuild) |
| `npm run typecheck` | Type-check the project with `tsc` |
| `npm run sync-models` | Refresh the model catalog used in Settings |
| `npm run build-manifest` | Regenerate `manifest.json` from `manifest.template.json` |

---

## Project layout

```
src/
├── background/
│   └── service-worker.ts   Brokers chrome.bookmarks (read / apply / undo)
├── core/
│   ├── types.ts            Shared contracts
│   ├── storage.ts          chrome.storage.local (settings + undo snapshot)
│   ├── messaging.ts        Typed page ↔ service-worker protocol
│   ├── bookmarks.ts        Read scope, snapshot, apply, restore
│   ├── permissions.ts      Per-origin runtime host permission
│   ├── batch.ts            Chunking + bounded-concurrency pool
│   ├── cost.ts             Pre-run cost estimate
│   └── ai/                 pi-ai runtime, TypeBox tool schemas, Zod parse-time schemas, taxonomy + assignment passes
├── app/                    Full-page tab: run engine and the organize flow
├── popup/                  Toolbar popup: Organize, Undo, Settings
└── options/                Settings page
```

### Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Bundler | Node.js + esbuild (`tsx` runs the TS build scripts) |
| Platform | Chrome Manifest V3 |
| AI | [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai) — multi-provider streaming; [Zod](https://zod.dev) — parse-time validation; TypeBox — tool-calling schemas |
| UI | Vanilla DOM, no framework |

---

## Privacy

- **Local-first.** No backend, no telemetry, no analytics.
- **Bring your own key.** Your API key is stored in `chrome.storage.local` and is never synced to any server.
- **Minimal payload.** Only bookmark **titles and URLs** are sent to your configured endpoint. Nothing else leaves your device.
- **Explicit consent.** A first-run consent screen states exactly what is sent and where, before any data is transmitted.
- **Scoped permissions.** No host permissions are granted at install time. Chrome asks you to grant access to your provider's origin the first time the extension needs to contact it. Nothing is granted silently, and origins you never use are never touched.
