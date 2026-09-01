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
  botol: 350,
  kaleng: 330,
  cup: 250,
};

// Satuan yang isinya cairan. Dipakai buat nentuin entri log ditulis dalam mL atau gram —
// bukan buat konversi (konversinya tetap lewat URT_DICTIONARY di atas).
const LIQUID_UNITS = new Set(['ml', 'gelas', 'cangkir', 'botol', 'kaleng', 'cup', 'teko']);
export const isLiquidUnit = (unitStr) => LIQUID_UNITS.has(normalizeUnit(unitStr));

// Satuan yang BOLEH nempel di entri log cuma 'g' atau 'ml' — angkanya kan berat/volume total.
// Satuan rumah tangga (gelas, centong, potong) itu cuma buat NGURAI input, dan sudah
// dikonversi jadi gram di URT_DICTIONARY. Kalau ikut kesimpan, log-nya jadi "200 gelas".
export const entryUnit = (householdUnit, isDrink = false) =>
  (isDrink || isLiquidUnit(householdUnit)) ? 'ml' : 'g';

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
  gram: 'g',
  // Ejaan yang muncul di nota belanja (dibaca Darka dari struk) — dipetakan ke satuan di
  // domus-app/src/lib/items.js#UNITS supaya Domus, Darka, dan Lomeal ngomongin satuan yang sama.
  kilo: 'kg',
  kilogram: 'kg',
  kgs: 'kg',
  ltr: 'l',
  psg: 'pasang',
  meter: 'm',
  mtr: 'm',
  liter: 'l',
  litre: 'l',
  mili: 'ml',
  mililiter: 'ml',
  pcs: 'buah',
  pc: 'buah',
  pieces: 'buah',
  pak: 'pack',
  btl: 'botol',
  klg: 'kaleng',
  tab: 'tablet',
  tbl: 'tablet',
  kps: 'kapsul',
  kap: 'kapsul',
  cap: 'kapsul',
  capsule: 'kapsul',
  sch: 'sachet',
  sct: 'sachet',
  str: 'strip',
  stp: 'strip',
  bx: 'box',
  dus: 'box',
  kotak: 'box',
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

export const getItemUnitWeight = (item, unitName) => {
  const norm = normalizeUnit(unitName);
  if (norm === 'g' || norm === 'ml') return 1;

  if (norm === 'porsi') {
    if (item?.perPortionGrams && Number(item.perPortionGrams) > 0) {
      return Number(item.perPortionGrams);
    }
    if (item?.servingGrams && Number(item.servingGrams) > 0) {
      return Number(item.servingGrams);
    }
    if (item?.baseGrams && Number(item.baseGrams) > 0) {
      return Number(item.baseGrams);
    }
  }

  if (item?.servingUnit && normalizeUnit(item.servingUnit) === norm && Number(item.servingGrams) > 0) {
    return Number(item.servingGrams);
  }

  return URT_DICTIONARY[norm] || 1;
};

export const UNIT_OPTIONS = [
  'g', 'ml', 'porsi', 'potong', 'centong', 'sdm', 'sdt', 'butir', 'buah',
  'mangkok', 'piring', 'gelas', 'cangkir', 'botol', 'kaleng', 'cup',
  'bungkus', 'iris', 'lembar', 'tusuk', 'ekor', 'biji', 'kepal', 'genggam', 'batang', 'siung'
];


