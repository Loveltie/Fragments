/**
 * Fragments – cross-browser WebExtension polyfill
 *
 * Firefox exposes extension APIs under both `browser.*` (Promise-based) and
 * `chrome.*` (callback-based, for Chrome compatibility). The one MV2 divergence
 * that actually breaks at runtime is:
 *
 *   chrome.action   → does NOT exist in Firefox MV2
 *   chrome.browserAction → the MV2 equivalent (supported since Firefox 45)
 *
 * Chrome MV3 uses `chrome.action`. Firefox 109+ added `browser.action` for
 * MV3, but an MV2 extension on any Firefox version still needs `browserAction`.
 *
 * This shim creates the alias once, at startup, so all subsequent
 * `chrome.action.*` calls in background.js just work.
 *
 * Everything else used by this extension (`chrome.runtime`, `chrome.storage`,
 * `chrome.alarms`, `chrome.notifications`, `chrome.tabs`) is supported
 * natively under `chrome.*` in Firefox 45+ with no changes required.
 */
(function () {
  if (typeof chrome === 'undefined') return;

  // Alias chrome.action → chrome.browserAction for Firefox MV2.
  // In Chrome (MV3) and Firefox 109+ MV3, chrome.action already exists.
  if (!chrome.action && typeof chrome.browserAction !== 'undefined') {
    chrome.action = chrome.browserAction;
  }
})();
