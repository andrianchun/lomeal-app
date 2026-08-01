# Lomeal — catatan untuk agent / IDE

## Rilis & versi

`package.json` adalah **satu-satunya** sumber versi. Jangan pernah mengetik nomor versi
di file lain, dan jangan edit `"version"` di `package.json` secara manual.

Setelah menyelesaikan perubahan yang terlihat oleh user (UI, fitur, bugfix), jalankan:

```bash
npm run release
```

Perintah itu melakukan semuanya: bump patch → `vite build` → zip OTA → `firebase deploy --only hosting`
→ `git commit` → `git push`. Semua PWA dan APK yang sudah terpasang akan dapat update otomatis.

- `npm run release minor` untuk fitur besar, `npm run release major` untuk breaking change.
- **Jangan** panggil `scripts/build-ota.js` dengan argumen versi — script itu baca `package.json` sendiri.
- **Jangan** hardcode versi di komponen; pakai `__APP_VERSION__` (di-inject vite dari `package.json`).

## Cara update sampai ke user

| Target | Mekanisme | Yang dilihat user |
|---|---|---|
| PWA / browser | service worker `vite-plugin-pwa` mode `prompt`, dicek tiap jam + tiap tab kembali aktif | kartu "Pembaruan Tersedia" (`src/components/PwaUpdater.jsx`) |
| APK Android | Capgo `@capgo/capacitor-updater` menarik `https://lomeal.web.app/ota/version.json` saat launch + saat kembali ke foreground | kartu update (`src/components/UpdaterAlert.jsx`), progress di Settings |

Versi yang sedang berjalan di APK dibaca dari `CapacitorUpdater.current()`, **bukan** dari
`localStorage` — supaya rollback Capgo ke bundle builtin tidak bikin app nyangkut.

`firebase.json` menjaga `index.html` / `sw.js` / `version.json` selalu revalidate, sementara
`/assets/**` (nama file sudah di-hash) di-cache setahun. Jangan longgarkan header `index.html`
atau update PWA bisa telat sampai satu jam.

## Android

Distribusi APK lewat sideload + OTA Capgo, bukan Play Store. Rebuild APK hanya perlu kalau
menambah plugin Capacitor atau mengubah `capacitor.config.json`:

```bash
npm run sync:android
```

lalu build di Android Studio. `versionCode`/`versionName` di `android/app/build.gradle`
sengaja tidak disinkronkan — versi yang dipakai app adalah `__APP_VERSION__` dari bundle JS.
