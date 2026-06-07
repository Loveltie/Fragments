// db/db.js and polyfill.js are loaded before this script via manifest.json
// "background.scripts": ["polyfill.js", "db/db.js", "background.js"]
// importScripts() is not available in MV2 background pages (only in service workers).

// ── Badge ──────────────────────────────────────────────────────────────────

async function updateBadge() {
  const cards = await getDueCards();
  const count = cards.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  if (count > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#FFD700' });
    // setBadgeTextColor available Chrome 110+ — skip silently on older builds
    if (typeof chrome.action.setBadgeTextColor === 'function') {
      chrome.action.setBadgeTextColor({ color: '#111111' });
    }
  }
}

// ── Notification ───────────────────────────────────────────────────────────
// Notifies only when the due count grows since the last check.

async function checkAndNotify() {
  const cards = await getDueCards();
  const count = cards.length;

  // Update badge
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  if (count > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#FFD700' });
    if (typeof chrome.action.setBadgeTextColor === 'function') {
      chrome.action.setBadgeTextColor({ color: '#111111' });
    }
  }

  // Notify only when the queue grows (new cards became due)
  const { lastKnownDue = 0 } = await chrome.storage.local.get('lastKnownDue');
  if (count > lastKnownDue) {
    chrome.notifications.create('fragments-due', {
      type:    'basic',
      iconUrl: chrome.runtime.getURL('assets/icon128.png'),
      title:   'Fragments',
      message: `${count} word${count === 1 ? '' : 's'} ready to review.`,
    });
  }
  await chrome.storage.local.set({ lastKnownDue: count });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('fragments-due-check', { periodInMinutes: 60 });
  checkAndNotify();
});

chrome.runtime.onStartup.addListener(() => {
  checkAndNotify();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'fragments-due-check') checkAndNotify();
});

// ── Message handling ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.action === 'save') {
    saveWord(msg.payload)
      .then(id => {
        console.log('[Fragments] saved:', JSON.stringify(msg.payload.word), '→ id', id);
        updateBadge();
        sendResponse({ ok: true, id });
      })
      .catch(err => {
        console.error('[Fragments] save error:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (msg.action === 'getAll') {
    getAllWords()
      .then(words => sendResponse({ words }))
      .catch(err  => sendResponse({ words: [], error: err.message }));
    return true;
  }

  if (msg.action === 'getDue') {
    getDueCards()
      .then(cards => sendResponse({ cards }))
      .catch(err  => sendResponse({ cards: [], error: err.message }));
    return true;
  }

  if (msg.action === 'updateCard') {
    updateCardFSRS(msg.id, msg.fsrs)
      .then(() => {
        console.log('[Fragments] FSRS updated card', msg.id, '→ due', msg.fsrs.due);
        updateBadge();
        sendResponse({ ok: true });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === 'import') {
    upsertWords(msg.entries)
      .then(({ added, updated }) => {
        console.log(`[Fragments] import: +${added} added, ~${updated} updated`);
        updateBadge();
        sendResponse({ ok: true, added, updated });
      })
      .catch(err => {
        console.error('[Fragments] import error:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

});
