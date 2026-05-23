/**
 * strategy/spatial.js
 *
 * Strategi SPATIAL: cari elemen interaktif yang posisinya paling dekat
 * (dan lebih diutamakan di bawah/kanan) dari elemen teks label.
 *
 * Cocok untuk: form modern dengan label di atas/kiri input.
 */

'use strict';

const INPUT_TYPES = ['input:not([type=hidden])', 'textarea', 'select', '[contenteditable=true]'];
const BUTTON_TYPES = ['button', '[role=button]', 'a', 'input[type=submit]', 'input[type=button]'];

/**
 * Cari input yang posisinya paling dekat ke teks label.
 * @returns {ElementHandle|null}
 */
async function findBySpatial(page, labelText, { targetTypes = INPUT_TYPES, maxDistance = 350 } = {}) {
  return page.evaluateHandle(
    ({ labelText, targetTypes, maxDistance }) => {
      /* ── helpers (inline karena evaluate scope) ── */
      const norm = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
      const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

      /* ── cari semua kandidat label ── */
      const needleNorm = norm(labelText);
      const labelCandidates = Array.from(document.querySelectorAll(
        'label,legend,span,p,div,td,th,dt,li,[class*="label"],[class*="title"]'
      )).filter(el => {
        if (!visible(el)) return false;
        const t = norm(el.innerText || el.textContent || '');
        return t.includes(needleNorm) && t.length < 120;
      }).sort((a, b) =>
        (a.innerText || a.textContent || '').trim().length -
        (b.innerText || b.textContent || '').trim().length
      );

      if (!labelCandidates.length) return null;
      const label = labelCandidates[0];
      const lc = center(label);

      /* ── cari semua input terdekat ── */
      const inputs = Array.from(document.querySelectorAll(targetTypes.join(','))).filter(visible);

      const scored = inputs.map(el => {
        const ec = center(el);
        const d = dist(lc, ec);
        if (d > maxDistance) return null;

        // Penalti jika elemen ada di ATAS label (kemungkinan bukan field-nya)
        const dy = ec.y - lc.y;
        const dx = ec.x - lc.x;
        const penalty = (dy < -10 ? 120 : 0) + (dx < -100 ? 50 : 0);

        return { el, score: d + penalty };
      }).filter(Boolean);

      if (!scored.length) return null;
      scored.sort((a, b) => a.score - b.score);
      return scored[0].el;
    },
    { labelText, targetTypes, maxDistance }
  );
}

/**
 * Cari tombol/link yang teksnya mengandung salah satu dari candidates.
 */
async function findButtonBySpatial(page, textCandidates, { maxDistance = 500 } = {}) {
  return page.evaluateHandle(
    ({ textCandidates, buttonTypes, maxDistance }) => {
      const norm = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
      const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

      const buttons = Array.from(document.querySelectorAll(buttonTypes.join(','))).filter(visible);

      for (const candidate of textCandidates) {
        const cn = norm(candidate);
        const found = buttons.find(btn => {
          const t = norm(btn.innerText || btn.value || btn.getAttribute('aria-label') || btn.title || '');
          return t.includes(cn);
        });
        if (found) return found;
      }
      return null;
    },
    { textCandidates, buttonTypes: BUTTON_TYPES, maxDistance }
  );
}

module.exports = { findBySpatial, findButtonBySpatial };
