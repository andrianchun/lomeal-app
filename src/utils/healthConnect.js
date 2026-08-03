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

const isNative = () => Capacitor.isNativePlatform();

const getPlugin = async () => {
  const { Health } = await import('@capgo/capacitor-health');
  return Health;
};

export const hcAvailable = async () => {
  if (!isNative()) return false;
  try {
    const H = await getPlugin();
    const res = await H.isAvailable();
    return !!res?.available;
  } catch { return false; }
};

const READ_TYPES = ['calories', 'steps', 'weight'];
const WRITE_TYPES = ['dietaryEnergyConsumed', 'dietaryWater'];

// Android gak nge-throw kalau user pencet "Tolak" di dialog izin — tetap resolve normal
// dengan readAuthorized/writeAuthorized kosong. Lempar di sini kalau BENERAN nihil, biar semua
// caller (App.jsx, OnboardingFlow.jsx, DietQuestionnaireModal.jsx) yang udah punya try/catch
// otomatis kebenerin tanpa perlu diubah manual satu-satu.
// requestHistoryAccess:true — tanpa ini Health Connect cuma kasih akses baca 30 hari terakhir,
// backfill histori yang lebih lama gak akan dapat apa-apa (lihat AndroidManifest.xml).
export const hcRequestPermissions = async () => {
  const H = await getPlugin();
  const result = await H.requestAuthorization({ read: READ_TYPES, write: WRITE_TYPES, requestHistoryAccess: true });
  if (!result?.readAuthorized?.length && !result?.writeAuthorized?.length) {
    throw new Error('Izin ditolak — buka Pengaturan Android > Aplikasi > Health Connect > Aplikasi terhubung untuk memberi akses manual.');
  }
  return result;
};

// Baca kalori aktif terbakar untuk satu tanggal (YYYY-MM-DD)
export const hcReadBurnedCalories = async (ymd) => {
  if (!isNative()) return null;
  try {
    const H = await getPlugin();
    const res = await H.queryAggregated({
      dataType: 'calories',
      startDate: new Date(`${ymd}T00:00:00`).toISOString(),
      endDate: new Date(`${ymd}T23:59:59`).toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });
    const total = res?.samples?.[0]?.value;
    return total != null ? Math.round(total) : null;
  } catch (e) {
    console.warn('hcReadBurnedCalories gagal:', e);
    return null;
  }
};

// Tulis kalori yang dimakan hari ini (ringkasan, bukan per-item — plugin ini gak dukung
// Nutrition record lengkap dengan makro) ke Health Connect.
export const hcWriteNutrition = async (ymd, totals) => {
  if (!isNative()) return false;
  try {
    const H = await getPlugin();
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
    const H = await getPlugin();
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
  try {
    const H = await getPlugin();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const res = await H.queryAggregated({
      dataType: 'calories',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      bucket: 'day',
      aggregation: 'sum',
    });
    for (const sample of res?.samples || []) {
      const ymd = sample.startDate.slice(0, 10);
      if (hasOtherSource(ymd)) continue;
      if (sample.value > 0) onDayResult(ymd, Math.round(sample.value));
    }
  } catch (e) {
    console.warn('hcBackfillBurnedCalories gagal:', e);
  }
};
