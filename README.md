<div align="center">
  <img src="public/icons/logo.png" alt="Clean Bookmarks" width="280" />

  <h3>AI-powered bookmark organizer for Chromium. Local-first, bring-your-own-key.</h3>

  [![npm](https://img.shields.io/badge/npm-CB3837.svg?style=flat-square&logo=npm&logoColor=white)](https://npmjs.com)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Chrome MV3](https://img.shields.io/badge/Chrome%20MV3-4285F4.svg?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

  [Overview](#overview) • [Features](#features) • [How it works](#how-it-works) • [Get started](#get-started) • [Project layout](#project-layout)

  **[▶ Try it online](https://shafiqimtiaz.github.io/clean-bookmarks/)**
</div>

## Overview

Clean Bookmarks turns a messy bookmark collection into a clean, categorized folder tree. It scans the bookmarks you've tossed into the "junk drawer" — `Other Bookmarks` and loose items on the `Bookmarks Bar` — asks an AI to propose a category structure, lets you tune it, then sorts everything into place. One click and it's all back the way it was.

There is **no backend, no account, and no data store of ours**. Your bookmarks stay in your browser, and the only thing that ever leaves your device is bookmark titles and URLs, sent to the AI endpoint **you** configure.

> [!NOTE]
> Ships with a built-in catalog of 27 providers (OpenAI, Anthropic, Google, Mistral, DeepSeek, Groq, xAI, OpenRouter, Ollama, LM Studio, …) and a `Custom` mode for any other OpenAI-compatible endpoint. The browser runtime supports OpenAI, Anthropic, Google Gemini, and Mistral.

## Features

- **AI categorization in two passes** — the first pass proposes a taxonomy of 8–15 top-level categories (≤2 levels deep); the second pass assigns every bookmark to the fixed taxonomy. Categories stay consistent across thousands of bookmarks.
- **You stay in control** — review the proposed categories in the UI. Rename, remove, or add categories before anything is moved.
- **Non-destructive** — your existing named folders are never touched. Only the "junk drawer" is organized, and the result is a new dated `📁 Organized — YYYY-MM-DD` folder.
- **One-click undo** — the current bookmark layout is snapshotted before any change. A single click restores it.
- **Bring your own key** — your API key is stored in `chrome.storage.local` and is never synced. The extension ships with no install-time host permissions; access to your endpoint is granted per-origin on first use.
- **Cost transparency** — see the estimated number of API calls, tokens, and cost *before* you spend a cent.
- **Resilient** — requests are batched with bounded concurrency, automatic retries, and a safe `Unsorted` fallback for anything the model can't confidently place.

## How it works

The run is a small state machine executed in a full-page extension tab. The service worker only brokers fast `chrome.bookmarks` operations.

```
Toolbar popup ──"Organize"──▶ Full-page tab (runs the long job)
                                  │  READ_SCOPE / APPLY / UNDO
                                  ▼
                          Service worker ──▶ chrome.bookmarks
                                  │
                                  ▼
                          Your configured AI provider
```

### Pipeline

1. **Read scope** — collect everything in `Other Bookmarks` and loose items on the `Bookmarks Bar`. Named folders are left alone.
2. **Estimate** — compute batch count, expected tokens, and dollar cost; show it to the user.
3. **Propose taxonomy** — batched call to the model. The model is invoked with a TypeBox-typed `propose_taxonomy` tool, so the taxonomy comes back as validated structured args — no JSON parsing.
4. **Review** — the user edits the proposed categories.
5. **Assign** — every bookmark is matched to the fixed taxonomy in parallel batches. Each bookmark is referenced by a numeric index, so the model never echoes (or corrupts) your data. The response is parsed and validated against a Zod schema.
6. **Apply** — a snapshot of the current layout is taken, then bookmarks are moved into the new dated folder.
7. **Undo** — restore the snapshot at any time.

> [!IMPORTANT]
> The AI job runs in a full-page extension tab, not the service worker. MV3 service workers are killed after ~30s of idle, which would interrupt a multi-minute run. The tab context stays alive instead. The service worker only brokers fast `chrome.bookmarks` operations.

## Get started

### Prerequisites

- [Node.js](https://nodejs.org) 20+ or [npm](https://npmjs.com)
- A Chromium-based browser (Chrome, Edge, Brave, etc.)
- An API key for any supported provider (OpenAI, Anthropic, Google Gemini, Mistral, OpenAI Responses, or a custom OpenAI-compatible endpoint)

### Build and load

```bash
git clone https://github.com/shafiqimtiaz/clean-bookmarks.git
cd clean-bookmarks
npm install
npm run build
```

Then load the unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

### Configure your key

1. Click the toolbar icon, then **Settings**
2. Pick a provider, enter your **API base URL**, **API key**, and **model**
3. Save — you'll be asked to grant the extension access to **only that origin**

Click the toolbar icon, then **Organize bookmarks** to start.

> [!TIP]
> The extension ships with no install-time host permissions. The first time it talks to your provider's origin, Chrome asks you to grant access to that specific origin. Nothing is granted silently.

### Scripts

| Command | Description |
| --- | --- |
| `npm run build` | Bundle the extension into `dist/` |
| `npm run typecheck` | Type-check the project with `tsc` |
| `npm run sync-models` | Refresh the model catalog used in Settings |
| `npm run build-manifest` | Regenerate `manifest.json` from `manifest.template.json` |

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

## Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Runtime / bundler | npm + esbuild |
| Platform | Chrome Manifest V3 |
| AI | [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai) for multi-provider streaming + [Zod](https://zod.dev) for parse-time validation + TypeBox for tool-calling schemas |
| UI | Vanilla DOM — no framework |

## Privacy

- **Local-first.** No backend, no telemetry, no analytics.
- **Bring your own key.** Your API key is stored in `chrome.storage.local` and is never synced.
- **Minimal payload.** Only bookmark **titles and URLs** are sent to your configured endpoint. Nothing else leaves your device.
- **Explicit consent.** A first-run consent screen states exactly what is sent and where, before any run.
- **Scoped permissions.** The extension ships with no install-time host permissions. Chrome asks you to grant access to your provider's origin the first time the extension needs to talk to it. Nothing is granted silently, and origins you never use are never touched.
