import { assignmentsSchema, ASSIGNMENTS_HINT } from './schema';
import { generateJson, type Usage } from './json';
import type { Assignment, FlatBookmark, Settings, Taxonomy } from '../types';

function system(taxonomy: Taxonomy): string {
  const cats = taxonomy
    .map((c) => (c.children?.length ? `${c.name} > [${c.children.join(', ')}]` : c.name))
    .join('\n');
  return `Assign each bookmark to exactly one category from this fixed taxonomy. Use a sub-category when one fits, else null. Never invent categories. Return one entry per bookmark idx.\n\nTaxonomy:\n${cats}`;
}

// Assign a single batch. Missing idxs are handled by the caller (-> Unsorted).
// Throws only after retries are exhausted.
export async function assignBatch(
  settings: Settings,
  taxonomy: Taxonomy,
  batch: FlatBookmark[]
): Promise<{ assignments: Assignment[]; usage: Usage }> {
  const list = batch.map((b) => `${b.idx}: ${b.title} | ${b.url}`).join('\n');

  const { data, usage } = await generateJson(
    settings,
    assignmentsSchema,
    system(taxonomy),
    `Bookmarks:\n${list}`,
    ASSIGNMENTS_HINT
  );

  const known = new Set(batch.map((b) => b.idx));
  return {
    assignments: data.assignments
      .filter((a) => known.has(a.idx))
      .map((a) => ({ idx: a.idx, cat: a.cat, sub: a.sub ?? undefined })),
    usage,
  };
}
