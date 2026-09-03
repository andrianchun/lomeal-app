# Lomeal App Release Protocol

Panduan ini ditujukan untuk AI Assistant (seperti Cursor, Claude Code, atau Antigravity) saat pengguna meminta untuk "merilis" atau "membuat versi rilis" aplikasi Lomeal.

## Pilih jalur rilis dulu

Ada dua jalur, dan **hampir selalu jalur A yang benar.** Tanyakan satu hal: apakah ada perubahan di `android/` (plugin native baru, permission, SDK, icon/splash)?

| | Jalur A — OTA ZIP | Jalur B — APK |
|---|---|---|
| Kapan | Perubahan hanya React/JS/CSS | Ada perubahan native di `android/` |
| Caranya | `npm run release` → deploy hosting | Build APK, bagikan, user pasang manual |
| Yang diunduh user | Bundle web ±48 MB, di dalam aplikasi | APK ±60 MB, lewat browser |
| Progress bar | Ada (Capgo `download` listener) | Tidak ada |

Jalur A pakai [`scripts/build-ota.js`](scripts/build-ota.js) dan Capgo Updater — sudah otomatis dan sudah terbukti jalan. Jalur B dikerjakan manual dan rawan salah. Kalau ragu, pilih A.

### Aturan yang tidak boleh dilanggar (semuanya pernah bikin rilis gagal)

1. **`dist/ota/version.json` hanya boleh dihasilkan oleh `npm run build:ota`.** Jangan pernah membuat `public/ota/version.json` — Vite menyalin `public/` ke `dist/`, jadi file itu akan menimpa manifest yang benar dan yang ter-deploy adalah konfigurasi salah.
2. **Deploy hosting selalu lewat `npm run build:ota`, jangan `npm run build` polos.** `npm run build` tidak membuat zip dan tidak menulis manifest, hasilnya manifest lama atau hilang.
3. **Naikkan `package.json` SEBELUM build apa pun.** `__APP_VERSION__` di-bake saat build ([vite.config.js](vite.config.js)); updater membandingkan angka itu, bukan `versionName` di gradle. Kalau build jalan duluan, aplikasi melapor versi lama selamanya dan updater akan menawarkan update yang sama berulang-ulang.
4. **Link download APK publik:** `https://lomeal.web.app/apk/lomeal-latest.apk` — permanen, ditimpa tiap rilis APK, file `.apk` ada di `public/apk/lomeal-latest.apk` (di-ignore oleh git agar repo tidak bengkak).

---

## Jalur A — Rilis OTA ZIP (default)

```bash
npm run release force "Perbaikan bug X dan Y"
```
Satu perintah ini sudah mencakup semuanya: bump versi → build → zip → manifest → deploy hosting → commit → push. Tanpa kata `force`, kartu update bisa ditutup user. Verifikasi setelahnya:
```bash
curl -s https://lomeal.web.app/ota/version.json
```

---

## Jalur B — Rilis APK (hanya kalau ada perubahan native)

Jalankan prosedur berikut secara berurutan:

### 1. Update Versi Aplikasi
1. **Di Web**: Buka `package.json` dan naikkan `version`.
2. **Di Native Android**: Buka file `android/app/build.gradle`. Cari blok `defaultConfig` lalu:
   - Naikkan angka `versionCode` +1.
   - Samakan `versionName` dengan versi di `package.json`.

### 2. Build APK (Native Android)
```bash
npm run sync:android
cd android && ./gradlew assembleRelease
```

### 3. Salin APK ke hosting
```bash
cp android/app/build/outputs/apk/release/app-release.apk public/apk/lomeal-latest.apk
```
Link publiknya: `https://lomeal.web.app/apk/lomeal-latest.apk`

### 4. Rilis dengan jalur APK
```bash
npm run release force apk "Pembaruan native Lomeal"
```

Verifikasi setelah deploy:
```bash
curl -s https://lomeal.web.app/ota/version.json
curl -sIL https://lomeal.web.app/apk/lomeal-latest.apk | grep -i "content-type"
```
Manifest harus memuat `"is_apk": true`, dan APK harus tayang sebagai `application/vnd.android.package-archive`.
