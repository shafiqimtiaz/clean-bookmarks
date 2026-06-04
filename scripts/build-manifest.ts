import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_APIS } from "../src/core/providers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
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
const HOSTS = [...origins];

const PACKAGE_JSON = resolve(PROJECT_ROOT, "package.json");
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: string };

const template = JSON.parse(readFileSync(TEMPLATE, "utf8")) as Record<
  string,
  unknown
>;
template.optional_host_permissions = HOSTS;
template.version = pkg.version;
template.version_name = pkg.version;

writeFileSync(OUT, JSON.stringify(template, null, 2) + "\n");
console.log(`Wrote v${pkg.version} + ${origins.size} host permissions -> ${OUT}`);
