# Lomeal — Design System & UI/UX Guidelines

Dokumen ini adalah aturan baku desain UI/UX untuk aplikasi Lomeal. **Wajib dipatuhi oleh developer dan agent AI pada setiap perubahan UI.**

---

## 1. Aturan Tipografi & Token Teks (STRICT)

Aplikasi Lomeal menggunakan **3 tingkat ukuran teks baku** berbasis `rem` (agar otomatis mengikuti setelan font size perangkat pengguna / accessibility):

| Token | Kelas CSS / Tailwind | Ukuran Baku | Penggunaan |
|---|---|---|---|
| **Judul Layar** | `.h1` / `text-2xl` | `2.0625rem` (33px), font-heading (Sora), bold | Judul halaman utama / header besar |
| **Judul Kartu / Modal** | `.h2` / `text-md` | `1.3125rem` (21px), font-heading (Sora), bold | Judul modal, judul kartu utama, tombol CTA besar |
| **Sub-Judul / Label Seksi** | `.h3` / `text-sm` | `1rem` (16px), uppercase, bold, tracking-wider | Header seksi (`uppercase tracking-wider`) |
| **Teks Isi / Angka** | `.body-md` / `text-sm` | `1rem` (16px), font-sans (Inter), bold/normal | Nilai angka, deskripsi item, teks input |
| **Label / Keterangan / Meta** | `.caption` / `text-sm` | `1rem` (16px), font-sans (Inter), leading-tight | Label field, meta info, counter karakter |

### ⛔ DILARANG KERAS:
- **JANGAN PERNAH** menggunakan ukuran font arbitrer seperti `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`. Ukuran kustom ini mematikan penskalaan font HP pengguna.
- Gunakan token `.caption`, `.body-md`, `.h3`, `.h2`, atau `.h1`.

---

## 2. Larangan "Kotak di dalam Kotak" (NO Nested Cards / Anti-Pattern)

Desain UI modern Lomeal menganut prinsip **Single-Surface Hierarchy**:

### ❌ SALAH (Kotak di dalam Kotak):
- Menaruh border card di dalam border card lain untuk setiap data.

### ✅ BENAR (Single Surface Flat Grid / Divider):
- Gunakan **satu kartu berlatar** dengan pembagian kolom grid dan garis pemisah halus (`border-t border-black/5 dark:border-white/10`).
- Jangan membungkus setiap pasangan label-nilai ke dalam kartu mini persegi ber-border di dalam kartu induk.

---

## 3. Penamaan Fitur & Copywriting yang Manusiawi

- **Jelas dan Ringkas**: Hindari kata-kata berlebihan (*fluff*) seperti *"Lomy akan menyesuaikan konsep rasa..."*.
- **Gunakan Penamaan Sederhana**:
  - `Buat Resep` (bukan istilah berlebihan).
  - `Resep Manual`.
  - `Konsep Masakan (Opsional)`.
  - `Bahan yang Tersedia`.
- **Bebas Ikon AI yang Ramai**:
  - Jangan menaruh ikon bintang/sparkle AI (`Sparkles`, bot icon) di tombol-tombol utama atau header modal. Antarmuka harus bersih, fungsional, dan tidak mengganggu.

---

## 4. Multi-Select Bahan Makanan

- Form pembuatan resep harus menyediakan multi-select bahan makanan yang tersedia (mengintegrasikan stok Domus, database pangan, dan input bebas pengguna).
- Bahan yang dipilih ditampilkan dalam bentuk *pill/chip* yang bisa dihapus dengan satu ketukan.

---

## 5. Palet Warna Resmi (`src/theme.js` & `src/styles/tokens.css`)
- **Tema Utama:** Modern Fresh Glassmorphism (`Sora` untuk heading `.h1`/`.h2`, `Inter` untuk teks isi; lantai font **16px / `1rem`**).
- **Aksen Brand:** Forest Emerald Green (`#22c55e` / `#15803d`), status nutrisi lampu lalu lintas (`#22c55e` aman, `#eab308` mendekati batas 85%, `#f87171` melebihi batas / aksi destruktif rose `#f43f5e`).
- **Dark vs Light:** Dark Mode `#070a08` dengan gradien radial hijau lembut + kartu kaca solid `#0f1d16`; Light Mode latar putih bersih dengan gradien hijau halus + kartu `#FFFFFF`.
- **Komponen Baku & UpdaterAlert:** Token dikunci di [`src/styles/tokens.css`](./src/styles/tokens.css) serta `<Button>` (`src/components/ui/Button.jsx`) & `<Dialog>` (`src/components/ui/Dialog.jsx`). `UpdaterAlert` memakai layout Solid Bottom Sheet `logym.app` bertema hijau Lomeal.
- **Audit Layout Otomatis (Dark/Light, HP/PC, & i18n):** Verifikasi kontras di kedua mode, nol overflow di HP (~375px) & PC (~1440px), dan pastikan setiap perubahan terjemahan di `src/i18n.js` konsisten tanpa teks gado-gado ID/EN.
