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
  const bio = day.bioData || day.biometrics || {};

  // Dukung array maupun map/object workouts dari seluruh format & variasi penamaan Logym
  const rawWorkouts = day.workouts ?? day.workout ?? day.history ?? day.sessions ?? day.session ?? day.activities ?? day.activity;
  let workouts = [];
  if (Array.isArray(rawWorkouts)) {
    workouts = rawWorkouts;
  } else if (typeof rawWorkouts === 'object' && rawWorkouts !== null) {
    workouts = Object.values(rawWorkouts);
  } else if (day.programId || day.log || day.exercises || day.exerciseLogs || day.workoutLog || day.logs || day.completedExercises) {
    workouts = [day];
  }

  // Hitung jumlah gerakan latihan (exercises) dari semua sesi hari ini
  let totalExercises = 0;
  let completedSessions = 0;

  workouts.forEach((w) => {
    if (!w || typeof w !== 'object') return;
    // Abaikan sesi yang masih terjadwal / belum dikerjakan
    if (w.status === 'planned' || w.isProjected) return;

    const logObj = w.log || w.exerciseLogs || w.workoutLog || w.logs || w.records;
    const hasLogs = logObj && typeof logObj === 'object' && Object.keys(logObj).length > 0;
    const isCompleted = w.status === 'completed' || w.completed === true || (w.programId === 'adhoc' && hasLogs);
    if (isCompleted || w.isWorkout) completedSessions += 1;

    if (hasLogs) {
      let count = 0;
      Object.values(logObj).forEach((sets) => {
        if (Array.isArray(sets)) {
          if (sets.some((s) => s?.done && !s?.skipped)) count += 1;
        } else if (sets && typeof sets === 'object') {
          if (Object.values(sets).some((s) => s?.done && !s?.skipped)) count += 1;
        }
      });
      // Fallback jika format log adhoc/cardio tanpa centang done: gunakan jumlah item latihan
      totalExercises += count > 0 ? count : Object.keys(logObj).length;
    } else if (isCompleted) {
      if (Array.isArray(w.exercises) && w.exercises.length > 0) {
        totalExercises += w.exercises.length;
      } else if (typeof w.exercises === 'object' && w.exercises !== null && Object.keys(w.exercises).length > 0) {
        totalExercises += Object.keys(w.exercises).length;
      } else if (Array.isArray(w.overriddenExercises) && w.overriddenExercises.length > 0) {
        totalExercises += w.overriddenExercises.length;
      } else if (Array.isArray(w.completedExercises) && w.completedExercises.length > 0) {
        totalExercises += w.completedExercises.length;
      } else if (Array.isArray(w.exerciseList) && w.exerciseList.length > 0) {
        totalExercises += w.exerciseList.length;
      } else if (Array.isArray(w.items) && w.items.length > 0) {
        totalExercises += w.items.length;
      } else if (w.exerciseCount && Number(w.exerciseCount) > 0) {
        totalExercises += Number(w.exerciseCount);
      } else if (w.workoutCount && Number(w.workoutCount) > 0) {
        totalExercises += Number(w.workoutCount);
      } else if (w.duration || w.activeMinutes || w.caloriesBurned || w.burnedKcal) {
        totalExercises += 1;
      }
    }
  });

  // Fallback: Jika tidak ditemukan di per-sesi, periksa langsung di tingkat root hari (day)
  if (totalExercises === 0 && day.status !== 'planned') {
    const rootLogs = day.exerciseLogs || day.log || day.workoutLog || day.logs || day.records;
    if (rootLogs && typeof rootLogs === 'object' && Object.keys(rootLogs).length > 0) {
      totalExercises += Object.keys(rootLogs).length;
      if (completedSessions === 0) completedSessions = 1;
    } else if (Array.isArray(day.exercises) && day.exercises.length > 0) {
      totalExercises += day.exercises.length;
      if (completedSessions === 0) completedSessions = 1;
    } else if (typeof day.exercises === 'object' && day.exercises !== null && Object.keys(day.exercises).length > 0) {
      totalExercises += Object.keys(day.exercises).length;
      if (completedSessions === 0) completedSessions = 1;
    } else if (Array.isArray(day.completedExercises) && day.completedExercises.length > 0) {
      totalExercises += day.completedExercises.length;
      if (completedSessions === 0) completedSessions = 1;
    } else if (day.exerciseCount && Number(day.exerciseCount) > 0) {
      totalExercises += Number(day.exerciseCount);
      if (completedSessions === 0) completedSessions = 1;
    } else if (bio.workoutCount && Number(bio.workoutCount) > 0) {
      totalExercises += Number(bio.workoutCount);
      if (completedSessions === 0) completedSessions = 1;
    } else if (bio.exerciseCount && Number(bio.exerciseCount) > 0) {
      totalExercises += Number(bio.exerciseCount);
      if (completedSessions === 0) completedSessions = 1;
    } else if (workouts.length > 0 && workouts.some(w => typeof w === 'object' && Object.keys(w).length > 0)) {
      totalExercises = workouts.length;
      if (completedSessions === 0) completedSessions = workouts.length;
    }
  }

  const steps = Number(bio.steps) || 0;
  const stepsKcal = Math.round(steps * 0.04);
  const burnedKcal = Number(bio.activityCalories) || 0;
  const floorKcal = Number(bio.activityCaloriesFloor) || 0;

  return {
    burnedKcal,
    floorKcal,
    steps,
    stepsKcal,
    bmr: Number(bio.bmr) || null,
    weight: Number(bio.weight) || null,
    height: Number(bio.height) || null,
    workoutCount: totalExercises,
    sessionCount: completedSessions || (totalExercises > 0 ? 1 : 0),
    workoutNames: workouts.map((w) => w.programName || w.name || w.title || w.workoutName || w.programId).filter(Boolean),
    nutritionOverride: bio._manualFlags?.nutritionCalories ? (Number(bio.nutritionCalories) || null) : null,
    workouts,
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
