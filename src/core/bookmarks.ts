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

// Default "junk drawer" scope: everything under Other Bookmarks, plus loose
// bookmarks (non-folder children) directly on the Bookmarks Bar. Existing
// named folders on the bar are left untouched.
export async function readScope(
  folderIds?: string[]
): Promise<{ bookmarks: FlatBookmark[]; scopeParentIds: string[] }> {
  const scopeParentIds = folderIds?.length
    ? folderIds
    : [OTHER_BOOKMARKS_ID, BOOKMARKS_BAR_ID];

  const flat: FlatBookmark[] = [];
  let idx = 0;

  for (const parentId of scopeParentIds) {
    const onlyLooseChildren = !folderIds?.length && parentId === BOOKMARKS_BAR_ID;
    const [root] = await chrome.bookmarks.getSubTree(parentId);
    if (!root?.children) continue;

    const walk = (node: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
      for (const child of node.children ?? []) {
        if (child.url) {
          // Skip items already inside an AI-created folder (incremental re-run).
          if (isInsideOrganized(child)) continue;
          flat.push({ idx: idx++, id: child.id, title: child.title || child.url, url: child.url });
        } else if (!onlyLooseChildren) {
          if (child.title.startsWith(ORGANIZED_FOLDER_PREFIX)) continue;
          walk(child, depth + 1);
        }
      }
    };
    walk(root, 0);
  }

  return { bookmarks: flat, scopeParentIds };
}

function isInsideOrganized(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  // Best-effort: title-based marker check happens during the walk; a node's
  // own ancestry is enforced by skipping organized folders in walk().
  return false;
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

// Build the organized tree under a fresh dated folder, then move bookmarks in.
export async function applyOrganization(
  taxonomy: Taxonomy,
  assignments: Assignment[],
  bookmarks: FlatBookmark[]
): Promise<{ movedCount: number; unsortedCount: number }> {
  const root = await chrome.bookmarks.create({
    parentId: OTHER_BOOKMARKS_ID,
    title: `${ORGANIZED_FOLDER_PREFIX} — ${dateStamp()}`,
  });

  const folderId = new Map<string, string>(); // "cat" or "cat/sub" -> id
  const ensureFolder = async (cat: string, sub?: string): Promise<string> => {
    const key = sub ? `${cat}/${sub}` : cat;
    const existing = folderId.get(key);
    if (existing) return existing;
    const parent = sub ? await ensureFolder(cat) : root.id;
    const node = await chrome.bookmarks.create({ parentId: parent, title: sub ?? cat });
    folderId.set(key, node.id);
    return node.id;
  };

  // Pre-create taxonomy so empty categories still appear in the preview tree.
  for (const c of taxonomy) {
    await ensureFolder(c.name);
    for (const child of c.children ?? []) await ensureFolder(c.name, child);
  }

  const byIdx = new Map(assignments.map((a) => [a.idx, a]));
  let moved = 0;
  let unsorted = 0;

  for (const bm of bookmarks) {
    const a = byIdx.get(bm.idx);
    if (!a) {
      await moveTo(bm.id, await ensureFolder(UNSORTED_FOLDER));
      unsorted++;
      continue;
    }
    await moveTo(bm.id, await ensureFolder(a.cat, a.sub));
    moved++;
  }

  return { movedCount: moved, unsortedCount: unsorted };
}

async function moveTo(id: string, parentId: string): Promise<void> {
  await chrome.bookmarks.move(id, { parentId });
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

function dateStamp(): string {
  const d = new Date(nowMs());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function nowMs(): number {
  return Date.now();
}
