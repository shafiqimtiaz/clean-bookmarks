import { taxonomySchema, TAXONOMY_HINT } from './schema';
import { generateJson, type Usage } from './json';
import type { FlatBookmark, Settings, Taxonomy } from '../types';

const SYSTEM = `Group bookmarks into 8-15 categories. Single word per name. Abbreviate. Merge similar. No articles. Tight.
Example: "react-hooks" + "react-state" + "react-router" → "react"`;

// Pass 1: read all bookmarks and propose a taxonomy.
// `configSeeds` = user's explicitly configured seed categories (guaranteed to survive).
// `folderHints` = auto-detected existing folder names (advisory only — AI may merge/rename).
export async function proposeTaxonomy(
  settings: Settings,
  bookmarks: FlatBookmark[],
  configSeeds: string[],
  folderHints: string[] = []
): Promise<{ taxonomy: Taxonomy; usage: Usage }> {
  const parts: string[] = [];
  if (configSeeds.length) parts.push(`Required categories (keep as-is): ${configSeeds.join(', ')}.`);
  if (folderHints.length) parts.push(`Existing folder hints (merge/rename freely): ${folderHints.join(', ')}.`);
  const list = bookmarks.map((b) => `${b.title} | ${hostOf(b.url)}`).join('\n');

  const { data, usage } = await generateJson(
    settings,
    taxonomySchema,
    SYSTEM,
    `${parts.join('\n')}\nBookmarks:\n${list}`,
    TAXONOMY_HINT
  );

  const taxonomy: Taxonomy = data.categories.map((c) => ({ name: c.name, children: c.children }));
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
