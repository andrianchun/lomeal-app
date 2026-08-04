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
import { Capacitor } from '@capacitor/core';
// Import STATIS, jangan diganti dynamic import lewat fungsi async — plugin Capacitor itu
// Proxy yang menganggap SEMUA akses property sebagai method native, termasuk `.then` yang
// diakses otomatis saat promise me-resolve nilai balikan fungsi async. Hasilnya panggilan
// native "Health.then()" yang gak ada → promise gak pernah selesai → semua pemanggil
// nge-hang diam-diam selamanya. (Bug nyata: tombol "Hubungkan" macet di "Menghubungkan...".)
import { Health } from '@capgo/capacitor-health';

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

// Tulis kalori yang dimakan hari ini (ringkasan, bukan per-item — plugin ini gak dukung
// Nutrition record lengkap dengan makro) ke Health Connect.
export const hcWriteNutrition = async (ymd, totals) => {
  if (!isNative()) return false;
  try {
    const H = Health;
    await H.saveSample({
      dataType: 'dietaryEnergyConsumed',
      value: Math.round(totals.kcal || 0),
      startDate: new Date(`${ymd}T12:00:00`).toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('hcWriteNutrition gagal:', e);
    return false;
  }
};

export const hcWriteHydration = async (ymd, ml) => {
  if (!isNative() || !ml) return false;
  try {
    const H = Health;
    await H.saveSample({
      dataType: 'dietaryWater',
      value: ml / 1000, // plugin pakai liter, Lomeal nyimpen mL
      startDate: new Date(`${ymd}T12:00:00`).toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('hcWriteHydration gagal:', e);
    return false;
  }
};

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
