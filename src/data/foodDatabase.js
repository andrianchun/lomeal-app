// ============================================================
// DATABASE PANGAN BAWAAN LOMEAL (seed offline)
// Sumber utama nilai gizi: TKPI — Tabel Komposisi Pangan Indonesia
// (Kemenkes RI / panganku.org), dilengkapi USDA FDC untuk bahan
// yang tidak tercakup, dan estimasi purin dari tabel klinis umum.
// Semua nilai per 100 g (atau per 100 ml untuk minuman, unit: 'ml').
// `portion` = ukuran rumah tangga (URT) default untuk 1x klik log.
// ============================================================

import { TKPI_DB, formatTKPI } from './tkpi';

const F = (id, name, category, portionLabel, portionGrams, n, opts = {}) => ({
  id, name, category,
  unit: opts.unit || 'g',
  isDrink: !!opts.isDrink,
  portion: { label: portionLabel, grams: portionGrams },
  nutrition: {
    kcal: n[0], protein: n[1], carbs: n[2], fat: n[3],
    sodium: n[4], sugar: n[5], cholesterol: n[6], satFat: n[7],
    iron: n[8], calcium: n[9], purine: n[10] || 0,
    fiber: n[11] || 0, kalium: n[12] || 0, fosfor: n[13] || 0, zinc: n[14] || 0,
    tembaga: n[15] || 0, magnesium: n[16] || 0, vitA: n[17] || 0, vitB1: n[18] || 0,
    vitB2: n[19] || 0, vitB3: n[20] || 0, vitB6: n[21] || 0, vitB9: n[22] || 0,
    vitB12: n[23] || 0, vitC: n[24] || 0, vitD: n[25] || 0, vitE: n[26] || 0, vitK: n[27] || 0,
  },
  source: opts.source || 'TKPI',
});

export const FOOD_CATEGORIES = [
  { id: 'staple',  label: 'Makanan Pokok', emoji: '🍚' },
  { id: 'protein', label: 'Lauk Pauk',     emoji: '🍗' },
  { id: 'veggie',  label: 'Sayuran',       emoji: '🥬' },
  { id: 'fruit',   label: 'Buah',          emoji: '🍌' },
  { id: 'dish',    label: 'Masakan Jadi',  emoji: '🍛' },
  { id: 'snack',   label: 'Jajanan',       emoji: '🍢' },
  { id: 'drink',   label: 'Minuman',       emoji: '🥤' },
  { id: 'packaged',label: 'Kemasan',       emoji: '🛒' },
];

//                                                    kcal  prot  carb  fat  sodium sugar chol satFat iron  calc  purine
const OLD_FOOD_DB = [
  // ---------- MAKANAN POKOK ----------
  F('nasi-putih',      'Nasi Putih',            'staple', '1 centong (100g)', 100, [ 180,  3.0, 39.8,  0.3,    1,  0.1,   0,  0.1, 0.2,   25,  10]),
  F('nasi-merah',      'Nasi Merah',            'staple', '1 centong (100g)', 100, [ 149,  2.8, 32.5,  0.4,    2,  0.3,   0,  0.1, 0.8,   12,  10]),
  F('nasi-uduk',       'Nasi Uduk',             'staple', '1 porsi (150g)',   150, [ 195,  3.5, 32.0,  6.0,  180,  0.3,   0,  4.2, 0.5,   30,  10]),
  F('nasi-goreng',     'Nasi Goreng',           'staple', '1 piring (250g)',  250, [ 168,  4.5, 22.0,  7.0,  420,  1.5,  35,  1.8, 1.0,   30,  25]),
  F('lontong',         'Lontong / Ketupat',     'staple', '1 buah (150g)',    150, [ 108,  2.0, 24.0,  0.2,    2,  0.1,   0,  0.1, 0.2,   10,   8]),
  F('bubur-ayam',      'Bubur Ayam',            'staple', '1 mangkok (350g)', 350, [  90,  3.5, 12.5,  2.8,  350,  0.5,  15,  0.8, 0.5,   15,  30]),
  F('mie-instan',      'Mie Instan (matang)',   'staple', '1 bungkus (200g)', 200, [ 219,  4.5, 29.0,  9.5,  860,  1.8,   0,  4.5, 1.2,   20,  15]),
  F('mie-telur',       'Mie Telur (matang)',    'staple', '1 porsi (150g)',   150, [ 138,  4.5, 25.0,  2.0,   10,  0.5,  20,  0.5, 1.0,   15,  20]),
  F('bihun',           'Bihun (matang)',        'staple', '1 porsi (100g)',   100, [ 110,  0.9, 25.0,  0.1,    5,  0.1,   0,  0.0, 0.3,    5,   5]),
  F('roti-tawar',      'Roti Tawar',            'staple', '1 lembar (35g)',    35, [ 248,  8.0, 50.0,  1.2,  430,  5.0,   0,  0.5, 1.5,   20,  15]),
  F('kentang-rebus',   'Kentang Rebus',         'staple', '1 buah sedang (100g)', 100, [ 87, 1.9, 20.1, 0.1,   4,  0.9,   0,  0.0, 0.3,    5,  15]),
  F('singkong-rebus',  'Singkong Rebus',        'staple', '1 potong (100g)',  100, [ 154,  1.0, 36.8,  0.3,   14,  1.7,   0,  0.1, 0.7,   33,  10]),
  F('ubi-jalar',       'Ubi Jalar Rebus',       'staple', '1 buah (135g)',    135, [  86,  1.6, 20.1,  0.1,   55,  4.2,   0,  0.0, 0.6,   30,  10]),
  F('jagung-rebus',    'Jagung Manis Rebus',    'staple', '1 tongkol (125g)', 125, [  96,  3.4, 20.9,  1.5,   15,  4.5,   0,  0.2, 0.5,    2,  25]),
  F('oatmeal',         'Oatmeal (masak)',       'staple', '1 mangkok (240g)', 240, [  71,  2.5, 12.0,  1.5,    4,  0.3,   0,  0.3, 0.9,   10,  25], { source: 'USDA' }),
  F('nasi-kuning',     'Nasi Kuning',           'staple', '1 porsi (150g)',   150, [ 175,  3.2, 30.5,  4.5,  200,  0.3,   0,  3.2, 0.5,   25,  10]),

  // ---------- LAUK PAUK ----------
  F('ayam-dada',       'Dada Ayam (tanpa kulit, matang)', 'protein', '1 potong (100g)', 100, [ 165, 31.0,  0.0,  3.6,   74,  0.0,  85,  1.0, 1.0,   15, 140], { source: 'USDA' }),
  F('ayam-paha',       'Paha Ayam (dengan kulit, matang)','protein', '1 potong (100g)', 100, [ 232, 23.3,  0.0, 15.5,   87,  0.0,  98,  4.2, 1.3,   12, 140], { source: 'USDA' }),
  F('ayam-goreng',     'Ayam Goreng',           'protein', '1 potong (100g)',  100, [ 260, 21.9,  6.5, 16.0,  350,  0.5,  89,  4.5, 1.4,   20, 140]),
  F('telur-rebus',     'Telur Ayam Rebus',      'protein', '1 butir (55g)',     55, [ 155, 12.6,  1.1, 10.6,  124,  1.1, 373,  3.3, 1.2,   50,   5]),
  F('telur-goreng',    'Telur Ceplok / Dadar',  'protein', '1 butir (60g)',     60, [ 196, 13.6,  0.9, 15.3,  207,  0.4, 401,  4.3, 1.9,   62,   5]),
  F('tempe-goreng',    'Tempe Goreng',          'protein', '1 potong (50g)',    50, [ 225, 17.0,  9.0, 15.0,   10,  0.5,   0,  2.5, 2.3,  120, 100]),
  F('tempe-mentah',    'Tempe (mentah)',        'protein', '1 papan kecil (100g)', 100, [ 201, 20.8, 13.5,  8.8,    9,  0.5,   0,  1.8, 4.0,  155, 100]),
  F('tahu-goreng',     'Tahu Goreng',           'protein', '1 potong (50g)',    50, [ 115,  9.7,  2.5,  8.5,   15,  0.3,   0,  1.3, 1.2,  223,  60]),
  F('tahu-putih',      'Tahu Putih (mentah)',   'protein', '1 potong (100g)',  100, [  80, 10.9,  0.8,  4.7,    2,  0.3,   0,  0.7, 3.4,  223,  60]),
  F('ikan-lele',       'Ikan Lele Goreng',      'protein', '1 ekor (100g)',    100, [ 204, 18.0,  8.0, 11.0,  180,  0.0,  60,  2.5, 1.0,   60, 150]),
  F('ikan-nila',       'Ikan Nila / Mujair (matang)', 'protein', '1 ekor (100g)', 100, [ 128, 26.2,  0.0,  2.7,   56,  0.0,  57,  0.9, 0.7,   14, 150], { source: 'USDA' }),
  F('ikan-tongkol',    'Ikan Tongkol (matang)', 'protein', '1 potong (100g)',  100, [ 111, 24.0,  0.0,  1.0,   50,  0.0,  46,  0.3, 1.3,   30, 250]),
  F('ikan-teri',       'Ikan Teri Goreng',      'protein', '2 sdm (20g)',       20, [ 330, 33.4,  8.0, 18.0,  850,  0.0,  90,  4.0, 3.7,  976, 300]),
  F('udang',           'Udang Rebus',           'protein', '5 ekor sedang (75g)', 75, [  99, 20.9,  0.2,  1.1,  111,  0.0, 189,  0.3, 0.5,   70, 180], { source: 'USDA' }),
  F('cumi',            'Cumi-cumi (matang)',    'protein', '1 porsi (100g)',   100, [  92, 15.6,  3.1,  1.4,   44,  0.0, 233,  0.4, 0.7,   32, 135], { source: 'USDA' }),
  F('daging-sapi',     'Daging Sapi (matang, tanpa lemak)', 'protein', '1 potong (100g)', 100, [ 217, 26.1,  0.0, 11.8,   60,  0.0,  90,  4.7, 2.9,   11, 120], { source: 'USDA' }),
  F('bakso-sapi',      'Bakso Sapi',            'protein', '5 butir (100g)',   100, [ 190, 10.3, 15.0, 10.0,  680,  1.0,  30,  4.0, 1.5,   30,  80]),
  F('sosis',           'Sosis Ayam/Sapi',       'protein', '1 buah (35g)',      35, [ 270, 12.0,  8.0, 21.0,  820,  2.0,  60,  8.0, 1.0,   20,  60], { source: 'USDA' }),
  F('nugget',          'Nugget Ayam',           'protein', '3 potong (60g)',    60, [ 296, 14.0, 18.0, 19.0,  540,  1.0,  40,  4.0, 0.9,   15,  70], { source: 'USDA' }),
  F('hati-ayam',       'Hati Ayam (matang)',    'protein', '1 buah (45g)',      45, [ 167, 24.5,  0.9,  6.5,   76,  0.0, 564,  2.1, 11.6,  11, 310]),
  F('telur-puyuh',     'Telur Puyuh Rebus',     'protein', '5 butir (45g)',     45, [ 158, 13.1,  0.4, 11.1,  141,  0.4, 844,  3.6, 3.7,   64,   5]),

  // ---------- SAYURAN ----------
  F('bayam',           'Bayam (rebus/bening)',  'veggie', '1 mangkok (100g)',  100, [  23,  2.9,  3.6,  0.4,   79,  0.4,   0,  0.1, 2.7,   99,  55]),
  F('kangkung-tumis',  'Tumis Kangkung',        'veggie', '1 porsi (100g)',    100, [  70,  3.0,  5.5,  4.5,  380,  1.5,   0,  0.7, 2.3,   73,  50]),
  F('brokoli',         'Brokoli (rebus)',       'veggie', '1 mangkok (100g)',  100, [  35,  2.4,  7.2,  0.4,   41,  1.4,   0,  0.1, 0.7,   40,  70]),
  F('wortel',          'Wortel (rebus)',        'veggie', '1 buah (60g)',       60, [  35,  0.8,  8.2,  0.2,   58,  3.5,   0,  0.0, 0.3,   30,  10]),
  F('capcay',          'Capcay Kuah',           'veggie', '1 porsi (200g)',    200, [  68,  3.5,  7.0,  3.0,  420,  2.5,  20,  0.6, 1.0,   40,  40]),
  F('sayur-asem',      'Sayur Asem',            'veggie', '1 mangkok (200g)',  200, [  40,  1.5,  7.5,  0.6,  350,  3.0,   0,  0.1, 0.8,   40,  30]),
  F('sayur-lodeh',     'Sayur Lodeh',           'veggie', '1 mangkok (200g)',  200, [  75,  2.2,  6.5,  4.8,  380,  2.0,   0,  3.4, 1.0,   50,  35]),
  F('urap',            'Urap Sayur',            'veggie', '1 porsi (100g)',    100, [ 105,  3.5,  8.0,  7.0,  280,  2.0,   0,  4.8, 1.5,   80,  40]),
  F('timun',           'Timun Segar',           'veggie', '1 buah (100g)',     100, [  15,  0.7,  3.6,  0.1,    2,  1.7,   0,  0.0, 0.3,   16,   7]),
  F('selada',          'Selada / Lalapan',      'veggie', '1 porsi (50g)',      50, [  15,  1.4,  2.9,  0.2,   28,  0.8,   0,  0.0, 0.9,   36,  15]),

  // ---------- BUAH ----------
  F('pisang',          'Pisang',                'fruit', '1 buah (100g)',      100, [  89,  1.1, 22.8,  0.3,    1, 12.2,   0,  0.1, 0.3,    5,  10]),
  F('apel',            'Apel',                  'fruit', '1 buah (150g)',      150, [  52,  0.3, 13.8,  0.2,    1, 10.4,   0,  0.0, 0.1,    6,   5, 2.4, 107, 11, 0.04, 0.03, 5, 3, 0.02, 0.03, 0.09, 0.04, 3, 0, 4.6, 0, 0.18, 2.2]),
  F('pepaya',          'Pepaya',                'fruit', '1 potong (100g)',    100, [  43,  0.5, 10.8,  0.3,    8,  7.8,   0,  0.1, 0.3,   20,   5]),
  F('mangga',          'Mangga',                'fruit', '1 buah (200g)',      200, [  60,  0.8, 15.0,  0.4,    1, 13.7,   0,  0.1, 0.2,   11,   5]),
  F('semangka',        'Semangka',              'fruit', '1 potong (150g)',    150, [  30,  0.6,  7.6,  0.2,    1,  6.2,   0,  0.0, 0.2,    7,   5]),
  F('jeruk',           'Jeruk Manis',           'fruit', '1 buah (130g)',      130, [  47,  0.9, 11.8,  0.1,    0,  9.4,   0,  0.0, 0.1,   40,   5]),
  F('alpukat',         'Alpukat',               'fruit', '1/2 buah (100g)',    100, [ 160,  2.0,  8.5, 14.7,    7,  0.7,   0,  2.1, 0.6,   12,  20]),
  F('durian',          'Durian',                'fruit', '3 biji (100g)',      100, [ 147,  1.5, 27.1,  5.3,    2, 20.0,   0,  1.5, 0.4,    6,  15]),
  F('anggur',          'Anggur',                'fruit', '10 butir (100g)',    100, [  69,  0.7, 18.1,  0.2,    2, 15.5,   0,  0.1, 0.4,   10,   8]),
  F('nanas',           'Nanas',                 'fruit', '1 potong (100g)',    100, [  50,  0.5, 13.1,  0.1,    1,  9.9,   0,  0.0, 0.3,   13,   5]),

  // ---------- MASAKAN JADI ----------
  F('rendang',         'Rendang Sapi',          'dish', '1 potong (75g)',       75, [ 285, 22.0,  6.0, 20.0,  480,  2.5,  75, 10.5, 3.0,   80, 120]),
  F('gulai-ayam',      'Gulai Ayam',            'dish', '1 potong + kuah (150g)', 150, [ 165, 14.0,  4.0, 10.5,  420,  1.5,  60,  6.0, 1.5,   40, 110]),
  F('opor-ayam',       'Opor Ayam',             'dish', '1 potong + kuah (150g)', 150, [ 163, 13.5,  4.0, 10.5,  380,  1.8,  58,  6.2, 1.3,   40, 110]),
  F('soto-ayam',       'Soto Ayam (tanpa nasi)', 'dish', '1 mangkok (300g)',   300, [  55,  4.5,  3.5,  2.5,  330,  0.8,  20,  0.8, 0.6,   20,  50]),
  F('rawon',           'Rawon (tanpa nasi)',    'dish', '1 mangkok (300g)',    300, [  72,  6.0,  3.0,  4.0,  380,  0.8,  25,  1.6, 1.2,   25,  70]),
  F('sate-ayam',       'Sate Ayam + Bumbu Kacang', 'dish', '5 tusuk (100g)',   100, [ 225, 18.5,  8.0, 13.0,  420,  4.0,  70,  3.5, 1.8,   40, 130]),
  F('pecel',           'Pecel Sayur',           'dish', '1 porsi (150g)',      150, [ 120,  5.0, 12.0,  6.0,  320,  4.5,   0,  1.2, 1.8,   80,  45]),
  F('gado-gado',       'Gado-gado',             'dish', '1 porsi (300g)',      300, [ 137,  6.1, 12.0,  7.5,  380,  4.0,  35,  1.8, 1.7,   80,  50]),
  F('ketoprak',        'Ketoprak',              'dish', '1 porsi (300g)',      300, [ 153,  5.5, 18.0,  6.5,  420,  3.5,  40,  1.5, 1.5,   60,  45]),
  F('mie-ayam',        'Mie Ayam',              'dish', '1 mangkok (300g)',    300, [ 141,  6.5, 18.0,  5.0,  520,  1.0,  25,  1.4, 1.0,   20,  60]),
  F('nasi-padang-ayam','Nasi Padang (ayam + sayur)', 'dish', '1 porsi (400g)', 400, [ 180,  8.0, 22.0,  7.0,  400,  1.0,  45,  3.5, 1.2,   30,  70]),
  F('ikan-bakar',      'Ikan Bakar + Kecap',    'dish', '1 ekor (150g)',       150, [ 126, 21.0,  3.0,  3.5,  380,  2.5,  55,  0.9, 1.0,   40, 180]),
  F('semur-telur',     'Semur Telur',           'dish', '1 butir + kuah (80g)', 80, [ 155, 10.0,  6.0, 10.0,  350,  4.0, 280,  3.0, 1.5,   50,   5]),
  F('sop-ayam',        'Sop Ayam Sayuran',      'dish', '1 mangkok (300g)',    300, [  48,  3.5,  4.0,  2.0,  310,  1.2,  15,  0.6, 0.5,   25,  40]),

  // ---------- JAJANAN ----------
  F('bakwan',          'Bakwan / Bala-bala',    'snack', '1 buah (50g)',        50, [ 280,  4.5, 30.0, 15.5,  350,  1.0,   5,  6.5, 1.0,   40,  20]),
  F('tempe-mendoan',   'Tempe Mendoan',         'snack', '1 buah (50g)',        50, [ 210, 10.0, 16.0, 12.0,  280,  0.5,   0,  5.0, 1.8,   90,  80]),
  F('pisang-goreng',   'Pisang Goreng',         'snack', '1 buah (60g)',        60, [ 252,  1.5, 36.0, 11.0,  120,  14.0,  0,  5.0, 0.5,   15,   8]),
  F('risoles',         'Risoles',               'snack', '1 buah (50g)',        50, [ 247,  5.0, 27.0, 13.0,  310,  2.5,  35,  5.5, 0.8,   30,  25]),
  F('martabak-manis',  'Martabak Manis',        'snack', '1 potong (100g)',    100, [ 350,  6.5, 46.0, 15.5,  260, 22.0,  45,  8.0, 1.0,   90,  15]),
  F('martabak-telur',  'Martabak Telur',        'snack', '1 potong (100g)',    100, [ 280, 10.0, 20.0, 18.0,  480,  1.5, 110,  7.0, 1.5,   50,  50]),
  F('donat',           'Donat Gula',            'snack', '1 buah (60g)',        60, [ 421,  6.4, 50.0, 22.0,  330, 18.0,  20, 10.0, 1.2,   40,  10], { source: 'USDA' }),
  F('siomay',          'Siomay + Bumbu Kacang', 'snack', '1 porsi (200g)',     200, [ 162,  8.5, 15.0,  7.5,  480,  3.0,  40,  2.0, 1.2,   50,  90]),
  F('batagor',         'Batagor',               'snack', '1 porsi (200g)',     200, [ 219,  8.0, 20.0, 12.0,  520,  3.0,  45,  3.5, 1.2,   50,  90]),
  F('cilok',           'Cilok + Saus',          'snack', '10 butir (100g)',    100, [ 165,  2.5, 32.0,  3.0,  450,  2.0,   5,  1.2, 0.5,   15,  15]),
  F('kerupuk',         'Kerupuk Putih',         'snack', '2 keping (15g)',      15, [ 477,  1.5, 65.0, 22.0,  850,  0.5,   0,  9.5, 0.5,   20,  10]),
  F('emping',          'Emping Melinjo',        'snack', '1 genggam (20g)',     20, [ 505, 11.0, 60.0, 25.0,  620,  1.0,   0, 10.0, 3.5,  100, 500]),
  F('lemper',          'Lemper Ayam',           'snack', '1 buah (70g)',        70, [ 220,  6.0, 35.0,  6.0,  280,  1.5,  20,  3.2, 0.7,   15,  30]),
  F('klepon',          'Klepon',                'snack', '3 buah (60g)',        60, [ 220,  2.0, 45.0,  3.5,   80, 22.0,   0,  2.8, 0.8,   30,   5]),

  // ---------- MINUMAN (per 100 ml) ----------
  F('air-putih',       'Air Putih',             'drink', '1 gelas (250ml)',    250, [   0,  0.0,  0.0,  0.0,    0,  0.0,   0,  0.0, 0.0,    0,   0], { unit: 'ml', isDrink: true }),
  F('teh-manis',       'Teh Manis',             'drink', '1 gelas (250ml)',    250, [  30,  0.0,  7.8,  0.0,    2,  7.6,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true }),
  F('teh-tawar',       'Teh Tawar',             'drink', '1 gelas (250ml)',    250, [   1,  0.0,  0.2,  0.0,    2,  0.0,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true }),
  F('kopi-hitam',      'Kopi Hitam Tanpa Gula', 'drink', '1 cangkir (200ml)',  200, [   2,  0.1,  0.4,  0.0,    2,  0.0,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true }),
  F('kopi-susu-gula-aren', 'Es Kopi Susu Gula Aren', 'drink', '1 cup (250ml)', 250, [  70,  1.2,  11.0,  2.4,   25, 10.0,   8,  1.5, 0.1,   40,   0], { unit: 'ml', isDrink: true }),
  F('susu-uht',        'Susu UHT Full Cream',   'drink', '1 kotak (250ml)',    250, [  61,  3.2,  4.8,  3.3,   44,  4.8,  10,  2.1, 0.0,  113,   0], { unit: 'ml', isDrink: true }),
  F('susu-kental-manis','Susu Kental Manis',    'drink', '2 sdm (40g)',         40, [ 321,  7.9, 55.0,  8.7,  127, 54.0,  28,  5.5, 0.2,  284,   0], { unit: 'ml', isDrink: true }),
  F('es-jeruk',        'Es Jeruk Manis',        'drink', '1 gelas (250ml)',    250, [  40,  0.3,  9.8,  0.1,    2,  9.0,   0,  0.0, 0.1,   10,   0], { unit: 'ml', isDrink: true }),
  F('jus-alpukat',     'Jus Alpukat + SKM',     'drink', '1 gelas (300ml)',    300, [  95,  1.3,  9.5,  6.0,   25,  8.0,   3,  1.5, 0.3,   30,   5], { unit: 'ml', isDrink: true }),
  F('es-teh-boba',     'Milk Tea Boba',         'drink', '1 cup (350ml)',      350, [  75,  0.8, 15.5,  1.4,   25, 12.0,   3,  1.0, 0.1,   20,   0], { unit: 'ml', isDrink: true }),
  F('soda',            'Minuman Bersoda',       'drink', '1 kaleng (330ml)',   330, [  42,  0.0, 10.6,  0.0,    4, 10.6,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true, source: 'USDA' }),
  F('air-kelapa',      'Air Kelapa Muda',       'drink', '1 gelas (250ml)',    250, [  19,  0.7,  3.7,  0.2,  105,  2.6,   0,  0.2, 0.3,   24,   0], { unit: 'ml', isDrink: true }),
  F('teh-kemasan',     'Teh Kemasan Botol',     'drink', '1 botol (350ml)',    350, [  36,  0.0,  8.9,  0.0,    8,  8.6,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true }),
  F('minuman-isotonik','Minuman Isotonik',      'drink', '1 botol (500ml)',    500, [  26,  0.0,  6.4,  0.0,   49,  6.2,   0,  0.0, 0.0,    2,   0], { unit: 'ml', isDrink: true }),
  F('santan',          'Santan Kelapa',         'drink', '1/4 gelas (60ml)',    60, [ 230,  2.3,  5.5, 23.8,   15,  3.3,   0, 21.1, 1.6,   16,   0], { unit: 'ml', isDrink: true }),

  // ---------- KEMASAN ----------
  F('biskuit',         'Biskuit Marie',         'packaged', '3 keping (24g)',    24, [ 458,  6.9, 75.1, 14.4,  350, 22.0,   5,  7.0, 1.8,   62,   5]),
  F('keripik-kentang', 'Keripik Kentang Kemasan', 'packaged', '1 bungkus kecil (35g)', 35, [ 536,  7.0, 53.0, 34.0,  525,  0.5,   0, 11.0, 1.2,   24,  15], { source: 'USDA' }),
  F('coklat-batang',   'Coklat Susu Batang',    'packaged', '4 kotak (25g)',     25, [ 535,  7.7, 59.0, 30.0,   79, 52.0,  23, 18.5, 2.4,  189,   5], { source: 'USDA' }),
  F('es-krim',         'Es Krim Vanila',        'packaged', '1 scoop (66g)',     66, [ 207,  3.5, 23.6, 11.0,   80, 21.2,  44,  6.8, 0.1,  128,   5], { source: 'USDA' }),
  F('yogurt',          'Yogurt Plain',          'packaged', '1 cup (125g)',     125, [  61,  3.5,  4.7,  3.3,   46,  4.7,  13,  2.1, 0.1,  121,   0], { source: 'USDA' }),
  F('granola-bar',     'Granola / Energy Bar',  'packaged', '1 bar (30g)',       30, [ 471,  8.0, 64.0, 20.0,  250, 29.0,   0,  4.0, 2.5,   60,  10], { source: 'USDA' }),
  F('wafer',           'Wafer Coklat',          'packaged', '1 bungkus (20g)',   20, [ 520,  5.0, 62.0, 28.0,  120, 38.0,   5, 15.0, 1.5,   50,   5]),
  F('kacang-goreng',   'Kacang Tanah Goreng',   'packaged', '1 genggam (30g)',   30, [ 585, 26.9, 21.3, 49.6,  410,  4.9,   0,  6.9, 2.3,   58,  80]),
  F('roti-coklat',     'Roti Isi Coklat',       'packaged', '1 buah (70g)',      70, [ 330,  7.0, 52.0, 10.5,  280, 18.0,  15,  5.0, 1.5,   40,  10]),
  F('sereal',          'Sereal Jagung',         'packaged', '1 mangkok (30g)',   30, [ 380,  6.0, 84.0,  1.5,  660,  9.0,   0,  0.5, 12.0,  20,  10], { source: 'USDA' }),
];

// Menggabungkan data lama (yang kurang detail) dengan TKPI_DB baru yang kaya vitamin
// Item di TKPI_DB akan menimpa item lama jika ID-nya sama.
const oldFiltered = OLD_FOOD_DB.filter(oldItem => !TKPI_DB.find(newF => newF[0] === oldItem.id));
export const FOOD_DB = [...formatTKPI(TKPI_DB), ...oldFiltered];

export const searchFoods = (term, customFoods = []) => {
  const q = (term || '').toLowerCase().trim();
  const all = [...customFoods, ...FOOD_DB];
  if (!q) return all;
  return all.filter(f => f.name.toLowerCase().includes(q));
};

export const getFoodById = (id, customFoods = []) =>
  customFoods.find(f => f.id === id) || FOOD_DB.find(f => f.id === id) || null;

// Nutrisi aktual untuk `grams` gram/ml dari sebuah entri makanan (nilai DB per 100)
export const nutritionForAmount = (food, grams) => {
  const factor = (Number(grams) || 0) / 100;
  const out = {};
  Object.entries(food.nutrition).forEach(([k, v]) => { out[k] = Math.round(v * factor * 10) / 10; });
  return out;
};

// ─── API FETCH: OpenFoodFacts ──────────────────────────────────────
export const fetchOpenFoodFacts = async (query) => {
  // DINONAKTIFKAN SESUAI PERMINTAAN USER DEMI KECEPATAN (OFFLINE FIRST)
  // Tidak lagi menggunakan OpenFoodFacts karena lambat dan data mikronya kosong.
  return [];
};
