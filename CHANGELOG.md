# Changelog

All notable changes to Clean Bookmarks are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.0.1] - 2026-06-04

First public release. Manifest v3 Chrome extension that organizes bookmarks with
LLMs using the user's own API key. Local-first: no backend, no telemetry, no
third-party data flow beyond direct calls to the chosen provider.

### Added

- **AI-powered organization.** Two-pass pipeline against any supported LLM:
  pass 1 proposes a category taxonomy from the current bookmark set, pass 2
  assigns each bookmark to a category. The taxonomy is editable before commit.
- **Bring-your-own-key.** Users paste a single API key per provider. Keys are
  stored locally in `chrome.storage.local`, never transmitted anywhere except
  the chosen provider's endpoint.
- **Multi-provider support** via [`@earendil-works/pi-ai`](https://www.npmjs.com/package/@earendil-works/pi-ai):
  26 provider domains pre-registered in `optional_host_permissions`, including
  Anthropic, OpenAI, Google (Gemini), Mistral, Groq, DeepSeek, OpenRouter,
  Cloudflare AI Gateway, Vercel AI Gateway, xAI, Kimi/Moonshot, Together,
  Fireworks, Cerebras, GitHub Copilot, Bedrock, Z.AI, and more.
- **Per-provider API key memory.** Switching providers keeps each key around
  so the user can hop between them without re-pasting.
- **Folder exclusion.** A "Folders in scope" checklist lets the user exclude
  top-level folders and their subtrees from a cleanup run.
- **Scope preview.** Before applying, the user sees the proposed moves and
  can back out without touching the bookmark tree.
- **Snapshot / undo.** After a successful apply, a snapshot of the touched
  subtree is saved locally for one-shot rollback from the status screen.
- **User-editable taxonomy prompt.** An advanced-settings field overrides the
  default category-generation prompt.
- **Theme toggle.** Light / dark, persisted across sessions, respects the
  system preference on first run.
- **Robust AI JSON parsing.** Pass-1 taxonomy output and pass-2 assignment
  output are validated through Zod schemas; malformed responses surface a
  clear error instead of silently failing.
- **Sub-folder collapse.** Single-bookmark subfolders are pruned so the
  resulting tree stays flat.
- **Cost estimate.** Settings screen shows a USD estimate per run before the
  user commits, based on the model registry's per-1M-token pricing.
- **MANIFEST.md** documenting the manifest template, host-permission
  generation, and the rationale for each field.
- **USAGE.md** with end-to-end install / configure / run instructions.

### Changed

- **AI client migrated from a custom wrapper to `@earendil-works/pi-ai`.**
  Provider SDKs are lazy-imported by `model.api`, so unused SDKs never
  land in the extension bundle.
- **Build pipeline migrated from Bun to Node + esbuild.** `npm run build`
  bundles each entrypoint into a flat `[name].js` the HTML pages and
  manifest reference. `prebuild` regenerates `manifest.json` from the
  template and syncs the model catalog before each build.
- **Icon resizing via `sharp` instead of `convert`.** Cross-platform, no
  ImageMagick dependency.
- **Sub-folder counts scoped to root.** Folder badges in the scope list
  reflect the size of each root's subtree, not the global count.
- **Bookmark titles normalized by the assign pass.** Ambiguous or blank
  titles are renamed to match the destination category.
- **Provider / model pickers use `<datalist>`.** Free-text entry is allowed
  so a newly released model can be used before the catalog sync picks it up.

### Removed

- **Custom (OpenAI-compatible) provider support.** Earlier drafts let users
  point at any OpenAI-compatible endpoint, but that required the wildcard
  `https://*/*` host permission, which the Chrome Web Store flags as
  "reads data on all sites". The picker is now restricted to the 26
  pre-registered providers, and the wildcard is gone from the manifest.
- **Wildcard host permission.** `optional_host_permissions` now lists the
  26 provider origins only.
- **Popup UI.** Consolidated into the options page; the toolbar action
  opens the same surface as the extension menu.
- **Test files.** Removed in an early commit; not yet re-introduced.

### Security & privacy

- No analytics, no telemetry, no remote config.
- No calls to any endpoint other than the user-selected provider's base URL
  (with the `optional_host_permissions` grant, which the user approves on
  first run).
- API keys never leave the local machine.
- Source is plain TypeScript, reviewable end-to-end; the build is
  reproducible from `npm ci && npm run build`.

### Build

- Node `>= 18` (pinned in `engines`).
- `npm run sync-models` — regenerates `src/core/ai/models.json` from the
  installed `@earendil-works/pi-ai` catalog (758 models across 27 providers
  at release time).
- `npm run build-manifest` — writes `manifest.json` from
  `manifest.template.json` plus the host set derived from the model
  catalog.
- `npm run build` — runs the two above, then `tsx build.ts` to bundle
  into `dist/`.
- `npm run typecheck` — `tsc --noEmit`.

[Unreleased]: https://github.com/shafiq-imtiaz/clean-bookmarks/compare/v0.0.0.1...HEAD
[0.0.0.1]: https://github.com/shafiq-imtiaz/clean-bookmarks/releases/tag/v0.0.0.1
