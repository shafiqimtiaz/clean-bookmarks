#!/usr/bin/env bun
// Generates manifest.json with the actual list of optional host
// permissions (one entry per provider's baseUrl). Without this, Chrome
// shows "Read and change all your data on websites you visit" at
// install time, which scares users. With this, the user sees the
// specific providers they can configure.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const TEMPLATE = resolve(PROJECT_ROOT, "manifest.template.json");
const OUT = resolve(PROJECT_ROOT, "manifest.json");
const MODELS_JSON = resolve(PROJECT_ROOT, "src/core/ai/models.json");

interface SlimProvider {
  id: string;
  baseUrl: string;
  models: unknown[];
}

const providers = Object.values(
  JSON.parse(readFileSync(MODELS_JSON, "utf8")) as Record<string, SlimProvider>,
);

const origins = new Set<string>();
for (const p of providers) {
  try {
    const u = new URL(p.baseUrl);
    origins.add(`${u.protocol}//${u.host}/*`);
  } catch {
    // skip malformed
  }
}
// Always include the OpenAI-compatible custom-endpoint case. We don't
// know the URL in advance, so Chrome must allow any https host the
// extension might request. The runtime prompt still narrows to the
// user-typed origin.
const HOSTS = [...origins, "https://*/*"];

const template = JSON.parse(readFileSync(TEMPLATE, "utf8")) as Record<
  string,
  unknown
>;
template.optional_host_permissions = HOSTS;

writeFileSync(OUT, JSON.stringify(template, null, 2) + "\n");
console.log(`Wrote ${origins.size} host permissions + wildcard -> ${OUT}`);
