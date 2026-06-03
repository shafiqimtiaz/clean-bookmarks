import { taxonomyTool, TAXONOMY_HINT } from "./schema";
import { complete } from "./provider";
import type { ToolCall } from "@earendil-works/pi-ai";
import type { FlatBookmark, Settings, Taxonomy } from "../types";

const SYSTEM = `Group bookmarks into categories. Single word per name. Abbreviate. Merge similar. No articles. Tight. No cap.
Children (sub-categories) are OPTIONAL — only add when 5+ bookmarks clearly share a distinct sub-theme. Never use bookmark names as children. Most categories should have NO children.
Example: "react-hooks" + "react-state" + "react-router" → "react"`;

export const DEFAULT_TAXONOMY_PROMPT = SYSTEM;

// Pass 1: read all bookmarks and propose a taxonomy. Uses tool calling
// (propose_taxonomy) so the response is structured and TypeBox-validated.
// `configSeeds` = user's explicitly configured seed categories
// (guaranteed to survive). `folderHints` = auto-detected existing folder
// names (advisory only — AI may merge/rename).
export async function proposeTaxonomy(
  settings: Settings,
  bookmarks: FlatBookmark[],
  configSeeds: string[],
  folderHints: string[] = [],
): Promise<{ taxonomy: Taxonomy; usage: { input: number; output: number; costUsd: number } }> {
  const parts: string[] = [];
  if (configSeeds.length)
    parts.push(`Required categories (keep as-is): ${configSeeds.join(", ")}.`);
  if (folderHints.length)
    parts.push(
      `Existing folder hints (merge/rename freely): ${folderHints.join(", ")}.`,
    );
  const list = bookmarks.map((b) => `${b.title} | ${hostOf(b.url)}`).join("\n");

  let raw: unknown = null;
  let usage = { input: 0, output: 0, costUsd: 0 };

  // Try the tool call first. If the model didn't call the tool (some
  // smaller models ignore it), fall back to prompt-JSON + parseJson.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete(settings, {
      systemPrompt:
        attempt === 0
          ? SYSTEM
          : `${SYSTEM}\n\nYou MUST call the propose_taxonomy tool with the categories. Do not reply with prose.`,
      messages: [
        {
          role: "user",
          content: `${parts.join("\n")}\nBookmarks:\n${list}`,
          timestamp: Date.now(),
        },
      ],
      tools: [taxonomyTool],
    });
    usage.input += result.usage.input;
    usage.output += result.usage.output;
    usage.costUsd += result.usage.cost.total;

    const toolCall = result.content.find(
      (b): b is ToolCall => b.type === "toolCall" && b.name === "propose_taxonomy",
    );
    if (toolCall) {
      raw = toolCall.arguments;
      break;
    }

    // Fallback: try to parse text content as JSON.
    const text = result.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (text) {
      // Reuse the tolerant parser — but with a runtime-shaped validator.
      // We accept the structure even if TypeBox didn't pre-validate.
      try {
        const obj = JSON.parse(text);
        if (obj && Array.isArray(obj.categories)) {
          raw = obj;
          break;
        }
      } catch {
        // retry with stricter instruction
      }
    }
  }

  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { categories: unknown }).categories)) {
    throw new Error("Model did not return a valid taxonomy.");
  }

  const cats = (raw as { categories: { name: string; children?: string[] }[] }).categories;
  const taxonomy: Taxonomy = cats.map((c) => ({
    name: c.name,
    children: c.children,
  }));

  // Strip children that look like individual bookmark names, not sub-categories.
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
  // Only guarantee explicitly configured seeds survive — folder hints are advisory.
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
