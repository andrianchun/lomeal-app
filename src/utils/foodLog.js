// ============================================================
// LAPISAN DATA LOMEAL — akses Firestore project lomeal-id (Fase 1)
// SEMUA operasi tulis (.set/.update) di seluruh aplikasi Lomeal WAJIB
// melewati file ini, dan file ini HANYA menulis ke sub-koleksi:
//     /users/{uid}/food_logs/*
// Project ini berdiri sendiri, terpisah dari project Firebase Logym/Lyfit.
// ============================================================
import { db } from '../firebase';
import { doc, setDoc, updateDoc, onSnapshot, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { getMonthKey } from '../data/constants';

const flDoc = (uid, docId) => doc(db, 'users', uid, 'food_logs', docId);

// ---------- PROFIL LOMEAL (konsen, kuesioner, target, pengaturan) ----------
export const subscribeLomealProfile = (uid, cb) =>
  onSnapshot(flDoc(uid, 'profile'), (snap) => {
    // Kalau snapshot dari cache lokal dan dokumen tidak ada, JANGAN langsung return null —
    // ini bisa berarti cache baru saja dihapus (clear cache) dan data server belum sampai.
    // Biarkan loading state di App.jsx tetap aktif (profile === undefined) sampai server membalas.
    if (!snap.exists() && snap.metadata.fromCache) return;
    cb(snap.exists() ? snap.data() : null);
  });


export const saveLomealProfile = (uid, data) =>
  setDoc(flDoc(uid, 'profile'), data, { merge: true });

// ---------- LOG HARIAN (1 dokumen per bulan: log_YYYY-MM) ----------
// days: { 'YYYY-MM-DD': { meals: { sessionId: [entry,...] }, water: ml } }
export const subscribeMonth = (uid, monthKey, cb) =>
  onSnapshot(flDoc(uid, `log_${monthKey}`), (snap) => cb(snap.exists() ? (snap.data().days || {}) : {}));

export const getMonth = async (uid, monthKey) => {
  const snap = await getDoc(flDoc(uid, `log_${monthKey}`));
  return snap.exists() ? (snap.data().days || {}) : {};
};

export const saveDay = async (uid, ymd, dayData) => {
  const docRef = flDoc(uid, `log_${getMonthKey(ymd)}`);
  try {
    await updateDoc(docRef, { [`days.${ymd}`]: dayData });
  } catch (e) {
    await setDoc(docRef, { days: { [ymd]: dayData } }, { merge: true });
  }
};

// Entry makanan: { id, name, grams, unit, nutrition, foodId?, photoUrl?, time, source }
export const makeEntry = (data) => ({
  id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  time: new Date().toTimeString().slice(0, 5),
  source: 'db',
  ...data,
});

// ---------- RESEP & CUSTOM FOODS (dokumen tunggal berisi array) ----------
export const subscribeRecipes = (uid, cb) =>
  onSnapshot(flDoc(uid, 'recipes'), (snap) => cb(snap.exists() ? (snap.data().items || []) : []));

export const saveRecipes = (uid, items) =>
  setDoc(flDoc(uid, 'recipes'), { items }, { merge: false });

export const subscribeMealPreps = (uid, cb) =>
  onSnapshot(flDoc(uid, 'meal_preps'), (snap) => cb(snap.exists() ? (snap.data().items || []) : []));

export const saveMealPreps = (uid, items) =>
  setDoc(flDoc(uid, 'meal_preps'), { items }, { merge: false });

export const subscribeCustomFoods = (uid, cb) =>
  onSnapshot(flDoc(uid, 'custom_foods'), (snap) => cb(snap.exists() ? (snap.data().items || []) : []));

export const saveCustomFoods = (uid, items) =>
  setDoc(flDoc(uid, 'custom_foods'), { items }, { merge: false });

// ---------- HAPUS AKUN: bersihkan seluruh sub-koleksi food_logs milik user ----------
// Dipanggil dari SettingsPage "Zona Berbahaya" sebelum deleteUser(auth.currentUser).
// Cuma menyentuh /users/{uid}/food_logs/* milik Lomeal — tidak pernah menyentuh Logym.
export const deleteAllUserData = async (uid) => {
  const snap = await getDocs(collection(db, 'users', uid, 'food_logs'));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
};

// ---------- SATPAM API: kuota Smart Input 10 request/hari ----------
export const checkAndCountAiUsage = async (uid, ymd, limit = 10) => {
  const ref = flDoc(uid, 'profile');
  const snap = await getDoc(ref);
  const usage = snap.exists() ? (snap.data().aiUsage || {}) : {};
  const count = usage.date === ymd ? (usage.count || 0) : 0;
  if (count >= limit) return { allowed: false, remaining: 0 };
  await setDoc(ref, { aiUsage: { date: ymd, count: count + 1 } }, { merge: true });
  return { allowed: true, remaining: limit - count - 1 };
};
