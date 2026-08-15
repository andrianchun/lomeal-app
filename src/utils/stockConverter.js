import { normalizeUnit, URT_DICTIONARY } from './urtMapping';

// Parsing string jumlah gaya lama: "1 kg", "500g", "2.5 liter", "1/2 panci", "5 buah".
// Masih dipakai buat item Domus yang dibuat sebelum ada `qtyValue`/`qtyUnit`.
export function parseQuantityString(str) {
  if (!str) return null;

  let cleanStr = str.trim().toLowerCase();
  cleanStr = cleanStr.replace(/(\d+)\/(\d+)/g, (m, n, d) => (Number(n) / Number(d)).toString());

  const match = cleanStr.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;

  const val = Number(match[1]);
  if (isNaN(val)) return null;

  return { value: val, unit: match[2].trim(), originalStr: str };
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

  const unitNorm = normalizeUnit(stock.unit);
  let value = stock.value;

  if (['g', 'ml'].includes(unitNorm)) {
    value -= deductedGrams;
  } else if (['kg', 'l', 'liter'].includes(unitNorm)) {
    value -= deductedGrams / 1000;
  } else {
    const unitWeight = URT_DICTIONARY[unitNorm];
    if (!unitWeight || unitWeight <= 0) return { ok: false };
    value -= deductedGrams / unitWeight;
  }

  if (value <= 0) return { ok: true, value: 0, unit: stock.unit, depleted: true };
  return { ok: true, value: Number(Math.round(value + 'e2') + 'e-2'), unit: stock.unit, depleted: false };
}

/** Berapa gram/ml stok yang tersedia — null kalau satuannya tak bisa dikonversi. */
export function stockInGrams(item) {
  const stock = itemStock(item);
  if (!stock) return null;
  const unitNorm = normalizeUnit(stock.unit);
  if (['g', 'ml'].includes(unitNorm)) return stock.value;
  if (['kg', 'l', 'liter'].includes(unitNorm)) return stock.value * 1000;
  const unitWeight = URT_DICTIONARY[unitNorm];
  return unitWeight > 0 ? stock.value * unitWeight : null;
}
