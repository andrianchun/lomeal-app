// Cek cepat inti perhitungan gizi. Jalanin: node src/data/nutrition.selfcheck.mjs
// Tanpa framework — nutrition.js nol impor, jadi bisa jalan di node polos.
import assert from 'node:assert/strict';
import { EMPTY_NUTRITION, addNutrition, scaleNutrition, computeDayTotals, reconcileKcal, nutritionForAmount } from './nutrition.js';

// ---------- addNutrition ----------
const a = { ...EMPTY_NUTRITION, kcal: 100, protein: 10 };
assert.equal(addNutrition(a, { kcal: 50, protein: 5 }).kcal, 150);
assert.equal(addNutrition(a, { kcal: 50 }, 2).kcal, 200, 'factor harus mengali operan kedua');
assert.equal(addNutrition(a, null).kcal, 100, 'operan null gak boleh bikin NaN');
assert.equal(addNutrition(a, { kcal: 'bukan angka' }).kcal, 100, 'nilai non-numerik dianggap 0');
assert.equal(addNutrition(a, { kcal: 50 }).protein, 10, 'kunci yang gak disebut tetap utuh');

// ---------- scaleNutrition ----------
assert.equal(scaleNutrition({ kcal: 200 }, 0.5).kcal, 100);
assert.equal(scaleNutrition({ kcal: 200 }, 0).kcal, 0);
assert.equal(scaleNutrition({}, 2).kcal, 0, 'nutrisi kosong → 0, bukan NaN');
assert.equal(scaleNutrition(null, 2).protein, 0);

// ---------- reconcileKcal (Atwater 4/4/9) ----------
// Label kemasan yang baris "Energi"-nya kelewat kebaca: kcal 0 padahal makronya terisi.
const missing = reconcileKcal({ kcal: 0, protein: 10, carbs: 20, fat: 5 });
assert.equal(missing.nutrition.kcal, 165, '(10*4)+(20*4)+(5*9) = 165');
assert.equal(missing.suspect, false, 'dihitung dari makro, bukan tebakan ragu');

// kcal wajar dibanding makronya → dibiarkan, gak ditandai.
const ok = reconcileKcal({ kcal: 160, protein: 10, carbs: 20, fat: 5 });
assert.equal(ok.nutrition.kcal, 160, 'angka yang masuk akal gak boleh ditimpa');
assert.equal(ok.suspect, false);

// kcal meleset jauh → angkanya TETAP dipertahankan, cuma ditandai.
const wild = reconcileKcal({ kcal: 600, protein: 10, carbs: 20, fat: 5 });
assert.equal(wild.nutrition.kcal, 600, 'jangan diam-diam nimpa angka user/AI');
assert.equal(wild.suspect, true);

// Tanpa makro sama sekali (mis. minuman nol kalori) gak ada yang bisa disimpulkan.
assert.equal(reconcileKcal({ kcal: 0 }).nutrition.kcal, 0);
assert.equal(reconcileKcal({ kcal: 0 }).suspect, false);
assert.equal(reconcileKcal(null).suspect, false, 'input null gak boleh bikin lempar error');

// ---------- computeDayTotals ----------
const entry = (kcal, extra = {}) => ({ id: `e${kcal}`, nutrition: { ...EMPTY_NUTRITION, kcal }, ...extra });

assert.deepEqual(computeDayTotals(null), EMPTY_NUTRITION, 'hari kosong → EMPTY_NUTRITION');
assert.deepEqual(computeDayTotals({ meals: {} }), EMPTY_NUTRITION);

assert.equal(computeDayTotals({ meals: { pagi: [entry(100), entry(50)] } }).kcal, 150);

// hiddenSessions = slot sesi kosong yang disembunyikan, BUKAN "buang makanannya".
// Sesi yang pernah dihapus lalu diisi lagi wajib ikut kehitung.
assert.equal(
  computeDayTotals({ meals: { pagi: [entry(100)], siang: [entry(500)] }, hiddenSessions: ['siang'] }).kcal,
  600,
  'sesi hidden yang ADA ISINYA tetap dihitung',
);
assert.equal(
  computeDayTotals({ meals: { pagi: [entry(100)], siang: [] }, hiddenSessions: ['siang'] }).kcal,
  100,
  'sesi hidden yang kosong gak nambah apa-apa',
);

// isEaten:false = direncanakan tapi belum dimakan.
assert.equal(computeDayTotals({ meals: { pagi: [entry(100, { isEaten: false })] } }).kcal, 0);
assert.equal(computeDayTotals({ meals: { pagi: [entry(100, { isEaten: true })] } }).kcal, 100);

// Meal prep default BELUM dimakan walaupun defaultEaten true.
assert.equal(computeDayTotals({ meals: { pagi: [entry(100, { isMealPrep: true })] } }).kcal, 0);
assert.equal(computeDayTotals({ meals: { pagi: [entry(100, { source: 'recipe' })] } }).kcal, 0);
// ...tapi kalau user centang sudah dimakan, tetap dihitung.
assert.equal(computeDayTotals({ meals: { pagi: [entry(100, { isMealPrep: true, isEaten: true })] } }).kcal, 100);

// defaultEaten=false dipakai buat tanggal masa depan (rencana, bukan riwayat).
assert.equal(computeDayTotals({ meals: { pagi: [entry(100)] } }, false).kcal, 0);

// ---------- penskalaan takaran saji (bug label OCR) ----------
const per100 = { kcal: 500, protein: 10, vitB12: 0.1 };

// Snack takaran 35 g dengan label 500 kkal/100 g = 175 kkal, BUKAN 500.
assert.equal(nutritionForAmount({ nutrition: per100 }, 35).kcal, 175);
// Susu 250 ml dengan 61 kkal/100 ml = 152,5 kkal, bukan 61.
assert.equal(nutritionForAmount({ nutrition: { kcal: 61 } }, 250).kcal, 152.5);
// Takaran 100 = apa adanya.
assert.equal(nutritionForAmount({ nutrition: per100 }, 100).kcal, 500);
// Nutrien skala mcg gak boleh amblas jadi 0 di porsi kecil (dulu dibulatkan ke 0,1).
assert.equal(nutritionForAmount({ nutrition: per100 }, 30).vitB12, 0.03);

console.log('nutrition OK');
