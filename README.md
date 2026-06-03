<div align="center">
  <img src="public/icons/logo.png" alt="Clean Bookmarks" width="320" />

  <p>Organize your browser bookmarks with AI — using your own API key.</p>

  [![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.com)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![Chrome MV3](https://img.shields.io/badge/Chrome%20MV3-4285F4.svg?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
  [![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

  [Features](#features) • [How it works](#how-it-works) • [Getting started](#getting-started) • [Project structure](#project-structure)
</div>

## Overview

Clean Bookmarks is a Chromium extension that turns a messy bookmark collection into a clean, categorized folder tree. It scans your uncategorized bookmarks, asks an AI to propose a category structure, lets you tune it, then sorts everything into place — with a one-click undo.

It is **local-first** and **bring-your-own-key**: there is no backend, no account, and no data store of ours. Your bookmarks stay in your browser, and the only thing that ever leaves your device is bookmark titles and URLs, sent to the AI endpoint *you* configure.

> [!NOTE]
> The extension works with any OpenAI-compatible API — OpenAI, OpenRouter, local servers like Ollama, or your own deployment.

## Features

- **AI categorization** — proposes 8–15 top-level categories with optional sub-folders (at most two levels deep) and sorts every bookmark into them.
- **You stay in control** — review and edit the proposed categories (rename, remove, add) before anything is moved.
- **Non-destructive** — existing named folders are left untouched. Only the "junk drawer" (Other Bookmarks + loose Bookmarks Bar items) is organized.
- **One-click undo** — the current bookmark layout is snapshotted before any change; a single click restores everything.
- **Bring your own key** — works with any OpenAI-compatible endpoint. Your key is stored in `chrome.storage.local` and never synced.
- **Cost transparency** — shows estimated API calls, tokens, and cost *before* you spend anything.
- **Resilient** — batched with bounded concurrency, automatic retries, and a safe `Unsorted` fallback for anything the AI cannot place.

## How it works

The run happens in two AI passes so categories stay consistent across thousands of bookmarks:

1. **Propose** — all bookmark titles and URLs are sent (batched) to your model, which proposes a category taxonomy.
2. **Review** — you edit that taxonomy in the UI.
3. **Assign** — every bookmark is matched to the fixed taxonomy in parallel batches. Each bookmark is referenced by a numeric index so the model never echoes (or corrupts) your data.
4. **Apply** — after a snapshot is taken, bookmarks are moved into a new dated `📁 Organized — YYYY-MM-DD` folder.

```
Popup ──"Organize"──▶ Full-page tab (runs the long job)
                          │  READ_SCOPE / APPLY / UNDO
                          ▼
                  Service worker  ──▶  chrome.bookmarks
                          │
                          ▼
              Your OpenAI-compatible endpoint
```

> [!NOTE]
> The AI job runs inside a full-page extension tab, not the service worker. MV3 service workers are killed after ~30s idle, which would interrupt a multi-minute run. The tab context stays alive instead. The service worker only brokers fast `chrome.bookmarks` operations.

## Prerequisites

- [Bun](https://bun.com) 1.3+
- A Chromium-based browser (Chrome, Edge, Brave, etc.)
- An API key for any OpenAI-compatible chat endpoint

## Getting started

```bash
# Clone and install
git clone https://github.com/shafiqimtiaz/clean-bookmarks.git
cd clean-bookmarks
bun install

# Build the extension
bun run build
```

Load it in your browser:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

Then configure your key:

1. Open the extension's **Settings** (toolbar icon → Settings)
2. Enter your **API base URL** (e.g. `https://api.openai.com/v1`), **API key**, and **model** (e.g. `gpt-4o-mini`)
3. Save — you will be asked to grant the extension access to that specific endpoint

Click the toolbar icon, then **Organize bookmarks** to start.

> [!IMPORTANT]
> The extension ships with no host permissions. When you save your API base URL, it requests access to **only that origin**. Nothing else is granted at install time.

## Scripts

| Command | Description |
| --- | --- |
| `bun run build` | Bundle the extension into `dist/` |
| `bun run typecheck` | Type-check the project with `tsc` |
| `bun run test` | Run tests with `bun test` |

## Project structure

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
│   └── ai/                 Provider, Zod schemas, taxonomy + assignment passes
├── app/                    Full-page tab: run engine and the organize flow
├── popup/                  Toolbar popup: Organize, Undo, Settings
└── options/                Settings page
```

## Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Runtime / bundler | Bun (`bun build`) |
| Platform | Chrome Manifest V3 |
| AI | [Vercel AI SDK](https://ai-sdk.dev) with OpenAI-compatible provider + Zod structured output |
| UI | Vanilla DOM — no framework |

## Privacy

- Your API key is stored in `chrome.storage.local` and is never synced.
- Only bookmark **titles and URLs** are sent to your configured endpoint. Nothing else leaves your device.
- A first-run consent screen states exactly what is sent and where, before any run.
