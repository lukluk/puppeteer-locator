/**
 * strategy/form-order.js
 *
 * Strategi FORM ORDER: manfaatkan urutan field dalam form dan
 * hubungan posisi relatif antar elemen dalam DOM order (tabIndex).
 *
 * Berguna ketika:
 * - Label dan input tidak punya relasi HTML eksplisit
 * - Tapi urutan DOM konsisten (label sebelum input-nya)
 *
 * Juga berisi: fuzzy label matching dengan skor kesamaan string.
 */

'use strict';

/**
 * Bangun peta: setiap input di-pair dengan label teks terdekat di DOM sebelumnya.
 * Return pasangan (label teks → input element) untuk seluruh halaman.
 */
async function buildFieldMap(page) {
  return page.evaluate(() => {
    const visible = el => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };

    const inputs = Array.from(
      document.querySelectorAll('input:not([type=hidden]),textarea,select')
    ).filter(visible);

    const map = [];

    for (const input of inputs) {
      const r = input.getBoundingClientRect();
      const inputCx = r.left + r.width / 2;
      const inputCy = r.top + r.height / 2;

      // Cari semua teks yang ada di ATAS atau di KIRI input (dalam viewport)
      const texts = Array.from(document.querySelectorAll(
        'label,span,p,div,td,th,dt,legend,li'
      )).filter(el => {
        if (!visible(el) || el.contains(input)) return false;
        const er = el.getBoundingClientRect();
        const elCy = er.top + er.height / 2;
        const elCx = er.left + er.width / 2;
        const text = (el.innerText || el.textContent || '').trim();
        return (
          text.length > 0 &&
          text.length < 80 &&
          // Elemen teks ada di atas atau di kiri input
          (elCy < inputCy + 20 || elCx < inputCx) &&
          // Tidak terlalu jauh
          Math.abs(elCy - inputCy) < 200 &&
          Math.abs(elCx - inputCx) < 400
        );
      });

      if (!texts.length) continue;

      // Ambil teks terdekat ke input
      texts.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const da = Math.sqrt((ra.left - r.left) ** 2 + (ra.top - r.top) ** 2);
        const db = Math.sqrt((rb.left - r.left) ** 2 + (rb.top - r.top) ** 2);
        return da - db;
      });

      const labelText = (texts[0].innerText || texts[0].textContent || '').trim();

      map.push({
        label: labelText,
        inputTag: input.tagName,
        inputType: input.type || null,
        inputName: input.name || input.id || null,
        placeholder: input.placeholder || null,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }

    return map;
  });
}

/**
 * Fuzzy match: cari input dengan label paling mirip menggunakan
 * bigram similarity score.
 */
async function findByFuzzyLabel(page, labelText, { threshold = 0.45 } = {}) {
  return page.evaluateHandle(
    ({ labelText, threshold }) => {
      /* ── bigram similarity ── */
      function bigrams(str) {
        const s = str.toLowerCase().replace(/\s+/g, '');
        const bg = new Set();
        for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
        return bg;
      }
      function similarity(a, b) {
        const ba = bigrams(a), bb = bigrams(b);
        const inter = [...ba].filter(x => bb.has(x)).length;
        return (2 * inter) / (ba.size + bb.size || 1);
      }

      const visible = el => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };

      const inputs = Array.from(
        document.querySelectorAll('input:not([type=hidden]),textarea,select')
      ).filter(visible);

      /* Untuk setiap input, cari label teks terdekat lalu hitung similarity */
      const candidates = inputs.map(input => {
        const ir = input.getBoundingClientRect();
        const nearbyTexts = Array.from(document.querySelectorAll(
          'label,span,div,p,td,th,dt,legend'
        )).filter(el => {
          if (!visible(el) || el.contains(input)) return false;
          const er = el.getBoundingClientRect();
          const dist = Math.sqrt((er.left - ir.left) ** 2 + (er.top - ir.top) ** 2);
          const text = (el.innerText || el.textContent || '').trim();
          return dist < 300 && text.length > 0 && text.length < 80;
        });

        let bestScore = 0;
        let bestLabel = '';
        for (const el of nearbyTexts) {
          const t = (el.innerText || el.textContent || '').trim();
          const s = similarity(labelText, t);
          if (s > bestScore) { bestScore = s; bestLabel = t; }
        }

        // Juga cek placeholder dan aria-label sebagai fallback label
        const ph = input.placeholder || '';
        const al = input.getAttribute('aria-label') || '';
        const phScore = similarity(labelText, ph);
        const alScore = similarity(labelText, al);
        const maxScore = Math.max(bestScore, phScore, alScore);

        return { input, score: maxScore, label: bestLabel || ph || al };
      }).filter(c => c.score >= threshold);

      if (!candidates.length) return null;
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].input;
    },
    { labelText, threshold }
  );
}

module.exports = { buildFieldMap, findByFuzzyLabel };
