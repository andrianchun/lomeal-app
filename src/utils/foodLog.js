// ============================================================
// LAPISAN DATA LOMEAL — akses Firestore project hexa-life (dimigrasi dari lomeal-id)
// SEMUA operasi tulis (.set/.update) di seluruh aplikasi Lomeal WAJIB
// melewati file ini, dan file ini HANYA menulis ke sub-koleksi:
//     /lomeal_users/{uid}/food_logs/*
// Prefix `lomeal_` biar gak tabrakan sama collection Darka/Domus/Logym di project bareng ini.
// ============================================================
import { db } from '../firebase';
import { doc, setDoc, updateDoc, onSnapshot, getDoc, collection, getDocs, writeBatch, deleteField, increment } from 'firebase/firestore';
import { getMonthKey } from '../data/constants';
import { uploadImageToFirebase } from './storageLogym';

const flDoc = (uid, docId) => doc(db, 'lomeal_users', uid, 'food_logs', docId);

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
  onSnapshot(flDoc(uid, `log_${monthKey}`), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return;
    const days = snap.exists() ? (snap.data().days || {}) : {};
    migrateInlinePhotos(uid, monthKey, days);
    cb(days);
  });

export const getMonth = async (uid, monthKey) => {
  const snap = await getDoc(flDoc(uid, `log_${monthKey}`));
  return snap.exists() ? (snap.data().days || {}) : {};
};

// `photos` sengaja dibuang di sini — foto disimpan di dokumennya sendiri (lihat di bawah).
// eslint-disable-next-line no-unused-vars
export const saveDay = async (uid, ymd, { photos, ...dayData }) => {
  const docRef = flDoc(uid, `log_${getMonthKey(ymd)}`);
  try {
    await updateDoc(docRef, { [`days.${ymd}`]: dayData });
  } catch (e) {
    await setDoc(docRef, { days: { [ymd]: dayData } }, { merge: true });
  }
};

// ---------- FOTO SESI (file di Firebase Storage, URL-nya di photos_YYYY-MM-DD) ----------
// Dulu foto disimpan base64 (~100KB/biji) langsung di dokumen log bulanan. 8 foto sebulan aja
// udah nembus limit 1 MiB/dokumen Firestore, dan begitu lewat SEMUA penyimpanan bulan itu gagal
// — termasuk sekadar ngetik nama makanan. Sekarang: file naik ke Storage, Firestore cuma nyimpen
// URL-nya (~100 byte), dipisah per hari biar dokumen bulanan gak kesenggol sama sekali.
export const uploadMealPhoto = async (uid, ymd, sessionId, dataUrl) => {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadImageToFirebase(blob, `lomeal_users/${uid}/meal_photos/${ymd}_${sessionId}_${Date.now()}.webp`);
};

export const subscribeDayPhotos = (uid, ymd, cb) =>
  onSnapshot(flDoc(uid, `photos_${ymd}`), (snap) => cb(snap.exists() ? snap.data() : {}));

export const getDayPhotos = async (uid, ymd) => {
  const snap = await getDoc(flDoc(uid, `photos_${ymd}`));
  return snap.exists() ? snap.data() : {};
};

export const saveDayPhotos = (uid, ymd, photos) =>
  setDoc(flDoc(uid, `photos_${ymd}`), photos, { merge: false });

// Sekali jalan per bulan: foto base64 lama yang masih nyangkut di dokumen bulanan diangkat ke
// Storage, dokumen bulanannya nyusut di bawah 1 MiB dan bisa ditulis lagi.
const migratedMonths = new Set();
const migrateInlinePhotos = async (uid, monthKey, days) => {
  const ymds = Object.keys(days).filter((ymd) => Object.keys(days[ymd]?.photos || {}).length > 0);
  if (!ymds.length || migratedMonths.has(monthKey)) return;
  migratedMonths.add(monthKey);
  try {
    const batch = writeBatch(db);
    for (const ymd of ymds) {
      const urls = {};
      for (const [sessionId, val] of Object.entries(days[ymd].photos)) {
        urls[sessionId] = (typeof val === 'string' && val.startsWith('data:'))
          ? await uploadMealPhoto(uid, ymd, sessionId, val)
          : val;
      }
      batch.set(flDoc(uid, `photos_${ymd}`), urls, { merge: true });
      batch.update(flDoc(uid, `log_${monthKey}`), { [`days.${ymd}.photos`]: deleteField() });
    }
    await batch.commit();
  } catch (e) {
    migratedMonths.delete(monthKey); // gagal (offline / rules Storage?) — coba lagi di snapshot berikutnya
    console.error('Migrasi foto gagal:', e);
  }
};

// Entry makanan: { id, name, grams, unit, nutrition, foodId?, photoUrl?, time, source, baseNutrition?, baseGrams? }
export const makeEntry = (data) => ({
  id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  time: new Date().toTimeString().slice(0, 5),
  source: 'db',
  baseNutrition: data.baseNutrition || data.nutrition,
  baseGrams: data.baseGrams || (data.grams > 0 ? data.grams : 1),
  ...data,
});

// ---------- RESEP & CUSTOM FOODS (dokumen tunggal berisi array) ----------
export const subscribeRecipes = (uid, cb) =>
  onSnapshot(flDoc(uid, 'recipes'), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return;
    cb(snap.exists() ? (snap.data().items || []) : []);
  });

export const saveRecipes = (uid, items) =>
  setDoc(flDoc(uid, 'recipes'), { items }, { merge: false });

export const subscribeMealPreps = (uid, cb) =>
  onSnapshot(flDoc(uid, 'meal_preps'), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return;
    cb(snap.exists() ? (snap.data().items || []) : []);
  });

export const saveMealPreps = (uid, items) =>
  setDoc(flDoc(uid, 'meal_preps'), { items }, { merge: false });

export const subscribeCustomFoods = (uid, cb) =>
  onSnapshot(flDoc(uid, 'custom_foods'), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return;
    cb(snap.exists() ? (snap.data().items || []) : []);
  });

export const saveCustomFoods = (uid, items) =>
  setDoc(flDoc(uid, 'custom_foods'), { items }, { merge: false });

// ---------- HAPUS AKUN: bersihkan seluruh sub-koleksi food_logs milik user ----------
// Dipanggil dari SettingsPage "Zona Berbahaya" sebelum deleteUser(auth.currentUser).
// Cuma menyentuh /users/{uid}/food_logs/* milik Lomeal — tidak pernah menyentuh Logym.
export const deleteAllUserData = async (uid) => {
  const snap = await getDocs(collection(db, 'lomeal_users', uid, 'food_logs'));
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

// Kuota dipotong SEBELUM request (biar gak bisa di-spam paralel), jadi kalau user pencet X
// di tengah jalan jatahnya dibalikin — request yang dibatalin gak boleh ikut kehitung.
// ponytail: increment(-1) tanpa cek tanggal — kalau pas batalnya persis lewat tengah malam,
// user cuma dapat 1 jatah lebih di hari berikutnya. Gak worth satu read tambahan.
export const refundAiUsage = (uid) =>
  updateDoc(flDoc(uid, 'profile'), { 'aiUsage.count': increment(-1) }).catch(() => {});
