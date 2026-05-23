# puppeteer-locator

> Temukan elemen HTML tanpa CSS selector — cukup pakai teks label seperti yang terlihat di layar.

Library ini untuk Puppeteer yang mencari input, tombol, dan elemen interaktif menggunakan **6 strategi fallback** secara otomatis: dari atribut semantic HTML, traversal DOM, kedekatan posisi visual, hingga fuzzy string matching. Cocok untuk automation di berbagai website dengan struktur berbeda-beda.

---

## Masalah yang Diselesaikan

Automation browser biasanya bergantung pada CSS selector seperti `#email` atau `.btn-submit`. Ini rapuh: selector berubah saat website diupdate, dan tidak bisa dipakai lintas website berbeda.

`puppeteer-locator` mencari elemen **dari perspektif pengguna** — berdasarkan label teks yang terlihat, bukan struktur internal DOM.

```js
// ❌ Cara lama — rapuh, spesifik per-website
await page.$('#user_email_field');
await page.$('.ant-input[name="email"]');

// ✅ Cara baru — generik, works di website manapun
await loc.fill('Email', 'budi@test.com');
```

---

## Instalasi

```bash
npm install puppeteer-locator
```

---

## Quick Start

```js
const puppeteer = require('puppeteer');
const { Locator } = require('puppeteer-locator');

const browser = await puppeteer.launch({ headless: 'new' });
const page    = await browser.newPage();
const loc     = new Locator(page, { debug: true });

await page.goto('https://contoh-website.com/daftar');

// Isi form register
await loc.fill('Nama Lengkap', 'Budi Santoso');
await loc.fill('Email',        'budi@test.com');
await loc.fill('Password',     'Rahasia123!');
await loc.fill('No. HP',       '081234567890');
await loc.select('Provinsi',   'Jawa Tengah');
await loc.checkbox('Setuju dengan syarat dan ketentuan');
await loc.click(['Daftar', 'Register', 'Buat Akun', 'Submit']);
```

---

## API

### `new Locator(page, opts?)`

| Opsi | Default | Keterangan |
|------|---------|------------|
| `debug` | `false` | Log strategi yang berhasil ke console |
| `retryWait` | `400` | Delay (ms) sebelum retry setelah scroll |

---

### `loc.fill(labelText, value, opts?)`

Cari input/textarea terdekat dengan teks label, lalu isi dengan value.

```js
await loc.fill('Email', 'budi@test.com');
await loc.fill('Pesan', 'Halo, saya ingin bertanya...', { delay: 80 });
```

| Opsi | Default | Keterangan |
|------|---------|------------|
| `clear` | `true` | Hapus isi lama sebelum mengetik |
| `delay` | `40` | Delay antar karakter (ms), untuk simulasi manusia |

---

### `loc.click(texts)`

Cari tombol atau link berdasarkan teks, lalu klik. Menerima satu string atau array kandidat.

```js
await loc.click('Login');
await loc.click(['Daftar', 'Register', 'Sign Up', 'Submit']); // coba satu per satu
```

---

### `loc.select(labelText, optionText)`

Cari elemen `<select>` lalu pilih option berdasarkan teks yang terlihat.

```js
await loc.select('Provinsi', 'Jawa Tengah');
await loc.select('Metode Pengiriman', 'JNE Regular');
```

---

### `loc.checkbox(labelText, checked?)`

Centang atau uncentang checkbox/radio berdasarkan label.

```js
await loc.checkbox('Setuju dengan syarat');        // centang
await loc.checkbox('Terima newsletter', false);    // uncentang
```

---

### `loc.extractNear(labelText, maxDistance?)`

Ambil semua teks yang ada di sekitar label tertentu. Berguna untuk scrape nilai/data.

```js
const saldo   = await loc.extractNear('Saldo');              // ['Rp 50.000']
const kontak  = await loc.extractNear('Hubungi Kami', 300);  // ['cs@toko.com', '021-123456']
const metode  = await loc.extractNear('Metode Pembayaran');  // ['Transfer Bank', 'GoPay', 'QRIS']
```

---

### `loc.scanFields()`

Debug utility: scan semua field di halaman dan return peta label → info elemen. Berguna saat pertama kali menjelajahi website yang tidak dikenal.

```js
const fields = await loc.scanFields();
console.log(fields);
// [
//   { label: 'Nama Lengkap', inputTag: 'INPUT', inputType: 'text',     name: 'fullname', ... },
//   { label: 'Email',        inputTag: 'INPUT', inputType: 'email',    name: 'email',    ... },
//   { label: 'Provinsi',     inputTag: 'SELECT', inputType: null,      name: 'province', ... },
// ]
```

---

### `loc.snapshot()`

Ambil state halaman lengkap (screenshot + field map + URL). Berguna untuk dikirim ke AI agent saat stuck.

```js
const snap = await loc.snapshot();
// {
//   screenshot: '<base64 PNG>',
//   fieldMap: [...],
//   url: 'https://...',
//   title: 'Halaman Daftar'
// }
```

---

### `loc.findInput(labelText)` / `loc.findButton(texts)`

Low-level: cari elemen dan return `ElementHandle` tanpa langsung berinteraksi.

```js
const el = await loc.findInput('Email');
if (el) {
  const box = await el.boundingBox();
  console.log('Posisi field:', box);
}
```

---

## Strategi Pencarian

Library ini mencoba **6 strategi** secara berurutan. Berhenti di strategi pertama yang berhasil.

```
labelText → [1] Semantic → [2] DOM Traversal → [3] Form Group
                                                      ↓ (jika gagal)
                         [6] Iframe  ← [5] Fuzzy ← [4] Spatial
```

| # | Strategi | Cara Kerja | Cocok Untuk |
|---|----------|------------|-------------|
| 1 | **Semantic** | `label[for]`, `aria-label`, `placeholder`, `name`, `title`, `data-*` | Form HTML standar, WordPress |
| 2 | **DOM Traversal** | `nextElementSibling`, `parent.nextSibling` | Bootstrap, Tailwind forms |
| 3 | **Form Group** | Naik ke ancestor dengan class `form/field/group/item` | Ant Design, Material UI, Vuetify |
| 4 | **Spatial** | Kalkulasi jarak X/Y antar elemen di viewport | Form custom, dashboard builder |
| 5 | **Fuzzy** | Bigram similarity score antara label kandidat dan teks di halaman | Label verbose ("Alamat Email *") |
| 6 | **Iframe** | Scan frame-frame di dalam halaman | Payment gateway embed (Midtrans, Xendit) |

---

## Contoh Kasus Nyata

### Form Register → Login → Payment (satu sesi browser)

```js
const loc = new Locator(page, { debug: true });

// 1. Register
await page.goto('https://toko.com/daftar');
await loc.fill('Nama', 'Budi Santoso');
await loc.fill('Email', 'budi@mailinator.com');
await loc.fill('Password', 'P@ss123');
await loc.click(['Daftar', 'Buat Akun']);

// 2. Login (jika tidak auto-login setelah register)
await loc.fill('Email', 'budi@mailinator.com');
await loc.fill('Password', 'P@ss123');
await loc.click(['Masuk', 'Login', 'Sign In']);

// 3. Cek metode payment (session sudah aktif)
await loc.click(['Top Up', 'Isi Saldo', 'Deposit']);
const methods = await loc.extractNear('Metode Pembayaran', 400);
console.log('Metode tersedia:', methods);

// 4. Scrape info kontak
await loc.click(['Kontak', 'Hubungi Kami']);
const emails = await loc.extractNear('Email', 250);
const phones = await loc.extractNear('Telepon', 250);
```

### Debug website baru

```js
// Tidak tahu struktur form-nya? Scan dulu.
await page.goto('https://website-baru.com/signup');
const fields = await loc.scanFields();

// Output membantu identifikasi label yang harus dipakai:
// { label: 'Nama Pengguna', inputType: 'text', name: 'username' }
// { label: 'Surel',        inputType: 'email', name: 'email'    }  ← label berbeda!
// { label: 'Sandi',        inputType: 'password', ...           }

await loc.fill('Nama Pengguna', 'budi123');
await loc.fill('Surel', 'budi@test.com');   // bukan 'Email'!
await loc.fill('Sandi', 'rahasia');
```

---

## Struktur Project

```
puppeteer-locator/
├── src/
│   ├── locator.js                  # Kelas utama, orkestrasi strategi
│   ├── strategies/
│   │   ├── semantic.js             # Strategi: atribut HTML semantic
│   │   ├── dom-traversal.js        # Strategi: traversal sibling/parent
│   │   ├── form-order.js           # Strategi: urutan form & fuzzy match
│   │   ├── spatial.js              # Strategi: kedekatan posisi visual
│   │   └── shadow-iframe.js        # Strategi: shadow DOM & iframe
│   └── utils/
│       └── dom-fns.js              # Helper fungsi DOM (pure, serializable)
└── index.js                        # Public API
```

---

## Keterbatasan

- **CAPTCHA** — tidak ada strategi yang bisa melewati CAPTCHA secara otomatis. Gunakan service seperti 2captcha atau fallback ke AI agent dengan screenshot.
- **Canvas/WebGL form** — elemen yang dirender di canvas tidak bisa diakses via DOM.
- **Sangat dinamis** — SPA yang render field secara bertahap mungkin perlu tambahan `waitForTimeout` atau `waitForSelector` sebelum `fill()`.
- **Shadow DOM** — deteksi shadow DOM masih eksperimental, mungkin tidak konsisten di semua browser versi.

---

## Lisensi

MIT
