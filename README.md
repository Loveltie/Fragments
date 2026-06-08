# Fragments

A browser extension for saving vocabulary as you browse. Highlight any word on a page, click the save button, and it's captured — along with the context sentence and the page it came from. A built-in spaced-repetition system then schedules reviews so the words actually stick.

---

## Features

- **One-click capture** — a floating button appears whenever you select text on any page; one click saves the word, its context sentence, and the source URL; a two-note chime confirms the save
- **Multi-language support** — cards are tagged by language pair (e.g. `de-en`, `es-de`); every card belongs to exactly one pair and is never deleted or modified when you switch languages
- **Language bar** — pick **Capturing from** (source) and **Into** (target) languages from dropdown menus; a ⇄ swap button flips them instantly; the Words list, Review queue, and Practice session always show only the active pair
- **Spaced-repetition review** — flashcard sessions driven by the FSRS algorithm; rate each card Again / Hard / Good / Easy and the next due date adjusts automatically
- **Practice mode** — review all translated cards outside the normal schedule without affecting due dates
- **Due-card badge** — the toolbar icon shows a live count of cards due for review in the active language pair
- **Hourly notifications** — a desktop notification fires when new cards come due (only when the count grows, so it never repeats needlessly)
- **Delete with confirmation** — cards can be deleted from the Words list (× button → inline ✓ / ✗ confirmation) or from the Review screen (⋯ menu → confirm bar); nothing is removed until explicitly confirmed
- **Pronunciation** — each flashcard has a speaker button that opens the word on Forvo in its source language
- **Create Cards tab** — paste output in `word | article | translation | example` format to fill in translations and examples in bulk; upserts existing cards by word so re-importing is safe
- **Language-aware AI prompt** — the **Copy for AI** and **Copy untranslated for AI** buttons build a prompt tailored to the active language pair: the correct target-language name for translations, the right article/gender grammar rules for the source language (German der/die/das, Spanish/Italian/French grammatical gender, etc.), and the word list filtered to that pair only; the untranslated-copy shortcut is available on both the Words tab and the Create Cards tab

---

## Visual theme

Yellow-and-black sparkle aesthetic throughout: `#FFD700` gold on `#111111` near-black, carried through the toolbar icon, badge colour, and UI accents.

---

## Installation

### Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select the `fragments/` folder
4. The Fragments icon appears in the toolbar — pin it to keep the badge visible

### Firefox / Zen Browser

**Temporary (development, resets on restart):**

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Navigate into `fragments-firefox/` and select `manifest.json`

**Permanent (.xpi package):**

1. From the repo root, run:
   ```
   cd fragments-firefox && zip -r ../fragments-firefox.zip . -x "*.zip"
   ```
2. Rename the resulting `.zip` to `.xpi`
3. In Firefox: `about:addons` → gear icon → **Install Add-on From File…**  
   *(Or submit to addons.mozilla.org for a signed, auto-updating build)*

---

## Tech notes

| Area | Detail |
|---|---|
| API | WebExtensions — MV3 for Chrome, MV2 for Firefox |
| Storage | IndexedDB via a small wrapper in `db/db.js`; all data stays on-device |
| Spaced repetition | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) bundled locally |
| Language pairs | Stored as `"source-target"` strings (e.g. `"de-en"`) on each card; cards without a `lang` field are treated as `de-en` for backwards compatibility |
| Alarms | `chrome.alarms` — one periodic alarm every 60 minutes checks due cards |
| Notifications | `chrome.notifications` — fires only when the due count increases |
| External requests | **None.** No data is transmitted anywhere. Forvo links open in a new tab only when explicitly clicked. |

---

## Project structure

```
fragments/           Chrome (Manifest V3)
fragments-firefox/   Firefox / Zen Browser (Manifest V2)
```

Both folders contain the same logic. The intentional differences are:

- **`manifest.json`** — `manifest_version: 3` vs `2`; `action` vs `browser_action`; service-worker background vs persistent-false scripts array
- **`polyfill.js`** — present only in `fragments-firefox/`; aliases `chrome.action → chrome.browserAction` so background badge calls work on Firefox MV2
- **`browser.*` storage and messaging** — Firefox's `chrome.storage.local.*` does not return Promises in MV2; `fragments-firefox/` uses `browser.storage.local.*` throughout `background.js` and `popup/popup.js`; `fragments-firefox/content/content.js` uses `browser.runtime.sendMessage()` (Promise-based) rather than the `chrome.*` callback shim, which has a known port-lifecycle incompatibility with MV2 event pages

Any functional change must be mirrored across both folders. There is no build step — the source files load directly as the extension.
