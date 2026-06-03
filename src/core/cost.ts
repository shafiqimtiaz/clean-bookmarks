import type { FlatBookmark } from "./types";

export const BATCH_SIZE = 100;
export const CONCURRENCY = 3;

// Rough per-1K-token USD pricing for the cost estimate. These are display
// hints only; real spend comes from the provider's usage in responses.
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.0025, out: 0.01 },
  default: { in: 0.0005, out: 0.0015 },
};

// ~4 chars per token heuristic.
function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CostEstimate {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  usd: number;
}

export function estimateCost(
  bookmarks: FlatBookmark[],
  model: string,
): CostEstimate {
  const batches = Math.ceil(bookmarks.length / BATCH_SIZE);
  const pass1Prompt = estTokens(
    bookmarks.map((b) => `${b.title} ${b.url}`).join("\n"),
  );
  const pass2Prompt = pass1Prompt; // each bookmark sent once more in assign pass
  const promptTokens = pass1Prompt + pass2Prompt;
  const completionTokens = bookmarks.length * 12 + 400; // assignments + taxonomy
  const calls = 1 + batches; // 1 taxonomy + N assign batches

  const p = PRICING[model] ?? PRICING.default!;
  const usd = (promptTokens / 1000) * p.in + (completionTokens / 1000) * p.out;
  return { calls, promptTokens, completionTokens, usd: round(usd) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
