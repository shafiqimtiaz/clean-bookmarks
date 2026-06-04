import {
  UNSORTED_FOLDER,
  type Assignment,
  type FlatBookmark,
  type SerializedNode,
  type Snapshot,
  type Taxonomy,
} from "./types";

// Chrome's well-known roots: '1' = Bookmarks Bar, '2' = Other Bookmarks.
const OTHER_BOOKMARKS_ID = "2";
const BOOKMARKS_BAR_ID = "1";

// Scope = Other Bookmarks + Bookmarks Bar. Loose bookmarks and the contents
// of the user's top-level folders are all flattened and re-sorted. The user's
// top-level folder NAMES are returned as `folderNames` so they survive as
// categories (the user doesn't lose those groupings); nested sub-folder
// structure is intentionally discarded.
export async function readScope(excludedFolderNames: string[] = []): Promise<{
  bookmarks: FlatBookmark[];
  scopeParentIds: string[];
  folderNames: string[];
}> {
  const scopeParentIds = [OTHER_BOOKMARKS_ID, BOOKMARKS_BAR_ID];
  const excluded = new Set(excludedFolderNames);

  const flat: FlatBookmark[] = [];
  const folderNames = new Set<string>();
  let idx = 0;

  const collect = (node: chrome.bookmarks.BookmarkTreeNode, root: string) => {
    for (const child of node.children ?? []) {
      if (child.url) {
        flat.push({
          idx: idx++,
          id: child.id,
          title: child.title || child.url,
          url: child.url,
          root,
        });
      } else {
        collect(child, root);
      }
    }
  };

  for (const parentId of scopeParentIds) {
    let effectiveId = parentId;
    let root: chrome.bookmarks.BookmarkTreeNode | undefined;
    try {
      [root] = await chrome.bookmarks.getSubTree(parentId);
    } catch {
      try {
        const kids = await chrome.bookmarks.getChildren("0");
        const replacement = (kids as chrome.bookmarks.BookmarkTreeNode[]).find(
          (k) => k.title.toLowerCase().includes("other bookmark"),
        );
        if (replacement) {
          effectiveId = replacement.id;
          [root] = await chrome.bookmarks.getSubTree(replacement.id);
          const i = scopeParentIds.indexOf(parentId);
          if (i !== -1) scopeParentIds[i] = effectiveId;
          console.warn(
            `[readScope] Replaced stale root ${parentId} → ${effectiveId} ("${replacement.title}")`,
          );
        }
      } catch {
        /* give up */
      }
      if (!root) {
        console.warn(`[readScope] Root ${parentId} not found — skipping`);
        continue;
      }
    }
    for (const child of root?.children ?? []) {
      if (child.url) {
        flat.push({
          idx: idx++,
          id: child.id,
          title: child.title || child.url,
          url: child.url,
          root: effectiveId,
        });
      } else if (excluded.has(child.title)) {
        // skip excluded folder and its entire subtree
      } else {
        folderNames.add(child.title);
        collect(child, effectiveId);
      }
    }
  }

  return { bookmarks: flat, scopeParentIds, folderNames: [...folderNames] };
}

// Lightweight count of the in-scope bookmarks, split by where they live now.
// Loose = direct URL children of a root; foldered = anything inside a named
// folder. Mirrors readScope's traversal so the totals match.
export async function countScope(): Promise<{
  looseBar: number;
  looseOther: number;
  foldered: number;
  total: number;
}> {
  let looseBar = 0;
  let looseOther = 0;
  let foldered = 0;

  const countFoldered = (node: chrome.bookmarks.BookmarkTreeNode) => {
    for (const child of node.children ?? []) {
      if (child.url) foldered++;
      else countFoldered(child);
    }
  };

  for (const parentId of [BOOKMARKS_BAR_ID, OTHER_BOOKMARKS_ID]) {
    let root: chrome.bookmarks.BookmarkTreeNode | undefined;
    try {
      [root] = await chrome.bookmarks.getSubTree(parentId);
    } catch {
      continue;
    }
    for (const child of root?.children ?? []) {
      if (child.url) {
        if (parentId === BOOKMARKS_BAR_ID) looseBar++;
        else looseOther++;
      } else {
        countFoldered(child);
      }
    }
  }

  return {
    looseBar,
    looseOther,
    foldered,
    total: looseBar + looseOther + foldered,
  };
}

// Snapshot the current scope so a single "Undo" can restore it.
export async function snapshotScope(
  scopeParentIds: string[],
): Promise<Snapshot> {
  const nodes: SerializedNode[] = [];
  for (const parentId of scopeParentIds) {
    let root: chrome.bookmarks.BookmarkTreeNode | undefined;
    try {
      [root] = await chrome.bookmarks.getSubTree(parentId);
    } catch {
      console.warn("[snapshotScope] Skipping missing root:", parentId);
      continue;
    }
    if (!root) continue;
    const collect = (
      node: chrome.bookmarks.BookmarkTreeNode,
      path: string[],
    ) => {
      for (const child of node.children ?? []) {
        if (child.url) {
          nodes.push({
            title: child.title,
            url: child.url,
            parentTitlePath: path,
          });
        } else {
          collect(child, [...path, child.title]);
        }
      }
    };
    collect(root, [parentId]);
  }
  return { createdAt: nowMs(), nodes, scopeParentIds };
}

// Organize each origin root in place: category folders are created directly
// under the root (Bookmarks Bar items spread across the bar, Other-Bookmarks
// items across Other Bookmarks) — no wrapper "Organized" folder. Category
// folders are created lazily, so each root only grows the folders it uses.
export async function applyOrganization(
  _taxonomy: Taxonomy,
  assignments: Assignment[],
  bookmarks: FlatBookmark[],
  excludedFolderNames: string[] = [],
): Promise<{ movedCount: number; unsortedCount: number }> {
  const excludedNames = new Set(excludedFolderNames);
  const byIdx = new Map(assignments.map((a) => [a.idx, a]));
  let moved = 0;
  let unsorted = 0;

  for (const rootId of [...new Set(bookmarks.map((b) => b.root))]) {
    // Tally each category's direct items vs. its sub-folders so we can drop
    // sub-folders that add no structure (see keepSub below).
    const catDirect = new Map<string, number>();
    const catSubs = new Map<string, Map<string, number>>();
    for (const bm of bookmarks.filter((b) => b.root === rootId)) {
      const a = byIdx.get(bm.idx);
      if (!a) continue;
      if (a.sub) {
        let subs = catSubs.get(a.cat);
        if (!subs) catSubs.set(a.cat, (subs = new Map()));
        subs.set(a.sub, (subs.get(a.sub) ?? 0) + 1);
      } else {
        catDirect.set(a.cat, (catDirect.get(a.cat) ?? 0) + 1);
      }
    }
    // Keep a sub-folder only if it holds 2+ bookmarks AND the category has
    // more than just that one sub — otherwise the extra level is noise:
    // a singleton, or a lone sub that simply mirrors its parent.
    const keepSub = (cat: string, sub: string): boolean => {
      const subs = catSubs.get(cat);
      if (!subs || (subs.get(sub) ?? 0) <= 1) return false;
      if (subs.size === 1 && (catDirect.get(cat) ?? 0) === 0) return false;
      return true;
    };

    const createdIds = new Set<string>();
    const folderId = new Map<string, string>(); // "cat" or "cat/sub" -> id
    const ensureFolder = async (cat: string, sub?: string): Promise<string> => {
      const key = sub ? `${cat}/${sub}` : cat;
      const existing = folderId.get(key);
      if (existing) return existing;
      const parent = sub ? await ensureFolder(cat) : rootId;
      try {
        const node = await chrome.bookmarks.create({
          parentId: parent,
          title: sub ?? cat,
        });
        folderId.set(key, node.id);
        createdIds.add(node.id);
        return node.id;
      } catch (e) {
        console.error(
          "[applyOrg] create folder failed",
          JSON.stringify({ cat, sub, parent }),
          e,
        );
        return rootId; // fall back to root
      }
    };

    for (const bm of bookmarks.filter((b) => b.root === rootId)) {
      const a = byIdx.get(bm.idx);
      const title = a?.title || displayTitle(bm.title, bm.url);
      try {
        if (title !== bm.title) await chrome.bookmarks.update(bm.id, { title });
      } catch (e) {
        console.error("[applyOrg] update title failed", bm.id, e);
        continue;
      }

      if (a?.sub && !keepSub(a.cat, a.sub)) a.sub = undefined;
      const dest = a
        ? await ensureFolder(a.cat, a.sub)
        : await ensureFolder(UNSORTED_FOLDER);
      try {
        await chrome.bookmarks.move(bm.id, { parentId: dest });
        if (!a) unsorted++;
        else moved++;
      } catch (e) {
        console.error("[applyOrg] move failed", bm.id, "→", dest, e);
      }
    }

    await removeEmptyFolders(rootId, createdIds);
    await sortFolderTree(rootId, excludedNames);
  }

  return { movedCount: moved, unsortedCount: unsorted };
}

// Reorder every folder under `rootId` so children are alphabetical by title,
// folders before bookmarks, recursing into sub-folders. Front-to-back
// placement only ever moves a node to an index <= its current one, sidestepping
// Chrome's off-by-one when moving to a higher index.
// `excludedNames` (root level only) pins untouched out-of-scope folders to the
// top, ahead of the alphabetised in-scope folders we just organised.
async function sortFolderTree(
  folderId: string,
  excludedNames?: Set<string>,
): Promise<void> {
  let node: chrome.bookmarks.BookmarkTreeNode | undefined;
  try {
    [node] = await chrome.bookmarks.getSubTree(folderId);
  } catch (e) {
    console.error("[sortFolderTree] getSubTree failed", folderId, e);
    return;
  }
  if (!node) return;
  const sorted = [...(node.children ?? [])].sort((a, b) =>
    compareNodes(a, b, excludedNames),
  );
  for (let i = 0; i < sorted.length; i++) {
    try {
      await chrome.bookmarks.move(sorted[i]!.id, { parentId: folderId, index: i });
    } catch (e) {
      console.error("[sortFolderTree] move failed", sorted[i]!.id, e);
    }
  }
  // Recurse into in-scope sub-folders with plain alpha — excluded folders only
  // ever live at the root, so the pin tier is irrelevant deeper down.
  for (const child of sorted) {
    if (!child.url) await sortFolderTree(child.id);
  }
}

function compareNodes(
  a: chrome.bookmarks.BookmarkTreeNode,
  b: chrome.bookmarks.BookmarkTreeNode,
  excludedNames?: Set<string>,
): number {
  const aFolder = a.url ? 1 : 0;
  const bFolder = b.url ? 1 : 0;
  if (aFolder !== bFolder) return aFolder - bFolder;
  if (excludedNames) {
    const aExcluded = !a.url && excludedNames.has(a.title) ? 0 : 1;
    const bExcluded = !b.url && excludedNames.has(b.title) ? 0 : 1;
    if (aExcluded !== bExcluded) return aExcluded - bExcluded;
  }
  return (a.title || a.url || "").localeCompare(b.title || b.url || "", undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

async function moveTo(id: string, parentId: string): Promise<void> {
  await chrome.bookmarks.move(id, { parentId });
}

// Remove top-level folders under `rootId` that contain no bookmarks (and only
// empty sub-folders). Never touches folders we created this run.
async function removeEmptyFolders(
  rootId: string,
  keepIds: Set<string>,
): Promise<void> {
  let root;
  try {
    [root] = await chrome.bookmarks.getSubTree(rootId);
  } catch (e) {
    console.error("[removeEmptyFolders] getSubTree failed", rootId, e);
    return;
  }
  if (!root) return;
  for (const child of root?.children ?? []) {
    if (child.url) continue;
    if (keepIds.has(child.id)) continue;
    if (!hasUrl(child)) {
      try {
        await chrome.bookmarks.removeTree(child.id);
      } catch (e) {
        console.error("[removeEmptyFolders] removeTree failed", child.id, e);
      }
    }
  }
}

function hasUrl(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  return (node.children ?? []).some((c) => c.url || hasUrl(c));
}

// Restore from snapshot: wipe the scope's current children and recreate.
export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  // Clear whatever the apply pass left in each scope root.
  for (const parentId of snapshot.scopeParentIds) {
    let root;
    try {
      [root] = await chrome.bookmarks.getSubTree(parentId);
    } catch (e) {
      console.error("[restoreSnapshot] getSubTree failed (wipe)", parentId, e);
      continue;
    }
    if (!root) continue;
    for (const child of root?.children ?? []) {
      try {
        if (child.url) await chrome.bookmarks.remove(child.id);
        else await chrome.bookmarks.removeTree(child.id);
      } catch (e) {
        console.error(
          "[restoreSnapshot] remove/removeTree failed",
          child.id,
          e,
        );
      }
    }
  }

  const pathId = new Map<string, string>();
  const ensurePath = async (path: string[]): Promise<string | null> => {
    let parentId = path[0]!;
    let acc = path[0]!;
    for (let i = 1; i < path.length; i++) {
      acc += "/" + path[i];
      let id = pathId.get(acc);
      if (!id) {
        try {
          const node = await chrome.bookmarks.create({
            parentId,
            title: path[i]!,
          });
          id = node.id;
          pathId.set(acc, id);
        } catch (e) {
          console.error(
            "[restoreSnapshot] ensurePath create failed",
            parentId,
            path[i],
            e,
          );
          return null;
        }
      }
      parentId = id;
    }
    return parentId;
  };
  for (const node of snapshot.nodes) {
    try {
      const parentId = await ensurePath(node.parentTitlePath);
      if (parentId === null) continue;
      await chrome.bookmarks.create({
        parentId,
        title: node.title,
        url: node.url,
      });
    } catch (e) {
      console.error("[restoreSnapshot] create bookmark failed", node.title, e);
    }
  }
}

// Empty or bare-number titles ("", "197") → URL host. Real titles are kept.
function displayTitle(title: string, url: string): string {
  const t = title.trim();
  if (t && !/^\d+$/.test(t)) return title;
  try {
    return new URL(url).host;
  } catch {
    return title;
  }
}

function nowMs(): number {
  return Date.now();
}
