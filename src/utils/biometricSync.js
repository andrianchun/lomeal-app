// ============================================================
// SINKRON KE LOGYM — SATU-SATUNYA file yang boleh menulis ke project Logym
// (dbLogym) dari Lomeal. Dua hal:
//  1. pushBiometricsToLogym: gender/dob/height/weight → settings.userProfile
//     (merge:true → deep-merge, field lain milik Logym tidak tersentuh).
//  2. pushDailyTotalsToLogym: ringkasan kalori-dimakan HARI INI → field baru
//     `lomealSync` di root users/{uid} (namespace terpisah, tidak bentrok
//     dengan apa pun milik Logym).
//  3. pushActivityOverrideToLogym: koreksi manual kalori dibakar → langsung ke
//     bioData.activityCalories milik Logym sendiri (history_years/{tahun}),
//     ditandai _manualFlags biar gak ketimpa hitungan otomatis Logym.
//  4. pushTargetsToLogym: target kalori/makro (delta bulking/cutting) → Logym
//     cuma baca, gak lagi punya preset delta independen sendiri.
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

// Target kalori/makro Lomeal → Logym. Delta bulking/cutting/maintenance murni urusan makan
// (gak ngaruh ke pemilihan/intensitas latihan — sudah dicek: satu-satunya pemakaian nutritionGoal
// di Logym cuma badge kosmetik, bukan logika program), jadi Lomeal jadi SATU-SATUNYA sumber
// kebenaran; Logym cuma baca field ini, gak punya preset delta sendiri lagi.
export const pushTargetsToLogym = async (logymUid, targets) => {
  if (!logymUid || !targets) return;
  try {
    await setDoc(doc(dbLogym, 'users', logymUid), {
      lomealSync: {
        targets: {
          kcal: Math.round(targets.kcal || 0),
          protein: Math.round(targets.protein || 0),
          carbs: Math.round(targets.carbs || 0),
          fat: Math.round(targets.fat || 0),
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push target kalori ke Logym:', e);
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

// Koreksi manual kalori dibakar (mis. user sebenarnya nyatet olahraga di app pihak ketiga,
// bukan Logym/Lomeal) — beda dari 3 fungsi di atas, ini nulis ke history_years/{tahun} (BUKAN
// users/{uid} root), karena bioData.activityCalories hidup di path history Logym sendiri.
// _manualFlags.activityCalories ikut di-set biar Logym gak nimpa balik pakai hitungan otomatisnya.
export const pushActivityOverrideToLogym = async (logymUid, ymd, burnedKcal) => {
  if (!logymUid || !ymd) return;
  const year = ymd.slice(0, 4);
  try {
    await setDoc(doc(dbLogym, 'users', logymUid, 'history_years', year), {
      [ymd]: {
        bioData: {
          activityCalories: Math.round(burnedKcal) || 0,
          _manualFlags: { activityCalories: true },
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push koreksi kalori dibakar ke Logym:', e);
  }
};
