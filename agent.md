# 🤖 Lomeal Agent Guidelines & Quality Protocol (`agent.md` / `AGENTS.md`)

Panduan untuk Developer dan AI Assistant saat mengembangkan dan memodifikasi **Lomeal App**.

---

## 1. Aturan Anti-Redundansi Visual & Copywriting
1. **Dilarang Redundansi Ikon & Emoji**:
   - ❌ DILARANG keras menaruh ikon berdampingan dengan emoji pada label makanan atau tombol (misal: `[Icon Utensils] 🍽️ Catat Makan`). Gunakan HANYA satu representasi visual.
   - ❌ DILARANG menaruh emoji hiasan tanpa fungsi di atas judul modal.
2. **Copywriting Manusiawi, Ringkas & To-the-Point**:
   - Judul modal maksimal 1–3 kata (misal: *Catat Makanan*, *Buat Resep*, *Scan Label*).
   - Hindari penjelasan panjang berbelit-belit (*fluff*).
   - Tombol aksi tegas dan lugas: *Simpan*, *Update*, *Batal*, *Hapus*.

---

## 2. Integritas Data & Proteksi Log Makanan
1. **Pencegahan Data Hilang / Tertimpa**:
   - Struktur makanan harian di-key berdasarkan YMD (`YYYY-MM-DD`) dan sesi makan (`breakfast`, `lunch`, `dinner`, `snack`).
   - Penambahan makanan baru wajib melalui mekanisme append, tidak boleh menimpa item yang sudah dicatat sebelumnya pada sesi yang sama.
2. **Single Source of Truth Kalori & Makronutrien**:
   - Nilai nutrisi wajib direkonsiliasi menggunakan `reconcileKcal` dan di-clamp pada batas wajar `MAX_PLAUSIBLE`.
   - Angka TDEE dan metabolisme harian merujuk ke data gabungan biometrik + aktivitas nyata (Logym / Health Connect), dilarang mengarang perhitungan parsial.

---

## 3. Integritas AI Coach Lomy & Vision Analyzer
1. **No Hallucination**: AI DILARANG mengarang makanan yang tidak tampak pada foto atau tidak disebut dalam input pengguna. Jika foto buram atau tidak yakin, beri flag `lowConfidence: true`.
2. **Kejujuran Data**: Jika ditanya hal di luar makanan dan nutrisi (misal resep obat, diagnosis medis), nyatakan dengan jujur dan tolak secara profesional.
3. **Efisiensi Token**: Pertahankan output strictly JSON tanpa markdown block pada mode ekstraksi/parsing, dan ringkas pada sesi chatting.
