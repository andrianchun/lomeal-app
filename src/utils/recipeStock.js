// src/utils/recipeStock.js — "bahannya cukup gak buat masak?", murni tanpa Firestore biar bisa
// dites langsung: `node src/utils/recipeStock.test.js`.
//
// Dipisah dari domusSync.js (yang narik firebase) karena hitungannya dipakai DI DUA TEMPAT dan
// dua-duanya wajib sepakat: layar resep yang nampilin daftar bahan, dan gerbang tombol masak.
// Kalau salah satunya nyalin hitungannya sendiri, cepat atau lambat tombolnya bilang "boleh"
// sementara daftarnya bilang "kurang".
import { stockInGrams, unitToGrams } from './stockConverter.js';

const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Cocokkan nama bahan resep ke item inventaris Domus.
 *
 * Bertingkat: nama sama persis dulu, baru semua kata bahan harus ada di nama item.
 * Saling-mengandung (versi lama) bikin item "Ayam" mencocoki bahan "Kaldu Ayam", lalu bahan itu
 * ditandai tersedia dan hilang dari daftar belanja padahal kaldunya tidak pernah ada.
 * ponytail: belum ada kamus sinonim ("santan" ≠ "kelapa parut"); tambahkan kalau sering meleset.
 */
export function matchDomusItem(domusItems, name) {
  if (!domusItems?.length || !name) return null;
  const n = norm(name);
  if (!n) return null;

  const exact = domusItems.find((di) => norm(di.name) === n);
  if (exact) return exact;

  const words = n.split(' ');
  return domusItems.find((di) => {
    const dn = norm(di.name);
    return dn && words.every((w) => dn.split(' ').includes(w));
  }) || null;
}

/**
 * Satu baris per bahan: butuh berapa gram, punya berapa, cukup atau nggak.
 *
 * `have == null` artinya jumlahnya TIDAK KEUKUR (barangnya gak diangkain, atau satuannya gak bisa
 * dikonversi seperti "1 pack"), BUKAN nol. Bedanya penting: yang gak keukur dianggap cukup —
 * Domus emang gak tau garam di dapur tinggal berapa, dan nebak "habis" dari situ bikin tombol
 * masaknya mati terus tanpa alasan.
 */
export function ingredientAvailability(recipe, factor, domusItems) {
  return (recipe?.ingredients || []).map((ing, i) => {
    const name = ing.rawName || ing.name;
    const needed = Math.round((ing.grams || 0) * factor);
    const match = matchDomusItem(domusItems, name);
    const have = match ? stockInGrams(match) : null;
    const enough = !!match && (have == null || have >= needed);
    return {
      key: `i${i}`,
      name,
      needed,
      match,
      have,
      enough,
      shortfall: have != null ? Math.max(0, needed - have) : 0,
    };
  });
}

/**
 * Bahan yang BENERAN menghalangi masak: ketemu barangnya di Domus, jumlahnya keukur, dan kurang.
 *
 * Yang gak ketemu di Domus sengaja TIDAK memblokir. Barang yang belum pernah dicatat itu bukan
 * bukti dapurnya kosong — cuma bukti belum kecatat, dan ngeblok masak gara-gara itu bikin
 * fiturnya dimatiin orang di hari kedua. Yang gak ketemu tetap muncul sebagai saran belanja.
 */
export const blockingShortages = (rows) =>
  rows.filter((r) => r.match && r.have != null && r.have < r.needed);

/**
 * Kekurangannya dinyatakan dalam SATUAN BARANGNYA, bukan gram. "Telur kurang 4 butir" itu
 * kalimat yang bisa dibawa ke pasar; "kurang 200 g" bikin orang mesti ngitung sendiri.
 * Balik ke gram cuma kalau satuan barangnya gak bisa dikonversi.
 */
export function shortfallInItemUnit(row) {
  const unit = row.match?.qtyUnit || '';
  const perUnit = unitToGrams(unit, row.match);
  if (!perUnit || !unit) return { value: row.shortfall, unit: 'g' };
  // Dibulatkan ke ATAS: kurang 1,2 butir telur artinya beli 2, bukan 1.
  return { value: Math.ceil((row.shortfall / perUnit) * 100) / 100, unit };
}

export const formatShortfall = (row) => {
  const { value, unit } = shortfallInItemUnit(row);
  return `${row.name} kurang ${Math.ceil(value)} ${unit}`.trim();
};
