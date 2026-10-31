import { calculateGramsFromURT, normalizeUnit, isRecognizedUnit } from './urtMapping.js';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase.js';
import { db } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PATTERN_CACHE_KEY = 'lomeal_pattern_cache';
const PATTERN_CACHE_MAX = 200; // cukup buat menu yang sering diulang; localStorage kuotanya ~5MB

/**
 * Kunci cache. WAJIB dipakai di semua sisi (tulis, baca, lokal, global) — dulu penyimpanan
 * pakai trim().toLowerCase() sementara pencariannya cuma toLowerCase(), jadi input berspasi
 * ekor tersimpan tapi tidak pernah ketemu lagi. Spasi ganda dan tanda baca ekor ikut
 * dirapikan biar "nasi goreng", "Nasi  Goreng", dan "nasi goreng." kena cache yang sama.
 */
export const cacheKey = (rawText) => (rawText || '')
  .toLowerCase()
  .trim()
  .replace(/[.,!?;]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Caches patterns locally
 */
export const getLocalPatternCache = () => {
  try {
    const cache = JSON.parse(localStorage.getItem(PATTERN_CACHE_KEY) || '{}');
    let dirty = false;
    for (const key of Object.keys(cache)) {
      const words = key.trim().split(/\s+/).filter(Boolean);
      // Jika key cuma 1 kata (seperti 'pepes', 'ayam', 'ikan') tapi hasil cachenya makanan multi-kata
      // yang bukan nama persis atau alias persis, maka ini cache racun (overmatch)
      if (words.length === 1) {
        const foods = cache[key];
        if (Array.isArray(foods) && foods.length === 1) {
          const fName = (foods[0]?.name || '').toLowerCase();
          if (fName !== key) {
            const dbMatch = searchFoods(key);
            const isLegit = dbMatch.length > 0 && 
              (dbMatch[0].name.toLowerCase() === key || (dbMatch[0].aliases || []).some(a => a.toLowerCase() === key));
            if (!isLegit) {
              delete cache[key];
              dirty = true;
            }
          }
        }
      }
    }
    if (dirty) {
      localStorage.setItem(PATTERN_CACHE_KEY, JSON.stringify(cache));
    }
    return cache;
  } catch (e) {
    return {};
  }
};

export const saveLocalPatternCache = (rawText, parsedFoods) => {
  try {
    const key = cacheKey(rawText);
    const words = key.split(/\s+/).filter(Boolean);
    // Jangan simpan cache untuk query 1 kata ambigu yang bukan exact match/alias
    if (words.length === 1 && Array.isArray(parsedFoods) && parsedFoods.length === 1) {
      const fName = (parsedFoods[0]?.name || '').toLowerCase();
      if (fName !== key) {
        const dbMatch = searchFoods(key);
        const isLegit = dbMatch.length > 0 && 
          (dbMatch[0].name.toLowerCase() === key || (dbMatch[0].aliases || []).some(a => a.toLowerCase() === key));
        if (!isLegit) return;
      }
    }
    const cache = getLocalPatternCache();
    delete cache[key]; // hapus dulu biar disisipkan ulang sebagai yang terbaru
    cache[key] = parsedFoods;
    // Objek JS mempertahankan urutan sisip untuk kunci string, jadi yang paling lama ada di depan.
    const keys = Object.keys(cache);
    const trimmed = keys.length > PATTERN_CACHE_MAX
      ? Object.fromEntries(keys.slice(keys.length - PATTERN_CACHE_MAX).map((k) => [k, cache[k]]))
      : cache;
    localStorage.setItem(PATTERN_CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save pattern cache', e);
  }
};

/**
 * Checks Firebase Global Pattern Cache
 */
export const checkGlobalPatternCache = async (rawText) => {
  try {
    const text = cacheKey(rawText);
    // Gunakan hash atau sanitize text untuk ID dokumen agar aman, tapi untuk MVP kita gunakan text jika pendek
    // Firestore doc ID tidak boleh mengandung /
    const docId = text.replace(/\//g, '_').substring(0, 100);
    const docRef = doc(db, 'lomeal_globalPatternCache', docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const foods = snap.data().foods;
      const words = text.split(/\s+/).filter(Boolean);
      // Validasi: jangan terima global cache untuk query 1 kata ambigu yang tidak match nama/alias
      if (words.length === 1 && Array.isArray(foods) && foods.length === 1) {
        const fName = (foods[0]?.name || '').toLowerCase();
        if (fName !== text) {
          const dbMatch = searchFoods(text);
          const isLegit = dbMatch.length > 0 && 
            (dbMatch[0].name.toLowerCase() === text || (dbMatch[0].aliases || []).some(a => a.toLowerCase() === text));
          if (!isLegit) return null;
        }
      }
      return foods;
    }
  } catch (e) {
    console.error('Failed to check global pattern cache', e);
  }
  return null;
};

/**
 * Saves to Firebase Global Pattern Cache
 */
export const saveGlobalPatternCache = async (rawText, parsedFoods) => {
  try {
    const text = cacheKey(rawText);
    const docId = text.replace(/\//g, '_').substring(0, 100);
    const docRef = doc(db, 'lomeal_globalPatternCache', docId);
    await setDoc(docRef, {
      originalInput: text,
      foods: parsedFoods,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to save global pattern cache', e);
  }
};

/**
 * Split text using Indonesian conjunctions and punctuation
 */
const splitInput = (text) => {
  const delimiters = /[,;\n\.]+|\bdan\b|\bterus\b|\bsama\b|\btambah\b|\bpakai\b|\bpake\b|\bbeserta\b|\bdengan\b/gi;
  return text.split(delimiters)
    .map(t => t.trim())
    .filter(t => t.length > 0);
};

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
  secuil: { qty: 0.25, unit: 'potong' },
};

/**
 * Extract qty, unit, and food name from a chunk.
 * Handles patterns like "nasi 1 centong", "1 centong nasi", "sebuah pisang", "pisang 2"
 */
const extractFoodParts = (chunk) => {
  let qty = 1;
  let name = chunk.trim();
  let unitStr = '';

  // Check prefix se- (contoh: "sebuah pisang", "sepiring nasi goreng")
  const seMatch = name.match(/^(se[a-z]+)\s+([\D]+)$/i);
  if (seMatch && SE_UNITS[seMatch[1].toLowerCase()]) {
    const info = SE_UNITS[seMatch[1].toLowerCase()];
    qty = info.qty;
    unitStr = info.unit;
    name = seMatch[2].trim();
    return { name, qty, unitStr };
  }

  // Pattern 1: [Name] [Qty] [Unit] -> "Nasi goreng 1.5 porsi" atau "pisang 2 buah" atau "pisang 2"
  const m1 = name.match(/^([\D]+?)\s+(\d+(?:\.\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?$/i);
  
  // Pattern 2: [Qty] [Unit] [Name] -> "1 centong nasi putih" atau "2 buah pisang" atau "2 pisang"
  const m2 = name.match(/^(\d+(?:\.\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?\s+([\D]+)$/i);

  let match = m1 || m2;
  if (match) {
    if (m1) { 
      name = match[1].trim(); 
      qty = match[2].toLowerCase(); 
      unitStr = match[3] || ''; 
    } else { 
      qty = match[1].toLowerCase(); 
      if (match[2] && isRecognizedUnit(match[2])) {
        unitStr = match[2]; 
        name = match[3].trim(); 
      } else if (match[2]) {
        unitStr = '';
        name = `${match[2]} ${match[3]}`.trim();
      } else {
        unitStr = '';
        name = match[3].trim();
      }
    }
  }

  // Parse qty value
  if (qty === 'setengah') qty = 0.5;
  else if (qty === 'seperempat') qty = 0.25;
  else if (typeof qty === 'string' && qty.includes('/')) {
    const [num, den] = qty.split('/');
    qty = Number(num) / Number(den);
  } else {
    qty = Number(qty) || 1;
  }

  return { name, qty, unitStr };
};

/**
 * Run local NLP parsing for a given text.
 * Returns { foods: [...] } if fully successful, otherwise null (requires Lomy fallback)
 */
export const runLocalNlpParse = (text, customFoods = []) => {
  const chunks = splitInput(text);
  let parsedFoods = [];

  for (const chunk of chunks) {
    const { name, qty, unitStr } = extractFoodParts(chunk);
    
    // Search DB dengan relevansi pintar
    const results = searchFoods(name, customFoods);
    const best = results[0];
    
    // Syarat lolos:
    // Jika query cuma 1 kata (misal 'pepes', 'ayam', 'soto'), HARUS match persis nama atau persis alias.
    // Tidak boleh substring liar yang mencocokkan 'pepes' ke 'Ikan mujahir pepes'.
    // Jika query >= 2 kata (misal 'ikan mas pepes', 'nasi goreng'), boleh kata-per-kata ada di nama/alias.
    const lower = name.toLowerCase().trim();
    const queryWords = lower.split(/\s+/).filter(Boolean);
    const bestNameClean = best ? best.name.toLowerCase().replace(/[,/()\-+]/g, ' ') : '';
    const isExactName = best && best.name.toLowerCase() === lower;
    const isExactAlias = best && (best.aliases || []).some(a => a.toLowerCase() === lower);
    const isMultiWordMatch = best && queryWords.length >= 2 && queryWords.every(qw => bestNameClean.includes(qw));
    const isMultiWordAlias = best && queryWords.length >= 2 && (best.aliases || []).some(a => queryWords.every(qw => a.toLowerCase().includes(qw)));
    
    if (best && (isExactName || isExactAlias || isMultiWordMatch || isMultiWordAlias)) {
      let grams = calculateGramsFromURT(qty, unitStr);
      if (grams === null) grams = best.portion.grams * qty; // satuan gak dikenal → pakai porsi bawaan
      // Satuan rumah tangga ("gelas") dipertahankan supaya sheet konfirmasi tetap nampilin
      // "1 gelas", bukan "200 ml". Konversi ke g/ml baru terjadi pas dicatat (entryUnit).
      const finalUnit = normalizeUnit(unitStr) || (best.isDrink ? 'ml' : 'g');

      parsedFoods.push({
        name: best.name,
        grams,
        unit: finalUnit,
        isDrink: !!best.isDrink, // dipakai buat nentuin mL vs gram waktu dicatat
        foodId: best.id, // biar gak dibikinin duplikat baru di custom DB
        nutrition: nutritionForAmount(best, grams),
        baseNutrition: best.nutrition,
        baseGrams: 100
      });
    } else {
      // Failed to confidently find this food chunk locally
      return null;
    }
  }

  if (parsedFoods.length > 0) {
    return { foods: parsedFoods };
  }
  return null;
};
