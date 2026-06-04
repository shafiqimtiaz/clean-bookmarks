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

export const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);

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
};

const KNOWN_BASEURLS: Record<string, string> = Object.fromEntries(
  Object.entries(REGISTRY as unknown as Record<string, ProviderInfo>).map(
    ([id, p]) => [p.baseUrl.replace(/\/$/, ""), id],
  ),
);
const FALLBACK_PROVIDER_ID = Object.keys(
  REGISTRY as unknown as Record<string, ProviderInfo>,
)[0] ?? "openai";

export function getProviders(): ProviderInfo[] {
  return Object.values(REGISTRY as unknown as Record<string, ProviderInfo>).map(
    (p) => ({ ...p, label: LABEL[p.id] ?? p.id }),
  );
}

export function getProvider(providerId: string): ProviderInfo | null {
  return (
    (REGISTRY as unknown as Record<string, ProviderInfo>)[providerId] ?? null
  );
}

export function getModel(
  providerId: string,
  modelId: string,
): SlimModel | null {
  const p = getProvider(providerId);
  if (!p) return null;
  return p.models.find((m) => m.id === modelId) ?? null;
}

export function getModelApi(
  providerId: string,
  modelId: string,
): string | null {
  return getModel(providerId, modelId)?.api ?? null;
}

export function isModelSupported(providerId: string, modelId: string): boolean {
  const api = getModelApi(providerId, modelId);
  return api !== null && SUPPORTED_APIS.has(api);
}

export function getProviderBaseUrl(providerId: string): string | null {
  return getProvider(providerId)?.baseUrl ?? null;
}

export function providerForBaseUrl(baseUrl: string): {
  id: string;
  baseUrl: string;
} {
  const norm = baseUrl.replace(/\/$/, "");
  const id = KNOWN_BASEURLS[norm] ?? FALLBACK_PROVIDER_ID;
  return { id, baseUrl: norm };
}
