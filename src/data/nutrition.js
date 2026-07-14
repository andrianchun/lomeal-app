// ============================================================
// CORE ENGINE NUTRISI LOMEAL — Fase 3 & 4 blueprint
// Pelacakan ketat "The Big 6" + makro + energi.
// Seluruh logika di file ini berjalan lokal/offline (tanpa API).
// ============================================================

// Nutrien yang dilacak. key = properti pada objek nutrisi makanan (per 100g / per porsi).
export const NUTRIENTS = [
  { key: 'kcal',        label: 'Energi',       unit: 'kkal', macro: true },
  { key: 'protein',     label: 'Protein',      unit: 'g',    macro: true },
  { key: 'carbs',       label: 'Karbohidrat',  unit: 'g',    macro: true },
  { key: 'fat',         label: 'Lemak',        unit: 'g',    macro: true },
  // The Big 6 (mikro spesifik klinis) + purin kondisional
  { key: 'sodium',      label: 'Natrium',      unit: 'mg' },
  { key: 'sugar',       label: 'Gula',         unit: 'g'  },
  { key: 'cholesterol', label: 'Kolesterol',   unit: 'mg' },
  { key: 'satFat',      label: 'Lemak Jenuh',  unit: 'g'  },
  { key: 'iron',        label: 'Zat Besi',     unit: 'mg' },
  { key: 'calcium',     label: 'Kalsium',      unit: 'mg' },
  { key: 'purine',      label: 'Purin',        unit: 'mg', conditional: true }, // hanya profil Rendah Purin
];

export const EMPTY_NUTRITION = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0, cholesterol: 0, satFat: 0, iron: 0, calcium: 0, purine: 0 };

export const addNutrition = (a, b, factor = 1) => {
  const out = { ...a };
  NUTRIENTS.forEach(({ key }) => { out[key] = (out[key] || 0) + (Number(b?.[key]) || 0) * factor; });
  return out;
};

export const scaleNutrition = (n, factor) => {
  const out = {};
  NUTRIENTS.forEach(({ key }) => { out[key] = (Number(n?.[key]) || 0) * factor; });
  return out;
};

// ---------- Profil Diet Medis (Tahap 2 kuesioner) ----------
export const DIET_PROFILES = [
  { id: 'weight_loss',  label: 'Lo Fat',                   emoji: '🫃', desc: 'Lemak ditekan, defisit kalori terkontrol untuk penurunan berat badan.' },
  { id: 'muscle_gain',  label: 'Hi Protein',               emoji: '💪', desc: 'Surplus ringan dengan protein tinggi untuk pembentukan otot.' },
  { id: 'dash',         label: 'DASH / Anti-Hipertensi',   emoji: '🫀', desc: 'Natrium ketat, kaya kalsium — ramah tekanan darah.' },
  { id: 'low_purine',   label: 'Rendah Purin / Asam Urat', emoji: '🦶', desc: 'Batasi purin untuk mengelola asam urat / gout.' },
  { id: 'carnivore',    label: 'Carnivore',                emoji: '🥩', desc: 'Hampir tanpa karbo, protein & lemak hewani penuh.' },
  { id: 'vegan',        label: 'Vegan',                    emoji: '🌱', desc: 'Nabati penuh; perhatian ekstra pada zat besi & protein.' },
  { id: 'keto',         label: 'Ketogenik',                emoji: '🥑', desc: 'Karbo sangat rendah, lemak tinggi — tubuh berbahan bakar keton.' },
  { id: 'gluten_free',  label: 'Gluten-Free',              emoji: '🌾', desc: 'Menghindari gluten; fokus bahan alami bebas gandum.' },
];

export const PACES = [
  { id: 'santai',  label: 'Santai',  desc: '±10% penyesuaian kalori — pelan tapi konsisten', factor: 0.10 },
  { id: 'normal',  label: 'Normal',  desc: '±15% penyesuaian kalori — jalur teruji',         factor: 0.15 },
  { id: 'agresif', label: 'Agresif', desc: '±22% penyesuaian kalori — hasil cepat, disiplin tinggi', factor: 0.22 },
];

// Fase kalori — arah defisit/surplus, TERPISAH dari DIET_PROFILES (gaya makan/makro).
// Ini yang dulu jadi preset "Cutting/Maintenance/Clean Bulk" di Logym; sekarang milik Lomeal
// (murni urusan makan, gak ngaruh ke pemilihan/intensitas latihan) — dan disimpan per-hari
// (lihat calcTargets di bawah, field `dietGoal` ikut ke targets) buat kalender riwayat fase.
export const DIET_GOALS = [
  { id: 'cutting',     label: 'Cutting',     emoji: '✂️', desc: 'Defisit kalori — fokus turunkan berat badan.' },
  { id: 'maintenance', label: 'Maintenance', emoji: '⚖️', desc: 'Kalori seimbang — pertahankan berat & performa.' },
  { id: 'bulk',        label: 'Bulk',        emoji: '📈', desc: 'Surplus kalori — fokus naikkan berat/massa otot.' },
];

// ---------- Kalkulasi Target ----------
// BMR Mifflin-St Jeor; aktivitas dasar sedentary-ringan (1.375) karena bonus
// kalori olahraga masuk dinamis dari Lyfit/Health Connect, bukan flat multiplier tinggi.
export const calcBMR = ({ weight, height, age, gender }) => {
  if (!weight || !height || !age) return 0;
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(gender === 'female' ? base - 161 : base + 5);
};

export const calcTargets = (profile) => {
  const { weight = 70, dietGoal = 'maintenance', dietProfile = 'weight_loss', pace = 'normal' } = profile || {};
  const bmr = calcBMR(profile) || 1600;
  const tdee = Math.round(bmr * 1.375);
  const paceFactor = (PACES.find(p => p.id === pace) || PACES[1]).factor;

  // Arah kalori dari dietGoal (fase cutting/maintenance/bulk) — TERPISAH dari dietProfile
  // (gaya makan di bawah cuma ngatur rasio makro, gak lagi nentuin defisit/surplus).
  let kcal = tdee;
  if (dietGoal === 'cutting') kcal = Math.round(tdee * (1 - paceFactor));
  else if (dietGoal === 'bulk') kcal = Math.round(tdee * (1 + paceFactor * 0.6));

  // Makro (g): protein per kg BB menyesuaikan profil. Keto/Carnivore rasionya beda drastis
  // (karbo ditekan abis) makanya dihitung terpisah dari pola persen-lemak-tetap yang lain.
  const proteinPerKg = dietProfile === 'muscle_gain' ? 2.0 : dietProfile === 'weight_loss' ? 1.6
    : dietProfile === 'keto' ? 1.6 : dietProfile === 'carnivore' ? 2.2 : 1.2;
  const protein = Math.round(weight * proteinPerKg);
  let fat, carbs;
  if (dietProfile === 'keto') {
    carbs = 25; // g — batas ketat standar keto (~5% kalori)
    fat = Math.max(0, Math.round((kcal - protein * 4 - carbs * 4) / 9));
  } else if (dietProfile === 'carnivore') {
    carbs = 0;
    fat = Math.max(0, Math.round((kcal - protein * 4) / 9));
  } else if (dietProfile === 'weight_loss') {
    fat = Math.round((kcal * 0.18) / 9); // Lo Fat — lemak ditekan lebih dari default 27%
    carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  } else {
    fat = Math.round((kcal * 0.27) / 9);
    carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  }

  // Batas mikro harian (default klinis umum; DASH memperketat natrium)
  const targets = {
    kcal, protein, carbs, fat,
    sodium: dietProfile === 'dash' ? 1500 : 2000,     // mg (WHO/AHA)
    sugar: 50,                                         // g (Permenkes 30/2013)
    cholesterol: 300,                                  // mg
    satFat: Math.round((kcal * 0.10) / 9),             // g (<10% energi)
    iron: profile?.gender === 'female' ? 18 : 9,       // mg (AKG, target minimal)
    calcium: 1000,                                     // mg (target minimal)
    purine: dietProfile === 'low_purine' ? 400 : null, // mg — hanya dilacak kondisional
    waterGoal: profile?.waterGoal || 2000, // ml — bisa dikustom user, default 2000
    tdee, bmr, dietGoal,
  };
  return targets;
};

// Nutrien yang targetnya "minimal tercapai" (bukan batas atas)
export const MINIMUM_TARGETS = new Set(['protein', 'iron', 'calcium']);

// ---------- SMART WARNING (Logika Lokal, luring, if-else murni) ----------
// Mengembalikan daftar peringatan { level: 'warn'|'danger', nutrient, message }.
export const getSmartWarnings = (totals, targets, dietProfile) => {
  const warnings = [];
  const check = (key, label, unit) => {
    const target = targets?.[key];
    if (!target) return;
    if (MINIMUM_TARGETS.has(key)) return; // target minimal tidak memicu warning batas
    const ratio = (totals?.[key] || 0) / target;
    if (ratio >= 1) {
      warnings.push({ level: 'danger', nutrient: key, message: `${label} sudah melewati batas harian (${Math.round(ratio * 100)}%).` });
    } else if (ratio >= 0.85) {
      warnings.push({ level: 'warn', nutrient: key, message: `${label} menyentuh ${Math.round(ratio * 100)}% dari batas harian.` });
    }
  };

  check('sodium', 'Natrium', 'mg');
  check('sugar', 'Gula', 'g');
  check('cholesterol', 'Kolesterol', 'mg');
  check('satFat', 'Lemak jenuh', 'g');
  if (dietProfile === 'low_purine') check('purine', 'Purin', 'mg');

  // Peringatan kontekstual profil (contoh blueprint: DASH + natrium 85%)
  if (dietProfile === 'dash') {
    const r = (totals?.sodium || 0) / (targets?.sodium || 1500);
    if (r >= 0.85 && r < 1) {
      warnings.push({ level: 'warn', nutrient: 'sodium', message: 'Profil Anti-Hipertensi: kurangi makanan asin untuk sisa hari ini.' });
    }
  }
  if (dietProfile === 'vegan' && (totals?.iron || 0) < (targets?.iron || 18) * 0.4) {
    warnings.push({ level: 'warn', nutrient: 'iron', message: 'Asupan zat besi masih rendah — pertimbangkan sayuran hijau/kacang-kacangan.' });
  }
  return warnings;
};

// Total nutrisi satu hari log: jumlahkan semua entri di semua sesi makan
export const computeDayTotals = (day) => {
  let totals = { ...EMPTY_NUTRITION };
  if (!day?.meals) return totals;
  Object.values(day.meals).forEach((entries) => {
    (entries || []).forEach((e) => { totals = addNutrition(totals, e.nutrition); });
  });
  return totals;
};

// Status hari: defisit / maintenance / surplus terhadap TDEE + bonus olahraga
export const getEnergyBalance = (eatenKcal, tdee, burnedBonus = 0) => {
  const allowance = tdee + burnedBonus;
  const diff = eatenKcal - allowance;
  if (diff > 100) return { state: 'surplus', diff };
  if (diff < -100) return { state: 'deficit', diff };
  return { state: 'maintenance', diff };
};
