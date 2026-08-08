const MAX_PLAUSIBLE = { kcal: 3000, protein: 300, carbs: 300, fat: 300, sodium: 5000, sugar: 300, cholesterol: 1000, satFat: 100, transFat: 20, polyFat: 100, monoFat: 100, iron: 100, calcium: 3000, purine: 2000, fiber: 100, kalium: 5000, fosfor: 5000, zinc: 100, tembaga: 20, magnesium: 1000, vitA: 5000, vitB1: 50, vitB2: 50, vitB3: 200, vitB6: 50, vitB9: 2000, vitB12: 50, vitC: 2000, vitD: 100, vitE: 100, vitK: 1000, omega3: 5000 };

const clampNutrition = (n) => {
  const out = {};
  Object.entries(n || {}).forEach(([k, v]) => {
    let num = 0;
    if (typeof v === 'string') {
      const match = v.replace(',', '.').match(/[\d.]+/);
      num = match ? parseFloat(match[0]) : 0;
    } else {
      num = Number(v) || 0;
    }
    const max = MAX_PLAUSIBLE[k];
    out[k] = Math.max(0, max ? Math.min(num, max) : num);
  });
  return out;
};
console.log(clampNutrition({ kcal: "120 kkal", protein: "22 g", sodium: undefined, weird: "abc" }));
