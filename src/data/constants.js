// Konstanta umum Lomeal

export const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getMonthKey = (ymd) => ymd.substring(0, 7); // 'YYYY-MM'

// dob = sumber kebenaran usia (skema disamakan dgn Logym, lihat utils/lyfitSync.js).
export const computeAge = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};

export const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const weekStripDates = (baseDate, weekStartDay = 0, jumlahMinggu = 1) => {
  const n = Math.max(1, Math.floor(Number(jumlahMinggu) || 1));
  const dasar = baseDate instanceof Date && !Number.isNaN(baseDate.getTime()) ? baseDate : new Date();
  const geser = (dasar.getDay() - weekStartDay + 7) % 7;
  const mulai = new Date(dasar.getFullYear(), dasar.getMonth(), dasar.getDate() - geser - (n - 1) * 7);
  const keluar = [];
  for (let i = 0; i < n * 7; i++) {
    keluar.push(new Date(mulai.getFullYear(), mulai.getMonth(), mulai.getDate() + i));
  }
  return keluar;
};

// Sesi makan default; snack bisa bertambah dinamis di Meal Grid
export const MEAL_SESSIONS = [
  { id: 'breakfast', label: 'Sarapan',      emoji: '🍳' },
  { id: 'lunch',     label: 'Makan Siang',  emoji: '🍛' },
  { id: 'dinner',    label: 'Makan Malam',  emoji: '🍲' },
  { id: 'snack',     label: 'Camilan',      emoji: '🍿' },
  { id: 'drink',     label: 'Minuman',      emoji: '🥤' },
];

export const DEFAULT_ACTIVE_SESSIONS = ['breakfast', 'lunch', 'dinner', 'drink'];

export const DEFAULT_SESSION_TIMES = {
  breakfast: '07:00',
  snack: '10:00',
  lunch: '12:00',
  snack2: '15:00',
  dinner: '19:00',
  snack3: '21:00',
  drink: '23:59'
};

export const WATER_STEP_ML = 200;    // satu tap = +200ml (blueprint Tab 2)
export const WATER_GOAL_ML = 2000;

// Satpam API: batas Smart Input Bar per user per hari (blueprint Fase 5)
export const AI_DAILY_LIMIT = 100;

export const APP_NAME = 'Lomeal';

// ---------- FOTO HERO RESEP ----------
// Resep yang belum punya foto tetap harus kelihatan "berisi" di kartu & layar detail,
// jadi dipilihkan foto coach masak sesuai bahan utamanya.
//
// Satu resep hampir selalu kena beberapa aturan sekaligus (ayam + telur + nasi), jadi
// pemenangnya ditentukan dua lapis:
//   1. NAMA resep dicek duluan. Nama itu niat si pemasak — "Mie Ayam" memang piring mie,
//      "Nasi Goreng Ayam" memang piring nasi. Karena itu format hidangan (mie/nasi/salad)
//      ditaruh di ATAS lauk di daftar bawah ini.
//   2. Kalau nama gak ngasih petunjuk sama sekali ("Menu Sehat Senin"), baru daftar
//      BAHAN yang discan, dengan urutan yang sama.
// Di dalam satu lapis, aturan yang lebih dulu di daftar yang menang.
// Konsekuensinya: "Salmon Panggang dengan Nasi" dapat foto nasi. Kalau kurang pas, user
// tinggal unggah fotonya sendiri — foto unggahan selalu menang atas semua aturan ini.
const RECIPE_HERO_RULES = [
  ['noodle',   /\bmie\b|\bmi\b|bakmi|pasta|spaghetti|spageti|fettuc|makaroni|ramen|kwetiau|bihun|soun/],
  ['rice',     /nasi|rice|bubur|lontong|ketupat/],
  ['salad',    /salad|lalap|capcay|gado|urap|selada|sayur/],
  ['seafood',  /seafood|udang|cumi|kerang|kepiting|lobster|rajungan|scallop/],
  ['salmon',   /salmon|tuna|kakap|tongkol|dori|\bikan\b|lele|nila|bandeng|gurame|patin/],
  ['beef',     /sapi|beef|steak|rendang|kambing|domba|\biga\b|burger/],
  ['chicken',  /ayam|chicken|bebek|kalkun|unggas/],
  ['egg',      /telur|telor|\begg\b|omelet|dadar|orak.?arik/],
  ['tempe',    /tempe|tahu|tofu|oncom/],
  ['milk',     /susu|\bmilk\b|yogurt|yoghurt|keju|cheese|smoothie|latte/],
];

export const RECIPE_HERO_KEYS = [...RECIPE_HERO_RULES.map(([k]) => k), 'default'];

export const heroForRecipe = (recipe) => {
  if (recipe?.photoUrl) return recipe.photoUrl;
  const match = (text) => text && RECIPE_HERO_RULES.find(([, re]) => re.test(text));
  const hit = match((recipe?.name || '').toLowerCase())
    || match((recipe?.ingredients || []).map((i) => i.name).join(' ').toLowerCase());
  return `/bg-recipe-${hit ? hit[0] : 'default'}.webp`;
};

// "P 58g K 76g L 17g" — label makro seragam: huruf di depan angka, dipisah spasi.
export const macroText = (n) =>
  `P ${Math.round(n?.protein || 0)}g K ${Math.round(n?.carbs || 0)}g L ${Math.round(n?.fat || 0)}g`;

// "1j 15m" / "45m" — durasi masak di chip stat.
export const formatDuration = (min) => {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return '—';
  return m >= 60 ? `${Math.floor(m / 60)}j${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};

// mm:ss buat timer masak (dipakai chip timer & input langkah).
export const formatClock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
