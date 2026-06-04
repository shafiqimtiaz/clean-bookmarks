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
  return `Assign every bookmark to the ONE category below that best matches what it is FOR. Judge by intent, not just the website it lives on — a cooking video on YouTube belongs in "cooking", not "video"; a company's careers page belongs in "job-search". Read the title and URL together.

Rules:
- Use only the categories listed. Never invent, rename, or merge them.
- When a category lists sub-categories and one clearly fits, set "sub" to it; otherwise leave sub null. Don't worry about small groups — singletons are merged automatically later.
- Every bookmark must get a category. If none fits well, choose the closest.
- Clean each title: return a clear, accurate name. Fix blank, numeric, duplicated, or truncated titles using the URL as a guide; keep good titles unchanged.
- Return exactly one entry per bookmark idx.

Categories:
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
): Promise<{
  assignments: Assignment[];
  usage: { input: number; output: number; costUsd: number };
}> {
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
