import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUPPORTED_APIS } from "../src/core/providers";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const TEMPLATE = resolve(PROJECT_ROOT, "manifest.template.json");
const OUT = resolve(PROJECT_ROOT, "manifest.json");
const MODELS_JSON = resolve(PROJECT_ROOT, "src/core/ai/models.json");

interface SlimProvider {
  id: string;
  baseUrl: string;
  models: { api: string }[];
}

const providers = Object.values(
  JSON.parse(readFileSync(MODELS_JSON, "utf8")) as Record<string, SlimProvider>,
);

const origins = new Set<string>();
for (const p of providers) {
  if (!p.models.some((m) => SUPPORTED_APIS.has(m.api))) continue;
  try {
    const u = new URL(p.baseUrl);
    origins.add(`${u.protocol}//${u.host}/*`);
  } catch {
  }
}
const HOSTS = [...origins, "https://*/*"];

const template = JSON.parse(readFileSync(TEMPLATE, "utf8")) as Record<
  string,
  unknown
>;
template.optional_host_permissions = HOSTS;

writeFileSync(OUT, JSON.stringify(template, null, 2) + "\n");
console.log(`Wrote ${origins.size} host permissions + wildcard -> ${OUT}`);
