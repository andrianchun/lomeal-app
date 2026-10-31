// ============================================================
// Lomeal External API Cascade (Tier 2 & 3)
// ============================================================
import { EMPTY_NUTRITION } from '../data/nutrition.js';

// Tier 2: OpenFoodFacts (Gratis, khusus produk kemasan ber-barcode)
export const searchOpenFoodFacts = async (query) => {
  try {
    const q = encodeURIComponent(query.trim());
    if (q.length < 3) return null; // terlalu pendek

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`https://world.openfoodfacts.net/api/v2/search?search_terms=${q}&fields=code,product_name,product_name_id,nutriments&page_size=5`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.products && data.products.length > 0) {
      // WAJIB VERIFIKASI RELEVANSI:
      // OpenFoodFacts sering mengembalikan produk acak bawaan/global (seperti 'Sidi Ali', 'Perly test3')
      // jika kata pencarian pengguna tidak ditemukan sama sekali di database mereka.
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
      const matchingProducts = data.products.filter(p => {
        const pName = (p.product_name_id || p.product_name || '').toLowerCase();
        return queryWords.some(qw => pName.includes(qw));
      });

      if (matchingProducts.length === 0) return null;

      // Ambil yang nutrisinya paling lengkap dari produk yang benar-benar relevan
      const product = matchingProducts.find(p => p.nutriments && p.nutriments['energy-kcal_100g']) || matchingProducts[0];
      
      if (!product || !product.nutriments) return null;
      
      const n = product.nutriments;
      const kcal = n['energy-kcal_100g'] || 0;
      if (kcal === 0) return null; // Abaikan jika kalori kosong

      return {
        foods: [{
          name: product.product_name_id || product.product_name || query,
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
    // Silently return null on search error
    return null;
  }
};
