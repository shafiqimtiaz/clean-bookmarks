// Flat bookmark fed to AI. `id` is the Chrome bookmark node id (string).
// `idx` is a short numeric index used in AI payloads so the model never
// echoes titles/URLs back — it only returns { idx, cat }.
export interface FlatBookmark {
  idx: number;
  id: string;
  title: string;
  url: string;
  root: string; // origin scope root id ('1' bar, '2' other) — reorganized in place
}

// A node in the proposed organized tree. Categories may nest one level
// (parent -> child), matching the locked "<=2 levels" decision.
export interface Category {
  name: string;
  children?: string[]; // sub-category names
}

export type Taxonomy = Category[];

// AI assignment: which bookmark idx lands in which category path.
// `sub` is optional (level 2). Missing assignments -> "unsorted".
export interface Assignment {
  idx: number;
  cat: string;
  sub?: string;
  title: string;
}

export interface Settings {
  // Provider id from src/core/ai/models.json, or "custom" for arbitrary
  // OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, etc.).
  provider: string;
  model: string; // model id from the registry, or user-typed when provider=custom
  apiKey: string; // active key for the selected provider
  apiKeys: Record<string, string>; // remembered key per provider id
  // Required only when provider === "custom". The runtime reads this for
  // host permissions and the AI client baseUrl.
  baseUrl: string;
  seedCategories: string[]; // optional user-seeded categories (pass 1 respects)
  taxonomyPrompt: string; // custom prompt for category generation (empty = use default)
  consentAt: number | null; // epoch ms of first-run consent, null = not given
  lastCleanupAt: number | null; // epoch ms of last successful apply, null = never
  excludedFolders: string[];
}

// Snapshot of the bookmark subtree we touched, for one-shot undo.
export interface Snapshot {
  createdAt: number;
  // Serialized Chrome bookmark tree of the organized scope, enough to restore.
  nodes: SerializedNode[];
  // Parent folder ids whose children we moved (to clear before restore).
  scopeParentIds: string[];
}

export interface SerializedNode {
  title: string;
  url?: string;
  parentTitlePath: string[]; // path of folder titles from scope root
}

export type RunPhase =
  | "idle"
  | "reading"
  | "pass1" // proposing taxonomy
  | "review" // user editing taxonomy
  | "pass2" // assigning
  | "preview" // ready to apply
  | "applying"
  | "done"
  | "error";

export interface RunState {
  phase: RunPhase;
  total: number;
  done: number; // bookmarks assigned so far
  batchesDone: number;
  batchesTotal: number;
  spentTokens: number;
  error?: string;
}

export const UNSORTED_FOLDER = "unsorted";
export const STORAGE_KEYS = {
  settings: "cb.settings",
  snapshot: "cb.snapshot",
} as const;
