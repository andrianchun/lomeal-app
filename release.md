# Rilis Lomeal

```bash
npm run release                              # 0.3.4 -> 0.3.5
npm run release minor                        # 0.3.4 -> 0.4.0
npm run release force "Perbaikan kritis di…" # update WAJIB, user diblokir sampai memperbarui
```

Argumen bebas urutan: `patch|minor|major`, kata `force`, dan teks catatan rilis (satu argumen,
pakai tanda kutip — kalimat lengkap, bukan satu kata; teks ini yang muncul di kartu update user).

## Yang dikerjakan `scripts/release.js`

1. `npm version` — bump `package.json`. Satu-satunya sumber versi.
2. `npm run build:ota` — build + zip `dist/ota/update_<versi>.zip` + `version.json`.
3. Hapus `.firebase/` — cache unggah ini pernah bikin seluruh `/ota/**` raib dari hosting, dan
   gejalanya menipu: deploy bilang sukses, tapi updater tidak pernah muncul di HP.
4. `firebase deploy --only hosting`.
5. `git add -A` + commit + push.

Karena langkah 5 memakai `git add -A`, **semua perubahan yang belum ter-commit ikut masuk ke commit
rilis** — termasuk yang sedang setengah jalan. Cek `git status` dulu kalau sedang ada eksperimen.

## Kapan perlu APK, kapan cukup OTA

Cukup OTA untuk perubahan `src/**` dan `public/**`. Butuh APK baru kalau menyentuh `android/**`,
`capacitor.config.json`, atau menambah plugin Capacitor.

## Verifikasi sesudah rilis

```bash
curl -s "https://lomeal.web.app/ota/version.json?t=$(date +%s)"
```

Versinya harus yang baru, dan `ota_url` harus balas 200 `application/zip` — kalau `text/html`,
file OTA-nya kena rewrite SPA dan update di APK gagal diam-diam.

## Batas dengan Domus & Darka — baca sebelum menyentuh `domusSync.js`

Lomeal satu project Firebase dengan Domus dan Darka (`hexa-life`), dan
`src/utils/domusSync.js` **baca-tulis koleksi `domus_items` yang sama persis** — bukan salinan.
Konsekuensinya saat rilis:

- Perubahan di `domusSync.js` mengubah data yang dipakai Domus. Kalau menambah/mengubah field,
  cocokkan dengan `domus-app/src/lib/items.js` dan `stock.js`; ambang `status`
  ('Penuh'/'Setengah'/'Habis') **harus sama persis** dengan `statusFromRatio` di sana.
- Menulis stok Domus wajib ikut memperbarui field turunannya (`quantity`, `status`), bukan hanya
  `qtyValue` — kalau tidak, Domus menampilkan status basi. Lihat `deductDomusItemQuantity`
  (pakai `runTransaction`, bukan `increment`, supaya bisa menghitung turunannya).
- Inbox Lomeal (`subscribeInbox`) membaca `darka_shared_items` milik Darka. Item dengan
  `previousStatus === 'claimed'` berarti notanya dikoreksi di Darka sesudah pernah diproses;
  entri food log yang sudah tercatat **sengaja tidak diubah** — user cuma diberi tanda, karena
  angka gizi hari lampau tidak boleh bergerak sendiri.
