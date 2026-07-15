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
export const AI_DAILY_LIMIT = 10;

export const APP_NAME = 'Lomeal';
