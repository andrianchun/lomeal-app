import React, { useMemo, useState } from 'react';
import { ChefHat, Plus, Trash2, X, Search, CalendarPlus, Share2, Loader2, Pill, GlassWater, CupSoda, Coffee, Beaker, Syringe, Tablets, ShieldPlus } from 'lucide-react';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { EMPTY_NUTRITION, addNutrition, scaleNutrition } from '../data/nutrition';
import { MEAL_SESSIONS, getLocalYMD, DAY_NAMES_ID } from '../data/constants';
import { makeEntry } from '../utils/foodLog';
import SupplementBuilder from '../components/SupplementBuilder';
import MedicineBuilder from '../components/MedicineBuilder';

const ICONS = { Beaker, Coffee, CupSoda, GlassWater, Pill, Syringe, Tablets, ShieldPlus };
const COLORS = [
  { id: 'sky', bg: 'bg-sky-500' }, { id: 'blue', bg: 'bg-blue-500' }, { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'purple', bg: 'bg-purple-500' }, { id: 'pink', bg: 'bg-pink-500' }, { id: 'rose', bg: 'bg-rose-500' },
  { id: 'orange', bg: 'bg-orange-500' }, { id: 'amber', bg: 'bg-amber-600' }, { id: 'emerald', bg: 'bg-emerald-500' },
  { id: 'zinc', bg: 'bg-zinc-600' },
];

/**
 * TAB 4: RENCANA & PROGRAM
 */
const RecipesTab = ({ t, theme, recipes, saveRecipesFn, customFoods, daysMap, saveDay, shareRecipe, showAlert, showConfirm, profile, saveProfilePatch }) => {
  const [activeTab, setActiveTab] = useState('resep'); // 'resep', 'suplemen', 'obat'
  const [editing, setEditing] = useState(null);  // draft resep di builder
  const [editingSupplement, setEditingSupplement] = useState(null);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [assigning, setAssigning] = useState(null); // resep yang sedang dijadwalkan
  const [ingSearch, setIngSearch] = useState('');
  const [shareBusy, setShareBusy] = useState(null);

  const drinkTemplates = profile?.drinkTemplates || [];
  const medicines = profile?.medicines || [];

  const ingResults = useMemo(() => ingSearch ? searchFoods(ingSearch, customFoods).slice(0, 8) : [], [ingSearch, customFoods]);

  const newRecipe = () => setEditing({
    id: `r_${Date.now()}`, name: '', portions: 2, ingredients: [], note: '', createdAt: new Date().toISOString(),
  });

  const draftTotals = useMemo(() => {
    if (!editing) return { ...EMPTY_NUTRITION };
    return editing.ingredients.reduce((acc, ing) => addNutrition(acc, ing.nutrition), { ...EMPTY_NUTRITION });
  }, [editing]);

  const saveDraft = () => {
    const totalGrams = editing.ingredients.reduce((s, i) => s + (i.grams || 0), 0);
    const portions = Math.max(1, Number(editing.portions) || 1);
    const recipe = {
      ...editing, portions, totalGrams,
      total: draftTotals,
      perPortion: scaleNutrition(draftTotals, 1 / portions),
    };
    const others = recipes.filter(r => r.id !== recipe.id);
    saveRecipesFn([recipe, ...others]);
    setEditing(null);
  };

  const deleteRecipe = async (r) => {
    if (!(await showConfirm(`Hapus resep "${r.name}"?`))) return;
    saveRecipesFn(recipes.filter(x => x.id !== r.id));
  };

  // ---------- Meal Prep Assigner ----------
  const [assignDays, setAssignDays] = useState([1, 2, 3, 4, 5]); // Sen-Jum default
  const [assignSession, setAssignSession] = useState('lunch');
  const [assignWeeks, setAssignWeeks] = useState(1);

  const runAssign = () => {
    const recipe = assigning;
    const today = new Date();
    let count = 0;
    for (let i = 0; i < assignWeeks * 7 + 1; i++) {
      const d = new Date(); d.setDate(today.getDate() + i);
      if (!assignDays.includes(d.getDay())) continue;
      const ymd = getLocalYMD(d);
      if (ymd <= getLocalYMD(today)) continue; // hanya tanggal maju (meal prep)
      const day = daysMap[ymd] || { meals: {} };
      const meals = { ...(day.meals || {}) };
      meals[assignSession] = [
        ...(meals[assignSession] || []),
        makeEntry({
          name: `${recipe.name} (1 porsi)`, grams: Math.round((recipe.totalGrams || 0) / recipe.portions),
          unit: 'g', nutrition: recipe.perPortion, recipeId: recipe.id, source: 'recipe', planned: true,
        }),
      ];
      saveDay(ymd, { ...day, meals });
      count++;
    }
    setAssigning(null);
    showAlert(`Resep dijadwalkan ke ${count} hari di Tab Histori 📅`);
  };

  const doShare = async (r) => {
    setShareBusy(r.id);
    try { await shareRecipe(r); await showAlert('Resep dibagikan ke Social Feed! 🎉'); }
    catch (e) { await showAlert(`Gagal share: ${e.message}`); }
    finally { setShareBusy(null); }
  };

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  // ============ BUILDER VIEWS ============
  if (editing) return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className={`h1 ${t.textMain}`}>Recipe Builder</h1>
        <button onClick={() => setEditing(null)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={16} className={t.textMuted} /></button>
      </div>
      <input className={inputCls} placeholder='Nama resep, mis. "Ayam Gochujang Diet"' value={editing.name}
        onChange={(e) => setEditing(r => ({ ...r, name: e.target.value }))} />
      <div className={`flex items-center gap-3 p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
        <span className={`body-md ${t.textMuted}`}>Jadi berapa porsi?</span>
        <div className="flex items-center gap-2 ml-auto">
          {[1, 2, 4, 6].map(n => (
            <button key={n} onClick={() => setEditing(r => ({ ...r, portions: n }))}
              className={`w-9 h-9 rounded-xl caption border ${editing.portions === n ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>{n}</button>
          ))}
          <input type="number" inputMode="numeric" value={editing.portions}
            onChange={(e) => setEditing(r => ({ ...r, portions: e.target.value }))}
            className={`w-12 h-9 text-center rounded-xl border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none`} />
        </div>
      </div>

      {/* Cari & tambah bahan */}
      <div className={`p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg}`}>
          <Search size={14} className={t.textMuted} />
          <input value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Cari bahan (dada ayam, santan…)"
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

      {/* Daftar bahan + gramasi */}
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
              className="p-1.5 text-red-400"><Trash2 size={13} /></button>
          </div>
        ))}
        {editing.ingredients.length === 0 && <p className={`body-md text-center py-4 ${t.textMuted}`}>Belum ada bahan — cari di atas ⬆️</p>}
      </div>

      {/* Estimasi nutrisi akhir */}
      <div className={`rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} p-4`}>
        <p className={`h3 ${t.textMuted} mb-2`}>Estimasi Nutrisi per Porsi (÷{editing.portions || 1})</p>
        <div className="grid grid-cols-4 gap-2">
          {[['kcal', 'kkal'], ['protein', 'Protein'], ['carbs', 'Karbo'], ['fat', 'Lemak']].map(([k, label]) => (
            <div key={k} className="text-center">
              <p className={`text-lg font-black tabular-nums ${t.textMain}`}>{Math.round(draftTotals[k] / (Number(editing.portions) || 1))}</p>
              <p className={`caption ${t.textMuted}`}>{label}{k !== 'kcal' && ' (g)'}</p>
            </div>
          ))}
        </div>
        <p className={`caption font-medium mt-2 ${t.textMuted}`}>
          Na {Math.round(draftTotals.sodium / (Number(editing.portions) || 1))}mg · Gula {Math.round(draftTotals.sugar / (Number(editing.portions) || 1))}g · Kolesterol {Math.round(draftTotals.cholesterol / (Number(editing.portions) || 1))}mg
        </p>
      </div>

      <button disabled={!editing.name || editing.ingredients.length === 0} onClick={saveDraft}
        className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>Simpan Resep</button>
    </div>
  );

  if (editingSupplement) return (
    <SupplementBuilder t={t} theme={theme} editing={editingSupplement} setEditing={setEditingSupplement}
      customFoods={customFoods}
      onSave={(item) => {
        const others = drinkTemplates.filter(d => d.id !== item.id);
        saveProfilePatch({ drinkTemplates: [item, ...others] });
        setEditingSupplement(null);
      }} />
  );

  if (editingMedicine) return (
    <MedicineBuilder t={t} editing={editingMedicine} setEditing={setEditingMedicine}
      onSave={(item) => {
        const others = medicines.filter(m => m.id !== item.id);
        saveProfilePatch({ medicines: [item, ...others] });
        setEditingMedicine(null);
      }} />
  );

  // ============ LIST VIEW ============
  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32">
      <div className={`flex items-center gap-1.5 mb-5 p-1.5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`}>
        {[
          { id: 'resep', label: 'Resep' },
          { id: 'suplemen', label: 'Suplemen' },
          { id: 'obat', label: 'Obat' },
        ].map(tb => (
          <button key={tb.id} onClick={() => setActiveTab(tb.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tb.id ? `${t.bgCard} shadow-sm text-emerald-500` : t.textMuted}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {activeTab === 'resep' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`h1 ${t.textMain}`}>Katalog Resep</h1>
              <p className={`body-md font-medium ${t.textMuted}`}>Rakit sekali, catat berulang kali.</p>
            </div>
            <button onClick={newRecipe} className={`p-3 rounded-2xl ${t.bgAccent} shadow-glow`}><Plus size={18} /></button>
          </div>

      {recipes.length === 0 && (
        <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-8 text-center`}>
          <ChefHat size={32} className={`mx-auto mb-2 ${t.textMuted}`} />
          <p className={`body-md ${t.textMuted}`}>Belum ada resep. Buat template resep pertamamu — bahan, jumlah, porsi, dan estimasi nutrisinya dihitung otomatis.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {recipes.map(r => (
          <div key={r.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`h2 ${t.textMain}`}>{r.name}</p>
                <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>
                  {r.ingredients.length} bahan · {r.portions} porsi · {Math.round(r.perPortion?.kcal || 0)} kkal/porsi
                </p>
              </div>
              <button onClick={() => deleteRecipe(r)} className="p-2 text-red-400"><Trash2 size={14} /></button>
            </div>
            <p className={`caption font-medium mt-1 ${t.textMuted} truncate`}>{r.ingredients.map(i => i.name).join(', ')}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setAssigning(r)}
                className={`flex-1 py-2.5 rounded-xl ${t.bgAccentSoft} border ${t.borderAccentSoft} ${t.textAccent} caption flex items-center justify-center gap-1.5`}>
                <CalendarPlus size={13} /> Jadwalkan (Meal Prep)
              </button>
              <button onClick={() => setEditing(r)} className={`px-4 py-2.5 rounded-xl border ${t.border} ${t.btnBg} caption ${t.textMain}`}>Edit</button>
              <button onClick={() => doShare(r)} disabled={shareBusy === r.id}
                className={`px-3 py-2.5 rounded-xl border ${t.border} ${t.btnBg} ${t.textMuted}`}>
                {shareBusy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
              </button>
            </div>
          </div>
        ))}
      </div>
      </>
      )}

      {activeTab === 'suplemen' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`h1 ${t.textMain}`}>Suplemen & Minuman</h1>
              <p className={`body-md font-medium ${t.textMuted}`}>Template kustom untuk Rak Minuman.</p>
            </div>
            <button onClick={() => setEditingSupplement({ id: `ds_${Date.now()}`, name: '', icon: 'CupSoda', color: 'sky', ingredients: [], nutrition: { ...EMPTY_NUTRITION } })} 
                    className={`p-3 rounded-2xl ${t.bgAccent} shadow-glow`}><Plus size={18} /></button>
          </div>

          {drinkTemplates.length === 0 && (
            <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-8 text-center`}>
              <CupSoda size={32} className={`mx-auto mb-2 ${t.textMuted}`} />
              <p className={`body-md ${t.textMuted}`}>Belum ada suplemen kustom. Klik + untuk membuat minuman pertamamu (misal: Jus Dada Ayam).</p>
            </div>
          )}

          <div className="space-y-2.5">
            {drinkTemplates.map(r => {
              const IconComp = ICONS[r.icon] || CupSoda;
              const bgClass = COLORS.find(c => c.id === r.color)?.bg || 'bg-zinc-500';
              return (
                <div key={r.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise flex items-center gap-4`}>
                  <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white ${bgClass}`}>
                    <IconComp size={24} />
                  </div>
                  <div className="flex-1">
                    <p className={`h2 ${t.textMain}`}>{r.name}</p>
                    <p className={`caption mt-0.5 ${t.textMuted}`}>{Math.round(r.nutrition?.kcal || 0)} kkal · {Math.round(r.nutrition?.protein || 0)}g P</p>
                  </div>
                  <button onClick={async () => {
                    if (await showConfirm(`Hapus minuman "${r.name}"?`)) saveProfilePatch({ drinkTemplates: drinkTemplates.filter(x => x.id !== r.id) });
                  }} className="p-2 text-red-400"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'obat' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`h1 ${t.textMain}`}>Jadwal Obat</h1>
              <p className={`body-md font-medium ${t.textMuted}`}>Daftar pengobatan rutin harian.</p>
            </div>
            <button onClick={() => setEditingMedicine({ id: `med_${Date.now()}`, name: '', icon: 'Pill', color: 'rose', signa: '', note: '' })} 
                    className={`p-3 rounded-2xl ${t.bgAccent} shadow-glow`}><Plus size={18} /></button>
          </div>

          {medicines.length === 0 && (
            <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-8 text-center`}>
              <Pill size={32} className={`mx-auto mb-2 ${t.textMuted}`} />
              <p className={`body-md ${t.textMuted}`}>Tidak ada jadwal obat. Tambahkan obat rutin jika ada.</p>
            </div>
          )}

          <div className="space-y-2.5">
            {medicines.map(r => {
              const IconComp = ICONS[r.icon] || Pill;
              const bgClass = COLORS.find(c => c.id === r.color)?.bg || 'bg-zinc-500';
              return (
                <div key={r.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise flex items-center gap-4`}>
                  <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white ${bgClass}`}>
                    <IconComp size={24} />
                  </div>
                  <div className="flex-1">
                    <p className={`h2 ${t.textMain}`}>{r.name}</p>
                    <p className={`caption mt-0.5 ${t.textMuted}`}>Signa: <span className="font-bold text-white">{r.signa}</span> {r.note && `(${r.note})`}</p>
                  </div>
                  <button onClick={async () => {
                    if (await showConfirm(`Hapus obat "${r.name}"?`)) saveProfilePatch({ medicines: medicines.filter(x => x.id !== r.id) });
                  }} className="p-2 text-red-400"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== MEAL PREP ASSIGNER SHEET ===== */}
      {assigning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setAssigning(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]' : 'bg-white'} p-4 anim-rise`}>
            <h2 className={`h2 ${t.textMain} mb-1`}>Jadwalkan "{assigning.name}"</h2>
            <p className={`caption font-medium ${t.textMuted} mb-3`}>1 porsi otomatis mengisi sesi terpilih pada hari-hari ini (mulai besok).</p>
            <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Hari:</p>
            <div className="flex gap-1.5 mb-3">
              {DAY_NAMES_ID.map((d, i) => (
                <button key={i} onClick={() => setAssignDays(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i])}
                  className={`flex-1 py-2 rounded-xl caption border ${assignDays.includes(i) ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>{d}</button>
              ))}
            </div>
            <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Sesi:</p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3">
              {MEAL_SESSIONS.map(s => (
                <button key={s.id} onClick={() => setAssignSession(s.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border caption ${assignSession === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Untuk:</p>
            <div className="flex gap-1.5 mb-4">
              {[[1, '1 minggu'], [2, '2 minggu'], [4, '1 bulan']].map(([w, label]) => (
                <button key={w} onClick={() => setAssignWeeks(w)}
                  className={`flex-1 py-2 rounded-xl caption border ${assignWeeks === w ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>{label}</button>
              ))}
            </div>
            <button disabled={assignDays.length === 0} onClick={runAssign}
              className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>Terapkan ke Kalender</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipesTab;
