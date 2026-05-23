/**
 * puppeteer-locator/index.js
 * Public API
 */
'use strict';

const { Locator }          = require('./src/locator');
const { buildFieldMap }    = require('./src/strategies/form-order');

module.exports = { Locator, buildFieldMap };

// ─────────────────────────────────────────────────────────────────────────────
// CONTOH PENGGUNAAN (hapus sebelum publish ke npm)
// ─────────────────────────────────────────────────────────────────────────────
//
// const puppeteer = require('puppeteer');
// const { Locator } = require('puppeteer-locator');
//
// const browser = await puppeteer.launch({ headless: 'new' });
// const page    = await browser.newPage();
// const loc     = new Locator(page, { debug: true });
//
// await page.goto('https://contoh-web.com/daftar');
//
// // ── Isi form register ──────────────────────────────────────────────────────
// await loc.fill('Nama Lengkap', 'Budi Santoso');
// await loc.fill('Email',        'budi@test.com');
// await loc.fill('Password',     'Rahasia123!');
// await loc.fill('No. HP',       '081234567890');
// await loc.select('Provinsi',   'Jawa Tengah');     // untuk <select>
// await loc.checkbox('Setuju dengan syarat');        // centang checkbox
// await loc.click(['Daftar', 'Register', 'Buat Akun', 'Submit']);
//
// // ── Scrape informasi setelah login ─────────────────────────────────────────
// const saldo  = await loc.extractNear('Saldo');          // → ['Rp 50.000']
// const metode = await loc.extractNear('Metode Pembayaran', 300);
//
// // ── Debug: lihat semua field yang terdeteksi di halaman ────────────────────
// const fields = await loc.scanFields();
// console.log(fields);
// // [
// //   { label: 'Nama Lengkap', inputTag: 'INPUT', inputType: 'text', ... },
// //   { label: 'Email',        inputTag: 'INPUT', inputType: 'email', ... },
// //   ...
// // ]
//
// // ── Snapshot untuk dikirim ke AI agent ────────────────────────────────────
// const snap = await loc.snapshot();
// // { screenshot: '<base64>', fieldMap: [...], url: '...', title: '...' }
