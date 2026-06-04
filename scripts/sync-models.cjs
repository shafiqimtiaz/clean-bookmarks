const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

// __dirname and __filename are available in CJS context
const PROJECT_ROOT = resolve(__dirname, "..");
const SOURCE = resolve(
  PROJECT_ROOT,
  "node_modules/@earendil-works/pi-ai/dist/models.generated.js"
);
const OVERRIDES = resolve(PROJECT_ROOT, "src/core/ai/vendor-overrides.json");
const OUT = resolve(PROJECT_ROOT, "src/core/ai/models.json");

/** @type {Record<string, Record<string, {id: string, name: string, api: string, provider: string, baseUrl: string, reasoning: boolean, input: string[], cost: {input: number, output: number, cacheRead: number, cacheWrite: number}, contextWindow: number, maxTokens: number, compat?: {supportsDeveloperRole?: boolean, supportsReasoningEffort?: boolean} }>>} */
const MODELS = require(SOURCE).MODELS;

const EXCLUDED_PROVIDERS = new Set(["amazon-bedrock", "huggingface"]);

const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);

/** @type {Record<string, {id: string, baseUrl: string, models: any[]}>} */
const out = {};

for (const [providerId, models] of Object.entries(MODELS)) {
  if (EXCLUDED_PROVIDERS.has(providerId)) continue;
  const slim = Object.values(models)
    .filter((m) => SUPPORTED_APIS.has(m.api))
    .map((m) => ({
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
  if (!slim.length) continue;
  out[providerId] = {
    id: providerId,
    baseUrl: slim[0].baseUrl,
    models: slim,
  };
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

const providerCount = Object.keys(out).length;
const modelCount = Object.values(out).reduce((n, p) => n + p.models.length, 0);
let extrasCount = 0;
if (existsSync(OVERRIDES)) {
  const ov = JSON.parse(readFileSync(OVERRIDES, "utf8"));
  for (const [providerId, patch] of Object.entries(ov.providers ?? {})) {
    const target = out[providerId];
    if (!target) {
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
    ` = ${finalCount} total -> ${OUT}`
);