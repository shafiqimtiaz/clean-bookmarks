import { taxonomyTool, TAXONOMY_HINT, taxonomySchema } from "./schema";
import { parseJson } from "./parse-json";
import { complete } from "./provider";
import type { ToolCall } from "@earendil-works/pi-ai";
import type { FlatBookmark, Settings, Taxonomy } from "../types";

const SYSTEM = `Propose 8–12 topic categories that capture what each bookmark is FOR, not where it lives.
Intent over source: a cooking tutorial on YouTube → "cooking"; a React repo on GitHub → "frontend". Read past the domain.

Rules:
- Names: 1 word, lowercase, no hyphens (e.g. "projects", "jobs", "frontend"). No caps, no articles.
- Merge aggressively — fewer broad categories beats many narrow ones.
- Sub-categories: avoid. Only add children when 10+ bookmarks clearly share a tight sub-theme with no better parent. Default is zero children.
- Never name a category after a website, domain, or bookmark title.`;

export const DEFAULT_TAXONOMY_PROMPT = SYSTEM;

// Pass 1: propose a taxonomy via tool call. configSeeds always survive;
// folderHints are advisory.
export async function proposeTaxonomy(
  settings: Settings,
  bookmarks: FlatBookmark[],
  configSeeds: string[],
  folderHints: string[] = [],
  excludedFolderNames: string[] = [],
): Promise<{
  taxonomy: Taxonomy;
  usage: { input: number; output: number; costUsd: number };
}> {
  // User's edited prompt drives pass 1; else the default.
  const promptBase = settings.taxonomyPrompt?.trim() || DEFAULT_TAXONOMY_PROMPT;

  const excluded = new Set(excludedFolderNames);
  const visibleHints = folderHints.filter((n) => !excluded.has(n));

  const parts: string[] = [];
  if (configSeeds.length)
    parts.push(`Required categories (keep as-is): ${configSeeds.join(", ")}.`);
  if (visibleHints.length)
    parts.push(
      `Existing folder names (merge/rename freely — they hint at the user's mental model): ${visibleHints.join(", ")}.`,
    );
  // "title | site/path" — the path is a cheap intent signal.
  const list = bookmarks
    .map((b) => `${b.title} | ${siteHint(b.url)}`)
    .join("\n");
  const guidance = parts.length ? parts.join("\n") + "\n\n" : "";

  let raw: unknown = null;
  let usage = { input: 0, output: 0, costUsd: 0 };

  // Tool call first; fall back to parsing prose JSON if the model ignores it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete(settings, {
      systemPrompt:
        attempt === 0
          ? promptBase
          : `${promptBase}\n\nYou MUST call the propose_taxonomy tool with the categories. Do not reply with prose.`,
      messages: [
        {
          role: "user",
          content:
            `You are organizing ${bookmarks.length} bookmarks, each shown as "title | site/path".\n` +
            `Read the title and site together to infer what each is FOR.\n\n` +
            `${guidance}Bookmarks:\n${list}`,
          timestamp: Date.now(),
        },
      ],
      tools: [taxonomyTool],
    });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    usage.costUsd += result.usage.cost.total;

    const toolCall = result.content.find(
      (b): b is ToolCall =>
        b.type === "toolCall" && b.name === "propose_taxonomy",
    );
    if (toolCall) {
      raw = toolCall.arguments;
      break;
    }

    // Some models reply with prose or fenced JSON, not a tool call; parse tolerantly.
    const text = result.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (text) {
      const obj = parseJson(text, taxonomySchema);
      if (obj) {
        raw = obj;
        break;
      }
      // else retry with the stricter instruction
    }
  }

  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { categories: unknown }).categories)
  ) {
    throw new Error("Model did not return a valid taxonomy.");
  }

  const cats = (raw as { categories: { name: string; children?: string[] }[] })
    .categories;
  const taxonomy: Taxonomy = cats.map((c) => ({
    name: c.name,
    children: c.children,
  }));

  // Drop children that are really bookmark names, not sub-categories.
  const titleSet = new Set(bookmarks.map((b) => b.title.toLowerCase()));
  const hostSet = new Set(
    bookmarks.map((b) => hostOf(b.url).toLowerCase()).filter(Boolean),
  );
  for (const cat of taxonomy) {
    cat.children = (cat.children ?? []).filter((ch) => {
      const lc = ch.toLowerCase();
      if (titleSet.has(lc)) return false;
      if (hostSet.has(lc)) return false;
      if (ch.length > 30) return false;
      if (/[^a-zA-Z0-9 &_\-.]/.test(ch)) return false;
      return true;
    });
  }
  // Only configured seeds are guaranteed; folder hints are advisory.
  const have = new Set(taxonomy.map((c) => c.name.toLowerCase()));
  for (const s of configSeeds) {
    if (!have.has(s.toLowerCase())) taxonomy.push({ name: s, children: [] });
  }

  return { taxonomy, usage };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// host + first meaningful path segment (e.g. github.com/tailwindlabs).
function siteHint(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg && seg.length <= 24 && !/\.[a-z0-9]{1,5}$/i.test(seg)
      ? `${host}/${seg}`
      : host;
  } catch {
    return url;
  }
}
