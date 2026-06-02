import { generateText, wrapLanguageModel, extractReasoningMiddleware } from 'ai';
import type { z } from 'zod';
import { buildModel } from './provider';
import type { Settings } from '../types';

// Just the token counts we surface in the progress UI.
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

// Strips <think>…</think> reasoning out of the content so it doesn't pollute
// the JSON we parse. Reasoning models emit it inline.
const reasoning = extractReasoningMiddleware({ tagName: 'think' });

const ZERO: Usage = { inputTokens: 0, outputTokens: 0 };

// Robust JSON generation that works across reasoning + non-reasoning,
// json-mode + plain providers: demand JSON-only, strip fences/prose, extract
// the first balanced object, validate with Zod, and retry once.
export async function generateJson<T>(
  settings: Settings,
  schema: z.ZodType<T>,
  system: string,
  user: string,
  shapeHint: string
): Promise<{ data: T; usage: Usage }> {
  const model = wrapLanguageModel({ model: buildModel(settings), middleware: reasoning });
  const base = `${system}\n\nRespond with ONLY a single JSON object — no markdown, no code fences, no commentary. It must match this shape exactly:\n${shapeHint}`;

  let usage = ZERO;
  let lastErr = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateText({
      model,
      system: attempt === 0 ? base : `${base}\n\nYour previous reply was not valid JSON. Output ONLY the JSON object.`,
      prompt: user,
      temperature: 0,
      maxRetries: 2,
    });
    usage = addUsage(usage, res.usage);

    const value = parseJson(res.text, schema);
    if (value !== null) return { data: value, usage };
    lastErr = 'no candidate matched the expected shape';
  }
  throw new Error(`Model did not return valid JSON: ${lastErr}`);
}

// Pull every balanced {…} object out of the (think/fence-stripped) text and
// return the first one — preferring the LAST in the text, since reasoning
// models emit stray braces in prose before the final answer — that both
// parses and matches the schema. Returns null if none do.
export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '');
  const candidates = extractObjects(cleaned);
  for (let i = candidates.length - 1; i >= 0; i--) {
    let obj: unknown;
    try {
      obj = JSON.parse(candidates[i]!);
    } catch {
      continue;
    }
    const r = schema.safeParse(obj);
    if (r.success) return r.data;
  }
  return null;
}

// All top-level {…} objects, respecting strings/escapes.
export function extractObjects(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0 && --depth === 0) {
      out.push(s.slice(start, i + 1));
    }
  }
  return out;
}

function addUsage(a: Usage, b: { inputTokens?: number; outputTokens?: number }): Usage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
  };
}
