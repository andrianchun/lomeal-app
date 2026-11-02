# 🚀 Lomeal App Release Protocol (`releaseprotocol.md`)

Panduan rilis dan pembaruan aplikasi **Lomeal Nutrition Tracker** (Web PWA & APK Android).

---

## 1. Prinsip Utama Rilis
1. **`package.json` adalah Single Source of Truth versi.** Jangan pernah mengedit nomor versi di file lain secara manual.
2. **Precache Protection**: `index.html` WAJIB dikecualikan dari precache Service Worker (`globIgnores: ['index.html']` dan `navigateFallback: null`).
3. **Pemberitahuan Otomatis ke User**: Keduanya membaca `/ota/version.json` saat app dibuka, saat foreground/resume, dan tiap 15 menit.

---

## 2. Prosedur Rilis

### Jalur A — Rilis OTA Standar (React/UI/Komposisi Gizi)
Jalankan satu perintah otomatis:
```bash
npm run release "Catatan rilis fitur atau perbaikan"
```
Untuk perbaikan kritis yang wajib diterapkan pengguna tanpa bisa ditutup:
```bash
npm run release force "Perbaikan kritis X"
```
*Perintah ini secara otomatis:*
1. Bump versi patch di `package.json`.
2. Build web bundle (`vite build`).
3. Kompresi paket OTA zip (`scripts/build-ota.js`).
4. Upload hosting & storage ke Firebase (`firebase deploy --only hosting,storage`).
5. Verifikasi deployment dua tahap (memastikan `version.json` & zip live).
6. Commit git & push ke branch utama.

---

### Jalur B — Rilis APK Native (Plugin Capacitor / Permissions)
```bash
npm run release force apk "Pembaruan native Lomeal vX.X.X"
```

---

## 3. Checklist Verifikasi Rilis
- [ ] Versi live terbaca di `https://lomeal.web.app/ota/version.json`.
- [ ] Header `Cache-Control: no-cache` aktif pada `version.json` dan `index.html`.
- [ ] File OTA zip tersaji dengan `Content-Type: application/zip` (bukan HTML).
