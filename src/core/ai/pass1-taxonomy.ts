import { taxonomySchema, TAXONOMY_HINT } from './schema';
import { generateJson, type Usage } from './json';
import type { FlatBookmark, Settings, Taxonomy } from '../types';

const SYSTEM = `You organize browser bookmarks. Given titles and URLs, propose 8-15 top-level categories that cleanly cover them. Each category may have a few sub-categories (max one level deep). Preserve the user's existing folder / seed categories (merge obvious duplicates like "Dev"/"Development").`;

// Pass 1: read all bookmarks and propose a taxonomy. `seeds` are the user's
// existing folder names + configured seed categories — fed to the model to
// merge/dedupe, then unioned back so none are ever dropped.
export async function proposeTaxonomy(
  settings: Settings,
  bookmarks: FlatBookmark[],
  seeds: string[]
): Promise<{ taxonomy: Taxonomy; usage: Usage }> {
  const seed = seeds.length
    ? `\nExisting folders / seed categories to preserve as categories: ${seeds.join(', ')}.`
    : '';
  const list = bookmarks.map((b) => `${b.title} | ${hostOf(b.url)}`).join('\n');

  const { data, usage } = await generateJson(
    settings,
    taxonomySchema,
    SYSTEM,
    `${seed}\nBookmarks:\n${list}`,
    TAXONOMY_HINT
  );

  const taxonomy: Taxonomy = data.categories.map((c) => ({ name: c.name, children: c.children }));
  // Guarantee every seed survives, even if the model dropped it.
  const have = new Set(taxonomy.map((c) => c.name.toLowerCase()));
  for (const s of seeds) {
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
