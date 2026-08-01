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
- Tambahkan catatan rilis (tampil di kartu update): `npm run release "Perbaikan X dan Y"`.
- Untuk update **wajib** (bug serius/data rusak), tambahkan `force` — user diblokir modal
  yang tidak bisa ditutup sampai memperbarui: `npm run release force "Perbaikan kritis X"`.
  Pakai seperlunya; tanpa `force` user dapat kartu yang bisa ditutup dan tombol di
  Pengaturan → Lanjutan → Pembaruan Aplikasi.
- **Jangan** panggil `scripts/build-ota.js` dengan argumen versi — script itu baca `package.json` sendiri.
- **Jangan** hardcode versi di komponen; pakai `__APP_VERSION__` (di-inject vite dari `package.json`).

## Cara update sampai ke user

PWA dan APK memakai **jalur deteksi yang sama**: keduanya membaca `/ota/version.json` dan
membandingkannya dengan versi yang sedang berjalan. Cek dijalankan tiga kali — saat app dibuka,
saat kembali ke foreground, dan tiap 15 menit selama app terbuka — supaya update muncul sendiri
tanpa user perlu refresh atau hapus cache. UI-nya satu komponen: `src/components/UpdaterAlert.jsx`
(modal blokir kalau `is_forced`, kartu yang bisa ditutup kalau tidak), plus tombol di
Pengaturan → Lanjutan.

| Target | Cara memasang | Progress |
|---|---|---|
| PWA / browser | `location.reload()` — index.html di-serve NetworkFirst, jadi selalu dapat HTML + chunk terbaru | instan, tidak ada unduhan besar |
| APK Android | Capgo mengunduh bundle `.zip` lalu `CapacitorUpdater.set()` | progress bar %, bundle ~48 MB |

### Jembatan `update_0118.zip` — jangan dihapus

Bundle **bawaan APK** yang terpasang sekarang adalah kode lama yang cuma membaca Firestore
`lomeal_settings/ota_update`, dan dokumen itu menunjuk permanen ke `update_0118.zip`.
Bundle itu aktif lagi setiap user menghapus data aplikasi atau install ulang APK.

Karena itu `scripts/build-ota.js` selalu menerbitkan ulang `update_0118.zip` berisi build
**terbaru**. Kalau file itu hilang, Firebase Hosting melayani `index.html` (kena rewrite SPA)
dengan status 200, Capgo gagal meng-unzip, dan user dapat pesan "periksa koneksi internet"
padahal koneksinya normal. Ini sudah pernah terjadi dua kali.

Baru boleh dihapus setelah APK di-build ulang dan disebarkan dengan bundle bawaan versi baru.

**Jangan pernah memasukkan `index.html` ke precache service worker.** Workbox memetakan `/` ke
entri precache `index.html`, jadi kalau ikut ter-precache, reload sesudah update tetap menyajikan
aplikasi versi lama — inilah yang dulu memaksa user hapus data/cache. Lihat `globIgnores` dan
`navigateFallback: null` di `vite.config.js`.

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
