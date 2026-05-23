/**
 * strategy/semantic.js
 *
 * Strategi SEMANTIC: manfaatkan atribut HTML yang bermakna tanpa CSS selector.
 *
 * Urutan cek:
 *   1. <label for="id"> → cari input#id
 *   2. <label> wrapping input
 *   3. aria-label / aria-labelledby
 *   4. placeholder (exact & fuzzy)
 *   5. name attribute
 *   6. title attribute
 *   7. data-* attributes (data-label, data-field, data-name, dll)
 *
 * Cocok untuk: form yang mengikuti standar accessibility HTML.
 */

'use strict';

async function findBySemantic(page, labelText) {
  return page.evaluateHandle((labelText) => {
    const norm  = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
    const nl    = norm(labelText);
    const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const inputs  = () => Array.from(document.querySelectorAll(
      'input:not([type=hidden]),textarea,select,[contenteditable=true]'
    )).filter(visible);

    // ── 1. <label for="..."> ─────────────────────────────────────────────────
    for (const label of document.querySelectorAll('label')) {
      if (!norm(label.innerText || label.textContent || '').includes(nl)) continue;
      const forId = label.getAttribute('for') || label.htmlFor;
      if (forId) {
        const el = document.getElementById(forId);
        if (el && visible(el)) return el;
      }
      // ── 2. label wrapping input ───────────────────────────────────────────
      const wrapped = label.querySelector('input,textarea,select');
      if (wrapped && visible(wrapped)) return wrapped;
    }

    // ── 3. aria-label ────────────────────────────────────────────────────────
    for (const el of inputs()) {
      const aria = norm(el.getAttribute('aria-label') || '');
      if (aria.includes(nl)) return el;
    }

    // ── 4. aria-labelledby ───────────────────────────────────────────────────
    for (const el of inputs()) {
      const ids = (el.getAttribute('aria-labelledby') || '').split(' ').filter(Boolean);
      for (const id of ids) {
        const labelEl = document.getElementById(id);
        if (labelEl && norm(labelEl.innerText || '').includes(nl)) return el;
      }
    }

    // ── 5. placeholder ───────────────────────────────────────────────────────
    for (const el of inputs()) {
      const ph = norm(el.getAttribute('placeholder') || '');
      if (ph.includes(nl) || nl.includes(ph.slice(0, 6))) return el;
    }

    // ── 6. name attribute ────────────────────────────────────────────────────
    for (const el of inputs()) {
      const nm = norm(el.getAttribute('name') || '');
      if (nm && nl.includes(nm)) return el;
    }

    // ── 7. title attribute ───────────────────────────────────────────────────
    for (const el of inputs()) {
      const ti = norm(el.getAttribute('title') || '');
      if (ti && ti.includes(nl)) return el;
    }

    // ── 8. data-* attributes ─────────────────────────────────────────────────
    for (const el of inputs()) {
      for (const attr of el.attributes) {
        if (!attr.name.startsWith('data-')) continue;
        const v = norm(attr.value);
        if (v && (v.includes(nl) || nl.includes(v))) return el;
      }
    }

    return null;
  }, labelText);
}

/**
 * Cari tombol via aria-label, title, value, role
 */
async function findButtonBySemantic(page, textCandidates) {
  return page.evaluateHandle((textCandidates) => {
    const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
    const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const buttons = Array.from(document.querySelectorAll(
      'button,[role=button],input[type=submit],input[type=button],[role=link],a'
    )).filter(visible);

    for (const candidate of textCandidates) {
      const cn = norm(candidate);
      const found = buttons.find(btn => {
        const checks = [
          norm(btn.innerText || ''),
          norm(btn.getAttribute('aria-label') || ''),
          norm(btn.getAttribute('title') || ''),
          norm(btn.value || ''),
          norm(btn.getAttribute('data-label') || ''),
        ];
        return checks.some(t => t.includes(cn));
      });
      if (found) return found;
    }
    return null;
  }, textCandidates);
}

module.exports = { findBySemantic, findButtonBySemantic };
