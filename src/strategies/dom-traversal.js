/**
 * strategy/dom-traversal.js
 *
 * Strategi DOM TRAVERSAL: telusuri struktur DOM di sekitar teks label.
 *
 * Pola yang dicari:
 *   A. Label → nextElementSibling (input sejajar di DOM)
 *   B. Label → parent.nextElementSibling (input di blok berikutnya)
 *   C. Label → parent → cari input di dalam parent yang sama (form-group pattern)
 *   D. Label → ancestor dengan class "form-item/field/group" → input di dalamnya
 *
 * Cocok untuk: Bootstrap, Ant Design, Material UI, form custom yang mengikuti pola kelompok.
 */

'use strict';

async function findByDomTraversal(page, labelText) {
  return page.evaluateHandle((labelText) => {
    const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
    const nl      = norm(labelText);
    const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const isInput = el => /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || el?.getAttribute('contenteditable') === 'true';
    const firstInput = el => el?.querySelector('input:not([type=hidden]),textarea,select,[contenteditable=true]');

    // ── Temukan elemen label teks ────────────────────────────────────────────
    const all = Array.from(document.querySelectorAll('*'));
    const labelEl = all.find(el => {
      if (!visible(el)) return false;
      if (el.children.length > 4) return false; // bukan container besar
      const t = norm(el.innerText || el.textContent || '');
      return t.includes(nl) && t.length < 100;
    });
    if (!labelEl) return null;

    // ── A. nextElementSibling langsung ───────────────────────────────────────
    let sib = labelEl.nextElementSibling;
    while (sib) {
      if (visible(sib)) {
        if (isInput(sib)) return sib;
        const inner = firstInput(sib);
        if (inner && visible(inner)) return inner;
      }
      sib = sib.nextElementSibling;
    }

    // ── B. parent.nextElementSibling ─────────────────────────────────────────
    const parent = labelEl.parentElement;
    if (parent) {
      let psib = parent.nextElementSibling;
      while (psib) {
        if (visible(psib)) {
          if (isInput(psib)) return psib;
          const inner = firstInput(psib);
          if (inner && visible(inner)) return inner;
        }
        psib = psib.nextElementSibling;
      }

      // ── C. form-group / field / item pattern ─────────────────────────────
      const group = findFormGroup(labelEl);
      if (group) {
        const inner = group.querySelector('input:not([type=hidden]),textarea,select,[contenteditable=true]');
        if (inner && visible(inner)) return inner;
      }
    }

    return null;
  }, labelText);
}

/**
 * Jalan ke atas DOM tree sampai ketemu ancestor yang sepertinya "form group"
 * (punya class mengandung kata: form, field, group, item, control, row, wrap).
 */
function findFormGroup(el) {
  // Inline helper karena ini dipakai di dalam page.evaluateHandle callback
  // Dipanggil dari dalam closure di atas — tidak perlu export terpisah.
}
// Catatan: findFormGroup dipanggil di dalam page.evaluateHandle,
// jadi didefinisikan ulang di sana sebagai bagian dari evaluasi.

async function findByFormGroup(page, labelText) {
  return page.evaluateHandle((labelText) => {
    const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
    const nl      = norm(labelText);
    const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

    const GROUP_KEYWORDS = /form|field|group|item|control|row|wrap|widget|entry|container/i;

    // Temukan label el
    const labelEl = Array.from(document.querySelectorAll('*')).find(el => {
      if (!visible(el)) return false;
      if (el.children.length > 4) return false;
      return norm(el.innerText || el.textContent || '').includes(nl);
    });
    if (!labelEl) return null;

    // Jalan ke atas cari form group
    let node = labelEl.parentElement;
    let depth = 0;
    while (node && depth < 6) {
      const cls = (node.className || '') + (node.id || '');
      if (GROUP_KEYWORDS.test(cls)) {
        const input = node.querySelector('input:not([type=hidden]),textarea,select,[contenteditable=true]');
        if (input && visible(input)) return input;
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }, labelText);
}

module.exports = { findByDomTraversal, findByFormGroup };
