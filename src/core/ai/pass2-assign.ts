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
- Pick a category only from the list below. Copy its name EXACTLY as written — same spelling, case, and hyphens. Never invent, rename, merge, re-case, or pluralize a category.
- "sub" must be one of the chosen category's own listed children (shown after ">"), copied exactly, or null. Never invent a sub, and never borrow a sub from a different category. If the category lists no children, sub is null. Prefer null — only nest when a listed child clearly fits.
- Every bookmark must get a category. If none fits well, choose the closest.
- Clean each title into a clear, accurate name. Never add facts not present in the title or URL; keep real product, brand, and site names; drop taglines and marketing copy. Fix blank, numeric, duplicated, or truncated titles using the URL as a guide; leave good titles unchanged.
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

  // Canonical lookup so the model's strings snap to the exact taxonomy nodes
  // the user approved — case/spacing variants ("Frontend" vs "frontend") map
  // to one folder, and unknown categories or subs are rejected rather than
  // spawning stray folders.
  const catByLower = new Map<string, string>();
  const subsByCat = new Map<string, Map<string, string>>();
  for (const c of taxonomy) {
    catByLower.set(c.name.trim().toLowerCase(), c.name);
    const subs = new Map<string, string>();
    for (const ch of c.children ?? []) subs.set(ch.trim().toLowerCase(), ch);
    subsByCat.set(c.name, subs);
  }

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
      const seen = new Set<number>();
      const assignments: Assignment[] = [];
      for (const a of value.assignments) {
        if (!known.has(a.idx) || seen.has(a.idx)) continue;
        const cat = catByLower.get((a.cat ?? "").trim().toLowerCase());
        if (!cat) continue; // unknown category -> drop -> Unsorted at apply
        seen.add(a.idx);
        const sub =
          a.sub != null
            ? subsByCat.get(cat)?.get(a.sub.trim().toLowerCase())
            : undefined;
        assignments.push({ idx: a.idx, cat, sub, title: a.title });
      }
      return { assignments, usage };
    }
  }
  throw new Error(`Model did not return valid JSON: ${lastErr}`);
}
