import React, { useMemo, useState } from 'react';
import { X, Search, Scale, ChefHat, Plus, Minus } from 'lucide-react';
import { searchFoods, nutritionForAmount, FOOD_CATEGORIES } from '../data/foodDatabase';
import { scaleNutrition } from '../data/nutrition';
import { makeEntry } from '../utils/foodLog';

/**
 * Manual Fallback Presisi (blueprint Tab 2): pencarian database + resep +
 * form gramasi pasti untuk meng-override ketika AI kurang akurat.
 * onAdd(entry) dipanggil per item yang dikonfirmasi.
 */
const FoodPickerModal = ({ t, theme, open, onClose, onAdd, customFoods = [], recipes = [], initialTab = 'db' }) => {
  const [tab, setTab] = useState(initialTab); // 'db' | 'recipes' | 'manual'
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState(null);
  const [selected, setSelected] = useState(null); // { food, grams }
  const [manual, setManual] = useState({ name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sodium: '', sugar: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '' });

  const results = useMemo(() => {
    let list = searchFoods(term, customFoods);
    if (category) list = list.filter(f => f.category === category);
    return list.slice(0, 60);
  }, [term, category, customFoods]);

  if (!open) return null;

  const confirmSelected = () => {
    const { food, grams } = selected;
    onAdd(makeEntry({
      name: food.name, foodId: food.id, grams, unit: food.unit,
      nutrition: nutritionForAmount(food, grams), source: 'db',
    }));
    setSelected(null);
  };

  const confirmManual = () => {
    const n = {};
    ['kcal', 'protein', 'carbs', 'fat', 'sodium', 'sugar', 'cholesterol', 'satFat', 'iron', 'calcium', 'purine'].forEach(k => { n[k] = Number(manual[k]) || 0; });
    onAdd(makeEntry({ name: manual.name || 'Makanan Manual', grams: Number(manual.grams) || 0, unit: 'g', nutrition: n, source: 'manual' }));
    setManual({ name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sodium: '', sugar: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '' });
    onClose();
  };

  const logRecipe = (recipe, portions = 1) => {
    onAdd(makeEntry({
      name: `${recipe.name} (${portions} porsi)`,
      grams: Math.round((recipe.totalGrams || 0) / (recipe.portions || 1) * portions),
      unit: 'g',
      nutrition: scaleNutrition(recipe.perPortion, portions),
      recipeId: recipe.id, source: 'recipe',
    }));
    onClose();
  };

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]' : 'bg-white'} anim-rise`}>
        {/* Header + tabs */}
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`h2 ${t.textMain}`}>Tambah Makanan</h2>
            <button onClick={onClose} className={`p-2 rounded-xl ${t.btnBg}`}><X size={16} className={t.textMuted} /></button>
          </div>
          <div className={`flex rounded-2xl p-1 ${t.bgSunken}`}>
            {[['db', 'Database', Search], ['recipes', 'Resep', ChefHat], ['manual', 'Manual', Scale]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl caption transition-all ${tab === id ? `${t.bgAccent} text-white shadow` : t.textMuted}`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {/* ---------- TAB DATABASE ---------- */}
          {tab === 'db' && !selected && (
            <>
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} mb-2`}>
                <Search size={14} className={t.textMuted} />
                <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari nasi goreng, tempe…"
                  className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} />
              </div>
              <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3 -mx-1 px-1">
                {FOOD_CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)}
                    className={`shrink-0 px-2.5 py-1.5 rounded-xl border caption ${category === c.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                {results.map(f => (
                  <button key={f.id} onClick={() => setSelected({ food: f, grams: f.portion.grams })}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left ${t.border} ${t.bgCard}`}>
                    <div>
                      <p className={`body-md ${t.textMain}`}>{f.name}{f.isCustom ? ' ✏️' : ''}</p>
                      <p className={`caption font-medium ${t.textMuted}`}>{f.portion.label} · {Math.round(f.nutrition.kcal * f.portion.grams / 100)} kkal</p>
                    </div>
                    <Plus size={16} className={t.textAccent} />
                  </button>
                ))}
                {results.length === 0 && <p className={`body-md text-center py-6 ${t.textMuted}`}>Tidak ketemu — coba tab Manual atau tambah di Tab Database.</p>}
              </div>
            </>
          )}

          {/* Detail porsi presisi */}
          {tab === 'db' && selected && (
            <div className="anim-rise">
              <p className={`h2 ${t.textMain} mb-1`}>{selected.food.name}</p>
              <p className={`caption font-medium ${t.textMuted} mb-4`}>Sumber: {selected.food.source || 'Custom'} · per 100{selected.food.unit}</p>
              <div className="flex items-center justify-center gap-4 mb-4">
                <button onClick={() => setSelected(s => ({ ...s, grams: Math.max(5, s.grams - 25) }))} className={`p-3 rounded-2xl ${t.btnBg}`}><Minus size={16} className={t.textMain} /></button>
                <div className="text-center">
                  <input type="number" inputMode="numeric" value={selected.grams}
                    onChange={(e) => setSelected(s => ({ ...s, grams: Number(e.target.value) || 0 }))}
                    className={`w-24 text-center text-3xl font-black bg-transparent outline-none no-spinners ${t.textMain}`} />
                  <p className={`caption ${t.textMuted}`}>{selected.food.unit === 'ml' ? 'mililiter' : 'gram'}</p>
                </div>
                <button onClick={() => setSelected(s => ({ ...s, grams: s.grams + 25 }))} className={`p-3 rounded-2xl ${t.btnBg}`}><Plus size={16} className={t.textMain} /></button>
              </div>
              <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl ${t.bgSunken} mb-4`}>
                {[['kcal', 'kkal'], ['protein', 'P (g)'], ['carbs', 'K (g)'], ['fat', 'L (g)']].map(([k, label]) => (
                  <div key={k} className="text-center">
                    <p className={`text-sm font-black tabular-nums ${t.textMain}`}>{Math.round(nutritionForAmount(selected.food, selected.grams)[k])}</p>
                    <p className={`caption ${t.textMuted}`}>{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} className={`px-4 py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md ${t.textMuted}`}>Kembali</button>
                <button onClick={confirmSelected} className={`flex-1 py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow`}>Tambahkan</button>
              </div>
            </div>
          )}

          {/* ---------- TAB RESEP ---------- */}
          {tab === 'recipes' && (
            <div className="space-y-1.5">
              {recipes.length === 0 && <p className={`body-md text-center py-6 ${t.textMuted}`}>Belum ada resep. Buat dulu di Tab Resep 👨‍🍳</p>}
              {recipes.map(r => (
                <div key={r.id} className={`flex items-center justify-between p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                  <div>
                    <p className={`body-md ${t.textMain}`}>{r.name}</p>
                    <p className={`caption font-medium ${t.textMuted}`}>{Math.round(r.perPortion?.kcal || 0)} kkal/porsi · {r.ingredients?.length || 0} bahan</p>
                  </div>
                  <button onClick={() => logRecipe(r, 1)} className={`px-3 py-2 rounded-xl caption ${t.bgAccent}`}>+1 porsi</button>
                </div>
              ))}
            </div>
          )}

          {/* ---------- TAB MANUAL (presisi) ---------- */}
          {tab === 'manual' && (
            <div className="space-y-2.5">
              <input className={inputCls} placeholder="Nama makanan" value={manual.name} onChange={(e) => setManual(m => ({ ...m, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                {[['grams', 'Berat (g/ml)'], ['kcal', 'Energi (kkal)'], ['protein', 'Protein (g)'], ['carbs', 'Karbo (g)'], ['fat', 'Lemak (g)'], ['sugar', 'Gula (g)'], ['sodium', 'Natrium (mg)'], ['cholesterol', 'Kolesterol (mg)'], ['satFat', 'Lemak Jenuh (g)'], ['iron', 'Zat Besi (mg)'], ['calcium', 'Kalsium (mg)'], ['purine', 'Purin (mg)']].map(([k, label]) => (
                  <div key={k}>
                    <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>{label}</p>
                    <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={manual[k]}
                      onChange={(e) => setManual(m => ({ ...m, [k]: e.target.value }))} placeholder="0" />
                  </div>
                ))}
              </div>
              <p className={`caption font-medium ${t.textMuted}`}>Isi nilai TOTAL untuk porsi yang kamu makan (bukan per 100g).</p>
              <button disabled={!manual.name || !manual.kcal} onClick={confirmManual}
                className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>Tambahkan</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FoodPickerModal;
