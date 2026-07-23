import React, { useMemo, useState } from 'react';
import { X, Search, Check, Beaker, Coffee, CupSoda, GlassWater, Pill } from 'lucide-react';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { EMPTY_NUTRITION, addNutrition } from '../data/nutrition';

const ICONS = { Beaker, Coffee, CupSoda, GlassWater, Pill };
const COLORS = [
  { id: 'sky', bg: 'bg-sky-500' },
  { id: 'blue', bg: 'bg-blue-500' },
  { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'purple', bg: 'bg-purple-500' },
  { id: 'pink', bg: 'bg-pink-500' },
  { id: 'rose', bg: 'bg-rose-500' },
  { id: 'orange', bg: 'bg-orange-500' },
  { id: 'amber', bg: 'bg-amber-600' },
  { id: 'emerald', bg: 'bg-emerald-500' },
  { id: 'zinc', bg: 'bg-zinc-600' },
];

const SupplementBuilder = ({ t, theme, editing, setEditing, onSave, customFoods }) => {
  const [ingSearch, setIngSearch] = useState('');

  const ingResults = useMemo(() => ingSearch ? searchFoods(ingSearch, customFoods).slice(0, 8) : [], [ingSearch, customFoods]);

  const draftTotals = useMemo(() => {
    return editing.ingredients.reduce((acc, ing) => addNutrition(acc, ing.nutrition), { ...EMPTY_NUTRITION });
  }, [editing.ingredients]);

  const handleSave = () => {
    onSave({
      ...editing,
      nutrition: draftTotals,
    });
  };

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  const CurrentIcon = ICONS[editing.icon] || CupSoda;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-4 anim-rise">
      <div className="flex items-center justify-between">
        <h1 className={`h1 ${t.textMain}`}>Rak Minuman Baru</h1>
        <button onClick={() => setEditing(null)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={16} className={t.textMuted} /></button>
      </div>

      <div className={`p-4 rounded-3xl flex items-center gap-4 border ${t.border} ${t.bgCard}`}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white ${COLORS.find(c => c.id === editing.color)?.bg || 'bg-zinc-500'}`}>
          <CurrentIcon size={32} />
        </div>
        <div className="flex-1">
          <input className={`${inputCls} !bg-transparent !border-b !rounded-none !px-0 !py-1 !text-xl font-black`} 
                 placeholder='Nama minuman (Jus Dada Ayam...)' value={editing.name}
                 onChange={(e) => setEditing(r => ({ ...r, name: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className={`caption font-bold mb-2 ${t.textMuted}`}>Pilih Ikon</p>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          {Object.keys(ICONS).map(iconName => {
            const IconComp = ICONS[iconName];
            const active = editing.icon === iconName;
            return (
              <button key={iconName} onClick={() => setEditing(r => ({ ...r, icon: iconName }))}
                className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center border transition-all ${active ? `${t.bgAccent} border-transparent text-white` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
                <IconComp size={22} />
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className={`caption font-bold mb-2 ${t.textMuted}`}>Pilih Warna</p>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
          {COLORS.map(c => {
            const active = editing.color === c.id;
            return (
              <button key={c.id} onClick={() => setEditing(r => ({ ...r, color: c.id }))}
                className={`w-10 h-10 shrink-0 rounded-full border-2 transition-all ${c.bg} ${active ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`} />
            )
          })}
        </div>
      </div>

      {/* Cari & tambah bahan */}
      <div className={`p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
        <p className={`caption font-bold mb-2 ${t.textMuted}`}>Kandungan Gizi (Opsional)</p>
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg}`}>
          <Search size={14} className={t.textMuted} />
          <input value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Cari bahan dari database..."
            className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} />
        </div>
        {ingResults.map(f => (
          <button key={f.id} onClick={() => {
            setEditing(r => ({ ...r, ingredients: [...r.ingredients, { foodId: f.id, name: f.name, grams: f.portion.grams, nutrition: nutritionForAmount(f, f.portion.grams) }] }));
            setIngSearch('');
          }} className={`w-full flex justify-between items-center px-3 py-2.5 mt-1 rounded-xl ${t.bgSunken}`}>
            <span className={`body-md ${t.textMain}`}>{f.name}</span>
            <span className={`caption ${t.textMuted}`}>{f.portion.label}</span>
          </button>
        ))}
      </div>

      {/* Daftar bahan */}
      <div className="space-y-1.5">
        {editing.ingredients.map((ing, i) => (
          <div key={i} className={`flex items-center gap-2 p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
            <p className={`body-md flex-1 ${t.textMain}`}>{ing.name}</p>
            <input type="number" inputMode="numeric" value={ing.grams}
              onChange={(e) => {
                const grams = Number(e.target.value) || 0;
                setEditing(r => ({
                  ...r,
                  ingredients: r.ingredients.map((x, j) => {
                    if (j !== i) return x;
                    const factor = x.grams > 0 ? grams / x.grams : 0;
                    return { ...x, grams, nutrition: Object.fromEntries(Object.entries(x.nutrition).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])) };
                  }),
                }));
              }}
              className={`w-16 text-right px-2 py-1 rounded-lg border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none`} />
            <span className={`caption ${t.textMuted}`}>g</span>
            <span className={`caption w-14 text-right ${t.textMuted}`}>{Math.round(ing.nutrition.kcal)} kkal</span>
            <button onClick={() => setEditing(r => ({ ...r, ingredients: r.ingredients.filter((_, j) => j !== i) }))}
              className="p-1.5 text-red-400"><X size={13} /></button>
          </div>
        ))}
        {editing.ingredients.length === 0 && <p className={`body-md text-center py-2 ${t.textMuted}`}>Tidak ada bahan tambahan (Kkal 0).</p>}
      </div>

      <div className={`rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} p-4`}>
        <p className={`h3 ${t.textMuted} mb-2`}>Total Nutrisi Suplemen</p>
        <div className="flex gap-4">
          <div className="flex-1">
            <p className={`text-xl font-black tabular-nums ${t.textMain}`}>{Math.round(draftTotals.kcal)}</p>
            <p className={`caption ${t.textMuted}`}>kkal</p>
          </div>
          <div className="flex-1">
            <p className={`text-xl font-black tabular-nums ${t.textMain}`}>{Math.round(draftTotals.protein)}</p>
            <p className={`caption ${t.textMuted}`}>Protein</p>
          </div>
          <div className="flex-1">
            <p className={`text-xl font-black tabular-nums ${t.textMain}`}>{Math.round(draftTotals.carbs)}</p>
            <p className={`caption ${t.textMuted}`}>Karbo</p>
          </div>
          <div className="flex-1">
            <p className={`text-xl font-black tabular-nums ${t.textMain}`}>{Math.round(draftTotals.fat)}</p>
            <p className={`caption ${t.textMuted}`}>Lemak</p>
          </div>
        </div>
      </div>

      <button disabled={!editing.name} onClick={handleSave}
        className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40 flex items-center justify-center gap-2`}>
        <Check size={18} /> Simpan ke Rak
      </button>
    </div>
  );
};

export default SupplementBuilder;
