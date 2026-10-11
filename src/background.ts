// Service worker: adds a "Inspect with DevLens" entry to the right-click menu for selected text.
// The selection is kept in in-memory session storage only; the popup deletes it as soon as it reads it.
const MENU_ID = 'devlens-inspect';
const MAX_SELECTION = 200_000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Inspect "%s" with DevLens',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  await chrome.storage.session.set({ pending: info.selectionText.slice(0, MAX_SELECTION) });
  try {
    await chrome.action.openPopup();
  } catch {
    // The popup could not be opened (e.g. no focused window): leave a badge so the user can open it.
    await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    await chrome.action.setBadgeText({ text: '1' });
  }
});
