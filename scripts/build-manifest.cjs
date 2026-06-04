const { readFileSync, writeFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");

// __dirname is available in CJS context
const PROJECT_ROOT = resolve(__dirname, "..");
const TEMPLATE = resolve(PROJECT_ROOT, "manifest.template.json");
const OUT = resolve(PROJECT_ROOT, "manifest.json");
const MODELS_JSON = resolve(PROJECT_ROOT, "src/core/ai/models.json");

const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);

const providers = Object.values(
  JSON.parse(readFileSync(MODELS_JSON, "utf8"))
);

const origins = new Set();
for (const p of providers) {
  if (!p.models.some((m) => SUPPORTED_APIS.has(m.api))) continue;
  try {
    const u = new URL(p.baseUrl);
    origins.add(`${u.protocol}//${u.host}/*`);
  } catch {
    // ignore invalid URLs
  }
}
const HOSTS = [...origins, "https://*/*"];

const template = JSON.parse(readFileSync(TEMPLATE, "utf8"));
template.optional_host_permissions = HOSTS;

writeFileSync(OUT, JSON.stringify(template, null, 2) + "\n");
console.log(`Wrote ${origins.size} host permissions + wildcard -> ${OUT}`);