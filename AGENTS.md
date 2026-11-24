# LOMEAL — Panduan Agen & Teknis (`AGENTS.md`)

Mengacu penuh pada konstitusi global [`E:\CODING\AGENTS.md`](file:///e:/CODING/AGENTS.md).

- **Ringkasan Aplikasi:** Pelacak nutrisi, kalori, makro/mikro, resep AI, dan sinkronisasi metabolik (Lomeal App).
- **Tech Stack:** React 18 + Vite + Tailwind CSS v3 + Capacitor + Firebase (`hexa-life`, hosting target `lomeal`, Cloud Functions v1 `lomealAiChat`/`lomealAiVision`/`lomealTrendCatcher` `codebase: "lomeal"`).
- **Rules & Indexes Terpusat:** Master `firestore.rules`, `firestore.indexes.json`, dan `storage.rules` untuk `hexa-life` dikelola **eksklusif dari [`E:\CODING\hexa-life\`](file:///e:/CODING/hexa-life)** — jangan menambah `"firestore"`/`"storage"` ke `firebase.json` lokal.
- **Integritas Data & Sinkronisasi Lintas-App:**
  - Log makanan harian berbasis `YYYY-MM-DD` & sesi (`breakfast`, `lunch`, `dinner`, `snack`) wajib append-safe (anti-timpa).
  - Kalori/makro wajib melewati `reconcileKcal` dan clamp `MAX_PLAUSIBLE`.
  - Kontrak `domusSync.js`: membaca/menulis `domus_items` memakai `runTransaction` dengan menjaga `quantity`, `qtyValue`, dan `status` identik dengan `domus-app`. Item `darka_shared_items` dengan `previousStatus === 'claimed'` memberi peringatan tanpa memodifikasi food log masa lalu.
- **Jembatan OTA Wajib (`update_0118.zip`):** **DILARANG** menghapus pembuatan `update_0118.zip` di `scripts/build-ota.js` selama APK lama masih aktif; `notifyAppReady()` pakai timer 7s + `RootErrorBoundary` rollback protection.
- **AI Domain Lock (Coach Lomy & Vision):** Terkunci khusus pada makanan, bahan pangan, kalori, nutrisi, dan resep sehat. Tolak topik non-nutrisi (diagnosis medis/obat), dilarang mengarang makanan tak terlihat (`lowConfidence: true`), output parser JSON ketat.
- **Perintah Baku:** `npm run dev`, `npm run build`, `npm run build:ota`, `npm run sync:android`.
- **Dokumen Terkait:** [`design.md`](./design.md), [`SCHEMA.md`](./SCHEMA.md), [`PROGRESS.md`](./PROGRESS.md), [`releaseprotocol.md`](./releaseprotocol.md), [`OTA-TEMPLATE.md`](./OTA-TEMPLATE.md).
