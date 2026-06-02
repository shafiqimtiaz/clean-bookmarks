import { taxonomySchema, TAXONOMY_HINT } from './schema';
import { generateJson, type Usage } from './json';
import type { FlatBookmark, Settings, Taxonomy } from '../types';

const SYSTEM = `You organize browser bookmarks. Given titles and URLs, propose 8-15 top-level categories that cleanly cover them. Each category may have a few sub-categories (max one level deep). Feel free to merge, rename, or consolidate similar topics — e.g. "immigration-platform", "immigration-process", "immigration-tool" → "Immigration". Produce clean, broad categories, not a copy of the existing folder structure.`;

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
