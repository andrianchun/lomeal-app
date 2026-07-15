// ============================================================
// SINKRONISASI EKOSISTEM LOGYM (READ-ONLY!)
// File ini hanya MEMBACA data milik aplikasi Logym (project logym-id):
//   - users/{uid}            → settings.userProfile (biometrik), userApiKeys
//   - users/{uid}/history_years/{year} → aktivitas & kalori terbakar harian
// DILARANG KERAS ada operasi tulis di file ini (blueprint Fase 1).
// Selalu dipanggil dengan logymUser.uid (uid project Logym), BUKAN uid Lomeal —
// keduanya beda project Firebase sejak Lomeal punya project sendiri (lomeal-id).
// ============================================================
import { dbLogym } from '../firebaseLogym';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

// Susun profil Logym dari raw doc data — dipakai fetchLyfitProfile (one-shot) &
// subscribeLyfitProfile (terus-menerus, buat sinkron biometrik 2 arah).
const parseLyfitProfile = (data) => {
  const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : (data.settings || {});
  const p = settings.userProfile || {};
  const bio = p.biometrics || p; // dukung kedua bentuk penyimpanan
  const dob = p.dob || bio.dob || null;
  // Umur dari DOB jika ada (dob = sumber kebenaran, sama seperti skema Logym)
  let age = bio.age || null;
  if (!age && dob) {
    const d = new Date(dob);
    if (!isNaN(d)) age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  }
  // Migrasi kunci lama → array (pola sama seperti App.jsx Logym sendiri)
  let userApiKeys = settings.userApiKeys || [];
  if (userApiKeys.length === 0) {
    if (settings.userApiKey) userApiKeys.push(settings.userApiKey);
    if (settings.userGeminiApiKey && settings.userGeminiApiKey !== settings.userApiKey) userApiKeys.push(settings.userGeminiApiKey);
  }
  userApiKeys = userApiKeys.filter((k) => k && k.trim());
  return {
    weight: bio.weight || null,
    height: bio.height || null,
    gender: p.gender || bio.gender || null,
    dob,
    age,
    bmr: bio.bmr || null,
    userApiKeys,
    theme: settings.theme || null,
    displayName: data.displayName || null,
  };
};

// Ambil biometrik dasar dari profil Logym untuk pre-fill kuesioner onboarding,
// plus userApiKeys yang sudah diisi user di Settings Logym (dipakai Settings Lomeal
// untuk ditawarkan "Salin ke Lomeal" — lihat SettingsPage.jsx).
export const fetchLyfitProfile = async (uid) => {
  try {
    const snap = await getDoc(doc(dbLogym, 'users', uid));
    if (!snap.exists()) return null;
    return parseLyfitProfile(snap.data());
  } catch (e) {
    console.warn('fetchLyfitProfile gagal:', e);
    return null;
  }
};

// Versi onSnapshot dari fetchLyfitProfile — buat mirroring biometrik berkelanjutan
// (App.jsx#dob/height/weight/gender 2-arah, lihat utils/biometricSync.js).
export const subscribeLyfitProfile = (uid, cb) =>
  onSnapshot(
    doc(dbLogym, 'users', uid),
    (snap) => cb(snap.exists() ? parseLyfitProfile(snap.data()) : null),
    () => cb(null)
  );

// Data aktivitas Logym untuk satu tanggal → bonus kalori + kartu sync ringkas.
// Struktur history Logym: { 'YYYY-MM-DD': { bioData: {...}, workouts: [...] } }
export const extractLyfitDay = (yearDays, ymd) => {
  const day = yearDays?.[ymd];
  if (!day) return null;
  const bio = day.bioData || {};
  const workouts = Array.isArray(day.workouts) ? day.workouts : [];
  const completed = workouts.filter(w => w.status === 'completed');
  return {
    burnedKcal: Number(bio.activityCalories) || 0,
    // Lantai BMR+langkah+workout internal Logym HARI ITU — dipakai buat clamp input koreksi
    // manual dari Lomeal (lihat DashboardTab.jsx#handleSaveBurnOverride), biar koreksi dari
    // Lomeal gak bisa "menghapus" pencatatan internal Logym, sama kayak proteksi di Logym sendiri.
    floorKcal: Number(bio.activityCaloriesFloor) || 0,
    steps: Number(bio.steps) || 0,
    weight: Number(bio.weight) || null,
    workoutCount: completed.reduce((sum, w) => {
        if (w.exercises && Array.isArray(w.exercises)) return sum + w.exercises.length;
        if (w.log && typeof w.log === 'object') return sum + Object.keys(w.log).length;
        return sum + 1;
    }, 0),
    workoutNames: completed.map(w => w.programName).filter(Boolean),
    // Simetris sama burnedKcal: kalau user isi manual "Kalori Makanan" langsung di Logym
    // (bukan lewat Lomeal), Lomeal ikut baca angka itu buat ring/remaining — murni override
    // tampilan, log makanan asli di Lomeal (Log tab, lengkap makronya) tetap gak disentuh.
    nutritionOverride: bio._manualFlags?.nutritionCalories ? (Number(bio.nutritionCalories) || null) : null,
  };
};

// Langganan dokumen tahun berjalan Logym (read-only listener).
export const subscribeLyfitYear = (uid, year, cb) =>
  onSnapshot(
    doc(dbLogym, 'users', uid, 'history_years', String(year)),
    (snap) => cb(snap.exists() ? snap.data() : {}),
    () => cb({})
  );
