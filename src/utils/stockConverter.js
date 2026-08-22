// Ekstensi `.js` ditulis eksplisit (beda dari import lain di repo ini) supaya modul ini —
// dan modul murni yang mengimpornya — bisa dijalanin Node langsung buat tes. Vite cuek.
import { normalizeUnit, URT_DICTIONARY } from './urtMapping.js';

// Parsing string jumlah gaya lama: "1 kg", "500g", "2.5 liter", "1/2 panci", "5 buah".
// Dipakai buat item Domus yang dibuat sebelum ada `qtyValue`/`qtyUnit`, DAN buat string jumlah
// mentah yang dikirim Darka — parser struk nyalin apa adanya, termasuk bentuk "x 1" / "2x".
// Kembarannya ada di domus-app/src/lib/stockConverter.js; dua-duanya harus tetap sama.
export function parseQuantityString(str) {
  if (!str) return null;

  let cleanStr = str.trim().toLowerCase();
  cleanStr = cleanStr.replace(/(\d+)\/(\d+)/g, (m, n, d) => (Number(n) / Number(d)).toString());
  // "x 1" / "×1" (kolom "Banyaknya" di struk) -> "1"; "2x" -> "2".
  cleanStr = cleanStr.replace(/^[x×]\s*/, '').replace(/^([\d.]+)\s*[x×](?=\s|$)/, '$1');

  const match = cleanStr.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;

  const val = Number(match[1]);
  if (isNaN(val)) return null;

  // Satuannya dinormalin di sini, bukan dibiarkan mentah: tanpa ini "2 ltr" kesimpen sebagai
  // satuan 'ltr' dan gak nyambung sama 'l' punya Domus.
  return { value: val, unit: normalizeUnit(match[2]), originalStr: str };
}

/** Stok sebuah item Domus sebagai angka. `qtyValue` menang; string lama cuma cadangan. */
export function itemStock(item) {
  if (!item) return null;
  if (typeof item.qtyValue === 'number' && Number.isFinite(item.qtyValue)) {
    return { value: item.qtyValue, unit: item.qtyUnit || '' };
  }
  const parsed = parseQuantityString(item.quantity);
  return parsed ? { value: parsed.value, unit: parsed.unit } : null;
}

export const formatStock = (stock) =>
  stock ? `${Number(Math.round(stock.value + 'e2') + 'e-2')} ${stock.unit || ''}`.trim() : '';

/**
 * Berat 1 satuan dalam gram/ml. null = satuan gak bisa dikonversi ("pack", "secukupnya").
 * Satu-satunya tempat tabel konversi dibaca — sebelumnya logika ini disalin di deductStock DAN
 * stockInGrams, dan yang satu gampang beda kalau yang lain diubah.
 *
 * `item.unitGrams` menang atas tabel umum: URT_DICTIONARY cuma rata-rata kasar (buah = 100 g),
 * padahal "1 pcs kecap = 40 ml" itu spesifik per produk. Sama persis dengan
 * domus-app/src/lib/stockConverter.js — dua app baca dokumen yang sama, hitungannya gak boleh beda.
 */
export function unitToGrams(unit, item = null) {
  const u = normalizeUnit(unit);
  if (item?.unitGrams > 0 && u === normalizeUnit(item.qtyUnit)) {
    if (item.conversionUnit) {
      const targetUnit = normalizeUnit(item.conversionUnit);
      if (['g', 'ml'].includes(targetUnit)) return item.unitGrams;
      if (['kg', 'l', 'liter'].includes(targetUnit)) return item.unitGrams * 1000;
      if (URT_DICTIONARY[targetUnit] > 0) return item.unitGrams * URT_DICTIONARY[targetUnit];
    }
    return item.unitGrams;
  }
  if (['g', 'ml'].includes(u)) return 1;
  if (['kg', 'l', 'liter'].includes(u)) return 1000;
  return URT_DICTIONARY[u] > 0 ? URT_DICTIONARY[u] : null;
}

/**
 * Kurangi stok sebuah item Domus sebanyak `deductedGrams` gram/ml.
 *
 * Mengembalikan `ok: false` kalau jumlahnya tidak bisa dihitung (kosong, satuan tak dikenal
 * seperti "secukupnya"). Itu BEDA dari habis: versi lama mengembalikan `null` untuk keduanya
 * dan pemanggil menganggapnya habis, sehingga bahan tanpa jumlah terhapus setelah sekali masak.
 */
export function deductStock(item, deductedGrams) {
  const stock = itemStock(item);
  if (!stock) return { ok: false };
  if (deductedGrams <= 0) return { ok: true, ...stock, depleted: false };

  const unitWeight = unitToGrams(stock.unit, item);
  if (unitWeight == null) return { ok: false };
  const value = stock.value - deductedGrams / unitWeight;

  if (value <= 0) return { ok: true, value: 0, unit: stock.unit, depleted: true };
  return { ok: true, value: Number(Math.round(value + 'e2') + 'e-2'), unit: stock.unit, depleted: false };
}

/** Berapa gram/ml stok yang tersedia — null kalau satuannya tak bisa dikonversi. */
export function stockInGrams(item) {
  const stock = itemStock(item);
  if (!stock) return null;
  const unitWeight = unitToGrams(stock.unit, item);
  return unitWeight == null ? null : stock.value * unitWeight;
}
