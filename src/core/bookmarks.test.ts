import { test, expect, beforeEach } from 'bun:test';
import { readScope, applyOrganization } from './bookmarks';
import type { FlatBookmark } from './types';

// Minimal stub of the bookmark tree: Other Bookmarks (id '2') holds a loose
// bookmark, a folder "Work" with a nested subfolder, and an old Organized
// folder. Bookmarks Bar (id '1') holds a folder too.
const TREE: Record<string, any> = {
  '2': {
    id: '2',
    title: 'Other Bookmarks',
    children: [
      { id: 'a', title: 'Loose A', url: 'https://a.com' },
      {
        id: '10',
        title: 'Work',
        children: [
          { id: 'b', title: 'B', url: 'https://b.com' },
          { id: '11', title: 'Projects', children: [{ id: 'c', title: 'C', url: 'https://c.com' }] },
        ],
      },
      { id: '99', title: '📁 Organized — 2026-01-01', children: [{ id: 'z', title: 'Z', url: 'https://z.com' }] },
    ],
  },
  '1': {
    id: '1',
    title: 'Bookmarks Bar',
    children: [{ id: '20', title: 'Reading', children: [{ id: 'd', title: 'D', url: 'https://d.com' }] }],
  },
};

beforeEach(() => {
  (globalThis as any).chrome = {
    bookmarks: { getSubTree: async (id: string) => [TREE[id]] },
  };
});

test('considers bookmarks inside Other Bookmarks folders', async () => {
  const { bookmarks, folderNames } = await readScope();
  const urls = bookmarks.map((b) => b.url).sort();
  expect(urls).toContain('https://b.com'); // inside Work
  expect(urls).toContain('https://c.com'); // inside Work/Projects (nested)
  expect(urls).toContain('https://a.com'); // loose in Other Bookmarks
  expect(folderNames).toContain('Work');
});

test('includes Bookmarks Bar folders too', async () => {
  const { bookmarks, folderNames } = await readScope();
  expect(bookmarks.map((b) => b.url)).toContain('https://d.com');
  expect(folderNames).toContain('Reading');
});

test('skips our own Organized folder (incremental re-run)', async () => {
  const { bookmarks, folderNames } = await readScope();
  expect(bookmarks.map((b) => b.url)).not.toContain('https://z.com');
  expect(folderNames.some((n) => n.includes('Organized'))).toBe(false);
});

test('tags each bookmark with its origin root', async () => {
  const { bookmarks } = await readScope();
  const byUrl = Object.fromEntries(bookmarks.map((b) => [b.url, b.root]));
  expect(byUrl['https://b.com']).toBe('2'); // Other Bookmarks
  expect(byUrl['https://d.com']).toBe('1'); // Bookmarks Bar
});

test('renames bare-number titles to URL host, leaves others (incl. empty) as-is', async () => {
  const updates: { id: string; title: string }[] = [];
  let n = 100;
  (globalThis as any).chrome = {
    bookmarks: {
      create: async ({ parentId, title }: any) => ({ id: `n${n++}`, parentId, title }),
      move: async () => {},
      update: async (id: string, { title }: any) => void updates.push({ id, title }),
      getSubTree: async (id: string) => [{ id, children: [] }],
    },
  };

  const bookmarks: FlatBookmark[] = [
    { idx: 0, id: 'num', title: '197', url: 'https://chat.inceptionlabs.ai/c/x', root: '1' },
    { idx: 1, id: 'named', title: 'GitHub', url: 'https://github.com', root: '1' },
    { idx: 2, id: 'empty', title: '', url: 'https://example.com', root: '1' },
  ];
  const assignments = [
    { idx: 0, cat: 'AI' },
    { idx: 1, cat: 'Dev' },
    { idx: 2, cat: 'Misc' },
  ];

  await applyOrganization([], assignments, bookmarks);

  expect(updates).toEqual([{ id: 'num', title: 'chat.inceptionlabs.ai' }]); // only the numeric one
});

test('applyOrganization spreads category folders directly under each origin root', async () => {
  const created: { id: string; parentId: string; title: string }[] = [];
  const moves: { id: string; parentId: string }[] = [];
  const removed: string[] = [];
  let n = 100;
  (globalThis as any).chrome = {
    bookmarks: {
      create: async ({ parentId, title }: any) => {
        const node = { id: `n${n++}`, parentId, title };
        created.push(node);
        return node;
      },
      move: async (id: string, { parentId }: any) => void moves.push({ id, parentId }),
      // Post-move cleanup: each root has an empty "Old" folder and a "Keep"
      // folder that still holds a bookmark.
      getSubTree: async (id: string) => [
        {
          id,
          children: [
            { id: `old-${id}`, title: 'Old', children: [] },
            { id: `keep-${id}`, title: 'Keep', children: [{ id: 'x', url: 'https://x.com' }] },
          ],
        },
      ],
      removeTree: async (id: string) => void removed.push(id),
    },
  };

  const bookmarks: FlatBookmark[] = [
    { idx: 0, id: 'b', title: 'B', url: 'https://b.com', root: '2' },
    { idx: 1, id: 'd', title: 'D', url: 'https://d.com', root: '1' },
  ];
  const assignments = [
    { idx: 0, cat: 'Dev' },
    { idx: 1, cat: 'Reading' },
  ];

  const res = await applyOrganization([], assignments, bookmarks);

  // No wrapper "Organized" folder — category folders sit directly on the roots.
  expect(created.some((c) => c.title.includes('Organized'))).toBe(false);
  expect(created.find((c) => c.title === 'Dev')?.parentId).toBe('2'); // Other Bookmarks
  expect(created.find((c) => c.title === 'Reading')?.parentId).toBe('1'); // Bookmarks Bar
  expect(res.movedCount).toBe(2);

  // Empty originals removed in both roots; non-empty "Keep" folders untouched.
  expect(removed.sort()).toEqual(['old-1', 'old-2']);
  expect(removed.some((id) => id.startsWith('keep-'))).toBe(false);
});
