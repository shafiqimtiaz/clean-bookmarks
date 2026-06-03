import type { z } from "zod";

// Tolerant JSON parsing for reasoning-model output. We strip <think> blocks
// and any markdown fences, then walk the text extracting balanced {...}
// objects. We prefer the LAST object that parses AND validates — reasoning
// models emit stray braces in prose before the final answer.

export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json|```/gi, "");
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

// All top-level {...} objects, respecting strings/escapes.
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
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0 && --depth === 0) {
      out.push(s.slice(start, i + 1));
    }
  }
  return out;
}

// Join all text + thinking blocks from an AssistantMessage's content into a
// single string for parseJson. Pass 2 sends "return JSON" instructions and
// reuses this; pass 1 uses tool calls instead.
export function flattenTextContent(
  blocks: ReadonlyArray<{ type: string; text?: string; thinking?: string }>,
): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "thinking" ? b.thinking : ""))
    .filter(Boolean)
    .join("\n");
}
