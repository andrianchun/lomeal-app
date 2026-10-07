// Cek cepat konversi satuan. Jalanin: node src/utils/urtMapping.selfcheck.mjs
// Sengaja tanpa framework — file ini murni, gak nyentuh firebase/vite.
import assert from 'node:assert/strict';
import { calculateGramsFromURT, normalizeUnit, entryUnit, isLiquidUnit, getItemUnitWeight } from './urtMapping.js';

// Konversi URT → gram/ml
assert.equal(calculateGramsFromURT(1, 'gelas'), 200);
assert.equal(calculateGramsFromURT(2, 'sdm'), 30);
assert.equal(calculateGramsFromURT(1.5, 'centong'), 150);
assert.equal(calculateGramsFromURT(250, 'ml'), 250);
assert.equal(calculateGramsFromURT(1, 'gls'), 200, 'singkatan harus dinormalisasi dulu');
assert.equal(calculateGramsFromURT(1, 'entahapa'), null, 'satuan asing → null biar pakai porsi bawaan');

assert.equal(normalizeUnit('GR'), 'g');
assert.equal(normalizeUnit(''), '');

// Bug yang dilaporkan: "matcha latte 1 gelas" kecatat sebagai gram, dan mL-nya 0.
assert.equal(entryUnit('gelas'), 'ml');
assert.equal(entryUnit('cangkir'), 'ml');
assert.equal(entryUnit('botol'), 'ml');
assert.equal(entryUnit('g', true), 'ml', 'ditandai minuman → mL walau satuannya bukan cairan');
assert.equal(entryUnit('potong'), 'g');
assert.equal(entryUnit(''), 'g');
assert.equal(entryUnit(undefined), 'g', 'AI kadang gak ngasih unit sama sekali');

// Satuan rumah tangga TIDAK boleh bocor jadi satuan entri ("200 gelas").
for (const u of ['gelas', 'centong', 'potong', 'porsi', 'butir']) {
  assert.ok(['g', 'ml'].includes(entryUnit(u)), `${u} harus jadi g/ml`);
}

assert.equal(isLiquidUnit('kaleng'), true);
assert.equal(isLiquidUnit('piring'), false);

// Smart unit weights: 1 porsi nasi = 200g, bukan baseGrams 100g atau 1g
assert.equal(getItemUnitWeight({ name: 'Nasi Putih', baseGrams: 100 }, 'porsi'), 200);
assert.equal(getItemUnitWeight({ name: 'Nasi Putih', baseGrams: 1 }, 'porsi'), 200);
assert.equal(getItemUnitWeight({ name: 'Nasi Putih' }, 'porsi'), 200);
assert.equal(getItemUnitWeight({ name: 'Nasi Putih' }, 'centong'), 100);
assert.equal(getItemUnitWeight({ name: 'Nasi Putih' }, 'g'), 1);
assert.equal(getItemUnitWeight({ name: 'Nasi Putih' }, 'ml'), 1);

// Resep / meal prep tetap menggunakan baseGrams
assert.equal(getItemUnitWeight({ name: 'Sop Ayam', recipeId: 'r1', baseGrams: 350 }, 'porsi'), 350);
assert.equal(getItemUnitWeight({ name: 'Meal Prep', isMealPrep: true, baseGrams: 280 }, 'porsi'), 280);

// Makanan dengan porsi spesifik di portion.label
assert.equal(getItemUnitWeight({ name: 'Nasi Uduk', portion: { label: '1 porsi (150g)', grams: 150 } }, 'porsi'), 150);
assert.equal(getItemUnitWeight({ name: 'Telur Ayam', portion: { label: '1 butir (55g)', grams: 55 } }, 'butir'), 55);

// Quick input parsing
const { parseQuickInput } = await import('./urtMapping.js');
assert.deepEqual(parseQuickInput('pisang'), { term: 'pisang', qty: 1, unit: null, explicitGrams: null });
assert.deepEqual(parseQuickInput('2 pisang'), { term: 'pisang', qty: 2, unit: null, explicitGrams: null });
assert.deepEqual(parseQuickInput('2 buah pisang'), { term: 'pisang', qty: 2, unit: 'buah', explicitGrams: null });
assert.deepEqual(parseQuickInput('pisang 2 buah'), { term: 'pisang', qty: 2, unit: 'buah', explicitGrams: null });
assert.deepEqual(parseQuickInput('pisang 2'), { term: 'pisang', qty: 2, unit: null, explicitGrams: null });
assert.deepEqual(parseQuickInput('150g pisang'), { term: 'pisang', qty: 1, unit: 'g', explicitGrams: 150 });
assert.deepEqual(parseQuickInput('pisang 150g'), { term: 'pisang', qty: 1, unit: 'g', explicitGrams: 150 });
assert.deepEqual(parseQuickInput('sebuah pisang'), { term: 'pisang', qty: 1, unit: 'buah', explicitGrams: null });
assert.deepEqual(parseQuickInput('nasi, pisang'), { term: 'pisang', qty: 1, unit: null, explicitGrams: null });

console.log('urtMapping OK');

