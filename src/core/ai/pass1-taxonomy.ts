import { generateText, Output, type LanguageModelUsage } from 'ai';
import { taxonomySchema } from './schema';
import { buildModel } from './provider';
import type { FlatBookmark, Settings, Taxonomy } from '../types';

const SYSTEM = `You organize browser bookmarks. Given titles and URLs, propose 8-15 top-level categories that cleanly cover them. Each category may have a few sub-categories (max one level deep). Use the user's seed categories if provided.`;

// Pass 1: read all bookmarks (compact title|host lines) and propose a taxonomy.
export async function proposeTaxonomy(
  settings: Settings,
  bookmarks: FlatBookmark[]
): Promise<{ taxonomy: Taxonomy; usage: LanguageModelUsage }> {
  const seed = settings.seedCategories.length
    ? `\nSeed categories to respect: ${settings.seedCategories.join(', ')}.`
    : '';
  const list = bookmarks.map((b) => `${b.title} | ${hostOf(b.url)}`).join('\n');

  const { output, usage } = await generateText({
    model: buildModel(settings),
    output: Output.object({ schema: taxonomySchema }),
    system: SYSTEM,
    prompt: `${seed}\nBookmarks:\n${list}`,
    temperature: 0,
    maxRetries: 2,
  });

  return {
    taxonomy: output.categories.map((c) => ({ name: c.name, children: c.children })),
    usage,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
