import React, { useMemo, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ChefHat, Plus, Trash2, X, Search, CalendarPlus, Share2, Loader2, Pill, GlassWater, CupSoda, Coffee, Beaker, Syringe, Tablets, ShieldPlus, Bot, ClipboardList, Sparkles } from 'lucide-react';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { EMPTY_NUTRITION, addNutrition, scaleNutrition, DIET_PROFILES } from '../data/nutrition';
import { MEAL_SESSIONS, getLocalYMD, DAY_NAMES_ID } from '../data/constants';
import { makeEntry } from '../utils/foodLog';
import { generateDietRecipe } from '../utils/aiFood';
import SupplementBuilder from '../components/SupplementBuilder';
import MedicineBuilder from '../components/MedicineBuilder';
import DietQuestionnaireModal from '../components/DietQuestionnaireModal';

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
const ProgramTab = ({ t, theme, recipes, saveRecipesFn, mealPreps, saveMealPrepsFn, customFoods, daysMap, saveDay, shareRecipe, showAlert, showConfirm, profile, saveProfilePatch, aiKey }) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.swipeDir === 'right' ? 'suplemen_obat' : 'resep'); // 'resep', 'suplemen_obat'
  
  const swipeXRef = useRef({ start: 0, end: 0 });
  const handleSubTabTouchStart = (e) => { swipeXRef.current.start = e.touches[0].clientX; };
  const handleSubTabTouchMove = (e) => { swipeXRef.current.end = e.touches[0].clientX; };
  const handleSubTabTouchEnd = (e) => {
    const dist = swipeXRef.current.start - swipeXRef.current.end;
    if (Math.abs(dist) < 50) return;
    if (dist > 0 && activeTab === 'resep') { setActiveTab('suplemen_obat'); e.stopPropagation(); }
    else if (dist < 0 && activeTab === 'suplemen_obat') { setActiveTab('resep'); e.stopPropagation(); }
  };
  const [editing, setEditing] = useState(null);  // draft resep di builder
  const [editingSupplement, setEditingSupplement] = useState(null);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [assigning, setAssigning] = useState(null); // resep yang sedang dijadwalkan
  const [ingSearch, setIngSearch] = useState('');
  const [shareBusy, setShareBusy] = useState(null);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  const isDark = theme === 'dark';

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

  const getAvailableStock = (b) => {
    let scheduledUneaten = 0;
    Object.values(daysMap).forEach(day => {
      if (!day.meals) return;
      Object.values(day.meals).flat().forEach(e => {
        if (e.batchId === b.id && !e.isEaten) scheduledUneaten++;
      });
    });
    return b.remainingPortions - scheduledUneaten;
  };

  const startCook = async (r) => {
    if (!(await showConfirm(`Mulai masak "${r.name}" (${r.portions} porsi)? Stok akan ditambahkan ke Kulkas.`))) return;
    
    const existingIndex = mealPreps.findIndex(b => b.recipeId === r.id);
    if (existingIndex >= 0) {
      const existing = mealPreps[existingIndex];
      const updatedBatch = {
        ...existing,
        initialPortions: existing.initialPortions + r.portions,
        remainingPortions: existing.remainingPortions + r.portions,
        totalGrams: (existing.totalGrams || 0) + (r.totalGrams || 0),
        perPortion: r.perPortion,
      };
      const newMealPreps = [...mealPreps];
      newMealPreps[existingIndex] = updatedBatch;
      saveMealPrepsFn(newMealPreps);
    } else {
      const newBatch = {
        id: `b_${Date.now()}`,
        recipeId: r.id,
        name: r.name,
        initialPortions: r.portions,
        remainingPortions: r.portions,
        perPortion: r.perPortion,
        totalGrams: r.totalGrams,
        createdAt: new Date().toISOString(),
      };
      saveMealPrepsFn([newBatch, ...mealPreps]);
    }
    showAlert(`Berhasil memasak ${r.portions} porsi ${r.name}! 👨‍🍳`);
  };

  const deleteBatch = async (b) => {
    if (!(await showConfirm(`Buang sisa stok "${b.name}"? Ini juga akan menghapus jadwal masa depan yang belum dimakan.`))) return;
    
    saveMealPrepsFn(mealPreps.filter(x => x.id !== b.id));
    
    let deletedCount = 0;
    const newDaysMap = { ...daysMap };
    let changed = false;
    
    Object.entries(newDaysMap).forEach(([ymd, day]) => {
      if (!day.meals) return;
      const meals = { ...day.meals };
      let dayChanged = false;
      Object.keys(meals).forEach(session => {
        const originalLen = meals[session].length;
        meals[session] = meals[session].filter(e => e.batchId !== b.id || e.isEaten);
        if (meals[session].length !== originalLen) {
          deletedCount += (originalLen - meals[session].length);
          dayChanged = true;
        }
      });
      if (dayChanged) {
        newDaysMap[ymd] = { ...day, meals };
        saveDay(ymd, newDaysMap[ymd]);
        changed = true;
      }
    });
    
    showAlert(`Sisa stok dibuang. ${deletedCount} jadwal terhapus.`);
  };

  const runAssign = () => {
    const batch = assigning;
    const today = new Date();
    
    const maxAllowed = getAvailableStock(batch);
    if (maxAllowed <= 0) {
      showAlert(`Stok tidak cukup! Sisa stok yang belum dijadwalkan: 0 porsi.`);
      setAssigning(null);
      return;
    }

    let count = 0;
    for (let i = 0; i < 365; i++) {
      if (count >= maxAllowed) break;
      const d = new Date(); d.setDate(today.getDate() + i);
      if (!assignDays.includes(d.getDay())) continue;
      const ymd = getLocalYMD(d);
      if (ymd <= getLocalYMD(today)) continue; // hanya tanggal maju (meal prep)
      const day = daysMap[ymd] || { meals: {} };
      const meals = { ...(day.meals || {}) };
      meals[assignSession] = [
        ...(meals[assignSession] || []),
        makeEntry({
          name: `${batch.name} (1 porsi)`, 
          grams: Math.round((batch.totalGrams || 0) / batch.initialPortions),
          unit: 'g', nutrition: batch.perPortion, 
          recipeId: batch.recipeId, 
          batchId: batch.id,
          source: 'recipe', planned: true,
          isMealPrep: true
        }),
      ];
      saveDay(ymd, { ...day, meals });
      count++;
    }
    setAssigning(null);
    showAlert(`Meal Prep dijadwalkan ke ${count} hari! 📅`);
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
  
  const currentDiet = DIET_PROFILES.find(d => d.id === profile?.dietProfile) || DIET_PROFILES[0];
  
  const generateOfflineRecipes = async () => {
    const dietName = currentDiet.label;
    if (!(await showConfirm(`Generate resep (Offline) untuk program diet "${dietName}"?`))) return;
    
    const aiRecipe = {
      id: `r_ai_${Date.now()}`,
      name: `Menu Offline: ${dietName} Praktis`,
      portions: 2,
      ingredients: [
          { foodId: 'dada_ayam_mentah', name: 'Dada Ayam Mentah', grams: 200, nutrition: { kcal: 240, protein: 46, carbs: 0, fat: 5, sodium: 90, sugar: 0, cholesterol: 146 } },
          { foodId: 'minyak_zaitun', name: 'Minyak Zaitun', grams: 15, nutrition: { kcal: 133, protein: 0, carbs: 0, fat: 15, sodium: 0, sugar: 0, cholesterol: 0 } }
      ],
      note: 'Resep hasil racikan offline berdasarkan profil.',
      createdAt: new Date().toISOString(),
      totalGrams: 215,
      total: { kcal: 373, protein: 46, carbs: 0, fat: 20, sodium: 90, sugar: 0, cholesterol: 146 },
      perPortion: { kcal: 186.5, protein: 23, carbs: 0, fat: 10, sodium: 45, sugar: 0, cholesterol: 73 }
    };
    saveRecipesFn([aiRecipe, ...recipes]);
    showAlert(`1 Resep Offline berhasil ditambahkan ke Buku Resep! 🍲`);
  };

  const generateTrueAIRecipes = async () => {
    const dietName = currentDiet.label;
    if (!(await showConfirm(`Panggil AI sesungguhnya untuk meracik resep khusus diet "${dietName}"? Pastikan koneksi internet stabil.`))) return;
    
    showAlert(`Memanggil AI untuk memformulasikan resep ${dietName}... 🤖`);
    try {
        const generated = await generateDietRecipe(aiKey, {
            dietProfile: currentDiet.id,
            dietName: currentDiet.label,
            medicalHistory: profile?.medicalHistory || [],
            allergies: profile?.allergies || ''
        });
        
        const aiRecipe = {
          id: `r_ai_${Date.now()}`,
          name: generated.name || `Resep AI ${dietName}`,
          portions: generated.portions || 2,
          ingredients: generated.ingredients || [],
          note: generated.note || 'Resep otomatis hasil generate AI.',
          createdAt: new Date().toISOString(),
        };

        // Recalculate totals to be safe
        let tGrams = 0;
        let tNut = { ...EMPTY_NUTRITION };
        aiRecipe.ingredients.forEach(ing => {
            tGrams += Number(ing.grams || 0);
            tNut = addNutrition(tNut, ing.nutrition || {});
        });
        aiRecipe.totalGrams = tGrams;
        aiRecipe.total = tNut;
        aiRecipe.perPortion = scaleNutrition(tNut, 1 / aiRecipe.portions);

        saveRecipesFn([aiRecipe, ...recipes]);
        showAlert(`Resep AI "${aiRecipe.name}" berhasil dibuat! 🍲`);
    } catch (err) {
        if (err.message === 'RATE_LIMIT_EXCEEDED') {
            showAlert('Limit AI harian habis! Gunakan Generate Offline atau masukkan API Key pribadimu di Pengaturan.');
        } else {
            showAlert(`Gagal generate AI: ${err.message}`);
        }
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32" onTouchStart={handleSubTabTouchStart} onTouchMove={handleSubTabTouchMove} onTouchEnd={handleSubTabTouchEnd}>
      
      {/* KARTU PROGRAM DIET (Logym Style) */}
      <div 
        className={`w-full rounded-[2rem] border-0 shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden transition-all flex flex-col relative min-h-[340px] sm:min-h-[360px] mb-6`}
      >
        {/* --- Background Image Layer --- */}
        <div 
          className={`absolute inset-0 z-0 pointer-events-none transition-all duration-700 opacity-100`}
          style={{
            backgroundImage: `url('/bg-program.webp')`,
            backgroundSize: '150%',
            backgroundPosition: 'center 20%',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className={`absolute inset-0 z-0 bg-gradient-to-t ${isDark ? 'from-[#05070d]/90 via-[#05070d]/50 to-transparent' : 'from-black/80 via-black/40 to-transparent'} pointer-events-none`} />
        {/* ------------------------------ */}
        
        <div className="mt-auto relative z-10 w-full flex flex-col">
          {/* TEXT HEADER (NO BLUR) */}
          <div className="w-full sm:w-3/4 p-5 pb-4 sm:p-6 sm:pb-5">
            <div className="flex items-center gap-2 mb-2">
              <h3 className={`font-black text-3xl text-white drop-shadow-lg`}>Program Diet</h3>
            </div>
            <p className={`text-sm font-medium text-white/90 drop-shadow-md leading-relaxed`}>
              Jawab beberapa pertanyaan untuk mendapatkan program diet dan resep terbaik yang dipersonalisasi untuk Anda.
            </p>
          </div>

          {/* GLASSMORPHISM BUTTONS OVERLAY */}
          <div className={`w-full ${isDark ? 'bg-black/10 backdrop-blur-sm border-t border-white/10' : 'bg-black/5 backdrop-blur-sm border-t border-white/20'} p-5 pt-4 sm:p-6 sm:pt-4 transition-all duration-300`}>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowQuestionnaire(true)}
                className={`w-full py-3.5 rounded-[14px] font-black text-black bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95 transition-all flex items-center justify-center text-sm`}
              >
                Coach Lomy
              </button>
              <button 
                onClick={() => newRecipe()}
                className={`w-full py-3.5 rounded-[14px] font-bold text-white transition-all active:scale-95 flex items-center justify-center text-sm bg-white/10 hover:bg-white/20 border border-white/20 shadow-sm`}
              >
                Resep Custom
              </button>
            </div>
          </div>
        </div>
      </div>

      {showQuestionnaire && (
        <DietQuestionnaireModal 
          t={t} theme={theme} profile={profile} 
          onClose={() => setShowQuestionnaire(false)}
          onSave={async (newProfileData, showAlertMsg = true) => {
              await saveProfilePatch(newProfileData);
              if (showAlertMsg) {
                  showAlert('Profil Medis & Target Diet berhasil diperbarui! ✅');
              }
          }}
          generateOfflineRecipes={generateOfflineRecipes}
          generateTrueAIRecipes={generateTrueAIRecipes}
        />
      )}

      <div className={`flex items-center gap-1.5 mb-5 p-1.5 rounded-2xl ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`}>
        {[
          { id: 'resep', label: 'Buku Resep' },
          { id: 'suplemen_obat', label: 'Suplemen & Obat' },
        ].map(tb => (
          <button key={tb.id} onClick={() => setActiveTab(tb.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tb.id ? `${t.bgCard} shadow-sm text-emerald-500` : t.textMuted}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {activeTab === 'resep' && (
        <>
          {/* KULKAS (STOK MEAL PREP) */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className={`h2 ${t.textMain}`}>Kulkas (Meal Prep)</h2>
                <p className={`caption font-medium ${t.textMuted}`}>Stok makanan siap saji yang belum habis.</p>
              </div>
            </div>
            {mealPreps.length === 0 && (
              <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-6 text-center`}>
                <ChefHat size={28} className={`mx-auto mb-2 ${t.textMuted}`} />
                <p className={`caption ${t.textMuted}`}>Kulkas kosong. Masak resep di bawah untuk mengisi stok.</p>
              </div>
            )}
            <div className="space-y-2.5">
              {mealPreps.map(b => (
                <div key={b.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`h2 ${t.textMain}`}>{b.name}</p>
                      <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>
                        Dimakan: <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{b.initialPortions - b.remainingPortions}</span> / {b.initialPortions} porsi · Sisa: <span className={b.remainingPortions > 0 ? 'text-emerald-500 font-bold' : 'text-red-400 font-bold'}>{b.remainingPortions}</span>
                      </p>
                    </div>
                    <button onClick={() => deleteBatch(b)} className="p-2 text-red-400"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setAssigning(b)} disabled={b.remainingPortions <= 0}
                      className={`flex-1 py-2.5 rounded-xl ${t.bgAccentSoft} border ${t.borderAccentSoft} ${t.textAccent} caption flex items-center justify-center gap-1.5 disabled:opacity-40`}>
                      <CalendarPlus size={13} /> Jadwalkan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className={`border-t ${t.border} mb-6`} />

          {/* BUKU RESEP */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`h1 ${t.textMain}`}>Buku Resep</h1>
              <p className={`body-md font-medium ${t.textMuted}`}>Template masakan andalan Anda.</p>
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
              <button onClick={() => startCook(r)}
                className={`flex-1 py-2.5 rounded-xl ${t.bgAccentSoft} border ${t.borderAccentSoft} ${t.textAccent} caption flex items-center justify-center gap-1.5`}>
                <ChefHat size={13} /> Mulai Masak
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

      {activeTab === 'suplemen_obat' && (
        <div className="space-y-10">
          <div>
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
                <p className={`body-md ${t.textMuted}`}>Belum ada suplemen kustom. Klik + untuk membuat minuman pertamamu.</p>
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
          </div>

          <div>
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
                <p className={`body-md ${t.textMuted}`}>Belum ada resep obat. Klik + untuk membuat jadwal obat pertamamu.</p>
              </div>
            )}

            <div className="space-y-2.5">
              {medicines.map(m => {
                const IconComp = ICONS[m.icon] || Pill;
                const bgClass = COLORS.find(c => c.id === m.color)?.bg || 'bg-rose-500';
                return (
                  <div key={m.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise flex items-center gap-4`}>
                    <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white ${bgClass}`}>
                      <IconComp size={24} />
                    </div>
                    <div className="flex-1">
                      <p className={`h2 ${t.textMain}`}>{m.name}</p>
                      <p className={`caption font-medium mt-0.5 text-rose-500`}>{m.signa}</p>
                      {m.note && <p className={`caption mt-0.5 ${t.textMuted}`}>{m.note}</p>}
                    </div>
                    <button onClick={async () => {
                      if (await showConfirm(`Hapus obat "${m.name}"?`)) saveProfilePatch({ medicines: medicines.filter(x => x.id !== m.id) });
                    }} className="p-2 text-red-400"><Trash2 size={16} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== MEAL PREP ASSIGNER MODAL ===== */}
      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setAssigning(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]/80 backdrop-blur-xl' : 'bg-white/80 backdrop-blur-xl'} p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`h2 ${t.textMain}`}>Jadwalkan "{assigning.name}"</h2>
              <button onClick={() => setAssigning(null)} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
            </div>
            
            <p className={`caption font-medium ${t.textMuted} mb-4`}>
              Sistem akan otomatis mengisi jadwal makan Anda hingga sisa stok yang tersedia (<strong>{getAvailableStock(assigning)} porsi</strong>) habis.
            </p>
            
            <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Pilih Hari:</p>
            <div className="flex gap-1.5 mb-4">
              {DAY_NAMES_ID.map((d, i) => (
                <button key={i} onClick={() => setAssignDays(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i])}
                  className={`flex-1 py-2 rounded-xl caption border ${assignDays.includes(i) ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>{d}</button>
              ))}
            </div>
            
            <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Sesi Makan:</p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-5">
              {MEAL_SESSIONS.map(s => (
                <button key={s.id} onClick={() => setAssignSession(s.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border caption ${assignSession === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            
            <button disabled={assignDays.length === 0 || getAvailableStock(assigning) <= 0} onClick={runAssign}
              className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>Terapkan ke Kalender</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgramTab;
