// Statistik pemakaian makanan (lokal per-device) — dipakai buat urutkan hasil
// search: paling sering ditambahkan & paling baru dipakai naik ke atas. Bukan
// data penting (beda dari favorit), aman kalau hilang pas cache di-clear,
// makanya cukup localStorage aja (pola sama kayak pattern-cache AI di nlpParser.js).
const KEY = 'lomeal_food_usage';

const readMap = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

export const recordFoodUsage = (foodId) => {
  if (!foodId) return;
  const map = readMap();
  const cur = map[foodId] || { count: 0, lastUsed: 0 };
  map[foodId] = { count: cur.count + 1, lastUsed: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* ignore quota errors */ }
};

// Favorit dulu, lalu paling sering dipakai, lalu paling baru dipakai — sisanya
// (belum pernah dipakai/di-favoritkan) tetap di urutan asli (stable sort).
export const sortFoodsByUsage = (foods, favoriteIds = []) => {
  const usage = readMap();
  const favSet = new Set(favoriteIds);
  return [...foods].sort((a, b) => {
    const favDiff = (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0);
    if (favDiff) return favDiff;
    const au = usage[a.id] || { count: 0, lastUsed: 0 };
    const bu = usage[b.id] || { count: 0, lastUsed: 0 };
    if (bu.count !== au.count) return bu.count - au.count;
    return bu.lastUsed - au.lastUsed;
  });
};
