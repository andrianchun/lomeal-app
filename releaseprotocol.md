# Lomeal App Release Protocol (`releaseprotocol.md`)

Mengacu pada [`E:\CODING\.agent\skills\release-protocol\SKILL.md`](file:///e:/CODING/.agent/skills/release-protocol/SKILL.md).

## 1. Aturan Mutlak Rilis (Anti-Gagal)
1. **`package.json` adalah Single Source of Truth versi.** `__APP_VERSION__` di-inject saat build.
2. **`dist/ota/version.json` hanya dihasilkan oleh `npm run build:ota`.** Jangan pernah membuat `public/ota/version.json`.
3. **JANGAN HAPUS Jembatan `update_0118.zip`:** `scripts/build-ota.js` selalu menerbitkan ulang `update_0118.zip` berisi build terbaru agar APK lama tidak menerima HTML 200.
4. **Dilarang Precache `index.html`:** Workbox mengecualikan `index.html` (`navigateFallback: null`).
5. **Master Rules di `E:\CODING\hexa-life\`:** `lomeal-app/scripts/release.js` **hanya** men-deploy `hosting` (`target: lomeal`). Jangan deploy `firestore`/`storage` rules dari folder ini.
6. **Kontrak Lintas-App (`domus_items` & `darka_shared_items`):** Pastikan kompatibel dengan `domus-app` & `darka-app`.

## 2. Perintah Rilis
```bash
npm run release "Catatan pembaruan fitur atau perbaikan"
npm run release minor "Fitur besar baru"
npm run release force "Perbaikan kritis nutrisi atau sinkronisasi"
npm run release force apk "Pembaruan native APK Lomeal"
```

## 3. Verifikasi Rilis
- Jalankan `npm run build` dan `node --check functions/index.js` sebelum merilis.
- Verifikasi `https://lomeal.web.app/ota/version.json` mengembalikan versi terbaru dan `ota_url` ber-header `application/zip`.
- Perbarui kartu Lomeal di [`E:\CODING\hexaverse-app\public\index.html`](file:///e:/CODING/hexaverse-app/public/index.html) lalu deploy hosting Hexaverse.
