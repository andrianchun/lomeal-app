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

// Ambil biometrik dasar dari profil Logym untuk pre-fill kuesioner onboarding,
// plus userApiKeys yang sudah diisi user di Settings Logym (dipakai Settings Lomeal
// untuk ditawarkan "Salin ke Lomeal" — lihat SettingsPage.jsx).
export const fetchLyfitProfile = async (uid) => {
  try {
    const snap = await getDoc(doc(dbLogym, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const settings = typeof data.settings === 'string' ? JSON.parse(data.settings) : (data.settings || {});
    const p = settings.userProfile || {};
    const bio = p.biometrics || p; // dukung kedua bentuk penyimpanan
    // Umur dari DOB jika ada
    let age = bio.age || null;
    if (!age && (p.dob || bio.dob)) {
      const dob = new Date(p.dob || bio.dob);
      if (!isNaN(dob)) age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
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
      age,
      bmr: bio.bmr || null,
      userApiKeys,
      theme: settings.theme || null,
      displayName: data.displayName || null,
    };
  } catch (e) {
    console.warn('fetchLyfitProfile gagal:', e);
    return null;
  }
};

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
    steps: Number(bio.steps) || 0,
    weight: Number(bio.weight) || null,
    workoutCount: completed.length,
    workoutNames: completed.map(w => w.programName).filter(Boolean),
  };
};

// Langganan dokumen tahun berjalan Logym (read-only listener).
export const subscribeLyfitYear = (uid, year, cb) =>
  onSnapshot(
    doc(dbLogym, 'users', uid, 'history_years', String(year)),
    (snap) => cb(snap.exists() ? snap.data() : {}),
    () => cb({})
  );
