import { assignmentsSchema, ASSIGNMENTS_HINT } from "./schema";
import { complete } from "./provider";
import { flattenTextContent, parseJson } from "./parse-json";
import type { Assignment, FlatBookmark, Settings, Taxonomy } from "../types";

function system(taxonomy: Taxonomy): string {
  const cats = taxonomy
    .map((c) =>
      c.children?.length ? `${c.name} > [${c.children.join(", ")}]` : c.name,
    )
    .join("\n");
  return `Assign each bookmark to exactly one category. Only use sub when 2+ bookmarks share it — otherwise leave sub null. A folder with 1 item is noise. Never invent categories. Also, fix all bookmark names (title) - there should be NO incorrect, blank, or ambiguous bookmark names. Return one entry per bookmark idx.

Taxonomy:
${cats}`;
}

// Pass 2: assign a single batch of bookmarks to the locked taxonomy. Uses
// prompt-JSON (not tool calling) because batches can have 50-200 entries —
// a single JSON object is more reliable than a 200-arg tool invocation.
// Missing idxs are handled by the caller (-> Unsorted). Throws only after
// retries are exhausted.
export async function assignBatch(
  settings: Settings,
  taxonomy: Taxonomy,
  batch: FlatBookmark[],
): Promise<{ assignments: Assignment[]; usage: { input: number; output: number; costUsd: number } }> {
  const list = batch.map((b) => `${b.idx}: ${b.title} | ${b.url}`).join("\n");

  const base = `${system(taxonomy)}\n\nRespond with ONLY a single JSON object — no markdown, no code fences, no commentary. It must match this shape exactly:\n${ASSIGNMENTS_HINT}`;

  let usage = { input: 0, output: 0, costUsd: 0 };
  let lastErr = "no candidate matched the expected shape";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete(settings, {
      systemPrompt:
        attempt === 0
          ? base
          : `${base}\n\nYour previous reply was not valid JSON. Output ONLY the JSON object.`,
      messages: [
        {
          role: "user",
          content: `Bookmarks:\n${list}`,
          timestamp: Date.now(),
        },
      ],
    });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    usage.costUsd += result.usage.cost.total;

    // pi-ai returns content blocks. We flatten text + thinking (some
    // reasoning models emit the JSON inside a thinking block) and parse.
    const text = flattenTextContent(
      result.content as { type: string; text?: string; thinking?: string }[],
    );
    const value = parseJson(text, assignmentsSchema);
    if (value !== null) {
      const known = new Set(batch.map((b) => b.idx));
      return {
        assignments: value.assignments
          .filter((a) => known.has(a.idx))
          .map((a) => ({
            idx: a.idx,
            cat: a.cat,
            sub: a.sub ?? undefined,
            title: a.title,
          })),
        usage,
      };
    }
  }
  throw new Error(`Model did not return valid JSON: ${lastErr}`);
}
