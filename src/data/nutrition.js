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
  { key: 'iron', label: 'Zat Besi', macro: false, unit: 'mg' },
  { key: 'calcium', label: 'Kalsium', macro: false, unit: 'mg' },
  { key: 'purine', label: 'Purin', macro: false, unit: 'mg', conditional: true }, // Khusus low_purine
  { key: 'fiber', label: 'Serat', macro: false, unit: 'g' },
  { key: 'kalium', label: 'Kalium', macro: false, unit: 'mg' },
  { key: 'fosfor', label: 'Fosfor', macro: false, unit: 'mg' },
  { key: 'zinc', label: 'Seng (Zinc)', macro: false, unit: 'mg' },
  { key: 'tembaga', label: 'Tembaga', macro: false, unit: 'mg' },
  { key: 'magnesium', label: 'Magnesium', macro: false, unit: 'mg' },
  { key: 'vitA', label: 'Vitamin A', macro: false, unit: 'mcg' },
  { key: 'vitB1', label: 'Vitamin B1 (Thiamin)', macro: false, unit: 'mg' },
  { key: 'vitB2', label: 'Vitamin B2 (Riboflavin)', macro: false, unit: 'mg' },
  { key: 'vitB3', label: 'Vitamin B3 (Niacin)', macro: false, unit: 'mg' },
  { key: 'vitB6', label: 'Vitamin B6', macro: false, unit: 'mg' },
  { key: 'vitB9', label: 'Folat (B9)', macro: false, unit: 'mcg' },
  { key: 'vitB12', label: 'Vitamin B12', macro: false, unit: 'mcg' },
  { key: 'vitC', label: 'Vitamin C', macro: false, unit: 'mg' },
  { key: 'vitD', label: 'Vitamin D', macro: false, unit: 'mcg' },
  { key: 'vitE', label: 'Vitamin E', macro: false, unit: 'mg' },
  { key: 'vitK', label: 'Vitamin K', macro: false, unit: 'mcg' },
];

export const EMPTY_NUTRITION = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0, cholesterol: 0, satFat: 0, iron: 0, calcium: 0, purine: 0, fiber: 0, kalium: 0, fosfor: 0, zinc: 0, tembaga: 0, magnesium: 0, vitA: 0, vitB1: 0, vitB2: 0, vitB3: 0, vitB6: 0, vitB9: 0, vitB12: 0, vitC: 0, vitD: 0, vitE: 0, vitK: 0 };

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

// Batas aman minimum asupan kalori harian — dipotong ke sini APAPUN delta-nya (custom
// atau preset), karena bahaya diet ekstrem itu soal HASIL AKHIR (TDEE - delta), bukan
// besar angka delta-nya doang. -2000kkal buat TDEE 4000 masih wajar (sisa 2000kkal),
// tapi buat TDEE 2000 itu jadi 0kkal/hari — bahaya kelaparan. Angka umum dipakai
// klinis/WHO sebagai lantai konservatif (idealnya konsultasi dokter/ahli gizi buat kasus
// individual, ini bukan pengganti itu).
export const MIN_SAFE_KCAL = { female: 1200, male: 1500 };

export const calcTargets = (profile) => {
  const { weight = 70, dietGoal = 'maintenance', dietProfile = 'weight_loss', pace = 'normal', customDeltaKcal = null, customProteinPerKg = null } = profile || {};
  const bmr = calcBMR(profile) || 1600;
  const tdee = Math.round(bmr * 1.375);
  const paceFactor = (PACES.find(p => p.id === pace) || PACES[1]).factor;

  // Arah kalori dari dietGoal (fase cutting/maintenance/bulk) — TERPISAH dari dietProfile
  // (gaya makan di bawah cuma ngatur rasio makro, gak lagi nentuin defisit/surplus).
  // customDeltaKcal (kalau diisi) menang atas preset pace — delta APAPUN yang mau diisi.
  let kcal = tdee;
  if (dietGoal === 'cutting') {
    kcal = customDeltaKcal != null ? tdee - Math.abs(customDeltaKcal) : Math.round(tdee * (1 - paceFactor));
  } else if (dietGoal === 'bulk') {
    kcal = customDeltaKcal != null ? tdee + Math.abs(customDeltaKcal) : Math.round(tdee * (1 + paceFactor * 0.6));
  }

  // Lantai aman — gak peduli separah apa delta yang diminta, target gak pernah jatuh
  // di bawah ini. kcalFloored dikembalikan biar UI bisa kasih tau user kalau ke-potong.
  const safeMin = MIN_SAFE_KCAL[profile?.gender === 'female' ? 'female' : 'male'];
  const kcalFloored = kcal < safeMin;
  kcal = Math.max(kcal, safeMin);

  // Makro (g): protein per kg BB menyesuaikan profil. Keto/Carnivore rasionya beda drastis
  // (karbo ditekan abis) makanya dihitung terpisah dari pola persen-lemak-tetap yang lain.
  const proteinPerKg = customProteinPerKg != null ? customProteinPerKg : (dietProfile === 'muscle_gain' ? 2.0 : dietProfile === 'weight_loss' ? 1.6
    : dietProfile === 'keto' ? 1.6 : dietProfile === 'carnivore' ? 2.2 : 1.2);
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
  const medicalHistory = profile?.medicalHistory || [];
  const isHipertensi = medicalHistory.includes('Hipertensi') || medicalHistory.includes('Penyakit Jantung') || dietProfile === 'dash';
  const isDiabetes = medicalHistory.includes('Diabetes/Prediabetes');
  const isKolesterol = medicalHistory.includes('Kolesterol Tinggi');

  const targets = {
    kcal, protein, carbs, fat,
    sodium: isHipertensi ? 1500 : 2000,     // mg (WHO/AHA)
    sugar: isDiabetes ? 25 : 50,            // g (Permenkes 30/2013)
    cholesterol: isKolesterol ? 200 : 300,  // mg
    satFat: isKolesterol ? Math.round((kcal * 0.07) / 9) : Math.round((kcal * 0.10) / 9),
    iron: profile?.gender === 'female' ? 18 : 9,       // mg (AKG, target minimal)
    calcium: 1000,                                     // mg (target minimal)
    purine: dietProfile === 'low_purine' ? 400 : null, // mg — hanya dilacak kondisional
    fiber: 30, kalium: 4700, fosfor: 700, zinc: 11, tembaga: 0.9, magnesium: 350,
    vitA: 600, vitB1: 1.2, vitB2: 1.3, vitB3: 16, vitB6: 1.3, vitB9: 400, vitB12: 2.4,
    vitC: 90, vitD: 15, vitE: 15, vitK: 90,
    waterGoal: profile?.waterGoal || 2000, // ml — bisa dikustom user, default 2000
    tdee, bmr, dietGoal, customDeltaKcal, kcalFloored, customProteinPerKg,
  };
  return targets;
};

// Nutrien yang targetnya "minimal tercapai" (bukan batas atas)
export const MINIMUM_TARGETS = new Set([
  'protein', 'iron', 'calcium', 'fiber', 'kalium', 'fosfor', 'zinc', 'tembaga', 'magnesium',
  'vitA', 'vitB1', 'vitB2', 'vitB3', 'vitB6', 'vitB9', 'vitB12', 'vitC', 'vitD', 'vitE', 'vitK'
]);

// ---------- SMART WARNING (Logika Lokal, luring, if-else murni) ----------
// Mengembalikan daftar peringatan { level: 'warn'|'danger', nutrient, message }.
export const getSmartWarnings = (totals, targets, dietProfile, profile, lyfitToday, meals) => {
  const warnings = [];
  const medicalHistory = profile?.medicalHistory || [];
  const allergies = (profile?.allergies || '').toLowerCase();
  
  const check = (key, label, unit) => {
    const target = targets?.[key];
    if (!target) return;
    if (MINIMUM_TARGETS.has(key)) return; // target minimal tidak memicu warning batas
    const ratio = (totals?.[key] || 0) / target;
    if (ratio >= 1) {
      warnings.push({ level: 'danger', nutrient: key, message: `${label} melebihi batas (${Math.round(ratio * 100)}%).` });
    } else if (ratio >= 0.85) {
      warnings.push({ level: 'warn', nutrient: key, message: `${label} hampir maksimum (${Math.round(ratio * 100)}%).` });
    }
  };

  check('sodium', 'Natrium', 'mg');
  check('sugar', 'Gula', 'g');
  check('cholesterol', 'Kolesterol', 'mg');
  check('satFat', 'Lemak jenuh', 'g');
  if (dietProfile === 'low_purine' || medicalHistory.includes('Asam Urat')) check('purine', 'Purin', 'mg');

  // Peringatan kontekstual profil (contoh blueprint: DASH + natrium 85%)
  if (dietProfile === 'dash' || medicalHistory.includes('Hipertensi') || medicalHistory.includes('Penyakit Jantung')) {
    const r = (totals?.sodium || 0) / (targets?.sodium || 1500);
    if (r >= 0.85 && r < 1) {
      warnings.push({ level: 'warn', nutrient: 'sodium', message: 'Profil Jantung/Hipertensi: kurangi makanan asin untuk sisa hari ini.' });
    }
  }

  // Cek olahraga intens (Elektrolit)
  if (lyfitToday?.burnedKcal > 500 || lyfitToday?.workoutCount > 0) {
    warnings.push({ level: 'warn', nutrient: 'kalium', message: 'Kamu habis latihan intens! Jangan lupa kembalikan cairan & elektrolit (Natrium/Kalium).' });
  }

  // Cek kekurangan nutrisi krusial kalau sudah makan banyak (kcal > 70%)
  const kcalRatio = (totals?.kcal || 0) / (targets?.kcal || 2000);
  if (kcalRatio > 0.7) {
    if ((totals?.fiber || 0) / (targets?.fiber || 30) < 0.5) {
      warnings.push({ level: 'warn', nutrient: 'fiber', message: 'Asupan Serat masih sangat rendah. Perbanyak sayur dan buah hari ini!' });
    }
    if ((totals?.calcium || 0) / (targets?.calcium || 1000) < 0.5) {
      warnings.push({ level: 'warn', nutrient: 'calcium', message: 'Asupan Kalsium kurang. Usahakan minum susu atau makan tahu/tempe/sayur hijau.' });
    }
  }

  if (dietProfile === 'vegan' && (totals?.iron || 0) < (targets?.iron || 18) * 0.4) {
    warnings.push({ level: 'warn', nutrient: 'iron', message: 'Asupan zat besi masih rendah — pertimbangkan sayuran hijau/kacang-kacangan.' });
  }

  // Cek Alergi & Gaya Hidup Makanan dari meals
  if (meals) {
    let hasAnimalProduct = false;
    let foundAllergen = null;
    
    // Kata kunci alergi yang dilacak sederhana
    const userAllergens = allergies ? allergies.split(',').map(s => s.trim().toLowerCase()).filter(s => s) : [];
    const animalKeywords = ['ayam', 'sapi', 'daging', 'ikan', 'telur', 'susu', 'keju', 'udang', 'seafood', 'babi'];

    Object.values(meals).forEach(session => {
      if (!session) return;
      session.forEach(entry => {
        const foodName = entry.name.toLowerCase();
        if (dietProfile === 'vegan' && animalKeywords.some(k => foodName.includes(k))) {
          hasAnimalProduct = true;
        }
        for (const al of userAllergens) {
          if (foodName.includes(al)) {
            foundAllergen = al;
          }
        }
      });
    });

    if (dietProfile === 'vegan' && hasAnimalProduct) {
      warnings.push({ level: 'danger', nutrient: 'diet', message: 'Awas! Ada catatan konsumsi produk hewani padahal profil diet Anda Vegan.' });
    }
    if (foundAllergen) {
      warnings.push({ level: 'danger', nutrient: 'allergy', message: `Peringatan Alergi: Terdeteksi konsumsi yang mengandung '${foundAllergen}'.` });
    }
  }

  return warnings;
};

// Total nutrisi satu hari log: jumlahkan semua entri di semua sesi makan
export const computeDayTotals = (day, defaultEaten = true) => {
  let totals = { ...EMPTY_NUTRITION };
  if (!day?.meals) return totals;
  const hidden = day?.hiddenSessions || [];
  Object.entries(day.meals).forEach(([sessionId, entries]) => {
    if (hidden.includes(sessionId)) return;
    (entries || []).forEach((e) => { 
      const isMealPrep = e.isMealPrep || e.source === 'recipe';
      const eaten = e.isEaten !== undefined ? e.isEaten : (isMealPrep ? false : defaultEaten);
      if (eaten) {
        totals = addNutrition(totals, e.nutrition); 
      }
    });
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
