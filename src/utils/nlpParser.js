import { calculateGramsFromURT, normalizeUnit } from './urtMapping';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { db } from '../firebase';
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
  .replace(/[.,!?;]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Caches patterns locally
 */
export const getLocalPatternCache = () => {
  try {
    return JSON.parse(localStorage.getItem(PATTERN_CACHE_KEY) || '{}');
  } catch (e) {
    return {};
  }
};

export const saveLocalPatternCache = (rawText, parsedFoods) => {
  try {
    const cache = getLocalPatternCache();
    delete cache[cacheKey(rawText)]; // hapus dulu biar disisipkan ulang sebagai yang terbaru
    cache[cacheKey(rawText)] = parsedFoods;
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
      return snap.data().foods;
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

/**
 * Extract qty, unit, and food name from a chunk.
 * Handles patterns like "nasi 1 centong" or "1 centong nasi"
 */
const extractFoodParts = (chunk) => {
  let qty = 1;
  let name = chunk;
  let unitStr = '';

  // Pattern 1: [Name] [Qty] [Unit] -> "Nasi goreng 1.5 porsi"
  // Note: we want to match fractions like 1/2 or words like "setengah"
  const m1 = chunk.match(/^([\D]+?)\s+(\d+(?:\.\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?$/i);
  
  // Pattern 2: [Qty] [Unit] [Name] -> "1 centong nasi putih"
  const m2 = chunk.match(/^(\d+(?:\.\d+)?|\d+\/\d+|setengah|seperempat)\s*([a-zA-Z]+)?\s+([\D]+)$/i);

  let match = m1 || m2;
  if (match) {
    if (m1) { 
      name = match[1].trim(); 
      qty = match[2].toLowerCase(); 
      unitStr = match[3] || ''; 
    } else { 
      qty = match[1].toLowerCase(); 
      unitStr = match[2] || ''; 
      name = match[3].trim(); 
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
    
    // Search DB
    const results = searchFoods(name, customFoods);
    const best = results[0];
    
    // Syarat lolos: harus cukup mirip
    if (best && (best.name.toLowerCase() === name.toLowerCase() || best.name.toLowerCase().includes(name.toLowerCase()))) {
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
