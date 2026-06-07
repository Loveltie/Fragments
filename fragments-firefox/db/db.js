// IndexedDB wrapper — exposes saveWord(), getAllWords(), getWordCount(), upsertWords()

const _DB_NAME    = 'fragments-db';
const _DB_STORE   = 'words';
const _DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_DB_NAME, _DB_VERSION);

    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains(_DB_STORE)) {
        const store = db.createObjectStore(_DB_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('word',      'word');
        store.createIndex('createdAt', 'createdAt');
      }
    };

    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror   = ({ target: { error  } }) => reject(error);
  });
}

async function saveWord(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const record = {
      word:        entry.word        ?? '',
      sentence:    entry.sentence    ?? '',
      sourceUrl:   entry.sourceUrl   ?? '',
      sourceTitle: entry.sourceTitle ?? '',
      createdAt:   entry.createdAt   ?? new Date().toISOString(),
      article:     null,
      translation: null,
      example:     null,
      due:         null,
      interval:    null,
      ease:        null,
      reps:        null,
    };
    const req = db.transaction(_DB_STORE, 'readwrite').objectStore(_DB_STORE).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = ({ target: { error } }) => reject(error);
  });
}

async function getAllWords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_DB_STORE, 'readonly').objectStore(_DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = ({ target: { error } }) => reject(error);
  });
}

// Returns cards that are due for review: must have a translation, and either
// never reviewed (fsrs is null/undefined) or their due date has passed.
async function getDueCards() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_DB_STORE, 'readonly').objectStore(_DB_STORE).getAll();
    req.onsuccess = () => {
      const now = new Date();
      resolve(req.result.filter(r =>
        r.translation &&
        (!r.fsrs || new Date(r.fsrs.due) <= now)
      ));
    };
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

// Persist the FSRS scheduling state back onto a card record.
// fsrsData has ISO-string dates (due, last_review) so it's safe for IndexedDB.
async function updateCardFSRS(id, fsrsData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(_DB_STORE, 'readwrite');
    const store = tx.objectStore(_DB_STORE);
    const req   = store.get(id);
    req.onsuccess = () => {
      const record = req.result;
      if (!record) { resolve(false); return; }
      store.put({ ...record, fsrs: fsrsData });
      tx.oncomplete = () => resolve(true);
    };
    req.onerror = ({ target: { error } }) => reject(error);
    tx.onerror  = ({ target: { error } }) => reject(error);
  });
}

async function getWordCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_DB_STORE, 'readonly').objectStore(_DB_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = ({ target: { error } }) => reject(error);
  });
}

// Bulk upsert: update matching words (by name) or create new cards.
// entries: [{ word, article, translation, example }]
// Returns: { added, updated }
async function upsertWords(entries) {
  const db       = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const req = db.transaction(_DB_STORE, 'readonly').objectStore(_DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = ({ target: { error } }) => reject(error);
  });

  // Keyed by lowercase word for case-insensitive matching
  const byWord = new Map(existing.map(r => [r.word.toLowerCase(), r]));

  let added = 0, updated = 0;

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(_DB_STORE, 'readwrite');
    const store = tx.objectStore(_DB_STORE);

    tx.oncomplete = () => resolve({ added, updated });
    tx.onerror    = ({ target: { error } }) => reject(error);

    for (const entry of entries) {
      const key = entry.word.toLowerCase();
      if (byWord.has(key)) {
        const rec = byWord.get(key);
        store.put({
          ...rec,
          article:     entry.article     || rec.article     || null,
          translation: entry.translation || rec.translation || null,
          example:     entry.example     || rec.example     || null,
        });
        updated++;
      } else {
        store.add({
          word:        entry.word,
          sentence:    '',
          sourceUrl:   '',
          sourceTitle: '',
          createdAt:   new Date().toISOString(),
          article:     entry.article     || null,
          translation: entry.translation || null,
          example:     entry.example     || null,
          due:         null,
          interval:    null,
          ease:        null,
          reps:        null,
        });
        added++;
      }
    }
  });
}
