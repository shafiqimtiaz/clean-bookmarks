import { pool, chunk } from "../core/batch";
import { BATCH_SIZE, CONCURRENCY } from "../core/cost";
import { proposeTaxonomy } from "../core/ai/pass1-taxonomy";
import { assignBatch } from "../core/ai/pass2-assign";
import { getSettings } from "../core/storage";
import { send, type ReadScopeResult } from "../core/messaging";
import type {
  Assignment,
  FlatBookmark,
  RunState,
  Taxonomy,
} from "../core/types";

// Local usage shape surfaced to the progress UI. Matches what the
// pass1/pass2 functions return: per-call token counts + USD.
type RunUsage = { input: number; output: number; costUsd: number };

const tokens = (u: RunUsage) => u.input + u.output;
const usd = (u: RunUsage) => u.costUsd;

// The long-running organize job lives here, in the full-page tab context,
// so the MV3 service worker's ~30s idle kill never interrupts it. The SW is
// only asked to read the scope and (later) apply/undo.
export class OrganizeRun {
  state: RunState = {
    phase: "idle",
    total: 0,
    done: 0,
    batchesDone: 0,
    batchesTotal: 0,
    spentTokens: 0,
  };
  bookmarks: FlatBookmark[] = [];
  scopeParentIds: string[] = [];
  taxonomy: Taxonomy = [];
  assignments: Assignment[] = [];

  constructor(private onChange: (s: RunState) => void) {}

  private set(patch: Partial<RunState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  // Phase 1: ask the SW to read the scope, then propose a taxonomy.
  async start(folderIds?: string[]): Promise<Taxonomy> {
    this.set({ phase: "reading" });
    const read = await send<ReadScopeResult>({ type: "READ_SCOPE", folderIds });
    if (!read.ok) return this.fail(read.error);
    this.bookmarks = read.data.bookmarks;
    this.scopeParentIds = read.data.scopeParentIds;
    this.set({ phase: "pass1", total: this.bookmarks.length });

    const settings = await getSettings();
    const configSeeds = [...new Set(settings.seedCategories)];
    const folderHints = [...new Set(read.data.folderNames)];
    const { taxonomy, usage } = await proposeTaxonomy(
      settings,
      this.bookmarks,
      configSeeds,
      folderHints,
    );
    this.taxonomy = taxonomy;
    this.set({
      phase: "review",
      spentTokens: this.state.spentTokens + tokens(usage),
    });
    return taxonomy;
  }

  // Phase 2: user-edited taxonomy is committed; assign every bookmark.
  // Resumable + partial-safe: each batch accumulates as it returns.
  async assign(taxonomy: Taxonomy): Promise<Assignment[]> {
    this.taxonomy = taxonomy;
    const settings = await getSettings();
    const batches = chunk(this.bookmarks, BATCH_SIZE);
    this.assignments = [];
    this.set({
      phase: "pass2",
      batchesTotal: batches.length,
      batchesDone: 0,
      done: 0,
    });

    await pool(
      batches,
      CONCURRENCY,
      async (batch) => {
        try {
          const res = await assignBatch(settings, taxonomy, batch);
          return { assignments: res.assignments, tok: tokens(res.usage) };
        } catch (e) {
          // Failed batch -> its bookmarks fall through to Unsorted at apply.
          return { assignments: [] as Assignment[], tok: 0 };
        }
      },
      (res) => {
        this.assignments.push(...res.assignments);
        this.set({
          batchesDone: this.state.batchesDone + 1,
          done: this.assignments.length,
          spentTokens: this.state.spentTokens + res.tok,
        });
      },
    );

    this.set({ phase: "preview" });
    return this.assignments;
  }

  private fail(error: string): never {
    this.set({ phase: "error", error });
    throw new Error(error);
  }
}
