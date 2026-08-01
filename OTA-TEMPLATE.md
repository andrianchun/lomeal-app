# Template OTA & auto-update — cara port ke app lain

Sistem update Lomeal, dibuat portabel. Satu perintah `npm run release` menaikkan versi,
build, deploy, dan semua PWA + APK terpasang dapat pembaruan otomatis tanpa user
perlu refresh atau hapus cache.

Kalau kamu agent yang disuruh "lihat proyek lomeal yang OTA-nya berhasil": file ini
adalah panduannya. Baca juga [AGENTS.md](AGENTS.md) untuk cara kerja hariannya.

## Prasyarat

- Vite + hosting statis (di sini Firebase Hosting).
- Untuk jalur APK: Capacitor + `@capgo/capacitor-updater`.
- App PWA-saja tidak perlu Capgo — lihat [varian PWA-saja](#varian-pwa-saja).

## Status app-app lain (survei per 1 Agustus 2026)

| App | Stack | Yang dibutuhkan |
|---|---|---|
| `logym.app` | Capacitor + vite-plugin-pwa, v0.0.0 | Port penuh. Tambahkan `@capgo/capacitor-updater`. **`index.html` sudah ter-precache — bug laten.** Belum ada header cache. |
| `darka-app` | Capacitor + vite-plugin-pwa, v0.1.1 | Port penuh. Tambahkan `@capgo/capacitor-updater`. **`index.html` sudah ter-precache.** Belum ada header cache. Rewrite-nya cuma `/api/**`, jadi jebakan #2 tidak berlaku. |
| `tokoto-app` | vite-plugin-pwa, tanpa Capacitor, v1.0.0 | Varian PWA-saja. **`index.html` sudah ter-precache.** Sudah punya 3 aturan header — periksa apakah `index.html` sudah `no-cache`. |
| `domus-app` | Vite polos, v0.1.0 | Belum pakai `vite-plugin-pwa` sama sekali. Pasang dulu, lalu varian PWA-saja. |

"index.html ter-precache" = user **wajib** hapus cache untuk lihat versi baru. Lihat jebakan #1.

## Langkah port

### 1. Salin apa adanya

```
scripts/release.js
scripts/build-ota.js            # lewati kalau PWA-saja
src/components/UpdaterAlert.jsx
```

### 2. Ganti domain (2 tempat)

- [scripts/build-ota.js:66](scripts/build-ota.js#L66) — `ota_url`
- [src/App.jsx:70](src/App.jsx#L70) — `otaUrl`

### 3. `package.json`

```json
"scripts": {
  "build:ota": "vite build && node scripts/build-ota.js",
  "release": "node scripts/release.js",
  "sync:android": "vite build && npx cap sync android"
}
```

Jangan sisakan script `deploy` yang menjalankan `firebase deploy` penuh — itu ikut men-deploy
functions dan bisa gagal di predeploy hook. `release.js` sengaja pakai `--only hosting`.

### 4. `vite.config.js`

```js
import fs from 'fs'
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [VitePWA({
    registerType: 'prompt',     // SW tidak pernah reload sendiri; UpdaterAlert yang memutuskan
    injectRegister: 'auto',     // SW terdaftar sejak halaman dibuka, bukan setelah login
    workbox: {
      cleanupOutdatedCaches: true,
      navigateFallback: null,
      globIgnores: ['index.html'],          // WAJIB — lihat jebakan #1
      runtimeCaching: [{
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: { cacheName: 'html', networkTimeoutSeconds: 3, expiration: { maxEntries: 1 } },
      }],
    },
  })],
})
```

Tambahkan `globals: { __APP_VERSION__: 'readonly' }` di `.eslintrc.cjs` biar tidak kena `no-undef`.

### 5. `firebase.json`

Urutan penting: aturan `**` dulu, yang lebih spesifik menimpanya.

```json
"headers": [
  { "source": "**",          "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
  { "source": "/assets/**",  "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
  { "source": "/ota/**",     "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }] }
]
```

Glob `/**/*.@(html)` **tidak** mengenai `/` maupun rute SPA seperti `/dashboard`, karena
pencocokan dilakukan terhadap path request sebelum rewrite. Pakai `**` seperti di atas.

### 6. Efek cek update

Salin dari [src/App.jsx:62-136](src/App.jsx#L62) beserta `handleUpdate` dan render
`<UpdaterAlert>`. Intinya:

- Satu jalur untuk web dan native: dua-duanya `fetch('/ota/version.json')`.
- Versi yang sedang jalan = `__APP_VERSION__`. **Jangan** pakai `CapacitorUpdater.current()` —
  itu cuma melaporkan label yang diberikan saat download, bukan isi bundle-nya.
- Bandingkan dengan `!==`, bukan `>`, supaya mem-publish versi lama berfungsi sebagai rollback.
- Tiga pemicu: saat dibuka, `visibilitychange`, dan `setInterval` 15 menit.
- Web memasang update dengan `location.reload()`; native lewat `CapacitorUpdater.download()` + `set()`.

## Tiga jebakan yang bikin berdarah-darah

**1. `index.html` di precache service worker.** Workbox memetakan `/` ke entri precache
`index.html` (`directoryIndex`, default aktif). Selama itu terjadi, reload berapa kali pun
menyajikan aplikasi versi lama dan header HTTP tidak berpengaruh — request-nya memang tidak
pernah sampai jaringan. Inilah penyebab "user harus hapus data/cache". Obatnya `globIgnores`
+ `navigateFallback: null` + NetworkFirst di atas.

Cara mengetes: sisipkan `<meta name="X" content="1">` ke `dist/index.html` yang di-serve,
reload dengan SW aktif, cek `document.querySelector('meta[name=X]')`. Kalau `null`, masih bug.

**2. Rewrite SPA `**` bikin file OTA yang hilang balas 200 + HTML, bukan 404.** Capgo lalu
gagal meng-unzip dan menampilkan "periksa koneksi internet" padahal jaringan normal.
Sebelum menuduh koneksi, cek dulu: `curl -sI <url-zip>` → `content-type` harus
`application/zip`, bukan `text/html`.

**3. Jangan pernah menghapus bundle zip yang masih ditunjuk klien.** `vite build`
mengosongkan `dist/`, jadi zip rilis sebelumnya ikut hilang. `build-ota.js` menyimpannya di
`.ota-archive/` (di luar `dist/`) dan menerbitkan ulang 3 versi terakhir. Retensi apa pun yang
kamu pasang harus mengecualikan URL yang masih dipakai klien lama.

## Yang jangan dicopy

Konstanta `LEGACY_BRIDGE` / `update_0118.zip` di `build-ota.js` adalah tambalan khusus Lomeal
untuk bundle bawaan APK lama yang cuma bisa baca Firestore. App baru tidak punya warisan itu —
hapus baris tersebut.

## Varian PWA-saja

Buang `scripts/build-ota.js`, seluruh cabang `isNative`, dan `@capgo/capacitor-updater`.
Yang tersisa:

- `define: __APP_VERSION__` dan blok workbox di atas.
- Header cache di `firebase.json`.
- `release.js` tanpa langkah `build:ota` (`npm run build` saja).
- Satu file `public/version.json` yang ditulis `release.js` berisi `{ "ota_version": "<versi>" }`.
- Efek cek yang sama, dengan `handleUpdate` = `location.reload()`.

## Checklist verifikasi

Jalankan semuanya sesudah port, sebelum merasa selesai.

1. `npm run build:ota` lalu bandingkan `dist/ota/version.json` dengan `"version"` di `package.json` — harus identik.
2. `grep -c '"index.html"' dist/sw.js` → harus `0`.
3. `unzip -l dist/ota/update_*.zip | grep -E 'sw\.js|workbox'` → harus kosong. Service worker tidak boleh ikut ke bundle native; kalau ter-register di WebView dia akan menaungi bundle Capgo.
4. Jalankan preview, tunggu SW aktif, ubah `dist/index.html`, reload, pastikan perubahan terlihat (tes jebakan #1).
5. Matikan server preview lalu reload — halaman harus tetap render dari cache (offline tidak boleh rusak).
6. Sesudah deploy: `curl -sI <domain>/` → `no-cache`; `curl -sI <domain>/assets/<file-hash>.js` → `immutable`; `curl -s -o /dev/null -w '%{content_type}' <domain>/ota/update_XXXX.zip` → `application/zip`.
7. Buka Pengaturan di app — versi yang tampil harus sama dengan `package.json`, bukan `0.0.0`.

## Kalau app-nya sudah punya user

Semua kerumitan Lomeal berasal dari sini, bukan dari desainnya. Klien yang sudah terpasang
menjalankan kode lama yang tidak tahu skema baru, jadi butuh jembatan sekali jalan dan URL
lama harus tetap hidup selama masa transisi. Kalau app belum rilis, seluruh kelas masalah ini
tidak ada — pasang sistem ini **sebelum** user pertama.
