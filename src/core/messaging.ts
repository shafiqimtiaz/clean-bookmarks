import type { FlatBookmark, Snapshot, Taxonomy, Assignment } from './types';

// Typed message protocol between the full-page tab / popup and the
// service worker. The SW is the only context that touches chrome.bookmarks.
export type Message =
  | { type: 'READ_SCOPE'; folderIds?: string[] } // default scope = junk drawer
  | { type: 'APPLY'; taxonomy: Taxonomy; assignments: Assignment[] }
  | { type: 'UNDO' }
  | { type: 'HAS_SNAPSHOT' };

export interface ReadScopeResult {
  bookmarks: FlatBookmark[];
  scopeParentIds: string[];
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
