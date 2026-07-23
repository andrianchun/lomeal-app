import React, { useMemo, useState } from 'react';
import { X, Search, Scale, ChefHat, Plus, Star } from 'lucide-react';
import { searchFoods, nutritionForAmount, FOOD_CATEGORIES } from '../data/foodDatabase';
import { scaleNutrition, NUTRIENTS } from '../data/nutrition';
import { makeEntry } from '../utils/foodLog';
import { recordFoodUsage, sortFoodsByUsage } from '../utils/foodUsage';

const NUTRIENT_FIELDS = NUTRIENTS.filter(n => n.key !== 'kcal').map(n => [n.key, `${n.label} (${n.unit})`]);

/**
 * Cari & pilih makanan (Database/Resep/Manual). Tiap item yang dipilih langsung
 * dikirim lewat onAdd — porsi/satuan/sesi diatur belakangan di satu tempat: sheet
 * batch "Catat Makanan" (LogTab) atau editor gram inline (HistoryTab). Modal ini
 * gak nyimpen state porsi sendiri lagi, biar gak ada 2 cara beda buat hal yang sama.
 */
const FoodPickerModal = ({ t, theme, open, onClose, onAdd, customFoods = [], recipes = [], initialTab = 'db', favoriteFoods = [] }) => {
  const [tab, setTab] = useState(initialTab); // 'db' | 'recipes' | 'manual'
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState(null);
  const [manual, setManual] = useState({ name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sodium: '', sugar: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '' });

  const results = useMemo(() => {
    let list = searchFoods(term, customFoods);
    if (category) list = list.filter(f => f.category === category);
    return sortFoodsByUsage(list, favoriteFoods).slice(0, 60);
  }, [term, category, customFoods, favoriteFoods]);

  if (!open) return null;

  const addFood = (food) => {
    const grams = food.portion?.grams || 100;
    recordFoodUsage(food.id);
    onAdd(makeEntry({
      name: food.name, foodId: food.id, grams, unit: food.unit,
      nutrition: nutritionForAmount(food, grams), source: 'db',
      baseNutrition: food.nutrition,
      baseGrams: 100,
    }));
  };

  const confirmManual = () => {
    const n = {};
    ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'sugar', 'cholesterol', 'satFat', 'iron', 'calcium', 'purine'].forEach(k => { n[k] = Number(manual[k]) || 0; });
    onAdd(makeEntry({
      name: manual.name || 'Makanan Manual', grams: Number(manual.grams) || 0, unit: 'g',
      nutrition: n, source: 'manual',
      baseNutrition: n,
      baseGrams: Number(manual.grams) || 1,
    }));
    setManual({ name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sodium: '', sugar: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '' });
  };

  const logRecipe = (recipe, portions = 1) => {
    onAdd(makeEntry({
      name: `${recipe.name} (${portions} porsi)`,
      grams: Math.round((recipe.totalGrams || 0) / (recipe.portions || 1) * portions),
      unit: 'g',
      nutrition: scaleNutrition(recipe.perPortion, portions),
      recipeId: recipe.id, source: 'recipe',
      baseNutrition: recipe.perPortion,
      baseGrams: (recipe.totalGrams || 0) / (recipe.portions || 1) || 1,
    }));
  };

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm no-swipe" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/90 border-white/10' : 'bg-white/90 border-black/10'} backdrop-blur-3xl shadow-[0_-10px_50px_rgba(0,0,0,0.3)] anim-rise`}>
        {/* Header + tabs */}
        <div className="p-4 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`h2 ${t.textMain}`}>Tambah Item</h2>
            <button onClick={onClose} className={`p-2 rounded-xl ${t.btnBg}`}><X size={16} className={t.textMuted} /></button>
          </div>

          <div className={`flex gap-1 rounded-2xl p-1 ${t.bgSunken}`}>
            {[['db', 'Database', Search], ['recipes', 'Resep', ChefHat], ['manual', 'Manual', Scale]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl body-md font-bold transition-all ${tab === id ? `${t.bgAccent} text-white shadow-glow` : t.textMuted}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {tab === 'db' && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar mt-3 -mx-1 px-1">
              {FOOD_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)}
                  className={`shrink-0 px-4 py-2 rounded-2xl body-md font-bold transition-all ${category === c.id ? `${t.bgAccent} text-white shadow-glow` : `${t.bgCardSoft} ${t.textMuted}`}`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Konten scroll */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* ---------- TAB DATABASE ---------- */}
          {tab === 'db' && (
            <div className="space-y-1.5">
              {results.map(f => (
                <button key={f.id} onClick={() => addFood(f)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-transform active:scale-[0.98] ${t.border} ${t.bgCard}`}>
                  <div className="min-w-0">
                    <p className={`body-md ${t.textMain} truncate flex items-center gap-1`}>
                      {favoriteFoods.includes(f.id) && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
                      {f.name}{f.isCustom ? ' ✏️' : ''}
                    </p>
                    <p className={`caption font-medium ${t.textMuted}`}>{f.portion.label} · {Math.round(f.nutrition.kcal * f.portion.grams / 100)} kkal</p>
                  </div>
                  <span className={`shrink-0 ml-2 p-2 rounded-full ${t.bgAccentSoft} ${t.textAccent}`}><Plus size={18} /></span>
                </button>
              ))}
              {results.length === 0 && <p className={`body-md text-center py-6 ${t.textMuted}`}>Tidak ketemu — coba tab Manual atau tambah di Tab Database.</p>}
            </div>
          )}

          {/* ---------- TAB RESEP ---------- */}
          {tab === 'recipes' && (
            <div className="space-y-1.5">
              {recipes.length === 0 && <p className={`body-md text-center py-6 ${t.textMuted}`}>Belum ada resep. Buat dulu di Tab Resep 👨‍🍳</p>}
              {recipes.map(r => (
                <div key={r.id} className={`flex items-center justify-between p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                  <div className="min-w-0">
                    <p className={`body-md ${t.textMain} truncate`}>{r.name}</p>
                    <p className={`caption font-medium ${t.textMuted}`}>{Math.round(r.perPortion?.kcal || 0)} kkal/porsi · {r.ingredients?.length || 0} bahan</p>
                  </div>
                  <button onClick={() => logRecipe(r, 1)} className={`shrink-0 ml-2 px-3.5 py-2.5 rounded-xl body-md font-bold ${t.bgAccent} shadow-glow`}>+1 porsi</button>
                </div>
              ))}
            </div>
          )}

          {/* ---------- TAB MANUAL (presisi) ---------- */}
          {tab === 'manual' && (
            <div className="space-y-2.5">
              <input className={inputCls} placeholder="Nama makanan" value={manual.name} onChange={(e) => setManual(m => ({ ...m, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Berat (g/ml)</p>
                  <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={manual.grams} onChange={(e) => setManual(m => ({ ...m, grams: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Energi (kkal)</p>
                  <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={manual.kcal} onChange={(e) => setManual(m => ({ ...m, kcal: e.target.value }))} placeholder="0" />
                </div>
                {NUTRIENT_FIELDS.map(([k, label]) => (
                  <div key={k}>
                    <p className={`caption font-medium mb-0.5 ${t.textMuted} truncate`}>{label}</p>
                    <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={manual[k]}
                      onChange={(e) => setManual(m => ({ ...m, [k]: e.target.value }))} placeholder="0" />
                  </div>
                ))}
              </div>
              <p className={`caption font-medium ${t.textMuted} mb-2`}>Isi nilai TOTAL untuk porsi yang kamu makan (bukan per 100g).</p>
              <button disabled={!manual.name || !manual.kcal} onClick={confirmManual}
                className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>Tambahkan</button>
            </div>
          )}
        </div>

        {/* Search bar — sengaja di BAWAH (dekat jempol, gampang ketemu) bukan nyempil di atas */}
        {tab === 'db' && (
          <div className={`shrink-0 p-3 pt-2 border-t ${t.border}`}>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border ${t.border} ${t.inputBg}`}>
              <Search size={16} className={t.textMuted} />
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari nasi goreng, tempe…" autoFocus
                className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FoodPickerModal;
