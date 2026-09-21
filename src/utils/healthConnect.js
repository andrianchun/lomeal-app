// ============================================================
// ORCHESTRATOR HEALTH CONNECT via @capgo/capacitor-health (dua arah + backfill histori)
// Baca : kalori terbakar & langkah (smartwatch dsb.)
// Tulis: kalori yang dimakan (dietaryEnergyConsumed) + hidrasi (dietaryWater)
// Hanya aktif di platform native Android (Capacitor).
//
// GANTI PLUGIN (dari capacitor-health-connect ke @capgo/capacitor-health) — plugin lama
// TIDAK mendukung tipe 'Nutrition'/'Hydration'/'TotalCaloriesBurned' sama sekali (native-nya
// literally throw "Unexpected RecordType" kalau dipanggil pakai tipe itu), padahal kode lama
// di sini nembak persis tipe-tipe itu. Jadi fitur tulis-ke-Health-Connect selama ini SELALU
// gagal, bukan cuma soal bug izin di bawah.
// ============================================================
import { Capacitor, registerPlugin } from '@capacitor/core';
// Import STATIS, jangan diganti dynamic import lewat fungsi async — plugin Capacitor itu
// Proxy yang menganggap SEMUA akses property sebagai method native, termasuk `.then` yang
// diakses otomatis saat promise me-resolve nilai balikan fungsi async. Hasilnya panggilan
// native "Health.then()" yang gak ada → promise gak pernah selesai → semua pemanggil
// nge-hang diam-diam selamanya. (Bug nyata: tombol "Hubungkan" macet di "Menghubungkan...".)
import { Health } from '@capgo/capacitor-health';

const LomealHealth = registerPlugin('LomealHealth');

const isNative = () => Capacitor.isNativePlatform();

export const hcAvailable = async () => {
  if (!isNative()) return false;
  try {
    const H = Health;
    const res = await H.isAvailable();
    return !!res?.available;
  } catch { return false; }
};

// 'totalCalories' ikut diminta karena banyak sumber (mis. Samsung Health) cuma nulis
// TotalCaloriesBurned dan TIDAK pernah nulis ActiveCaloriesBurned — tanpa ini, query
// 'calories' balik kosong terus walau Health Connect penuh data (kejadian nyata).
const READ_TYPES = ['calories', 'totalCalories', 'steps', 'weight'];
const WRITE_TYPES = ['dietaryEnergyConsumed', 'dietaryWater'];

// Android gak nge-throw kalau user pencet "Tolak" di dialog izin — tetap resolve normal
// dengan readAuthorized/writeAuthorized kosong. Lempar di sini kalau BENERAN nihil, biar semua
// caller (App.jsx, OnboardingFlow.jsx, DietQuestionnaireModal.jsx) yang udah punya try/catch
// otomatis kebenerin tanpa perlu diubah manual satu-satu.
// requestHistoryAccess:true — tanpa ini Health Connect cuma kasih akses baca 30 hari terakhir,
// backfill histori yang lebih lama gak akan dapat apa-apa (lihat AndroidManifest.xml).
export const hcRequestPermissions = async () => {
  const H = Health;
  // Race pakai timeout — tanpa ini, kalau dialog izin native gagal muncul/nyangkut, tombol
  // "Hubungkan" nge-freeze diam-diam selamanya (gak ada error, gak ada dialog) dan user gak
  // tau apa yang salah.
  const result = await Promise.race([
    H.requestAuthorization({ read: READ_TYPES, write: WRITE_TYPES, requestHistoryAccess: true }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Waktu habis menunggu dialog izin Health Connect (30 detik) — dialognya kemungkinan gagal muncul. Coba lagi, atau buka app Health Connect langsung lalu cek/aktifkan izin untuk app ini secara manual.')), 30000)),
  ]);
  if (!result?.readAuthorized?.length && !result?.writeAuthorized?.length) {
    throw new Error('Izin ditolak — buka Pengaturan Android > Aplikasi > Health Connect > Aplikasi terhubung untuk memberi akses manual.');
  }
  return result;
};

// Cek izin yang BENERAN aktif sekarang (tanpa munculin dialog) — beda dari hcRequestPermissions,
// ini buat diagnosa: app bisa aja "nangkring" di daftar Health Connect padahal izin per-tipenya
// belum tentu ke-grant semua (khususnya tipe yang baru ditambahkan setelah user connect duluan).
export const hcCheckStatus = async () => {
  if (!isNative()) return null;
  try {
    const H = Health;
    return await H.checkAuthorization({ read: READ_TYPES, write: WRITE_TYPES });
  } catch (e) {
    console.warn('hcCheckStatus gagal:', e);
    return null;
  }
};

// Jumlahkan kalori per hari dari rentang tanggal, dengan fallback dua tipe:
// 'calories' (ActiveCaloriesBurned, bisa di-aggregate langsung — murah) dulu; kalau kosong,
// baru 'totalCalories' (TotalCaloriesBurned) yang HARUS dibaca mentah lalu dijumlah manual
// karena queryAggregated plugin ini gak dukung tipe itu (lihat aggregateMetrics di
// HealthManager.kt). Sumber macam Samsung Health cuma nulis yang kedua.
// Hasil: { 'YYYY-MM-DD': kcal }
const readCaloriesByDay = async (startISO, endISO) => {
  const H = Health;
  try {
    const res = await H.queryAggregated({
      dataType: 'calories', startDate: startISO, endDate: endISO, bucket: 'day', aggregation: 'sum',
    });
    const byDay = {};
    for (const s of res?.samples || []) {
      if (s.value > 0) byDay[s.startDate.slice(0, 10)] = Math.round(s.value);
    }
    if (Object.keys(byDay).length > 0) return byDay;
  } catch (e) {
    console.warn('readCaloriesByDay (calories) gagal:', e);
  }
  try {
    const res = await H.readSamples({
      dataType: 'totalCalories', startDate: startISO, endDate: endISO, limit: 5000, ascending: true,
    });
    const byDay = {};
    for (const s of res?.samples || []) {
      const ymd = s.startDate.slice(0, 10);
      byDay[ymd] = (byDay[ymd] || 0) + (s.value || 0);
    }
    Object.keys(byDay).forEach((ymd) => { byDay[ymd] = Math.round(byDay[ymd]); });
    return byDay;
  } catch (e) {
    console.warn('readCaloriesByDay (totalCalories) gagal:', e);
    return {};
  }
};

// Baca kalori terbakar untuk satu tanggal (YYYY-MM-DD)
export const hcReadBurnedCalories = async (ymd) => {
  if (!isNative()) return null;
  const byDay = await readCaloriesByDay(
    new Date(`${ymd}T00:00:00`).toISOString(),
    new Date(`${ymd}T23:59:59`).toISOString(),
  );
  return byDay[ymd] ?? null;
};

// ---------- SINKRONISASI NUTRISI KE HEALTH CONNECT (STANDAR ENTERPRISE) ----------
// Menggunakan custom plugin native LomealHealth jika tersedia di APK (mendukung NutritionRecord
// lengkap: mealType, nama makanan, protein, karbohidrat, lemak, serat, natrium, dan jam aktual).
// Fallback ke @capgo/capacitor-health jika masih berjalan di APK versi lama sebelum update native.

let lomealHealthAvailable = null;
export const isLomealHealthAvailable = async () => {
  if (!isNative()) return false;
  if (lomealHealthAvailable !== null) return lomealHealthAvailable;
  try {
    const res = await LomealHealth.isAvailable();
    lomealHealthAvailable = !!res?.available;
    return lomealHealthAvailable;
  } catch {
    lomealHealthAvailable = false;
    return false;
  }
};

const MEAL_TYPE_MAP = {
  breakfast: 1, // MEAL_TYPE_BREAKFAST
  lunch: 2,     // MEAL_TYPE_LUNCH
  dinner: 3,    // MEAL_TYPE_DINNER
  snack: 4,     // MEAL_TYPE_SNACK
  snack2: 4,
  snack3: 4,
  drink: 4,
};

const DEFAULT_SESSION_TIMES = {
  breakfast: '07:00',
  snack: '10:00',
  lunch: '12:00',
  snack2: '15:00',
  dinner: '19:00',
  snack3: '21:00',
  drink: '23:59',
};

const SESSION_LABELS = {
  breakfast: 'Sarapan',
  lunch: 'Makan Siang',
  dinner: 'Makan Malam',
  snack: 'Camilan',
  snack2: 'Camilan Siang',
  snack3: 'Camilan Malam',
  drink: 'Minuman',
};

const toIsoTimestamp = (ymd, timeStr) => {
  const t = (timeStr && timeStr.length >= 4) ? timeStr.slice(0, 5) : '12:00';
  const localDate = new Date(`${ymd}T${t.length === 5 ? t + ':00' : t}`);
  return isNaN(localDate.getTime()) ? new Date(`${ymd}T12:00:00`).toISOString() : localDate.toISOString();
};

/**
 * Sinkronkan seluruh sesi makan satu hari ke Health Connect.
 * @param {string} ymd - Format 'YYYY-MM-DD'
 * @param {object} mealsData - Map sesi makan: { breakfast: [entries], lunch: [entries], ... } atau objek totals
 */
export const hcSyncDayMeals = async (ymd, mealsData) => {
  if (!isNative() || !mealsData) return false;

  const nativeAvailable = await isLomealHealthAvailable();
  const sessionsPayload = [];

  if (typeof mealsData === 'object' && !('kcal' in mealsData)) {
    // Format standar: { breakfast: [entries], lunch: [entries], ... }
    for (const [sessionId, entries] of Object.entries(mealsData)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;

      const kcal = Math.round(entries.reduce((sum, e) => sum + (Number(e.nutrition?.kcal) || 0), 0));
      const protein = Math.round((entries.reduce((sum, e) => sum + (Number(e.nutrition?.protein) || 0), 0)) * 10) / 10;
      const carbs = Math.round((entries.reduce((sum, e) => sum + (Number(e.nutrition?.carbs) || 0), 0)) * 10) / 10;
      const fat = Math.round((entries.reduce((sum, e) => sum + (Number(e.nutrition?.fat) || 0), 0)) * 10) / 10;
      const fiber = Math.round((entries.reduce((sum, e) => sum + (Number(e.nutrition?.fiber) || 0), 0)) * 10) / 10;
      const sugar = Math.round((entries.reduce((sum, e) => sum + (Number(e.nutrition?.sugar) || 0), 0)) * 10) / 10;
      const sodium = Math.round(entries.reduce((sum, e) => sum + (Number(e.nutrition?.sodium) || 0), 0)); // mg

      if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) continue;

      const names = entries.map((e) => e.name?.trim()).filter(Boolean);
      const label = SESSION_LABELS[sessionId] || sessionId;
      const foodsText = names.length > 0 ? names.join(', ') : '';
      const macroParts = [];
      if (protein > 0) macroParts.push(`P: ${protein}g`);
      if (carbs > 0) macroParts.push(`K: ${carbs}g`);
      if (fat > 0) macroParts.push(`L: ${fat}g`);
      const macroStr = macroParts.length > 0 ? `(${macroParts.join(' • ')})` : '';

      let name = foodsText ? `${label}: ${foodsText}` : label;
      if (macroStr) name = `${name} ${macroStr}`;

      // Jam sesi aktual: ambil jam entry pertama yang punya field waktu, atau default waktu sesi
      const entryWithTime = entries.find((e) => e.time && typeof e.time === 'string');
      const timeStr = entryWithTime ? entryWithTime.time : (DEFAULT_SESSION_TIMES[sessionId] || '12:00');
      const startTime = toIsoTimestamp(ymd, timeStr);
      const endTime = new Date(new Date(startTime).getTime() + 15 * 60 * 1000).toISOString();

      const mealType = MEAL_TYPE_MAP[sessionId] || (sessionId.startsWith('snack') ? 4 : 0);

      sessionsPayload.push({
        sessionId,
        mealType,
        name,
        startTime,
        endTime,
        kcal,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        sodium,
      });
    }
  } else if (typeof mealsData === 'object' && ('kcal' in mealsData)) {
    // Format ringkasan / totals legacy
    const kcal = Math.round(Number(mealsData.kcal) || 0);
    if (kcal > 0) {
      const startTime = toIsoTimestamp(ymd, new Date().toTimeString().slice(0, 5));
      const endTime = new Date(new Date(startTime).getTime() + 15 * 60 * 1000).toISOString();
      sessionsPayload.push({
        sessionId: 'daily_total',
        mealType: 0,
        name: 'Total Harian',
        startTime,
        endTime,
        kcal,
        protein: Math.round(Number(mealsData.protein) || 0),
        carbs: Math.round(Number(mealsData.carbs) || 0),
        fat: Math.round(Number(mealsData.fat) || 0),
        fiber: Math.round(Number(mealsData.fiber) || 0),
        sugar: Math.round(Number(mealsData.sugar) || 0),
        sodium: Math.round(Number(mealsData.sodium) || 0),
      });
    }
  }

  // JALUR 1: Jika custom native plugin LomealHealth aktif (di APK yang sudah terpasang build baru)
  if (nativeAvailable) {
    try {
      await LomealHealth.syncDayNutrition({
        ymd,
        meals: sessionsPayload,
      });
      return true;
    } catch (e) {
      console.warn('LomealHealth.syncDayNutrition gagal, fallback ke generic:', e);
    }
  }

  // JALUR 2: Fallback plugin generic @capgo/capacitor-health (untuk APK lama sebelum rebuild)
  // Perbaikan penting: jangan hardcode 12:00:00! Tulis per sesi dengan waktu aktual sesi masing-masing.
  let pushedAny = false;
  for (const session of sessionsPayload) {
    const key = `hc_written_session_${session.sessionId}_${ymd}`;
    const already = Number(localStorage.getItem(key)) || 0;
    const delta = session.kcal - already;
    if (delta <= 0) continue;

    try {
      await Health.saveSample({
        dataType: 'dietaryEnergyConsumed',
        value: delta,
        startDate: session.startTime,
        endDate: session.endTime,
      });
      localStorage.setItem(key, String(session.kcal));
      pushedAny = true;
    } catch (e) {
      console.warn(`Fallback hcWrite ${session.sessionId} gagal:`, e);
    }
  }
  return pushedAny;
};

/**
 * Sinkronkan hidrasi harian ke Health Connect.
 */
export const hcSyncDayHydration = async (ymd, ml) => {
  if (!isNative()) return false;
  const val = Number(ml) || 0;

  const nativeAvailable = await isLomealHealthAvailable();
  if (nativeAvailable) {
    try {
      await LomealHealth.syncDayHydration({
        ymd,
        waterMl: val,
      });
      return true;
    } catch (e) {
      console.warn('LomealHealth.syncDayHydration gagal, fallback:', e);
    }
  }

  // Fallback: gunakan jam sekarang (bukan 12:00:00)
  const key = `hc_written_water_${ymd}`;
  const already = Number(localStorage.getItem(key)) || 0;
  const delta = val - already;
  if (delta <= 0) return false;

  const nowTime = new Date().toTimeString().slice(0, 5);
  const startTime = toIsoTimestamp(ymd, nowTime);
  const endTime = new Date(new Date(startTime).getTime() + 60 * 1000).toISOString();

  try {
    await Health.saveSample({
      dataType: 'dietaryWater',
      value: delta / 1000,
      startDate: startTime,
      endDate: endTime,
    });
    localStorage.setItem(key, String(val));
    return true;
  } catch (e) {
    console.warn('Fallback hcWrite water gagal:', e);
    return false;
  }
};

// Aliases agar semua pemanggil lama tetap kompatibel tanpa breaking changes
export const hcWriteNutrition = (ymd, data) => hcSyncDayMeals(ymd, data);
export const hcWriteHydration = (ymd, ml) => hcSyncDayHydration(ymd, ml);

// Backfill: tarik kalori-terbakar N hari ke belakang sekaligus (satu query teragregasi,
// bukan loop per-hari) — dipanggil sekali abis konek pertama kali, atau lewat tombol
// "Sinkron ulang" manual. `hasOtherSource(ymd)` mengembalikan true kalau hari itu SUDAH
// punya sumber data lain (mis. Logym) — backfill gak boleh nimpa itu, cuma isi yang kosong.
// `onDayResult(ymd, kcal)` dipanggil per hari yang berhasil diisi, biar caller yang nulis ke
// Firestore (lewat saveDay yang sudah ada) — file ini sengaja gak nulis Firestore sendiri.
export const hcBackfillBurnedCalories = async (days, hasOtherSource, onDayResult) => {
  if (!isNative()) return;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const byDay = await readCaloriesByDay(start.toISOString(), end.toISOString());
  for (const [ymd, kcal] of Object.entries(byDay)) {
    if (hasOtherSource(ymd)) continue;
    if (kcal > 0) onDayResult(ymd, kcal);
  }
};
