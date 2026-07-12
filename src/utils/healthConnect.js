// ============================================================
// ORCHESTRATOR HEALTH CONNECT (Fase 10) — dua arah (read/write)
// Baca : kalori terbakar & langkah (smartwatch dsb.)
// Tulis: total kalori & makro yang dimakan + hidrasi
// Hanya aktif di platform native Android (Capacitor).
// ============================================================
import { Capacitor } from '@capacitor/core';

const isNative = () => Capacitor.isNativePlatform();

const getPlugin = async () => {
  const { HealthConnect } = await import('capacitor-health-connect');
  return HealthConnect;
};

export const hcAvailable = async () => {
  if (!isNative()) return false;
  try {
    const HC = await getPlugin();
    const res = await HC.checkAvailability();
    return res?.availability === 'Available';
  } catch { return false; }
};

const READ_TYPES = ['ActiveCaloriesBurned', 'TotalCaloriesBurned', 'Steps', 'Weight'];
const WRITE_TYPES = ['Nutrition', 'Hydration'];

export const hcRequestPermissions = async () => {
  const HC = await getPlugin();
  return HC.requestHealthPermissions({ read: READ_TYPES, write: WRITE_TYPES });
};

// Baca kalori aktif terbakar untuk satu tanggal (YYYY-MM-DD)
export const hcReadBurnedCalories = async (ymd) => {
  if (!isNative()) return null;
  try {
    const HC = await getPlugin();
    const start = new Date(`${ymd}T00:00:00`);
    const end = new Date(`${ymd}T23:59:59`);
    const res = await HC.readRecords({
      type: 'ActiveCaloriesBurned',
      timeRangeFilter: { type: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    });
    const records = res?.records || [];
    const totalKcal = records.reduce((sum, r) => sum + (r.energy?.value || r.energy || 0), 0);
    // Plugin memakai satuan kilokalori pada energy.unit 'kilocalories' umumnya
    return Math.round(totalKcal);
  } catch (e) {
    console.warn('hcReadBurnedCalories gagal:', e);
    return null;
  }
};

// Tulis ringkasan nutrisi harian yang dimakan user ke Health Connect
export const hcWriteNutrition = async (ymd, totals) => {
  if (!isNative()) return false;
  try {
    const HC = await getPlugin();
    const start = new Date(`${ymd}T12:00:00`);
    const end = new Date(`${ymd}T12:01:00`);
    await HC.insertRecords({
      records: [{
        type: 'Nutrition',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        energy: { unit: 'kilocalories', value: Math.round(totals.kcal || 0) },
        protein: { unit: 'grams', value: Math.round(totals.protein || 0) },
        totalCarbohydrate: { unit: 'grams', value: Math.round(totals.carbs || 0) },
        totalFat: { unit: 'grams', value: Math.round(totals.fat || 0) },
        sodium: { unit: 'milligrams', value: Math.round(totals.sodium || 0) },
        sugar: { unit: 'grams', value: Math.round(totals.sugar || 0) },
        mealType: 4, // unknown/total harian
      }],
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
    const HC = await getPlugin();
    const start = new Date(`${ymd}T12:00:00`);
    const end = new Date(`${ymd}T12:01:00`);
    await HC.insertRecords({
      records: [{
        type: 'Hydration',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        volume: { unit: 'milliliters', value: Math.round(ml) },
      }],
    });
    return true;
  } catch (e) {
    console.warn('hcWriteHydration gagal:', e);
    return false;
  }
};
