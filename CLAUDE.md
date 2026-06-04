This is a Node.js project. Use `npm` and standard Node tooling.

- Use `node <file>` to run JS; use `tsx <file>` (or `npm run <script>`) to run TypeScript directly.
- Use `npm test` / a test runner only if a test setup exists (none currently).
- Use `npm install` to install dependencies. The project pins `engines.node >= 18`.
- Use `npm run <script>` to run package scripts.
- Use `npx <package> <command>` for one-off binaries.
- A project-local `.npmrc` pins the public npm registry so installs work on any machine.

## Build pipeline

- `npm run build` — bundles the extension into `dist/` via **esbuild** (called from `build.ts`, run with `tsx`). Code-splitting + ESM, `platform: 'browser'`.
- `npm run sync-models` — regenerates `src/core/ai/models.json` from the installed `@earendil-works/pi-ai` catalog.
- `npm run build-manifest` — regenerates `manifest.json` from `manifest.template.json`.
- `prebuild` runs sync-models + build-manifest automatically before `build`.
- `npm run typecheck` — `tsc --noEmit`.
- Build scripts (`build.ts`, `scripts/*.ts`) are TypeScript run via `tsx`. They use standard `node:*` APIs only — no runtime-specific globals. Derive `__dirname` with `fileURLToPath(import.meta.url)`.
- Icons are resized from `public/icons/icon.png` to 16/48/128 using **sharp** (cross-platform, no system ImageMagick required). `scripts/gen-icons.ts` is a pure-JS placeholder generator.

## APIs

- This is a Chrome MV3 extension (browser target). Source under `src/` uses Web/Chrome extension APIs (`chrome.*`), vanilla DOM, Zod, and `@earendil-works/pi-ai`. No Node runtime APIs in `src/`.
- Bundler output must stay framework-free vanilla DOM — no React/Vite.

## Frontend

- HTML pages (`src/options/options.html`, `src/app/app.html`) reference flat bundled `[name].js` files emitted by esbuild. Add new entrypoints to the `entryPoints` array in `build.ts`.
- Shared styles live in `src/styles.css`, copied verbatim into `dist/`.
