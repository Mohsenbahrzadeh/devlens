// Registers the "DevLens" panel inside Chrome DevTools (a no-op when opened outside DevTools).
chrome.devtools?.panels?.create('DevLens', 'icons/icon48.png', 'panel.html');
