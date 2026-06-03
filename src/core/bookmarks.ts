import {
  ORGANIZED_FOLDER_PREFIX,
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
// structure is intentionally discarded. Our own "Organized" folders are
// skipped so re-runs stay incremental.
export async function readScope(
  folderIds?: string[],
): Promise<{
  bookmarks: FlatBookmark[];
  scopeParentIds: string[];
  folderNames: string[];
}> {
  const scopeParentIds = folderIds?.length
    ? folderIds
    : [OTHER_BOOKMARKS_ID, BOOKMARKS_BAR_ID];

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
      } else if (!child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) {
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
      // Chrome root was deleted — find the replacement by name.
      try {
        const kids = await chrome.bookmarks.getChildren("0");
        const replacement = (kids as chrome.bookmarks.BookmarkTreeNode[]).find(
          (k) => k.title.toLowerCase().includes("other bookmark"),
        );
        if (replacement) {
          effectiveId = replacement.id;
          [root] = await chrome.bookmarks.getSubTree(replacement.id);
          // Swap the id in scopeParentIds so the rest of the code uses the real id.
          const idx = scopeParentIds.indexOf(parentId);
          if (idx !== -1) scopeParentIds[idx] = effectiveId;
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
      } else if (!child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) {
        folderNames.add(child.title);
        collect(child, effectiveId);
      }
    }
  }

  return { bookmarks: flat, scopeParentIds, folderNames: [...folderNames] };
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
): Promise<{ movedCount: number; unsortedCount: number }> {
  const byIdx = new Map(assignments.map((a) => [a.idx, a]));
  let moved = 0;
  let unsorted = 0;

  for (const rootId of [...new Set(bookmarks.map((b) => b.root))]) {
    // Pre-count how many bookmarks share each cat/sub combo.
    const subCount = new Map<string, number>();
    for (const bm of bookmarks) {
      const a = byIdx.get(bm.idx);
      if (a?.sub) {
        const key = `${a.cat}/${a.sub}`;
        subCount.set(key, (subCount.get(key) ?? 0) + 1);
      }
    }

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
      const title = displayTitle(bm.title, bm.url);
      try {
        if (title !== bm.title) await chrome.bookmarks.update(bm.id, { title });
      } catch (e) {
        console.error("[applyOrg] update title failed", bm.id, e);
        continue;
      }

      const a = byIdx.get(bm.idx);
      // Collapse sub-folder when only 1 bookmark maps to it.
      if (a?.sub && (subCount.get(`${a.cat}/${a.sub}`) ?? 0) <= 1) {
        a.sub = undefined;
      }
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
  }

  return { movedCount: moved, unsortedCount: unsorted };
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
    if (
      keepIds.has(child.id) ||
      child.title.startsWith(ORGANIZED_FOLDER_PREFIX)
    )
      continue;
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
