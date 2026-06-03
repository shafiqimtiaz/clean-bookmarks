// Known OpenAI-compatible providers for the Settings quick-fill dropdowns.
// The endpoint stays a single base-URL field (locked design) — these just
// pre-fill it. "Custom" leaves base URL + model free for any other endpoint.
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    models: ["MiniMax-M2.7", "MiniMax-M2"],
  },
];

export const CUSTOM_PROVIDER: ProviderPreset = {
  id: "custom",
  label: "Custom",
  baseUrl: "",
  models: [],
};

export function providerForBaseUrl(baseUrl: string): ProviderPreset {
  const norm = baseUrl.replace(/\/$/, "");
  return PROVIDERS.find((p) => p.baseUrl === norm) ?? CUSTOM_PROVIDER;
}
