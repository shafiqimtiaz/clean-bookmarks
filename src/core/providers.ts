// Provider registry backed by the slim model list synced from
// @earendil-works/pi-ai (see scripts/sync-models.ts). The UI reads from
// here to populate the Settings dropdowns. The runtime uses these to
// build a pi-ai Model object for the chosen provider/model.
//
// "custom" is a sentinel for arbitrary OpenAI-compatible endpoints
// (Ollama, LM Studio, vLLM, LiteLLM, etc.). It's not in models.json —
// users type baseUrl + model name directly.

import REGISTRY from "./ai/models.json" with { type: "json" };

export interface SlimModel {
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

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  models: SlimModel[];
}

// Browser extension runtime supports a subset of pi-ai's APIs. Bedrock,
// Vertex AI, and Azure are excluded (need cloud credentials we can't BYOK).
export const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);

// Human-friendly labels for the dropdown. Order matters: this is the
// display order in the Settings UI.
const LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  "google-vertex": "Google Vertex AI",
  "azure-openai-responses": "Azure OpenAI",
  "openai-codex-responses": "OpenAI Codex (ChatGPT)",
  "openai-responses": "OpenAI (Responses)",
  "openai-completions": "OpenAI (Completions)",
  deepseek: "DeepSeek",
  groq: "Groq",
  cerebras: "Cerebras",
  xai: "xAI (Grok)",
  mistral: "Mistral",
  cohere: "Cohere",
  openrouter: "OpenRouter",
  "vercel-ai-gateway": "Vercel AI Gateway",
  together: "Together AI",
  fireworks: "Fireworks",
  "github-copilot": "GitHub Copilot",
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
  vllm: "vLLM (local)",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax (China)",
  "z-ai": "ZAI",
  "kimi-coding": "Kimi For Coding",
  "xiaomi-mimo": "Xiaomi MiMo",
  cloudflare: "Cloudflare AI Gateway",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  opencode: "OpenCode Zen",
  nvidia: "NVIDIA NIM",
  custom: "Custom (OpenAI-compatible)",
};

const KNOWN_BASEURLS: Record<string, string> = Object.fromEntries(
  Object.entries(REGISTRY as unknown as Record<string, ProviderInfo>).map(
    ([id, p]) => [p.baseUrl.replace(/\/$/, ""), id],
  ),
);

export function getProviders(): ProviderInfo[] {
  return Object.values(REGISTRY as unknown as Record<string, ProviderInfo>).map(
    (p) => ({ ...p, label: LABEL[p.id] ?? p.id }),
  );
}

export function getProvider(providerId: string): ProviderInfo | null {
  return (REGISTRY as unknown as Record<string, ProviderInfo>)[providerId] ?? null;
}

export function getModel(providerId: string, modelId: string): SlimModel | null {
  const p = getProvider(providerId);
  if (!p) return null;
  return p.models.find((m) => m.id === modelId) ?? null;
}

export function getModelApi(providerId: string, modelId: string): string | null {
  return getModel(providerId, modelId)?.api ?? null;
}

export function isModelSupported(providerId: string, modelId: string): boolean {
  const api = getModelApi(providerId, modelId);
  return api !== null && SUPPORTED_APIS.has(api);
}

export function getProviderBaseUrl(providerId: string): string | null {
  return getProvider(providerId)?.baseUrl ?? null;
}

// Resolve a stored baseUrl to a known provider id, or "custom" if unknown.
export function providerForBaseUrl(baseUrl: string): { id: string; baseUrl: string } {
  const norm = baseUrl.replace(/\/$/, "");
  const id = KNOWN_BASEURLS[norm] ?? "custom";
  return { id, baseUrl: norm };
}

export const CUSTOM_PROVIDER_ID = "custom";
