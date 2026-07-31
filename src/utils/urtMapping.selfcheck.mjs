// Cek cepat konversi satuan. Jalanin: node src/utils/urtMapping.selfcheck.mjs
// Sengaja tanpa framework — file ini murni, gak nyentuh firebase/vite.
import assert from 'node:assert/strict';
import { calculateGramsFromURT, normalizeUnit, entryUnit, isLiquidUnit } from './urtMapping.js';

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

console.log('urtMapping OK');
