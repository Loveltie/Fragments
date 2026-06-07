# Fragments

A browser extension for saving vocabulary as you browse. Highlight any word on a page, click the sparkle button, and it's captured — along with the sentence it appeared in and the page it came from. A built-in spaced-repetition system then schedules reviews so the words actually stick.

---

## Features

- **One-click capture** — a floating ✨ button appears whenever you select text on any page; one click saves the word, its context sentence, and the source URL
- **Spaced-repetition review** — flashcard sessions driven by the FSRS algorithm; rate each card Again / Hard / Good / Easy and the next due date adjusts automatically
- **Due-card badge** — the toolbar icon shows a live count of cards waiting for review
- **Hourly notifications** — a desktop notification fires when new cards come due (only when the count grows, so it never repeats needlessly)
- **Create Cards tab** — paste AI-generated output in `word | article | translation | example` format to fill in translations and examples in bulk
- **Practice mode** — review all translated cards outside the normal schedule, without affecting due dates

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
| Alarms | `chrome.alarms` — one periodic alarm every 60 minutes checks due cards |
| Notifications | `chrome.notifications` — fires only when the due count increases |
| External requests | **None.** No data is transmitted anywhere. |

---

## Project structure

```
fragments/           Chrome (Manifest V3)
fragments-firefox/   Firefox / Zen Browser (Manifest V2)
```

Both folders contain the same logic. The only intentional differences are:

- **`manifest.json`** — `manifest_version: 3` vs `2`; `action` vs `browser_action`; service-worker background vs persistent-false scripts array
- **`polyfill.js`** — present only in `fragments-firefox/`; aliases `chrome.action → chrome.browserAction` so the shared background and content code runs unmodified on Firefox MV2

Any functional change must be mirrored across both folders. There is no build step — the source files load directly as the extension.
