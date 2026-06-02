import { generateText, Output, type LanguageModelUsage } from 'ai';
import { assignmentsSchema } from './schema';
import { buildModel } from './provider';
import type { Assignment, FlatBookmark, Settings, Taxonomy } from '../types';

function system(taxonomy: Taxonomy): string {
  const cats = taxonomy
    .map((c) => (c.children?.length ? `${c.name} > [${c.children.join(', ')}]` : c.name))
    .join('\n');
  return `Assign each bookmark to exactly one category from this fixed taxonomy. Use a sub-category when one fits, else null. Never invent categories. Return one entry per bookmark idx.\n\nTaxonomy:\n${cats}`;
}

// Assign a single batch. Missing idxs are handled by the caller (-> Unsorted).
// Throws only after the SDK's built-in retries are exhausted.
export async function assignBatch(
  settings: Settings,
  taxonomy: Taxonomy,
  batch: FlatBookmark[]
): Promise<{ assignments: Assignment[]; usage: LanguageModelUsage }> {
  const list = batch.map((b) => `${b.idx}: ${b.title} | ${b.url}`).join('\n');

  const { output, usage } = await generateText({
    model: buildModel(settings),
    output: Output.object({ schema: assignmentsSchema }),
    system: system(taxonomy),
    prompt: `Bookmarks:\n${list}`,
    temperature: 0,
    maxRetries: 2,
  });

  const known = new Set(batch.map((b) => b.idx));
  return {
    assignments: output.assignments
      .filter((a) => known.has(a.idx))
      .map((a) => ({ idx: a.idx, cat: a.cat, sub: a.sub ?? undefined })),
    usage,
  };
}
