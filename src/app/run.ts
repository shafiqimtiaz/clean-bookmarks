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

type RunUsage = { input: number; output: number; costUsd: number };

const tokens = (u: RunUsage) => u.input + u.output;

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
  excludedFolderNames: string[] = [];
  private lastExclusionSig: string = "";

  constructor(private onChange: (s: RunState) => void) {}

  private set(patch: Partial<RunState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async start(excludedFolderNames: string[] = []): Promise<Taxonomy> {
    const sig = [...excludedFolderNames].sort().join("|");
    if (this.taxonomy.length > 0 && this.lastExclusionSig === sig) {
      this.set({ phase: "review" });
      return this.taxonomy;
    }
    this.lastExclusionSig = sig;
    this.excludedFolderNames = excludedFolderNames;

    this.set({ phase: "reading" });
    const read = await send<ReadScopeResult>({
      type: "READ_SCOPE",
      excludedFolderNames,
    });
    if (!read.ok) return this.fail(read.error);
    this.bookmarks = read.data.bookmarks;
    this.scopeParentIds = read.data.scopeParentIds;

    if (this.bookmarks.length === 0) {
      return this.fail(
        "No bookmarks in scope. Uncheck a folder to include its contents.",
      );
    }

    this.set({ phase: "pass1", total: this.bookmarks.length });

    const settings = await getSettings();
    const configSeeds = [...new Set(settings.seedCategories)];
    const { taxonomy, usage } = await proposeTaxonomy(
      settings,
      this.bookmarks,
      configSeeds,
      read.data.folderNames,
      excludedFolderNames,
    );
    this.taxonomy = taxonomy;
    this.set({
      phase: "review",
      spentTokens: this.state.spentTokens + tokens(usage),
    });
    return taxonomy;
  }

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
        } catch {
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
