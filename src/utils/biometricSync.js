// ============================================================
// SINKRON KE LOGYM — SATU-SATUNYA file yang boleh menulis ke collection Logym
// (logym_users, project hexa-life) dari Lomeal. Dua hal:
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
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

const CAFFEINE_RULES = [
  { rx: /\b(pre[\s-]?workout|pwo|c4|gorilla\s?mode|total\s?war)\b/i, mg: 175, label: 'Pre-Workout' },
  { rx: /\b(double\s?espresso|cold\s?brew)\b/i, mg: 140, label: 'Kopi Kuat' },
  { rx: /\b(energy\s?drink|red\s?bull|monster|kratingdaeng|extra\s?joss|kuku\s?bima)\b/i, mg: 110, label: 'Energy Drink' },
  { rx: /\b(espresso|americano|kopi|coffee|latte|cappuccino|macchiato|mocha|flat\s?white|v60|arabika|robusta)\b/i, mg: 95, label: 'Kopi' },
  { rx: /\b(matcha)\b/i, mg: 70, label: 'Matcha' },
  { rx: /\b(green\s?tea|teh\s?hijau|oolong|black\s?tea|teh\s?hitam|earl\s?grey|thai\s?tea)\b/i, mg: 45, label: 'Teh' },
];

const SESSION_FALLBACK_TIME = {
  breakfast: '07:30',
  snack: '10:00',
  lunch: '12:30',
  snack2: '15:00',
  dinner: '19:00',
  snack3: '20:30',
  drink: '09:00',
};

/**
 * Ekstrak daftar konsumsi kafein / stimulan yang SUDAH DIMAKAN dari `dayData.meals` Lomeal
 * untuk dikirim ke Logym (`lomealSync.today.caffeineLogs` & `bioData.caffeineLogs`).
 * @returns {Array<{mg:number, time:string, source:string}>}
 */
export const extractDayCaffeineLogs = (dayData, defaultEaten = true) => {
  if (!dayData?.meals || typeof dayData.meals !== 'object') return [];
  const hidden = dayData?.hiddenSessions || [];
  const logs = [];

  Object.entries(dayData.meals).forEach(([sessionId, entries]) => {
    if (hidden.includes(sessionId) && !(entries || []).length) return;
    (entries || []).forEach((e) => {
      if (!e) return;
      const isPlanned = e.isMealPrep || e.source === 'recipe' || e.planned;
      const eaten = e.isEaten !== undefined ? Boolean(e.isEaten) : (isPlanned ? false : defaultEaten);
      if (!eaten) return;

      const name = String(e.name || e.title || '').trim();
      const explicitMg = Number(e.nutrition?.caffeine ?? e.caffeineMg ?? e.caffeine ?? 0);
      const rawTime = e.time || dayData?.sessionTimes?.[sessionId] || SESSION_FALLBACK_TIME[sessionId] || '09:00';
      const time = /^\d{1,2}:\d{2}/.test(String(rawTime)) ? String(rawTime).slice(0, 5) : '09:00';

      if (explicitMg > 0) {
        logs.push({ mg: Math.min(600, Math.round(explicitMg)), time, source: name || 'Kafein' });
        return;
      }

      if (!name) return;
      for (const rule of CAFFEINE_RULES) {
        if (rule.rx.test(name)) {
          logs.push({ mg: rule.mg, time, source: rule.label });
          break;
        }
      }
    });
  });

  return logs.sort((a, b) => a.time.localeCompare(b.time));
};

export const pushBiometricsToLogym = async (logymUid, { gender, dob, height, weight, activityLevel }) => {
  if (!logymUid) return;
  const patch = {};
  if (gender !== undefined) patch.gender = gender;
  if (dob !== undefined) patch.dob = dob;
  if (height !== undefined) patch.height = height;
  if (weight !== undefined) patch.weight = weight;
  if (activityLevel !== undefined) patch.activityLevel = activityLevel;
  if (Object.keys(patch).length === 0) return;
  try {
    await setDoc(doc(db, 'logym_users', logymUid), { settings: { userProfile: patch } }, { merge: true });
  } catch (e) {
    console.error('pushBiometricsToLogym error', e);
  }
};

export const pushPreferencesToLogym = async (logymUid, dietProfile, allergies, activityLevel) => {
  if (!logymUid) return;
  try {
    await setDoc(doc(db, 'logym_users', logymUid), {
      lomealSync: {
        preferences: {
          dietProfile: dietProfile || null,
          allergies: allergies || null,
          activityLevel: activityLevel || null,
        }
      }
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push preferences ke Logym:', e);
  }
};

// Target kalori/makro Lomeal → Logym. Delta bulking/cutting/maintenance murni urusan makan
// (gak ngaruh ke pemilihan/intensitas latihan — sudah dicek: satu-satunya pemakaian nutritionGoal
// di Logym cuma badge kosmetik, bukan logika program), jadi Lomeal jadi SATU-SATUNYA sumber
// kebenaran; Logym cuma baca field ini, gak punya preset delta sendiri lagi.
export const pushTargetsToLogym = async (logymUid, targets, todayTarget = null) => {
  if (!logymUid || !targets) return;
  try {
    const patch = {
      kcal: Math.round(targets.kcal || 0),
      tdee: Math.round(targets.tdee || 0),
      bmr: Math.round(targets.bmr || 0),
      dietGoal: targets.dietGoal || 'maintenance',
      protein: Math.round(targets.protein || 0),
      carbs: Math.round(targets.carbs || 0),
      fat: Math.round(targets.fat || 0),
    };
    if (todayTarget && todayTarget > 0) {
      patch.todayTarget = Math.round(todayTarget);
    }
    await setDoc(doc(db, 'logym_users', logymUid), {
      lomealSync: {
        targets: patch,
      },
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push target kalori ke Logym:', e);
  }
};

export const pushDailyTotalsToLogym = async (logymUid, ymd, totals, mealsCount = 0, dynamicTarget = null, caffeineLogs = null) => {
  if (!logymUid) return;
  try {
    const todayObj = {
      ymd,
      kcal: Math.round(totals.kcal || 0),
      protein: Math.round(totals.protein || 0),
      carbs: Math.round(totals.carbs || 0),
      fat: Math.round(totals.fat || 0),
      mealsCount: mealsCount,
      updatedAt: new Date().toISOString(),
    };
    if (dynamicTarget && dynamicTarget > 0) {
      todayObj.targetKcal = Math.round(dynamicTarget);
    }
    if (Array.isArray(caffeineLogs)) {
      todayObj.caffeineLogs = caffeineLogs;
    }
    await setDoc(doc(db, 'logym_users', logymUid), {
      lomealSync: {
        today: todayObj,
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
    await setDoc(doc(db, 'logym_users', logymUid, 'history_years', year), {
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

// Versi BATCH dari pushNutritionBioToLogym: satu tulisan untuk seluruh tahun.
//
// Dokumen history_years/{tahun} menampung SEMUA tanggal tahun itu, jadi menambal 300 hari yang
// bolong tidak butuh 300 setDoc — satu merge sudah cukup. Bentuk per-harinya identik dengan
// fungsi tunggal di atas; kalau salah satu diubah, ubah keduanya.
// @param {object} byYmd - { 'YYYY-MM-DD': kcal }
export const pushNutritionBatchToLogym = async (logymUid, year, byYmd) => {
  const dates = Object.keys(byYmd || {});
  if (!logymUid || dates.length === 0) return 0;
  const payload = {};
  dates.forEach((ymd) => {
    payload[ymd] = {
      bioData: {
        nutritionCalories: Math.round(byYmd[ymd]) || 0,
        _manualFlags: { nutritionCalories: true },
      },
    };
  });
  try {
    await setDoc(doc(db, 'logym_users', logymUid, 'history_years', String(year)), payload, { merge: true });
    return dates.length;
  } catch (e) {
    console.warn(`Gagal menambal kalori dimakan tahun ${year} ke Logym:`, e);
    return 0;
  }
};

// Push total kalori-dimakan dari Lomeal ke bioData.nutritionCalories Logym
// (di path history_years yang sama dengan activityCalories), agar grafik Logym
// bisa menampilkan data yang konsisten dengan food log Lomeal.
// Flag _manualFlags.nutritionCalories=true mencegah proses Logym menimpa data ini.
export const pushNutritionBioToLogym = async (logymUid, ymd, totalsOrKcal, caffeineLogs = null) => {
  if (!logymUid || !ymd) return;
  const year = ymd.slice(0, 4);
  const isObj = typeof totalsOrKcal === 'object' && totalsOrKcal !== null;
  const kcal = isObj ? totalsOrKcal.kcal : totalsOrKcal;
  const protein = isObj ? totalsOrKcal.protein : undefined;
  const carbs = isObj ? totalsOrKcal.carbs : undefined;
  const fat = isObj ? totalsOrKcal.fat : undefined;
  try {
    await setDoc(doc(db, 'logym_users', logymUid, 'history_years', year), {
      [ymd]: {
        bioData: {
          nutritionCalories: Math.round(kcal) || 0,
          ...(protein !== undefined ? { protein: Math.round(protein) || 0 } : {}),
          ...(carbs !== undefined ? { carbs: Math.round(carbs) || 0 } : {}),
          ...(fat !== undefined ? { fat: Math.round(fat) || 0 } : {}),
          ...(Array.isArray(caffeineLogs) ? { caffeineLogs } : {}),
          _manualFlags: { nutritionCalories: true },
        },
      },
    }, { merge: true });
  } catch (e) {
    console.warn('Gagal push kalori dimakan ke Logym bioData:', e);
  }
};
