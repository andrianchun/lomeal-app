// ============================================================
// Lomeal External API Cascade (Tier 2 & 3)
// ============================================================
import { EMPTY_NUTRITION } from '../data/nutrition';

// Tier 2: OpenFoodFacts (Gratis, khusus produk kemasan ber-barcode)
export const searchOpenFoodFacts = async (query) => {
  try {
    const q = encodeURIComponent(query.trim());
    if (q.length < 3) return null; // terlalu pendek

    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=3`);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.products && data.products.length > 0) {
      // Ambil yang nutrisinya paling lengkap
      const product = data.products.find(p => p.nutriments && p.nutriments['energy-kcal_100g']) || data.products[0];
      
      if (!product || !product.nutriments) return null;
      
      const n = product.nutriments;
      const kcal = n['energy-kcal_100g'] || 0;
      if (kcal === 0) return null; // Abaikan jika kalori kosong

      return {
        foods: [{
          name: product.product_name || query,
          grams: 100, // OFF selalu menggunakan per 100g
          unit: 'g',
          isDrink: false,
          source: 'OpenFoodFacts',
          nutrition: {
            ...EMPTY_NUTRITION,
            kcal: kcal,
            protein: n['proteins_100g'] || 0,
            carbs: n['carbohydrates_100g'] || 0,
            fat: n['fat_100g'] || 0,
            sodium: (n['sodium_100g'] || 0) * 1000, // OFF sodium dalam g, kita butuh mg
            sugar: n['sugars_100g'] || 0,
            satFat: n['saturated-fat_100g'] || 0,
            fiber: n['fiber_100g'] || 0,
            calcium: (n['calcium_100g'] || 0) * 1000,
            iron: (n['iron_100g'] || 0) * 1000,
          },
          baseNutrition: {
             // ... akan diisi oleh LogTab / withBase
          }
        }]
      };
    }
    return null;
  } catch (e) {
    console.error('OFF Search Error', e);
    return null;
  }
};
