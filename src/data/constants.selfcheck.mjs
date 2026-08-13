// Cek cepat helper resep. Jalanin: node src/data/constants.selfcheck.mjs
// Sengaja tanpa framework — file ini murni, gak nyentuh firebase/vite.
import assert from 'node:assert/strict';
import { heroForRecipe, formatDuration, formatClock } from './constants.js';

// Foto yang diunggah user selalu menang atas tebakan bahan.
assert.equal(heroForRecipe({ name: 'Nasi Goreng', photoUrl: 'https://x/y.webp' }), 'https://x/y.webp');

// Tebakan dari nama resep — satu kata kunci, tanpa saingan.
assert.equal(heroForRecipe({ name: 'Salmon Teriyaki' }), '/bg-recipe-salmon.webp');
assert.equal(heroForRecipe({ name: 'Pepes Ikan Kembung' }), '/bg-recipe-salmon.webp', 'ikan apa pun pakai foto salmon');
assert.equal(heroForRecipe({ name: 'Udang Saus Padang' }), '/bg-recipe-seafood.webp');
assert.equal(heroForRecipe({ name: 'Cumi Cabe Garam' }), '/bg-recipe-seafood.webp');
assert.equal(heroForRecipe({ name: 'Rendang Sapi' }), '/bg-recipe-beef.webp');
assert.equal(heroForRecipe({ name: 'Ayam Bakar Bumbu Rujak' }), '/bg-recipe-chicken.webp');
assert.equal(heroForRecipe({ name: 'Telur Balado' }), '/bg-recipe-egg.webp');
assert.equal(heroForRecipe({ name: 'Orek Tempe Kering' }), '/bg-recipe-tempe.webp');
assert.equal(heroForRecipe({ name: 'Tumis Jamur Tiram' }), '/bg-recipe-default.webp', 'jamur sengaja tanpa foto sendiri');
assert.equal(heroForRecipe({ name: 'Smoothie Susu Pisang' }), '/bg-recipe-milk.webp');
assert.equal(heroForRecipe({ name: 'Nasi Uduk' }), '/bg-recipe-rice.webp');
assert.equal(heroForRecipe({ name: 'Gado-gado' }), '/bg-recipe-salad.webp');
assert.equal(heroForRecipe({ name: 'Soto Betawi' }), '/bg-recipe-default.webp');

// --- TABRAKAN: beberapa kata kunci sekaligus, format hidangan menang di dalam nama ---
assert.equal(heroForRecipe({ name: 'Mie Ayam Jamur' }), '/bg-recipe-noodle.webp', 'mie ayam = piring mie');
assert.equal(heroForRecipe({ name: 'Nasi Goreng Ayam' }), '/bg-recipe-rice.webp', 'nasi goreng = piring nasi');
assert.equal(heroForRecipe({ name: 'Nasi Goreng Seafood' }), '/bg-recipe-rice.webp');
// Sesama lauk: yang lebih dulu di daftar menang (ayam di atas telur).
assert.equal(heroForRecipe({ name: 'Ayam Telur Balado' }), '/bg-recipe-chicken.webp');
assert.equal(heroForRecipe({ name: 'Telur Dadar Tempe' }), '/bg-recipe-egg.webp');
// "daging ayam" jangan sampai kebaca sapi.
assert.equal(heroForRecipe({ name: 'Semur Daging Ayam' }), '/bg-recipe-chicken.webp');

// Nama gak ngasih petunjuk → baru bahan yang discan.
assert.equal(heroForRecipe({ name: 'Menu Sehat Senin', ingredients: [{ name: 'Fillet Salmon' }] }), '/bg-recipe-salmon.webp');
assert.equal(heroForRecipe({ name: 'Bekal Kantor', ingredients: [{ name: 'Dada ayam' }, { name: 'Telur rebus' }] }), '/bg-recipe-chicken.webp');
// Nama sudah menang duluan — bahan gak boleh menimpanya.
assert.equal(heroForRecipe({ name: 'Rendang', ingredients: [{ name: 'Dada ayam' }] }), '/bg-recipe-beef.webp');
// Bahan yang gak punya foto sendiri (jamur, dll) jatuh ke default.
assert.equal(heroForRecipe({ name: 'Sup Bening', ingredients: [{ name: 'Jamur kuping' }] }), '/bg-recipe-default.webp');
assert.equal(heroForRecipe({ name: 'Menu Sehat Senin' }), '/bg-recipe-default.webp');
assert.equal(heroForRecipe(null), '/bg-recipe-default.webp', 'resep kosong gak boleh bikin crash');

assert.equal(formatDuration(45), '45m');
assert.equal(formatDuration(60), '1j');
assert.equal(formatDuration(75), '1j 15m');
assert.equal(formatDuration(0), '—');
assert.equal(formatDuration(undefined), '—', 'resep lama belum punya durationMin');

assert.equal(formatClock(0), '00:00');
assert.equal(formatClock(65), '01:05');
assert.equal(formatClock(3600), '60:00');
assert.equal(formatClock(-5), '00:00', 'timer lewat waktu jangan tampil minus');

console.log('constants.selfcheck OK');
