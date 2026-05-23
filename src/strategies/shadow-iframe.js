/**
 * strategy/shadow-iframe.js
 *
 * Strategi SHADOW DOM & IFRAME:
 * Web modern (Web Components, Lit, Salesforce, dll) sering pakai shadow DOM.
 * Form juga kadang ada di dalam iframe (payment gateway, embed form, dll).
 *
 * Fungsi ini melakukan traversal ke dalam shadow roots dan frames.
 */

'use strict';

/**
 * Cari input di dalam shadow DOM secara rekursif.
 * Mengembalikan { frame, selector } jika ditemukan,
 * atau null jika tidak ada.
 */
async function findInShadowDom(page, labelText) {
  // Puppeteer tidak bisa langsung handle shadow DOM via evaluate biasa.
  // Kita gunakan CDP (Chrome DevTools Protocol) untuk query lintas shadow root.
  try {
    const client = await page.target().createCDPSession();

    // Cari semua shadow hosts di halaman
    const { result: rootResult } = await client.send('Runtime.evaluate', {
      expression: `
        (function collectShadowHosts(root, hosts = []) {
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) {
              hosts.push(el);
              collectShadowHosts(el.shadowRoot, hosts);
            }
          }
          return hosts.length;
        })(document)
      `,
    });

    if (!rootResult.value) return null;

    // Cari di dalam setiap shadow root
    const found = await page.evaluate((labelText) => {
      const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
      const nl      = norm(labelText);
      const visible = el => { try { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; } catch { return false; } };

      function searchInRoot(root) {
        // Cari label teks di root ini
        const labels = Array.from(root.querySelectorAll('*')).filter(el => {
          try { return visible(el) && norm(el.innerText || el.textContent || '').includes(nl) && (el.innerText || '').length < 100; }
          catch { return false; }
        });
        if (!labels.length) return null;

        // Cari input terdekat
        const inputs = Array.from(root.querySelectorAll('input:not([type=hidden]),textarea,select')).filter(visible);
        if (!inputs.length) return null;

        return inputs[0]; // Simplifikasi: ambil input pertama
      }

      function traverse(root) {
        const found = searchInRoot(root);
        if (found) return found;
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = traverse(el.shadowRoot);
            if (inner) return inner;
          }
        }
        return null;
      }

      return traverse(document) ? 'found' : null; // hanya cek ada/tidak
    }, labelText);

    await client.detach();
    return found ? { inShadowDom: true } : null;
  } catch {
    return null;
  }
}

/**
 * Cari input di dalam iframe.
 * Return { frame, elementHandle } atau null.
 */
async function findInIframes(page, labelText) {
  const frames = page.frames();
  if (frames.length <= 1) return null; // Hanya main frame

  for (const frame of frames.slice(1)) { // skip main frame
    try {
      const url = frame.url();
      // Skip frame kosong atau tentang browser
      if (!url || url === 'about:blank' || url.startsWith('chrome-')) continue;

      const el = await frame.evaluateHandle((labelText) => {
        const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
        const nl      = norm(labelText);
        const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

        const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]),textarea,select')).filter(visible);

        // Cari label di frame
        const labelEl = Array.from(document.querySelectorAll('*')).find(el => {
          if (!visible(el)) return false;
          const t = norm(el.innerText || el.textContent || '');
          return t.includes(nl) && t.length < 100;
        });
        if (!labelEl) return null;

        // Cari input terdekat (spatial sederhana)
        const lr = labelEl.getBoundingClientRect();
        const lc = { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 };
        const dist = el => { const r = el.getBoundingClientRect(); const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; return Math.sqrt((c.x - lc.x) ** 2 + (c.y - lc.y) ** 2); };
        inputs.sort((a, b) => dist(a) - dist(b));
        return inputs[0] || null;
      }, labelText);

      // Cek apakah handle valid
      const jsHandle = el.asElement();
      if (jsHandle) return { frame, element: jsHandle };

      await el.dispose();
    } catch {
      continue;
    }
  }
  return null;
}

module.exports = { findInShadowDom, findInIframes };
