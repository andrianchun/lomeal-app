const fs = require('fs');

async function importTKPI() {
  console.log('Downloading TKPI JSON from GitHub...');
  const res = await fetch('https://raw.githubusercontent.com/ancxlol/tkpi-2020-database/main/data/tkpi_2020_pages_15_83.json');
  const items = await res.json();
  
  console.log(`Downloaded ${items.length} items. Processing...`);
  
  const formattedItems = items.map(item => {
    // We need to parse string values like "10,2" to 10.2, and handle "Tak" or "Tr" or null.
    const parseVal = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      const str = val.toString().trim().replace(',', '.');
      if (str === 'Tak' || str === 'Tr' || str === '-' || str === '') return 0;
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    // Make an ID
    const rawName = item.name || 'Unknown';
    const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + (item.code || Math.floor(Math.random()*1000));
    const name = rawName.substring(0, 50).replace(/'/g, "\\'");
    
    let category = 'packaged';
    const catStr = (item.category || '').toLowerCase();
    if (name.includes('bayam') || name.includes('bawang') || name.includes('tomat') || catStr.includes('sayur')) category = 'veggie';
    else if (name.includes('ayam') || name.includes('sapi') || name.includes('ikan') || name.includes('daging')) category = 'protein';
    else if (catStr.includes('buah')) category = 'fruit';
    else if (catStr.includes('serealia') || catStr.includes('umbi')) category = 'staple';

    const kcal = parseVal(item.energy_kcal);
    const protein = parseVal(item.protein_g);
    const fat = parseVal(item.fat_g);
    const carbs = parseVal(item.carb_g);
    const fiber = parseVal(item.fiber_g);
    
    const calcium = parseVal(item.calcium_mg);
    const fosfor = parseVal(item.phosphorus_mg);
    const iron = parseVal(item.iron_mg);
    const sodium = parseVal(item.sodium_mg);
    const kalium = parseVal(item.potassium_mg);
    const tembaga = parseVal(item.copper_mg);
    const zinc = parseVal(item.zinc_mg);
    
    const vitA = parseVal(item.retinol_mcg) + parseVal(item.beta_carotene_mcg) * 0.167; // roughly
    const vitB1 = parseVal(item.thiamin_mg);
    const vitB2 = parseVal(item.riboflavin_mg);
    const vitB3 = parseVal(item.niacin_mg);
    const vitC = parseVal(item.vitamin_c_mg);

    
    // Fill the rest with 0
    const sugar = 0;
    const chol = 0;
    const satFat = 0;
    const purine = 0;
    const mag = 0;
    const vitB6 = 0;
    const vitB9 = 0;
    const vitB12 = 0;
    const vitD = 0;
    const vitE = 0;
    const vitK = 0;

    const arr = [
      kcal, protein, carbs, fat, sodium, sugar, chol, satFat, iron, calcium, purine,
      fiber, kalium, fosfor, zinc, tembaga, mag,
      vitA, vitB1, vitB2, vitB3, vitB6, vitB9, vitB12, vitC, vitD, vitE, vitK
    ];
    
    return `  ['${id}', '${name}', '${category}', '100g', 100, [${arr.map(a => Math.round(a * 100) / 100).join(', ')}]],`;
  });

  console.log('Writing to src/data/tkpi.js...');
  
  const content = `// Auto-generated TKPI Database with 1100+ items
export const TKPI_DB = [
${formattedItems.join('\n')}
];

export const formatTKPI = (foods) => {
  return foods.map(f => {
    const n = f[5];
    return {
      id: f[0], name: f[1], category: f[2], unit: 'g', isDrink: false,
      portion: { label: f[3], grams: f[4] },
      nutrition: {
        kcal: n[0], protein: n[1], carbs: n[2], fat: n[3],
        sodium: n[4], sugar: n[5], cholesterol: n[6], satFat: n[7],
        iron: n[8], calcium: n[9], purine: n[10] || 0,
        fiber: n[11] || 0, kalium: n[12] || 0, fosfor: n[13] || 0, zinc: n[14] || 0,
        tembaga: n[15] || 0, magnesium: n[16] || 0,
        vitA: n[17] || 0, vitB1: n[18] || 0, vitB2: n[19] || 0, vitB3: n[20] || 0,
        vitB6: n[21] || 0, vitB9: n[22] || 0, vitB12: n[23] || 0, vitC: n[24] || 0,
        vitD: n[25] || 0, vitE: n[26] || 0, vitK: n[27] || 0,
      },
      source: 'TKPI Lomeal',
    };
  });
};
`;

  fs.writeFileSync('src/data/tkpi.js', content);
  console.log('Done! Imported ' + items.length + ' items.');
}

importTKPI().catch(console.error);
