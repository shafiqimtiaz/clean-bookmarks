import {
  applyOrganization,
  readScope,
  restoreSnapshot,
  snapshotScope,
} from '../core/bookmarks';
import { clearSnapshot, getSnapshot, saveSnapshot } from '../core/storage';
import type { ApplyResult, Message, ReadScopeResult, Response } from '../core/messaging';

// The only context that touches chrome.bookmarks. Each handler is fast and
// well under the service-worker idle limit; the long AI loop runs in the tab.
chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data } as Response<unknown>))
    .catch((e: unknown) => sendResponse({ ok: false, error: String(e) } as Response<unknown>));
  return true; // keep the message channel open for the async response
});

async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'READ_SCOPE':
      return readScope(msg.folderIds) satisfies Promise<ReadScopeResult>;

    case 'APPLY': {
      // We need the original flat list to know what to move; re-read scope so
      // the SW stays the single source of truth for bookmark ids.
      const { bookmarks, scopeParentIds } = await readScope();
      const snapshot = await snapshotScope(scopeParentIds);
      await saveSnapshot(snapshot);
      const { movedCount, unsortedCount } = await applyOrganization(
        msg.taxonomy,
        msg.assignments,
        bookmarks
      );
      return { movedCount, unsortedCount, snapshot } satisfies ApplyResult;
    }

    case 'UNDO': {
      const snapshot = await getSnapshot();
      if (!snapshot) throw new Error('No snapshot to undo');
      await restoreSnapshot(snapshot);
      await clearSnapshot();
      return { restored: snapshot.nodes.length };
    }

    case 'HAS_SNAPSHOT':
      return { has: (await getSnapshot()) !== null };
  }
}

// Open the full-page app when the user clicks the toolbar icon's "Organize".
// (Popup handles the click; this is a fallback if no popup is set.)
chrome.action.onClicked?.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
