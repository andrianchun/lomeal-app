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
  if (!norm || norm === 'g' || norm === 'ml') return 1;

  const isRecipeOrPrep = !!(item?.recipeId || item?.batchId || item?.isMealPrep || item?.source === 'recipe');

  if (norm === 'porsi') {
    if (item?.perPortionGrams && Number(item.perPortionGrams) > 0) {
      return Number(item.perPortionGrams);
    }
    if (isRecipeOrPrep) {
      if (item?.servingGrams && Number(item.servingGrams) > 0) {
        return Number(item.servingGrams);
      }
      if (item?.baseGrams && Number(item.baseGrams) > 0) {
        return Number(item.baseGrams);
      }
    }
    if (item?.servingUnit && normalizeUnit(item.servingUnit) === 'porsi' && Number(item.servingGrams) > 0) {
      return Number(item.servingGrams);
    }
    if (item?.portion?.label && Number(item?.portion?.grams) > 0) {
      if (normalizeUnit(item.portion.label).includes('porsi')) {
        return Number(item.portion.grams);
      }
    }
    return URT_DICTIONARY.porsi || 200;
  }

  if (item?.servingUnit && normalizeUnit(item.servingUnit) === norm && Number(item.servingGrams) > 0) {
    return Number(item.servingGrams);
  }

  if (item?.portion?.label && Number(item?.portion?.grams) > 0) {
    const match = item.portion.label.toLowerCase().match(/1\s+([a-z]+)/);
    if (match && normalizeUnit(match[1]) === norm) {
      return Number(item.portion.grams);
    }
  }

  return URT_DICTIONARY[norm] || 1;
};

export const UNIT_OPTIONS = [
  'g', 'ml', 'porsi', 'potong', 'centong', 'sdm', 'sdt', 'butir', 'buah',
  'mangkok', 'piring', 'gelas', 'cangkir', 'botol', 'kaleng', 'cup',
  'bungkus', 'iris', 'lembar', 'tusuk', 'ekor', 'biji', 'kepal', 'genggam', 'batang', 'siung'
];

const SE_UNITS = {
  sebuah: { qty: 1, unit: 'buah' },
  sebutir: { qty: 1, unit: 'butir' },
  sepotong: { qty: 1, unit: 'potong' },
  sepiring: { qty: 1, unit: 'piring' },
  segelas: { qty: 1, unit: 'gelas' },
  secangkir: { qty: 1, unit: 'cangkir' },
  semangkok: { qty: 1, unit: 'mangkok' },
  semangkuk: { qty: 1, unit: 'mangkok' },
  selembar: { qty: 1, unit: 'lembar' },
  sebungkus: { qty: 1, unit: 'bungkus' },
  sebatang: { qty: 1, unit: 'batang' },
  seekor: { qty: 1, unit: 'ekor' },
  sesendok: { qty: 1, unit: 'sdm' },
  secentong: { qty: 1, unit: 'centong' },
  setongkol: { qty: 1, unit: 'tongkol' },
  sebotol: { qty: 1, unit: 'botol' },
  sekaleng: { qty: 1, unit: 'kaleng' },
  sekeping: { qty: 1, unit: 'keping' },
  seporsi: { qty: 1, unit: 'porsi' },
};

/**
 * Ekstrak kata kunci pencarian makanan dan kuantitas dari input bebas
 * Mendukung variasi seperti: "pisang", "2 pisang", "2 buah pisang", "pisang 2", "150g pisang", "sebuah pisang"
 */
export const parseQuickInput = (input) => {
  if (!input) return { term: '', qty: 1, unit: null, explicitGrams: null };
  const chunks = input.split(/[,;\n]+|\bdan\b|\bsama\b|\btambah\b/i);
  const text = chunks[chunks.length - 1].trim();
  if (!text) return { term: '', qty: 1, unit: null, explicitGrams: null };

  // 1. Grams / ml explicit: 'pisang 150g' atau '150 gram pisang'
  const mGramPrefix = text.match(/^(\d+(?:[\.,]\d+)?)\s*(?:gram|g|ml)\s+([\D]+)$/i);
  if (mGramPrefix) {
    const grams = parseFloat(mGramPrefix[1].replace(',', '.'));
    const term = mGramPrefix[2].trim();
    return { term, qty: 1, unit: 'g', explicitGrams: grams };
  }
  const mGramSuffix = text.match(/^([\D]+?)\s+(\d+(?:[\.,]\d+)?)\s*(?:gram|g|ml)$/i);
  if (mGramSuffix) {
    const grams = parseFloat(mGramSuffix[2].replace(',', '.'));
    const term = mGramSuffix[1].trim();
    return { term, qty: 1, unit: 'g', explicitGrams: grams };
  }

  // 2. Prefix se- : 'sebuah pisang'
  const mSe = text.match(/^(se[a-z]+)\s+([\D]+)$/i);
  if (mSe && SE_UNITS[mSe[1].toLowerCase()]) {
    const u = SE_UNITS[mSe[1].toLowerCase()];
    return { term: mSe[2].trim(), qty: u.qty, unit: u.unit, explicitGrams: null };
  }

  // 3. Pattern '[Qty] [Unit] [Name]' -> '2 buah pisang' atau '2 porsi nasi'
  const mPrefix = text.match(/^(\d+(?:[\.,]\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?\s+([\D]+)$/i);
  if (mPrefix) {
    let q = parseFloat(mPrefix[1].replace(',', '.'));
    if (mPrefix[1].toLowerCase() === 'setengah') q = 0.5;
    if (mPrefix[1].toLowerCase() === 'seperempat') q = 0.25;
    const u = mPrefix[2] ? normalizeUnit(mPrefix[2]) : null;
    const term = mPrefix[3].trim();
    return { term, qty: q || 1, unit: u, explicitGrams: null };
  }

  // 4. Pattern '[Name] [Qty] [Unit]' -> 'pisang 2 buah' atau 'pisang 2'
  const mSuffix = text.match(/^([\D]+?)\s+(\d+(?:[\.,]\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?$/i);
  if (mSuffix) {
    let q = parseFloat(mSuffix[2].replace(',', '.'));
    if (mSuffix[2].toLowerCase() === 'setengah') q = 0.5;
    if (mSuffix[2].toLowerCase() === 'seperempat') q = 0.25;
    const u = mSuffix[3] ? normalizeUnit(mSuffix[3]) : null;
    const term = mSuffix[1].trim();
    return { term, qty: q || 1, unit: u, explicitGrams: null };
  }

  return { term: text, qty: 1, unit: null, explicitGrams: null };
};



