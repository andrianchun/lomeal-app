// ============================================================
// SINKRON KE LOGYM — SATU-SATUNYA file yang boleh menulis ke project Logym
// (dbLogym) dari Lomeal. Dua hal:
//  1. pushBiometricsToLogym: gender/dob/height/weight → settings.userProfile
//     (merge:true → deep-merge, field lain milik Logym tidak tersentuh).
//  2. pushDailyTotalsToLogym: ringkasan kalori-dimakan HARI INI → field baru
//     `lomealSync` di root users/{uid} (namespace terpisah, tidak bentrok
//     dengan apa pun milik Logym). Datanya ADA di Firestore begitu ini jalan,
//     tapi TIDAK otomatis tampil di layar Logym — itu perlu sedikit kode
//     ditambahkan di sisi Logym sendiri (di luar kewenangan Lomeal menyentuh
//     lyfit.app), lihat snippet yang diberikan terpisah ke user.
// ============================================================
import { dbLogym } from '../firebaseLogym';
import { doc, setDoc } from 'firebase/firestore';

export const pushBiometricsToLogym = async (logymUid, { gender, dob, height, weight }) => {
  if (!logymUid) return;
  const patch = {};
  if (gender !== undefined) patch.gender = gender;
  if (dob !== undefined) patch.dob = dob;
  if (height !== undefined) patch.height = height;
  if (weight !== undefined) patch.weight = weight;
  if (Object.keys(patch).length === 0) return;
  try {
    await setDoc(doc(dbLogym, 'users', logymUid), { settings: { userProfile: patch } }, { merge: true });
  } catch (e) {
    console.error('pushBiometricsToLogym error', e);
  }
};

export const pushPreferencesToLogym = async (logymUid, dietProfile, allergies) => {
  if (!logymUid) return;
  try {
    await setDoc(doc(dbLogym, 'users', logymUid), {
      lomealSync: {
        preferences: { dietProfile: dietProfile || null, allergies: allergies || null }
      }
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push biometrik ke Logym:', e);
  }
};

export const pushDailyTotalsToLogym = async (logymUid, ymd, totals) => {
  if (!logymUid) return;
  try {
    await setDoc(doc(dbLogym, 'users', logymUid), {
      lomealSync: {
        today: {
          ymd,
          kcal: Math.round(totals.kcal || 0),
          protein: Math.round(totals.protein || 0),
          carbs: Math.round(totals.carbs || 0),
          fat: Math.round(totals.fat || 0),
          updatedAt: new Date().toISOString(),
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push kalori dimakan ke Logym:', e);
  }
};
