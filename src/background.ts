// Service worker.
// - The toolbar icon opens the DevLens side panel (docked next to the page) instead of a popup.
// - A right-click entry sends selected text to the side panel. The selection is kept in in-memory
//   session storage only; the side panel deletes it as soon as it has read it.
const MENU_ID = 'devlens-inspect';
const MAX_SELECTION = 200_000;

async function openSidePanel(tabId?: number, windowId?: number): Promise<boolean> {
  try {
    if (tabId !== undefined) await chrome.sidePanel.open({ tabId });
    else if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
    else return false;
    return true;
  } catch {
    return false;
  }
}

// Persisted by Chrome, but setting it on every start is cheap and self-healing.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Inspect "%s" with DevLens',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  await chrome.storage.session.set({ pending: info.selectionText.slice(0, MAX_SELECTION) });
  const opened = await openSidePanel(tab?.id, tab?.windowId);
  if (!opened) {
    // Could not open it (e.g. no focused window): leave a badge so the user knows it is waiting.
    await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    await chrome.action.setBadgeText({ text: '1' });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'open-side-panel') await openSidePanel(tab?.id, tab?.windowId);
});
