// node src/utils/recipeStock.test.js
import assert from 'node:assert/strict';
import { blockingShortages, formatShortfall, ingredientAvailability, matchDomusItem, shortfallInItemUnit } from './recipeStock.js';

const telur = { id: 't', name: 'Telur', qtyValue: 1, qtyUnit: 'butir' };   // 1 butir = 50 g
const beras = { id: 'b', name: 'Beras', qtyValue: 2, qtyUnit: 'kg' };
const garam = { id: 'g', name: 'Garam', qtyValue: null, qtyUnit: '' };     // gak diangkain
const pack = { id: 'p', name: 'Mie Instan', qtyValue: 3, qtyUnit: 'pack' }; // satuan tanpa berat pasti

const resep = (ingredients) => ({ ingredients });
const rowsOf = (ings, items, factor = 1) => ingredientAvailability(resep(ings), factor, items);

// --- pencocokan nama ---
assert.equal(matchDomusItem([telur], 'telur')?.id, 't', 'beda huruf besar-kecil tetap cocok');
assert.equal(matchDomusItem([telur], 'Telur Ayam'), null, 'bahan lebih spesifik dari barangnya -> jangan asal cocok');
assert.equal(matchDomusItem([{ id: 'x', name: 'Telur Ayam Negeri' }], 'Telur Ayam')?.id, 'x',
  'semua kata bahan ada di nama barang');
assert.equal(matchDomusItem([{ id: 'a', name: 'Ayam' }], 'Kaldu Ayam'), null,
  'item "Ayam" gak boleh mencocoki bahan "Kaldu Ayam"');
assert.equal(matchDomusItem([], 'Telur'), null);

// --- cukup / kurang ---
// butuh 5 telur (250 g), punya 1 butir (50 g)
let rows = rowsOf([{ name: 'Telur', grams: 250 }], [telur]);
assert.equal(rows[0].needed, 250);
assert.equal(rows[0].have, 50);
assert.equal(rows[0].enough, false);
assert.equal(rows[0].shortfall, 200);
assert.equal(blockingShortages(rows).length, 1, 'stok keukur & kurang -> menghalangi masak');

// porsi dilipatduakan -> kebutuhannya ikut naik
assert.equal(rowsOf([{ name: 'Beras', grams: 500 }], [beras], 2)[0].needed, 1000);
assert.equal(rowsOf([{ name: 'Beras', grams: 500 }], [beras], 2)[0].enough, true, '2 kg cukup buat 1000 g');

// --- yang TIDAK boleh menghalangi ---
rows = rowsOf([{ name: 'Garam', grams: 5 }], [garam]);
assert.equal(rows[0].have, null, 'barang tanpa angka = gak keukur, bukan nol');
assert.equal(rows[0].enough, true);
assert.equal(blockingShortages(rows).length, 0, 'stok gak keukur jangan ngeblok masak');

rows = rowsOf([{ name: 'Mie Instan', grams: 200 }], [pack]);
assert.equal(rows[0].have, null, '"pack" gak punya berat pasti -> gak keukur');
assert.equal(blockingShortages(rows).length, 0);

rows = rowsOf([{ name: 'Kunyit', grams: 10 }], [telur]);
assert.equal(rows[0].match, null, 'bahan yang belum pernah dicatat');
assert.equal(rows[0].enough, false, 'tetap ditandai buat disaranin belanja');
assert.equal(blockingShortages(rows).length, 0, 'tapi JANGAN ngeblok — belum kecatat != dapur kosong');

// --- kekurangan dinyatakan dalam satuan barangnya ---
rows = rowsOf([{ name: 'Telur', grams: 250 }], [telur]);
assert.deepEqual(shortfallInItemUnit(rows[0]), { value: 4, unit: 'butir' }, '200 g / 50 g = 4 butir');
assert.equal(formatShortfall(rows[0]), 'Telur kurang 4 butir');

rows = rowsOf([{ name: 'Beras', grams: 2500 }], [beras]);
assert.deepEqual(shortfallInItemUnit(rows[0]), { value: 0.5, unit: 'kg' });

// `unitGrams` khusus produk ngalahin tabel rata-rata (telur besar 60 g)
rows = rowsOf([{ name: 'Telur', grams: 250 }], [{ ...telur, unitGrams: 60 }]);
assert.equal(rows[0].have, 60, 'punyanya 1 butir x 60 g');
assert.equal(shortfallInItemUnit(rows[0]).value, Math.ceil((190 / 60) * 100) / 100);

// resep kosong bukan error
assert.deepEqual(ingredientAvailability(null, 1, [telur]), []);
assert.deepEqual(ingredientAvailability({}, 1, [telur]), []);

console.log('recipeStock.test.js OK');
