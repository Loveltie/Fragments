import { fsrs, createEmptyCard, Rating } from '../assets/ts-fsrs.js';

const f = fsrs();

// ── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function sendMsg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

// ── Prompt template ────────────────────────────────────────────────────────

const PROMPT_TEMPLATE =
`For each word below, return exactly one line per word in this format:
word | article, plural | translation | example sentence

Rules:
- Use the word exactly as I wrote it — don't correct or normalize it
- Nouns: fill article as "der/die/das, plural" (e.g. "das, -e" or "die, Häuser")
- Verbs, adjectives, adverbs, other: leave the article field blank (keep the pipes)
- Translation: concise English meaning, no extra explanation
- Example: one natural sentence in the source language that uses the word in context

Output only the formatted lines — no headers, numbering, blank lines, or commentary.

Words:`;

function buildPrompt(wordList) {
  return PROMPT_TEMPLATE + '\n' + wordList.map(e => e.word).join('\n');
}

async function copyPrompt(wordList) {
  const msgEl = document.getElementById('copy-msg');
  if (wordList.length === 0) {
    msgEl.className = 'msg-warn'; msgEl.textContent = 'No words to copy.'; return;
  }
  try {
    await navigator.clipboard.writeText(buildPrompt(wordList));
    msgEl.className = 'msg-ok'; msgEl.textContent = 'Copied!';
    setTimeout(() => { msgEl.textContent = ''; }, 2000);
  } catch {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Failed.';
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────

const VIEWS = ['words', 'review', 'create-cards'];

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).hidden = v !== tab;
  });
  // export bar is only meaningful on the words tab
  const exportBar = document.getElementById('export-bar');
  if (exportBar) exportBar.hidden = tab !== 'words';

  if (tab === 'words')  loadWords();
  if (tab === 'review') loadReview();
}

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
);

// ── Words tab ──────────────────────────────────────────────────────────────

async function loadWords() {
  const countEl   = document.getElementById('count');
  const listEl    = document.getElementById('view-words');
  const exportBar = document.getElementById('export-bar');

  const { words = [] } = await sendMsg({ action: 'getAll' });

  countEl.textContent = `${words.length} ${words.length === 1 ? 'word' : 'words'}`;

  if (words.length === 0) {
    exportBar.hidden = true;
    listEl.innerHTML =
      '<p class="empty">No fragments yet.<br>Highlight any word on a page to save it.</p>';
    return;
  }

  exportBar.hidden = false;
  const untranslated = words.filter(w => !w.translation);

  const copyAllBtn = document.getElementById('copy-all');
  const copyUnBtn  = document.getElementById('copy-untranslated');
  copyAllBtn.onclick = () => copyPrompt(words);
  copyUnBtn.onclick  = () => copyPrompt(untranslated);
  copyUnBtn.textContent = untranslated.length
    ? `Copy untranslated for AI (${untranslated.length})`
    : 'Copy untranslated for AI';
  copyUnBtn.disabled = untranslated.length === 0;

  listEl.innerHTML = '';
  [...words].reverse().forEach(entry => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="word-row">
        <span class="word">${esc(entry.word)}</span>
        ${entry.article ? `<span class="article">${esc(entry.article)}</span>` : ''}
      </div>
      ${entry.translation ? `<p class="translation">${esc(entry.translation)}</p>` : ''}
      ${entry.example     ? `<p class="example">${esc(entry.example)}</p>`         : ''}
      ${entry.sentence && entry.sentence !== entry.example
                          ? `<p class="sentence">${esc(entry.sentence)}</p>`       : ''}
      <footer>
        <span class="source" title="${esc(entry.sourceUrl)}">${esc(entry.sourceTitle || entry.sourceUrl)}</span>
        <time>${fmtDate(entry.createdAt)}</time>
      </footer>
    `;
    listEl.appendChild(card);
  });
}

// ── Review tab ─────────────────────────────────────────────────────────────

let reviewQueue  = [];    // card records for current session
let reviewIdx    = 0;     // current position in queue
let practiceMode = false; // true = all translated cards, no FSRS writes

async function loadReview() {
  if (practiceMode) {
    const { words = [] } = await sendMsg({ action: 'getAll' });
    reviewQueue = words.filter(w => w.translation);
  } else {
    const { cards = [] } = await sendMsg({ action: 'getDue' });
    reviewQueue = cards;
  }
  reviewIdx = 0;
  renderCard();
}

function practiceBtn(label, active = false) {
  return `<button class="practice-toggle${active ? ' is-active' : ''}" id="practice-toggle">${label}</button>`;
}

function togglePractice() {
  practiceMode = !practiceMode;
  loadReview();
}

function renderCard() {
  const el = document.getElementById('view-review');

  // ── No cards in queue ──────────────────────────────────────────────────────
  if (reviewQueue.length === 0) {
    el.innerHTML = `
      <p class="empty">All caught up —<br>nothing to review right now.</p>
      <div class="review-practice-prompt">
        ${practiceBtn('Practice all')}
      </div>`;
    el.querySelector('#practice-toggle').addEventListener('click', togglePractice);
    return;
  }

  // ── Session complete ───────────────────────────────────────────────────────
  if (reviewIdx >= reviewQueue.length) {
    const n    = reviewQueue.length;
    const verb = practiceMode ? 'practiced' : 'reviewed';
    el.innerHTML = `
      <div class="review-done">
        <span class="done-check">✓</span>
        <p>${n} card${n === 1 ? '' : 's'} ${verb}</p>
        ${practiceMode
          ? practiceBtn('Exit practice', true)
          : practiceBtn('Practice all')}
      </div>`;
    el.querySelector('#practice-toggle').addEventListener('click', togglePractice);
    return;
  }

  // ── Active card ────────────────────────────────────────────────────────────
  const entry     = reviewQueue[reviewIdx];
  const remaining = reviewQueue.length - reviewIdx;

  el.innerHTML = `
    <div class="review-meta">
      <div class="review-meta-left">
        <span class="review-count">${practiceMode ? 'Practice' : `${remaining} due`}</span>
        ${practiceMode
          ? practiceBtn('Exit', true)
          : practiceBtn('Practice all')}
      </div>
      <span class="review-progress">${reviewIdx + 1} / ${reviewQueue.length}</span>
    </div>

    <div class="flashcard" id="flashcard">
      <div class="fc-front">
        <div class="fc-word-row">
          <p class="fc-word">${esc(entry.word)}</p>
          <button class="fc-forvo" title="Hear on Forvo" aria-label="Pronunciation on Forvo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="fc-back" hidden>
        ${entry.article ? `<p class="fc-article">${esc(entry.article)}</p>` : ''}
        <p class="fc-translation">${esc(entry.translation)}</p>
        ${entry.example ? `<p class="fc-example">${esc(entry.example)}</p>` : ''}
        ${entry.sentence && entry.sentence !== entry.example
                          ? `<p class="fc-sentence">${esc(entry.sentence)}</p>` : ''}
      </div>
    </div>

    <div class="review-actions">
      <button class="flip-btn" id="flip-btn">Show answer</button>
      <div class="rating-bar" id="rating-bar" hidden>
        <button class="rate-btn rate-again" data-r="1">Again</button>
        <button class="rate-btn rate-hard"  data-r="2">Hard</button>
        <button class="rate-btn rate-good"  data-r="3">Good</button>
        <button class="rate-btn rate-easy"  data-r="4">Easy</button>
      </div>
    </div>
  `;

  el.querySelector('#practice-toggle').addEventListener('click', togglePractice);
  document.getElementById('flashcard').addEventListener('click', flip);
  document.getElementById('flip-btn').addEventListener('click', e => { e.stopPropagation(); flip(); });
  document.querySelectorAll('.rate-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); rate(Number(btn.dataset.r)); })
  );
  el.querySelector('.fc-forvo')?.addEventListener('click', e => {
    e.stopPropagation();
    chrome.tabs.create({ url: `https://forvo.com/word/${encodeURIComponent(entry.word)}/#de` });
  });
}

function flip() {
  const back    = document.querySelector('.fc-back');
  const flipBtn = document.getElementById('flip-btn');
  const ratingBar = document.getElementById('rating-bar');
  if (!back || back.hidden === false) return; // already flipped
  back.hidden     = false;
  flipBtn.hidden  = true;
  ratingBar.hidden = false;
}

async function rate(ratingValue) {
  // Practice mode: advance without touching any scheduling state
  if (practiceMode) {
    reviewIdx++;
    renderCard();
    return;
  }

  const entry = reviewQueue[reviewIdx];

  // Restore FSRS card from stored state (dates are ISO strings in DB)
  let fsrsCard;
  if (entry.fsrs) {
    fsrsCard = {
      ...entry.fsrs,
      due:         new Date(entry.fsrs.due),
      last_review: entry.fsrs.last_review ? new Date(entry.fsrs.last_review) : undefined,
    };
  } else {
    fsrsCard = createEmptyCard();
  }

  const now            = new Date();
  const schedulingCards = f.repeat(fsrsCard, now);
  const next           = schedulingCards[ratingValue].card;

  // Serialise dates back to strings for IndexedDB
  const fsrsData = {
    due:            next.due.toISOString(),
    stability:      next.stability,
    difficulty:     next.difficulty,
    elapsed_days:   next.elapsed_days,
    scheduled_days: next.scheduled_days,
    reps:           next.reps,
    lapses:         next.lapses,
    state:          next.state,
    last_review:    next.last_review?.toISOString() ?? null,
  };

  await sendMsg({ action: 'updateCard', id: entry.id, fsrs: fsrsData });

  reviewIdx++;
  renderCard();
}

// ── Create cards tab ───────────────────────────────────────────────────────

function parseLines(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && l.includes('|'))
    .map(l => {
      const [word = '', article = '', translation = '', example = ''] =
        l.split('|').map(s => s.trim());
      return { word, article, translation, example };
    })
    .filter(e => e.word.length > 0);
}

document.getElementById('import-btn').addEventListener('click', async () => {
  const textarea = document.getElementById('import-text');
  const msgEl    = document.getElementById('import-msg');
  const entries  = parseLines(textarea.value);

  if (entries.length === 0) {
    msgEl.className = 'msg-warn'; msgEl.textContent = 'Nothing to import.'; return;
  }

  msgEl.className = 'msg-pending'; msgEl.textContent = '…';

  const result = await sendMsg({ action: 'import', entries });

  if (result?.ok) {
    const parts = [];
    if (result.added)   parts.push(`${result.added} added`);
    if (result.updated) parts.push(`${result.updated} updated`);
    msgEl.className   = 'msg-ok';
    msgEl.textContent = parts.length ? parts.join(', ') : 'No changes.';
    textarea.value = '';
  } else {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Import failed.';
  }
});

// ── In-popup selection save ────────────────────────────────────────────────
// Mirrors the content script behaviour but runs inside the popup's own document.

let _popupBtn      = null;
let _popupSel      = null;
let _popupDebounce = null;

function getPopupBtn() {
  if (_popupBtn) return _popupBtn;
  _popupBtn = document.createElement('button');
  _popupBtn.id = 'popup-save-btn';
  _popupBtn.textContent = '✨';
  _popupBtn.setAttribute('aria-label', 'Save to Fragments');
  document.body.appendChild(_popupBtn);
  _popupBtn.addEventListener('click', e => { e.stopPropagation(); handlePopupSave(); });
  return _popupBtn;
}

function showPopupBtn(rect) {
  const b   = getPopupBtn();
  let left  = rect.right + 5;
  let top   = rect.top   - 33;
  if (top  < 4)                       top  = rect.bottom + 5;
  if (left + 30 > window.innerWidth)  left = rect.left   - 34;
  b.style.left = `${left}px`;
  b.style.top  = `${top}px`;
  b.classList.add('active');
}

function hidePopupBtn() {
  _popupBtn?.classList.remove('active');
  _popupSel = null;
}

function extractPopupSentence(node, word) {
  const el  = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const raw = (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const p of parts) {
    if (p.toLowerCase().includes(word.toLowerCase())) return p.trim().slice(0, 300);
  }
  return raw.slice(0, 300);
}

async function handlePopupSave() {
  if (!_popupSel) return;
  clearTimeout(_popupDebounce);
  const { text, node } = _popupSel;
  const sentence = extractPopupSentence(node, text);
  hidePopupBtn();
  await sendMsg({
    action:  'save',
    payload: {
      word:        text,
      sentence,
      sourceUrl:   'fragments://popup',
      sourceTitle: 'Fragments',
      createdAt:   new Date().toISOString(),
    },
  });
  loadWords(); // refreshes count badge and list
}

document.addEventListener('mouseup', e => {
  if (_popupBtn?.contains(e.target)) return;
  clearTimeout(_popupDebounce);
  _popupDebounce = setTimeout(() => {
    const sel  = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || sel.rangeCount === 0) { hidePopupBtn(); return; }
    _popupSel = { text, node: sel.anchorNode, rect: sel.getRangeAt(0).getBoundingClientRect() };
    showPopupBtn(_popupSel.rect);
  }, 50);
});

document.addEventListener('mousedown', e => {
  if (!_popupBtn?.contains(e.target)) hidePopupBtn();
});

// ── Init ───────────────────────────────────────────────────────────────────
// Open Review if cards are due, otherwise fall back to Words.
(async () => {
  const { cards = [] } = await sendMsg({ action: 'getDue' });
  switchTab(cards.length > 0 ? 'review' : 'words');
})();
