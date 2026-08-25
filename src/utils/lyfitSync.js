// ============================================================
// SINKRONISASI EKOSISTEM LOGYM (READ-ONLY!)
// File ini hanya MEMBACA data milik aplikasi Logym, sekarang di collection `logym_users`
// (project hexa-life, sama project sama uid dengan Lomeal — gak perlu bridge lagi):
//   - logym_users/{uid}            → settings.userProfile (biometrik), userApiKeys
//   - logym_users/{uid}/history_years/{year} → aktivitas & kalori terbakar harian
// DILARANG KERAS ada operasi tulis di file ini (blueprint Fase 1).
// ============================================================
import { db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

const mapActivityLevel = (val) => {
  if (!val) return null;
  if (typeof val === 'string') {
    const s = val.toLowerCase();
    if (['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(s)) return s;
    if (s.includes('sedentary') || s.includes('sangat jarang')) return 'sedentary';
    if (s.includes('light') || s.includes('jarang') || s.includes('ringan')) return 'light';
    if (s.includes('moderate') || s.includes('sedang')) return 'moderate';
    if (s.includes('very') || s.includes('sangat')) return 'very_active';
    if (s.includes('active') || s.includes('sering') || s.includes('berat')) return 'active';
  }
  const n = Number(val);
  if (n <= 1.25) return 'sedentary';
  if (n <= 1.45) return 'light';
  if (n <= 1.65) return 'moderate';
  if (n <= 1.8) return 'active';
  if (n > 1.8) return 'very_active';
  return null;
};

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
  const rawAct = p.activityLevel || bio.activityLevel || settings.activityLevel || settings.activity || data.activityLevel || data.lomealSync?.preferences?.activityLevel;
  return {
    weight: bio.weight || null,
    height: bio.height || null,
    gender: p.gender || bio.gender || null,
    activityLevel: mapActivityLevel(rawAct),
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
    const snap = await getDoc(doc(db, 'logym_users', uid));
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
    doc(db, 'logym_users', uid),
    (snap) => cb(snap.exists() ? parseLyfitProfile(snap.data()) : null),
    () => cb(null)
  );

// Data aktivitas Logym untuk satu tanggal → bonus kalori + kartu sync ringkas.
// Struktur history Logym: { 'YYYY-MM-DD': { bioData: {...}, workouts: [...] } }
export const extractLyfitDay = (yearDays, ymd) => {
  const day = yearDays?.[ymd];
  if (!day) return null;
  const bio = day.bioData || {};

  // Dukung array maupun map/object workouts
  let workouts = [];
  if (Array.isArray(day.workouts)) {
    workouts = day.workouts;
  } else if (typeof day.workouts === 'object' && day.workouts !== null) {
    workouts = Object.values(day.workouts);
  } else if (day.programId || day.log || day.exercises || day.exerciseLogs) {
    workouts = [day];
  }

  // Hitung jumlah gerakan latihan (exercises) dari semua sesi hari ini
  let totalExercises = 0;
  workouts.forEach((w) => {
    if (!w) return;
    if (w.log && typeof w.log === 'object' && Object.keys(w.log).length > 0) {
      totalExercises += Object.keys(w.log).length;
    } else if (Array.isArray(w.exercises) && w.exercises.length > 0) {
      totalExercises += w.exercises.length;
    } else if (Array.isArray(w.overriddenExercises) && w.overriddenExercises.length > 0) {
      totalExercises += w.overriddenExercises.length;
    } else if (w.exerciseLogs && typeof w.exerciseLogs === 'object' && Object.keys(w.exerciseLogs).length > 0) {
      totalExercises += Object.keys(w.exerciseLogs).length;
    } else if (w.status === 'completed' || w.programId || w.duration) {
      totalExercises += 1;
    }
  });

  // Fallback: Jika tidak ditemukan di w.log per-sesi, cek langsung di tingkat hari
  if (totalExercises === 0) {
    if (day.exerciseLogs && typeof day.exerciseLogs === 'object' && Object.keys(day.exerciseLogs).length > 0) {
      totalExercises += Object.keys(day.exerciseLogs).length;
    } else if (Array.isArray(day.exercises) && day.exercises.length > 0) {
      totalExercises += day.exercises.length;
    } else if (day.log && typeof day.log === 'object' && Object.keys(day.log).length > 0) {
      totalExercises += Object.keys(day.log).length;
    } else if (workouts.length > 0) {
      totalExercises = workouts.length;
    }
  }

  return {
    burnedKcal: Number(bio.activityCalories) || 0,
    floorKcal: Number(bio.activityCaloriesFloor) || 0,
    steps: Number(bio.steps) || 0,
    weight: Number(bio.weight) || null,
    workoutCount: totalExercises,
    workoutNames: workouts.map((w) => w.programName || w.name).filter(Boolean),
    nutritionOverride: bio._manualFlags?.nutritionCalories ? (Number(bio.nutritionCalories) || null) : null,
  };
};

// Baca sekali dokumen tahun berapa pun (bukan cuma tahun berjalan) — dipakai penambalan lubang
// `nutritionCalories` buat tahu hari mana yang BENERAN bolong di Logym, supaya yang sudah benar
// tidak ditulis ulang tiap hari tanpa guna.
export const fetchLyfitYear = async (uid, year) => {
  try {
    const snap = await getDoc(doc(db, 'logym_users', uid, 'history_years', String(year)));
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.warn('fetchLyfitYear gagal:', e);
    return {};
  }
};

// Langganan dokumen tahun berjalan Logym (read-only listener).
export const subscribeLyfitYear = (uid, year, cb) =>
  onSnapshot(
    doc(db, 'logym_users', uid, 'history_years', String(year)),
    (snap) => cb(snap.exists() ? snap.data() : {}),
    () => cb({})
  );
