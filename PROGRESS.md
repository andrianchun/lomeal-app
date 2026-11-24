# LOMEAL — Progress Log (`PROGRESS.md`)

- **Versi Berjalan:** `0.3.84`
- **Status Repo GitHub:** Terhubung ke `https://github.com/andrianchun/lomeal-app.git`

## Fitur Aktif
- Pencatatan makanan harian (`breakfast`, `lunch`, `dinner`, `snack`) via NLP teks & AI Vision
- Target makro/mikro dinamis terhubung aktivitas Logym (`lyfitSync.js`) & stok dapur Domus (`domusSync.js`)
- Komunitas social post, resep AI Coach Lomy, kamus TKPI & `globalPatternCache`
- OTA Capgo + jembatan `update_0118.zip`, `RootErrorBoundary` & `TabErrorBoundary`

## Audit & Pembaruan Terakhir (2026-11-24)
- Menghapus blok `"storage"` dari `lomeal-app/firebase.json` & membersihkan duplikat rules lokal (`hexa-life` master terpusat di `E:\CODING\hexa-life\`)
- Menghapus `public/lomeal.apk`, duplikat APK di `android/.../assets/`, `netlify.toml`, serta skrip `test-*.mjs` lama
- Menambahkan `maxInstances` pada `lomealAiChat`, `lomealAiVision`, dan `lomealTrendCatcher` (Cloud Functions v1)
- Menyeragamkan `design.md`, `AGENTS.md`, `SCHEMA.md`, `releaseprotocol.md`, `src/styles/tokens.css`, serta fondasi `<Button>` & `<Dialog>`

## Next / Pending
- Melanjutkan perluasan `src/i18n.js` (saat ini baru mencakup layar Settings) ke seluruh tab utama (`Dashboard`, `Catat`, `Histori`, `Resep`, `Database`, `Social`) agar bebas campuran ID/EN saat bahasa diganti
- Audit kontras tema gelap/terang & layout mobile/PC secara berkala
