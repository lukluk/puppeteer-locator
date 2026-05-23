/**
 * locator.js — Puppeteer Element Locator
 *
 * Mencari elemen tanpa CSS selector dengan menjalankan strategi
 * secara berurutan dari yang paling reliable ke yang paling fuzzy.
 *
 * URUTAN STRATEGI:
 *   1. Semantic    — label[for], aria-label, placeholder, name attr
 *   2. DomTraversal— nextSibling, parent.nextSibling
 *   3. FormGroup   — ancestor dengan class form/field/group
 *   4. Spatial     — kedekatan posisi X/Y ke teks label
 *   5. FuzzyLabel  — bigram similarity score
 *   6. IframeScan  — cari di dalam frame-frame
 *
 * Usage:
 *   const loc = new Locator(page);
 *   const el  = await loc.findInput('Email');
 *   await loc.fill('Nama Lengkap', 'Budi Santoso');
 *   await loc.click(['Daftar', 'Register', 'Submit']);
 *   const map = await loc.scanFields();
 */

'use strict';

const { findBySemantic, findButtonBySemantic }       = require('./strategies/semantic');
const { findByDomTraversal, findByFormGroup }         = require('./strategies/dom-traversal');
const { findBySpatial, findButtonBySpatial }          = require('./strategies/spatial');
const { findByFuzzyLabel, buildFieldMap }             = require('./strategies/form-order');
const { findInIframes }                               = require('./strategies/shadow-iframe');

// Waktu tunggu maksimal per strategi (ms)
const STRATEGY_TIMEOUT = 3000;

class Locator {
  /**
   * @param {import('puppeteer').Page} page
   * @param {object} opts
   * @param {boolean} opts.debug     - log strategi yang berhasil
   * @param {number}  opts.retryWait - ms tunggu sebelum retry setelah scroll
   */
  constructor(page, opts = {}) {
    this.page      = page;
    this.debug     = opts.debug     ?? false;
    this.retryWait = opts.retryWait ?? 400;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cari input/textarea/select terdekat dengan label teks.
   * Otomatis mencoba semua strategi, return ElementHandle atau null.
   *
   * @param {string}   labelText  - teks label yang dicari
   * @param {object}   opts
   * @param {string[]} opts.scrollInto - scroll ke section ini dulu jika perlu
   * @returns {Promise<ElementHandle|null>}
   */
  async findInput(labelText, opts = {}) {
    const strategies = [
      { name: 'semantic',      fn: () => findBySemantic(this.page, labelText) },
      { name: 'dom-traversal', fn: () => findByDomTraversal(this.page, labelText) },
      { name: 'form-group',    fn: () => findByFormGroup(this.page, labelText) },
      { name: 'spatial',       fn: () => findBySpatial(this.page, labelText) },
      { name: 'fuzzy',         fn: () => findByFuzzyLabel(this.page, labelText, { threshold: 0.4 }) },
      { name: 'iframe',        fn: async () => { const r = await findInIframes(this.page, labelText); return r?.element || null; } },
    ];

    for (const { name, fn } of strategies) {
      try {
        const handle = await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), STRATEGY_TIMEOUT)),
        ]);

        const isValid = await this._isValidHandle(handle);
        if (isValid) {
          if (this.debug) console.log(`[Locator] "${labelText}" → strategi: ${name}`);
          return handle;
        }
        await handle?.dispose?.();
      } catch {
        // Lanjut ke strategi berikutnya
      }
    }

    if (this.debug) console.warn(`[Locator] "${labelText}" → semua strategi gagal`);
    return null;
  }

  /**
   * Cari tombol/link berdasarkan teks.
   * @param {string|string[]} texts - satu atau beberapa kandidat teks
   */
  async findButton(texts) {
    const list = Array.isArray(texts) ? texts : [texts];

    const strategies = [
      { name: 'semantic', fn: () => findButtonBySemantic(this.page, list) },
      { name: 'spatial',  fn: () => findButtonBySpatial(this.page, list) },
    ];

    for (const { name, fn } of strategies) {
      try {
        const handle = await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), STRATEGY_TIMEOUT)),
        ]);
        const isValid = await this._isValidHandle(handle);
        if (isValid) {
          if (this.debug) console.log(`[Locator] button "${list[0]}" → strategi: ${name}`);
          return handle;
        }
        await handle?.dispose?.();
      } catch {}
    }

    return null;
  }

  /**
   * Isi field berdasarkan label teks.
   * @param {string} labelText
   * @param {string} value
   * @param {object} opts
   * @param {boolean} opts.clear  - hapus isi lama sebelum mengetik (default: true)
   * @param {number}  opts.delay  - delay antar karakter ms (default: 40)
   * @throws {Error} jika field tidak ditemukan
   */
  async fill(labelText, value, { clear = true, delay = 40 } = {}) {
    const el = await this.findInput(labelText);
    if (!el) throw new Error(`[Locator] Field tidak ditemukan: "${labelText}"`);

    await el.click({ clickCount: clear ? 3 : 1 });
    if (clear) {
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Delete');
    }
    await el.type(String(value), { delay });
    return this;
  }

  /**
   * Pilih option dari <select> berdasarkan label.
   * @param {string} labelText  - label field select
   * @param {string} optionText - teks option yang dipilih
   */
  async select(labelText, optionText) {
    const el = await this.findInput(labelText);
    if (!el) throw new Error(`[Locator] Select tidak ditemukan: "${labelText}"`);

    // Cari value dari option yang teksnya cocok
    const value = await this.page.evaluate(
      ({ el, optionText }) => {
        const norm = s => (s || '').toLowerCase().trim();
        const nt = norm(optionText);
        const option = Array.from(el.options || []).find(o => norm(o.text).includes(nt) || norm(o.value).includes(nt));
        return option?.value || null;
      },
      { el, optionText }
    );

    if (!value) throw new Error(`[Locator] Option "${optionText}" tidak ditemukan di select "${labelText}"`);
    await this.page.select('', value); // fallback; gunakan handle langsung
    await el.select(value);
    return this;
  }

  /**
   * Klik tombol/link.
   * @param {string|string[]} texts
   * @throws {Error} jika tombol tidak ditemukan
   */
  async click(texts) {
    const el = await this.findButton(texts);
    if (!el) throw new Error(`[Locator] Tombol tidak ditemukan: "${JSON.stringify(texts)}"`);
    await el.click();
    return this;
  }

  /**
   * Centang/uncentang checkbox berdasarkan label teks.
   * @param {string}  labelText
   * @param {boolean} checked   - true = centang, false = uncentang
   */
  async checkbox(labelText, checked = true) {
    const el = await this.findInput(labelText, { types: ['input[type=checkbox]', 'input[type=radio]'] });
    if (!el) throw new Error(`[Locator] Checkbox tidak ditemukan: "${labelText}"`);

    const isChecked = await this.page.evaluate(el => el.checked, el);
    if (isChecked !== checked) await el.click();
    return this;
  }

  /**
   * Ekstrak teks dari area di sekitar label kunci.
   * Berguna untuk scrape nilai (harga, saldo, kontak, dll).
   * @param {string} labelText
   * @param {number} maxDistance - radius pencarian px
   * @returns {Promise<string[]>}
   */
  async extractNear(labelText, maxDistance = 200) {
    return this.page.evaluate(
      ({ labelText, maxDistance }) => {
        const norm    = s => (s || '').toLowerCase().replace(/[\s\-_*:]+/g, ' ').trim();
        const nl      = norm(labelText);
        const visible = el => { const s = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

        const labelEl = Array.from(document.querySelectorAll('*')).find(el => {
          if (!visible(el)) return false;
          return norm(el.innerText || el.textContent || '').includes(nl) && (el.innerText || '').length < 100;
        });
        if (!labelEl) return [];

        const lr = labelEl.getBoundingClientRect();
        const lc = { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 };

        return Array.from(document.querySelectorAll('*'))
          .filter(el => {
            if (el === labelEl || el.contains(labelEl) || labelEl.contains(el)) return false;
            if (!visible(el) || el.children.length > 0) return false;
            const r = el.getBoundingClientRect();
            const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            return Math.sqrt((c.x - lc.x) ** 2 + (c.y - lc.y) ** 2) < maxDistance;
          })
          .map(el => (el.innerText || el.textContent || '').trim())
          .filter(t => t.length > 0 && t.length < 200);
      },
      { labelText, maxDistance }
    );
  }

  /**
   * Scan semua field di halaman dan return peta label → info.
   * Berguna untuk debug atau memahami struktur form yang tidak dikenal.
   * @returns {Promise<Array<{label, tag, type, name, placeholder}>>}
   */
  async scanFields() {
    return buildFieldMap(this.page);
  }

  /**
   * Ambil snapshot state halaman (untuk AI agent atau debug).
   */
  async snapshot() {
    const [screenshot, fieldMap, url, title] = await Promise.all([
      this.page.screenshot({ encoding: 'base64', fullPage: false }),
      this.scanFields(),
      this.page.url(),
      this.page.title(),
    ]);
    return { screenshot, fieldMap, url, title };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────────────────

  async _isValidHandle(handle) {
    if (!handle) return false;
    try {
      // evaluateHandle mengembalikan JSHandle; asElement() null jika bukan DOM node
      if (typeof handle.asElement === 'function') {
        return handle.asElement() !== null;
      }
      // ElementHandle langsung
      const box = await handle.boundingBox();
      return box !== null;
    } catch {
      return false;
    }
  }
}

module.exports = { Locator };
