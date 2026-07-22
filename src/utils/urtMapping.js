// Tabel Konversi Satuan URT (Ukuran Rumah Tangga) ke Gram
// Nilai ini merupakan nilai pendekatan/estimasi standar.

export const URT_DICTIONARY = {
  g: 1,
  gram: 1,
  ml: 1,
  centong: 100,
  sdm: 15,
  'sendok makan': 15,
  sdt: 5,
  'sendok teh': 5,
  gelas: 200,
  cangkir: 150,
  potong: 50,
  iris: 30,
  mangkok: 250,
  mangkuk: 250,
  piring: 250,
  porsi: 200,
  bungkus: 100,
  biji: 10,
  buah: 100,
  lembar: 15,
  tusuk: 20,
  ekor: 150,
  butir: 50, // misal telur
  kepal: 100,
  genggam: 50,
  batang: 20,
  siung: 5,
};

// Tabel Sinonim untuk standarisasi input user yang sering salah ketik/disingkat
export const SYNONYMS = {
  gls: 'gelas',
  ptg: 'potong',
  sdk: 'sdm',
  sdok: 'sdm',
  sm: 'sdm',
  st: 'sdt',
  cntg: 'centong',
  pors: 'porsi',
  prs: 'porsi',
  mngkk: 'mangkok',
  bks: 'bungkus',
  btr: 'butir',
  lbr: 'lembar',
  gr: 'g',
  grm: 'g',
};

/**
 * Normalisasi satuan URT yang dimasukkan user
 */
export const normalizeUnit = (unitStr) => {
  if (!unitStr) return '';
  let normalized = unitStr.toLowerCase().trim();
  if (SYNONYMS[normalized]) {
    normalized = SYNONYMS[normalized];
  }
  return normalized;
};

/**
 * Menghitung estimasi berat dalam gram berdasarkan kuantitas dan satuan URT.
 * Jika satuan tidak dikenali, akan mengembalikan null agar sistem bisa menggunakan default food.
 */
export const calculateGramsFromURT = (qty, unit) => {
  const normUnit = normalizeUnit(unit);
  if (normUnit === 'g' || normUnit === 'gram' || normUnit === 'ml') {
    return Number(qty);
  }
  
  if (URT_DICTIONARY[normUnit]) {
    return Number(qty) * URT_DICTIONARY[normUnit];
  }
  
  return null;
};
