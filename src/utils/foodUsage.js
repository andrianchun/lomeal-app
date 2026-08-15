import { db } from '../firebase';
import { doc, setDoc, increment } from 'firebase/firestore';

// Statistik pemakaian makanan. Dua lapis:
//  - per-user (profil Firestore, field `foodUsage`) → tab "Terfavorit", ikut pindah HP.
//  - global (lomeal_food_popularity) → tab "Terpopuler", konsensus semua pengguna Lomeal.
// Cache localStorage tetap dipakai supaya pengurutan tidak menunggu Firestore tiap render.
const KEY = 'lomeal_food_usage';

const readMap = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

const writeMap = (map) => {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* ignore quota errors */ }
};

/** Gabungkan hitungan dari profil Firestore ke cache lokal (dipanggil saat profil dimuat). */
export const hydrateFoodUsage = (remote) => {
  if (!remote) return;
  const map = readMap();
  for (const [id, r] of Object.entries(remote)) {
    const local = map[id] || { count: 0, lastUsed: 0 };
    map[id] = { count: Math.max(local.count, r.count || 0), lastUsed: Math.max(local.lastUsed, r.lastUsed || 0) };
  }
  writeMap(map);
};

export const recordFoodUsage = (foodId, { uid, saveProfilePatch } = {}) => {
  if (!foodId) return;
  const map = readMap();
  const cur = map[foodId] || { count: 0, lastUsed: 0 };
  map[foodId] = { count: cur.count + 1, lastUsed: Date.now() };
  writeMap(map);

  if (saveProfilePatch) saveProfilePatch({ foodUsage: { [foodId]: map[foodId] } });

  // Makanan custom milik satu user tidak boleh mencemari peringkat global.
  if (uid && !String(foodId).startsWith('custom_')) {
    setDoc(doc(db, 'lomeal_food_popularity', String(foodId)), { count: increment(1) }, { merge: true })
      .catch((e) => console.error('[food_popularity] gagal:', e));
  }
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

/** Urutan berdasarkan hitungan global. `popularity` = { [foodId]: count }. */
export const sortFoodsByPopularity = (foods, popularity = {}) =>
  [...foods].sort((a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0));

/** Paling baru ditambahkan user. Item bawaan TKPI tidak punya `createdAt` — turun ke bawah. */
export const sortFoodsByNewest = (foods) =>
  [...foods].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
