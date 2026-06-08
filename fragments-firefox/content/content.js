(function () {
  'use strict';

  let btn        = null;
  let savedSel   = null;
  let debounceId = null;

  // ── Floating button ────────────────────────────────────────────────────────

  function ensureButton() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'fragments-btn';
    btn.setAttribute('aria-label', 'Save to Fragments');
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('assets/icon48.png');
    img.setAttribute('aria-hidden', 'true');
    btn.appendChild(img);
    document.body.appendChild(btn);
    btn.addEventListener('click', (e) => { e.stopPropagation(); handleSave(); });
    return btn;
  }

  function showButton(vr) {   // vr = viewport-relative DOMRect
    const b   = ensureButton();
    const BTN = 32;
    let left  = vr.right + 6;
    let top   = vr.top   - BTN - 4;
    if (left + BTN > window.innerWidth) left = vr.left - BTN - 6;
    if (top < 4)                         top  = vr.bottom + 6;
    b.style.left = `${left}px`;
    b.style.top  = `${top}px`;
    b.classList.add('fragments-show');
  }

  function hideButton() {
    btn?.classList.remove('fragments-show');
    savedSel = null;
  }

  // ── Selection listeners ───────────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    if (btn?.contains(e.target)) return;
    clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      const sel  = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || sel.rangeCount === 0) { hideButton(); return; }
      const range = sel.getRangeAt(0);
      savedSel = {
        text,
        node:         sel.anchorNode,
        viewportRect: range.getBoundingClientRect(),
      };
      showButton(savedSel.viewportRect);
    }, 40);
  });

  document.addEventListener('mousedown', (e) => {
    if (!btn?.contains(e.target)) hideButton();
  });

  // ── Sentence extraction ───────────────────────────────────────────────────

  function extractSentence(node, word) {
    const el  = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const raw = (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    const parts = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
    for (const p of parts) {
      if (p.toLowerCase().includes(word.toLowerCase())) return p.trim().slice(0, 300);
    }
    return raw.slice(0, 300);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function handleSave() {
    if (!savedSel) return;
    const { text, node, viewportRect } = savedSel;
    const sentence = extractSentence(node, text);
    const cx = viewportRect.left + viewportRect.width  / 2;
    const cy = viewportRect.top  + viewportRect.height / 2;
    hideButton();

    // Use browser.runtime.sendMessage (Firefox's native Promise-based API) rather
    // than the chrome.* callback shim.  The chrome.* shim's "return true" channel
    // keep-alive interacts poorly with async Promise chains in Firefox MV2 event
    // pages, causing the response to arrive after the port has already closed.
    browser.runtime.sendMessage({
      action:  'save',
      payload: {
        word:        text,
        sentence,
        sourceUrl:   location.href,
        sourceTitle: document.title,
        createdAt:   new Date().toISOString(),
      },
    })
    .then(resp => {
      if (resp?.ok) {
        burstStars(cx, cy);
        playChime();
      } else {
        console.error('[Fragments] save rejected:', resp?.error);
      }
    })
    .catch(err => {
      console.error('[Fragments]', err.message);
    });
  }

  // ── Star burst animation ──────────────────────────────────────────────────

  function burstStars(cx, cy) {
    const COUNT = 6;
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 - Math.PI / 2;
      const dist  = 44 + Math.random() * 22;
      const dx    = (Math.cos(angle) * dist).toFixed(1);
      const dy    = (Math.sin(angle) * dist).toFixed(1);

      const star = document.createElement('span');
      star.className   = 'fragments-star';
      star.textContent = '✨';
      star.style.cssText = `left:${cx}px;top:${cy}px;--dx:${dx}px;--dy:${dy}px`;
      document.body.appendChild(star);
      star.addEventListener('animationend', () => star.remove(), { once: true });
    }
  }

  // ── Chime (Web Audio API) ─────────────────────────────────────────────────
  // To swap in a sound file:
  //   const audio = new Audio(chrome.runtime.getURL('assets/chime.mp3'));
  //   audio.volume = 0.4; audio.play();

  let _ctx = null;
  function audioCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function playChime() {
    try {
      const ctx = audioCtx();
      [[523.25, 0], [659.25, 0.09]].forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type            = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.6);
      });
    } catch (_) {}
  }
})();
