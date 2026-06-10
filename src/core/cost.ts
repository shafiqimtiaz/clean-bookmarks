import type { FlatBookmark, Settings } from "./types";
import { getModel } from "./providers";
import type { SlimModel } from "./providers";

export const BATCH_SIZE = 100;
export const CONCURRENCY = 3;

function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CostEstimate {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  usd: number;
}

function pricingFor(settings: Settings): { in: number; out: number } {
  // Chrome browser model is free to run.
  if (settings.provider === "chrome-ai") return { in: 0, out: 0 };
  if (!settings.apiKey) {
    return { in: 0, out: 0 };
  }
  const m = getModel(settings.provider, settings.model);
  if (!m) return { in: 0.5, out: 1.5 };
  return { in: m.cost.in, out: m.cost.out };
}

export function estimateCost(
  bookmarks: FlatBookmark[],
  settings: Settings,
): CostEstimate {
  const batches = Math.ceil(bookmarks.length / BATCH_SIZE);
  const pass1Prompt = estTokens(
    bookmarks.map((b) => `${b.title} ${b.url}`).join("\n"),
  );
  const pass2Prompt = pass1Prompt; // each bookmark sent once more in assign pass
  const promptTokens = pass1Prompt + pass2Prompt;
  const completionTokens = bookmarks.length * 12 + 400; // assignments + taxonomy
  const calls = 1 + batches;

  const p = pricingFor(settings);
  // pi-ai's cost.in/out are per 1M tokens.
  const usd =
    (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
  return { calls, promptTokens, completionTokens, usd: round(usd) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Re-export so other modules can fetch the resolved model from one place.
export function modelFor(settings: Settings): SlimModel | null {
  return getModel(settings.provider, settings.model);
}
