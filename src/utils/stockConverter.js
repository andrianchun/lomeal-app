import { normalizeUnit, URT_DICTIONARY } from './urtMapping';

// Simple NLP parsing to extract numeric value and its unit string
// Supports strings like: "1 kg", "500g", "2.5 liter", "1/2 panci", "5 buah"
export function parseQuantityString(str) {
  if (!str) return null;
  
  // Convert fractions to decimals (e.g. "1/2" -> "0.5")
  let cleanStr = str.trim().toLowerCase();
  cleanStr = cleanStr.replace(/(\d+)\/(\d+)/g, (match, n, d) => (Number(n) / Number(d)).toString());
  
  // Extract number and the rest of the string
  const match = cleanStr.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;
  
  const val = Number(match[1]);
  if (isNaN(val)) return null;
  
  const rawUnit = match[2].trim();
  return { value: val, unit: rawUnit, originalStr: str };
}

export function deductStock(currentQuantityStr, deductedGrams, deductedOriginalUnit = 'g') {
  if (!currentQuantityStr) return null; // No starting quantity
  if (deductedGrams <= 0) return currentQuantityStr;

  const parsed = parseQuantityString(currentQuantityStr);
  if (!parsed) return null; // Unparseable, let caller decide what to do
  
  let { value, unit } = parsed;
  let unitNorm = normalizeUnit(unit);
  
  // If the unit in Domus is 'g' or 'ml'
  if (['g', 'ml'].includes(unitNorm)) {
    value -= deductedGrams;
  }
  // If the unit is 'kg' or 'l'
  else if (['kg', 'l', 'liter'].includes(unitNorm)) {
    value -= (deductedGrams / 1000);
  }
  // If it's a URT unit like "buah", "biji", "mangkok", "porsi"
  else {
    // If lomeal unit was the SAME AS domus unit, we deduct numerically!
    // But LoMeal's consumed amount is passed here as `deductedGrams`. 
    // Wait, we need to know the URT equivalent.
    // URT_DICTIONARY is an object where keys are units and values are grams (e.g. URT_DICTIONARY['mangkok'] = 250)
    const unitWeight = URT_DICTIONARY[unitNorm];
    if (unitWeight && unitWeight > 0) {
      // 1 unit = unitWeight grams
      const deductedUnits = deductedGrams / unitWeight;
      value -= deductedUnits;
    } else {
      // Cannot reliably convert this unit to grams.
      return null;
    }
  }

  if (value <= 0) return '0';
  
  // Format nicely, max 2 decimals
  const formattedVal = Number(Math.round(value + 'e2') + 'e-2');
  
  // Use original unit string casing if possible
  const outUnit = parsed.originalStr.replace(/[\d.\s\/]/g, '').trim() || unit;
  return `${formattedVal} ${outUnit}`.trim();
}
