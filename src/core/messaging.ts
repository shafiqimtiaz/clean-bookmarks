import type { FlatBookmark, Snapshot, Taxonomy, Assignment } from "./types";

// Typed message protocol between the full-page tab / popup and the
// service worker. The SW is the only context that touches chrome.bookmarks.
export type Message =
  | { type: "READ_SCOPE"; folderIds?: string[] } // default scope = junk drawer
  | { type: "COUNT_SCOPE" } // lightweight composition counts for the home card
  | { type: "APPLY"; taxonomy: Taxonomy; assignments: Assignment[] }
  | { type: "UNDO" }
  | { type: "HAS_SNAPSHOT" };

export interface ReadScopeResult {
  bookmarks: FlatBookmark[];
  scopeParentIds: string[];
  folderNames: string[]; // user's top-level folder names -> seed categories
}

// Composition of the in-scope bookmarks, for the home "Current Situation"
// card. Everything counted here is re-organized on a run.
export interface CountScopeResult {
  looseBar: number; // loose items directly on the Bookmarks Bar
  looseOther: number; // loose items directly under Other Bookmarks
  foldered: number; // items inside named folders
  total: number; // looseBar + looseOther + foldered
}

export interface ApplyResult {
  movedCount: number;
  unsortedCount: number;
  snapshot: Snapshot;
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export function send<T>(msg: Message): Promise<Response<T>> {
  return chrome.runtime.sendMessage(msg);
}
