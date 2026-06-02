import {
  ORGANIZED_FOLDER_PREFIX,
  UNSORTED_FOLDER,
  type Assignment,
  type FlatBookmark,
  type SerializedNode,
  type Snapshot,
  type Taxonomy,
} from './types';

// Chrome's well-known roots: '1' = Bookmarks Bar, '2' = Other Bookmarks.
const OTHER_BOOKMARKS_ID = '2';
const BOOKMARKS_BAR_ID = '1';

// Scope = Other Bookmarks + Bookmarks Bar. Loose bookmarks and the contents
// of the user's top-level folders are all flattened and re-sorted. The user's
// top-level folder NAMES are returned as `folderNames` so they survive as
// categories (the user doesn't lose those groupings); nested sub-folder
// structure is intentionally discarded. Our own "Organized" folders are
// skipped so re-runs stay incremental.
export async function readScope(
  folderIds?: string[]
): Promise<{ bookmarks: FlatBookmark[]; scopeParentIds: string[]; folderNames: string[] }> {
  const scopeParentIds = folderIds?.length
    ? folderIds
    : [OTHER_BOOKMARKS_ID, BOOKMARKS_BAR_ID];

  const flat: FlatBookmark[] = [];
  const folderNames = new Set<string>();
  let idx = 0;

  const collect = (node: chrome.bookmarks.BookmarkTreeNode, root: string) => {
    for (const child of node.children ?? []) {
      if (child.url) {
        flat.push({ idx: idx++, id: child.id, title: child.title || child.url, url: child.url, root });
      } else if (!child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) {
        collect(child, root);
      }
    }
  };

  for (const parentId of scopeParentIds) {
    const [root] = await chrome.bookmarks.getSubTree(parentId);
    for (const child of root?.children ?? []) {
      if (child.url) {
        flat.push({ idx: idx++, id: child.id, title: child.title || child.url, url: child.url, root: parentId });
      } else if (!child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) {
        folderNames.add(child.title); // top-level folder name -> seed category
        collect(child, parentId); // flatten its contents; nested structure discarded
      }
    }
  }

  return { bookmarks: flat, scopeParentIds, folderNames: [...folderNames] };
}

// Snapshot the current scope so a single "Undo" can restore it.
export async function snapshotScope(scopeParentIds: string[]): Promise<Snapshot> {
  const nodes: SerializedNode[] = [];
  for (const parentId of scopeParentIds) {
    const [root] = await chrome.bookmarks.getSubTree(parentId);
    if (!root) continue;
    const collect = (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => {
      for (const child of node.children ?? []) {
        if (child.url) {
          nodes.push({ title: child.title, url: child.url, parentTitlePath: path });
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
  bookmarks: FlatBookmark[]
): Promise<{ movedCount: number; unsortedCount: number }> {
  const byIdx = new Map(assignments.map((a) => [a.idx, a]));
  let moved = 0;
  let unsorted = 0;

  for (const rootId of [...new Set(bookmarks.map((b) => b.root))]) {
    const createdIds = new Set<string>(); // folders we made this run
    const folderId = new Map<string, string>(); // "cat" or "cat/sub" -> id
    const ensureFolder = async (cat: string, sub?: string): Promise<string> => {
      const key = sub ? `${cat}/${sub}` : cat;
      const existing = folderId.get(key);
      if (existing) return existing;
      const parent = sub ? await ensureFolder(cat) : rootId;
      const node = await chrome.bookmarks.create({ parentId: parent, title: sub ?? cat });
      folderId.set(key, node.id);
      createdIds.add(node.id);
      return node.id;
    };

    for (const bm of bookmarks.filter((b) => b.root === rootId)) {
      // Bookmarks titled with a bare number (e.g. "197") are unreadable once
      // sorted — rename them to their URL host (e.g. "chat.inceptionlabs.ai").
      const title = displayTitle(bm.title, bm.url);
      if (title !== bm.title) await chrome.bookmarks.update(bm.id, { title });

      const a = byIdx.get(bm.idx);
      if (!a) {
        await moveTo(bm.id, await ensureFolder(UNSORTED_FOLDER));
        unsorted++;
        continue;
      }
      await moveTo(bm.id, await ensureFolder(a.cat, a.sub));
      moved++;
    }

    // Drop the now-empty original folders (their bookmarks moved out), leaving
    // a clean root with just the freshly spread category folders.
    await removeEmptyFolders(rootId, createdIds);
  }

  return { movedCount: moved, unsortedCount: unsorted };
}

async function moveTo(id: string, parentId: string): Promise<void> {
  await chrome.bookmarks.move(id, { parentId });
}

// Remove top-level folders under `rootId` that contain no bookmarks (and only
// empty sub-folders). Never touches folders we created this run.
async function removeEmptyFolders(rootId: string, keepIds: Set<string>): Promise<void> {
  const [root] = await chrome.bookmarks.getSubTree(rootId);
  for (const child of root?.children ?? []) {
    if (child.url) continue; // a loose bookmark, not a folder
    if (keepIds.has(child.id) || child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) continue;
    if (!hasUrl(child)) await chrome.bookmarks.removeTree(child.id);
  }
}

function hasUrl(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  return (node.children ?? []).some((c) => c.url || hasUrl(c));
}

// Restore from snapshot: wipe the scope's current children and recreate.
export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  // Recreate every saved leaf under its original folder path.
  const pathId = new Map<string, string>();
  const ensurePath = async (path: string[]): Promise<string> => {
    let parentId = path[0]!;
    let acc = path[0]!;
    for (let i = 1; i < path.length; i++) {
      acc += '/' + path[i];
      let id = pathId.get(acc);
      if (!id) {
        const node = await chrome.bookmarks.create({ parentId, title: path[i]! });
        id = node.id;
        pathId.set(acc, id);
      }
      parentId = id;
    }
    return parentId;
  };
  for (const node of snapshot.nodes) {
    const parentId = await ensurePath(node.parentTitlePath);
    await chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
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
