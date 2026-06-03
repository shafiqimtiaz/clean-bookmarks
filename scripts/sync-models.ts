#!/usr/bin/env bun
// Syncs the slim model registry from the installed @earendil-works/pi-ai
// package. Re-run after `bun update @earendil-works/pi-ai` to pick up new
// providers and models. Run via `bun run sync-models` (wired as prebuild).
//
// We project each Model entry to a flat shape the picker UI consumes:
//   { id, name, provider, baseUrl, contextWindow, maxTokens, reasoning,
//     input, cost, compat }
// Bedrock is excluded (not browser-compatible per pi-ai README).
// Hugging Face is excluded (no fixed model list).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const SOURCE = resolve(
  PROJECT_ROOT,
  "node_modules/@earendil-works/pi-ai/dist/models.generated.js",
);
const OVERRIDES = resolve(PROJECT_ROOT, "src/core/ai/vendor-overrides.json");
const OUT = resolve(PROJECT_ROOT, "src/core/ai/models.json");

interface FullModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat?: { supportsDeveloperRole?: boolean; supportsReasoningEffort?: boolean };
}

interface SlimModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  cost: { in: number; out: number; cacheRead: number; cacheWrite: number };
  compat: { supportsDeveloperRole: boolean; supportsReasoningEffort: boolean };
}

interface ProviderInfo {
  id: string;
  baseUrl: string;
  models: SlimModel[];
}

type Registry = Record<string, ProviderInfo>;

// Providers not usable from a Chrome MV3 extension context. Bedrock needs
// AWS SigV4; HF has no fixed model list.
const EXCLUDED_PROVIDERS = new Set(["amazon-bedrock", "huggingface"]);

const mod = (await import(SOURCE)) as { MODELS: Record<string, Record<string, FullModel>> };
const out: Registry = {};

for (const [providerId, models] of Object.entries(mod.MODELS)) {
  if (EXCLUDED_PROVIDERS.has(providerId)) continue;
  // Use the first model's baseUrl as the canonical origin for host permissions.
  const firstModel = Object.values(models)[0];
  if (!firstModel) continue;
  const slim: SlimModel[] = Object.values(models).map((m) => ({
    id: m.id,
    name: m.name,
    api: m.api,
    provider: m.provider,
    baseUrl: m.baseUrl,
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    reasoning: m.reasoning,
    input: m.input,
    cost: {
      in: m.cost.input,
      out: m.cost.output,
      cacheRead: m.cost.cacheRead,
      cacheWrite: m.cost.cacheWrite,
    },
    compat: {
      supportsDeveloperRole: m.compat?.supportsDeveloperRole ?? true,
      supportsReasoningEffort: m.compat?.supportsReasoningEffort ?? true,
    },
  }));
  out[providerId] = {
    id: providerId,
    baseUrl: firstModel.baseUrl,
    models: slim,
  };
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

const providerCount = Object.keys(out).length;
const modelCount = Object.values(out).reduce((n, p) => n + p.models.length, 0);
let extrasCount = 0;
if (existsSync(OVERRIDES)) {
  const ov = JSON.parse(readFileSync(OVERRIDES, "utf8")) as {
    providers: Record<string, { models: SlimModel[] }>;
  };
  for (const [providerId, patch] of Object.entries(ov.providers ?? {})) {
    const target = out[providerId];
    if (!target) {
      // New provider from overrides that pi-ai doesn't ship.
      const first = patch.models[0];
      if (!first) continue;
      out[providerId] = {
        id: providerId,
        baseUrl: first.baseUrl,
        models: patch.models,
      };
      extrasCount += patch.models.length;
      continue;
    }
    const seen = new Set(target.models.map((m) => m.id));
    for (const m of patch.models) {
      if (seen.has(m.id)) {
        // Override an existing model in place.
        const idx = target.models.findIndex((x) => x.id === m.id);
        target.models[idx] = m;
      } else {
        target.models.push(m);
        seen.add(m.id);
        extrasCount++;
      }
    }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
}

const finalCount = Object.values(out).reduce((n, p) => n + p.models.length, 0);
console.log(
  `Synced ${providerCount} providers / ${modelCount} models` +
    (extrasCount ? ` + ${extrasCount} vendor extras` : "") +
    ` = ${finalCount} total -> ${OUT}`,
);
