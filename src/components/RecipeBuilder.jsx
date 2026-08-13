import React, { useMemo, useRef, useState } from 'react';
import { X, Search, Camera, Plus, Trash2, Timer, Loader2, ChevronUp, ChevronDown, ChevronLeft } from 'lucide-react';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { EMPTY_NUTRITION, addNutrition, scaleNutrition, NUTRIENTS } from '../data/nutrition';
import { heroForRecipe } from '../data/constants';
import { compressImage, PHOTO_KEEPSAKE, PHOTO_THUMB } from '../utils/aiFood';
import { URT_DICTIONARY } from '../utils/urtMapping';
import { uploadRecipePhoto } from '../utils/foodLog';
import { STATUS } from '../theme';
import { PillTabs } from './RecipeBits';

const newId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Builder resep custom ala Cookpad: info + foto, bahan bergizi otomatis, dan langkah
 * memasak yang dikelompokkan per KOMPONEN (Nasi / Ayam / Sambal). Komponen inilah yang
 * bikin mode masak bisa paralel — tiap komponen punya langkah & timernya sendiri.
 */
const RecipeBuilder = ({ t, theme, user, editing, setEditing, customFoods, onSave, onCancel, showToast }) => {
  const [expandedS, setExpandedS] = useState({});
  const [detailIng, setDetailIng] = useState(null);
  const [showMicros, setShowMicros] = useState(false);
  const [tab, setTab] = useState('info'); // info | bahan | langkah
  const [ingSearch, setIngSearch] = useState('');
  const [uploading, setUploading] = useState(null); // 'hero' | stepId
  const fileRef = useRef(null);
  const pendingTarget = useRef(null); // { kind: 'hero' } | { kind: 'step', ci, si }
  const isDark = theme === 'dark';

  const inputCls =`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;
  const components = editing.components || [];

  const ingResults = useMemo(
    () => (ingSearch ? searchFoods(ingSearch, customFoods).slice(0, 8) : []),
    [ingSearch, customFoods]
  );

  const draftTotals = useMemo(
    () => editing.ingredients.reduce((acc, ing) => addNutrition(acc, ing.nutrition), { ...EMPTY_NUTRITION }),
    [editing.ingredients]
  );

  const patch = (fn) => setEditing((r) => ({ ...r, ...fn(r) }));
  const patchComponents = (fn) => setEditing((r) => ({ ...r, components: fn(r.components || []) }));

  // ---------- foto ----------
  const pickPhoto = (target) => { pendingTarget.current = target; fileRef.current?.click(); };

  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = pendingTarget.current;
    if (!file || !target) return;
    setUploading(target.kind === 'hero' ? 'hero' : `${target.ci}_${target.si}`);
    try {
      const { dataUrl } = await compressImage(file, target.kind === 'hero' ? PHOTO_KEEPSAKE : PHOTO_THUMB);
      const url = await uploadRecipePhoto(user.uid, editing.id, dataUrl);
      if (target.kind === 'hero') patch(() => ({ photoUrl: url }));
      else patchComponents((cs) => cs.map((c, ci) => ci !== target.ci ? c : {
        ...c, steps: c.steps.map((s, si) => (si === target.si ? { ...s, photoUrl: url } : s)),
      }));
    } catch (err) {
      showToast?.(`Gagal unggah foto: ${err.message}`, { type: 'error' });
    } finally {
      setUploading(null);
    }
  };

  // ---------- langkah ----------
  const addComponent = () => patchComponents((cs) => [...cs, { id: newId('c'), name: '', steps: [{ id: newId('s'), text: '', timerSec: 0 }] }]);
  const addStep = (ci) => patchComponents((cs) => cs.map((c, i) => (i === ci ? { ...c, steps: [...c.steps, { id: newId('s'), text: '', timerSec: 0 }] } : c)));
  const setStep = (ci, si, key, value) => patchComponents((cs) => cs.map((c, i) => i !== ci ? c : {
    ...c, steps: c.steps.map((s, j) => (j === si ? { ...s, [key]: value } : s)),
  }));
  const moveStep = (ci, si, dir) => patchComponents((cs) => cs.map((c, i) => {
    if (i !== ci) return c;
    const to = si + dir;
    if (to < 0 || to >= c.steps.length) return c;
    const steps = [...c.steps];
    [steps[si], steps[to]] = [steps[to], steps[si]];
    return { ...c, steps };
  }));

  const canSave = editing.name.trim() && editing.ingredients.length > 0;

  const save = () => {
    const portions = Math.max(1, Number(editing.portions) || 1);
    const totalGrams = editing.ingredients.reduce((s, i) => s + (i.grams || 0), 0);
    onSave({
      ...editing,
      name: editing.name.trim(),
      portions,
      totalGrams,
      durationMin: Math.max(0, Number(editing.durationMin) || 0),
      // komponen/langkah kosong dibuang biar resep sederhana gak nyimpen sampah
      components: components
        .map((c) => ({ ...c, name: c.name.trim(), steps: c.steps.filter((s) => s.text.trim()) }))
        .filter((c) => c.steps.length > 0),
      total: draftTotals,
      perPortion: scaleNutrition(draftTotals, 1 / portions),
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoPicked} />

      <div className="flex items-center justify-between">
        <h1 className={`h1 ${t.textMain}`}>Racik Resep</h1>
        <button onClick={onCancel} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={18} className={t.textMuted} /></button>
      </div>

      <PillTabs t={t} theme={theme} value={tab} onChange={setTab}
        tabs={[['info', 'Info'], ['bahan', `Bahan (${editing.ingredients.length})`], ['langkah', `Langkah (${components.reduce((n, c) => n + c.steps.length, 0)})`]]} />

      {/* ============ INFO ============ */}
      {tab === 'info' && (
        <div className="space-y-3">
          <button onClick={() => pickPhoto({ kind: 'hero' })}
            className="relative w-full h-44 rounded-3xl overflow-hidden border border-white/10 bg-cover bg-center active:scale-[0.99] transition-transform"
            style={{ backgroundImage: `url('${heroForRecipe(editing)}')` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 flex items-center gap-2 text-white">
              {uploading === 'hero' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              <span className="body-md">{editing.photoUrl ? 'Ganti foto masakan' : 'Tambah foto masakan'}</span>
            </div>
          </button>

          <input className={inputCls} placeholder='Nama resep, mis. "Ayam Gochujang Diet"' value={editing.name}
            onChange={(e) => patch(() => ({ name: e.target.value }))} />

          <div className={`flex items-center gap-3 p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
            <span className={`body-md ${t.textMuted}`}>Jadi berapa porsi?</span>
            <div className="flex items-center gap-2 ml-auto">
              {[1, 2, 4, 6].map((n) => (
                <button key={n} onClick={() => patch(() => ({ portions: n }))}
                  className={`w-9 h-9 rounded-xl caption border ${Number(editing.portions) === n ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>{n}</button>
              ))}
              <input type="number" inputMode="numeric" value={editing.portions || ''} placeholder="1"
                onChange={(e) => patch((r) => ({ portions: Number(e.target.value) || 0 }))}
                className={`w-12 h-9 text-center rounded-xl border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none`} />
            </div>
          </div>

          <div className={`flex items-center gap-3 p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
            <span className={`body-md ${t.textMuted}`}>Durasi masak</span>
            <div className="flex items-center gap-2 ml-auto">
              <input type="number" inputMode="numeric" placeholder="45" value={editing.durationMin || ''}
                onChange={(e) => patch((r) => ({ durationMin: Number(e.target.value) || 0 }))}
                className={`w-16 h-9 text-center rounded-xl border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none`} />
              <span className={`caption ${t.textMuted}`}>menit</span>
            </div>
          </div>

          <textarea className={`${inputCls} min-h-[80px]`} placeholder="Catatan (opsional) — tips, asal resep, kenapa cocok…"
            value={editing.note || ''} onChange={(e) => patch(() => ({ note: e.target.value }))} />
        </div>
      )}

      {/* ============ BAHAN ============ */}
      {tab === 'bahan' && (
        <div className="space-y-3">
          <div className={`p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg}`}>
              <Search size={14} className={t.textMuted} />
              <input value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} placeholder="Cari bahan (dada ayam, santan…)"
                className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} />
            </div>
            {ingResults.map((f) => (
              <button key={f.id} onClick={() => {
                patch((r) => ({ ingredients: [...r.ingredients, { foodId: f.id, name: f.name, grams: f.portion.grams, nutrition: nutritionForAmount(f, f.portion.grams) }] }));
                setIngSearch('');
              }} className={`w-full flex justify-between items-center px-3 py-2.5 mt-1 rounded-xl ${t.bgSunken}`}>
                <span className={`body-md ${t.textMain}`}>{f.name}</span>
                <span className={`caption ${t.textMuted}`}>{f.portion.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            {editing.ingredients.map((ing, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-2xl border ${t.border} ${t.bgCard} cursor-pointer active:scale-[0.98] transition-transform`}
                onClick={() => setDetailIng(ing)}>
                <p className={`body-md flex-1 ${t.textMain}`}>{ing.name}</p>
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <input type="number" inputMode="numeric" 
                    value={Math.round((ing.grams / (URT_DICTIONARY[ing.displayUnit || 'g'] || 1)) * 10) / 10 || ''} 
                    placeholder="0"
                    onChange={(e) => {
                      const displayQty = Number(e.target.value) || 0;
                      const grams = displayQty * (URT_DICTIONARY[ing.displayUnit || 'g'] || 1);
                      patch((r) => ({
                        ingredients: r.ingredients.map((x, j) => {
                          if (j !== i) return x;
                          const bg = x.baseGrams || (x.grams > 0 ? x.grams : 100);
                          const bn = x.baseNutrition || x.nutrition;
                          const factor = bg > 0 ? grams / bg : 0;
                          return { ...x, grams, baseGrams: bg, baseNutrition: bn, nutrition: Object.fromEntries(Object.entries(bn).map(([k, v]) => [k, Math.round(v * factor * 1000) / 1000])) };
                        }),
                      }));
                    }}
                    className={`w-14 text-center px-2 py-1.5 rounded-lg border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none focus:border-emerald-500/50 transition-colors`} />
                  
                  <div className="relative">
                    <select
                      value={ing.displayUnit || 'g'}
                      onChange={(e) => {
                        const newUnit = e.target.value;
                        patch((r) => ({
                          ingredients: r.ingredients.map((x, j) => j === i ? { ...x, displayUnit: newUnit } : x)
                        }));
                      }}
                      className={`pl-2 pr-6 py-1.5 rounded-lg border ${t.border} ${t.inputBg} caption ${t.textMain} appearance-none cursor-pointer outline-none focus:border-emerald-500/50 transition-colors`}
                    >
                      {['g','ml','sdm','sdt','cup','gelas','porsi','potong','bungkus','siung','lembar','buah'].map(u => (
                        <option key={u} value={u} className={isDark ? 'bg-zinc-800 text-white' : 'bg-white text-black'}>{u === 'bungkus' ? 'bks' : u}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${t.textMuted}`} />
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); patch((r) => ({ ingredients: r.ingredients.filter((_, j) => j !== i) })); }}
                  className={`p-1.5 ${STATUS.danger.text}`}><X size={13} /></button>
              </div>
            ))}
            {editing.ingredients.length === 0 && <p className={`body-md text-center py-4 ${t.textMuted}`}>Belum ada bahan — cari di atas ⬆️</p>}
          </div>

          <div className={`rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} p-4 mt-4`}>
            <p className={`h3 ${t.textMuted} mb-3 uppercase tracking-wide`}>Estimasi Nutrisi per Porsi (÷{editing.portions || 1})</p>
            <div className="grid grid-cols-4 gap-2">
              {[['kcal', 'kkal'], ['protein', 'Protein'], ['carbs', 'Karbo'], ['fat', 'Lemak']].map(([k, label]) => (
                <div key={k} className="text-center">
                  <p className={`h2 tabular-nums ${t.textMain}`}>{Math.round(draftTotals[k] / (Number(editing.portions) || 1))}</p>
                  <p className={`caption ${t.textMuted}`}>{label}{k !== 'kcal' && ' (g)'}</p>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => setShowMicros(!showMicros)} 
              className={`w-full flex items-center justify-center gap-1 mt-4 py-2 caption font-bold rounded-xl ${t.bgCard} ${t.textMuted} active:scale-[0.98] transition-transform`}
            >
              {showMicros ? 'Sembunyikan Mikronutrien' : 'Lihat Mikronutrien'}
              <ChevronDown size={14} className={`transition-transform duration-300 ${showMicros ? 'rotate-180' : ''}`} />
            </button>
            
            {showMicros && (
              <div className={`mt-2 rounded-xl border ${t.border} ${isDark ? 'bg-black/20' : 'bg-white/50'} divide-y ${t.border}`}>
                {NUTRIENTS.filter(n => !n.macro && draftTotals[n.key] && draftTotals[n.key] !== 0).map(n => (
                  <div key={n.key} className="flex justify-between px-3 py-2.5">
                    <span className={`caption ${t.textMuted}`}>{n.label}</span>
                    <span className={`caption font-bold ${t.textMain}`}>{Math.round((draftTotals[n.key] / (Number(editing.portions) || 1)) * 10) / 10} {n.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ LANGKAH ============ */}
      {tab === 'langkah' && (
        <div className="space-y-3">
          {components.map((c, ci) => (
            <div key={c.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-7 h-7 shrink-0 rounded-lg ${t.bgAccentSoft} ${t.textAccent} caption flex items-center justify-center`}>{ci + 1}</span>
                <input className={`flex-1 bg-transparent outline-none h2 ${t.textMain}`} placeholder="Nama komponen, mis. Nasi"
                  value={c.name} onChange={(e) => patchComponents((cs) => cs.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)))} />
                <button onClick={() => patchComponents((cs) => cs.filter((_, i) => i !== ci))} className={`p-1.5 ${STATUS.danger.text}`}><Trash2 size={14} /></button>
              </div>

              <div className={`space-y-4 divide-y ${t.border}`}>
                {c.steps.map((s, si) => (
                  <div key={s.id} className="pt-4 first:pt-2 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className={`caption font-bold pt-2 ${t.textMuted}`}>{si + 1}.</span>
                      <textarea className={`flex-1 bg-transparent outline-none body-md ${t.textMain} min-h-[52px]`}
                        placeholder="Tulis langkahnya…" value={s.text}
                        onChange={(e) => setStep(ci, si, 'text', e.target.value)} />
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveStep(ci, si, -1)} disabled={si === 0} className={`p-1 disabled:opacity-25 ${t.textMuted}`}><ChevronUp size={14} /></button>
                        <button onClick={() => moveStep(ci, si, 1)} disabled={si === c.steps.length - 1} className={`p-1 disabled:opacity-25 ${t.textMuted}`}><ChevronDown size={14} /></button>
                      </div>
                    </div>

                    {s.photoUrl && <img src={s.photoUrl} alt="" className="w-full h-28 object-cover rounded-xl" />}

                    <div className="flex items-center gap-2">
                      <Timer size={13} className={t.textMuted} />
                      <input type="number" inputMode="numeric" placeholder="0"
                        value={s.timerSec ? Math.round(s.timerSec / 60) : ''}
                        onChange={(e) => setStep(ci, si, 'timerSec', Math.max(0, Number(e.target.value) || 0) * 60)}
                        className={`w-14 text-center px-2 py-1 rounded-lg border ${t.border} ${t.inputBg} caption ${t.textMain} no-spinners outline-none`} />
                      <span className={`caption ${t.textMuted}`}>menit timer</span>
                      <button onClick={() => pickPhoto({ kind: 'step', ci, si })} className={`ml-auto p-1.5 rounded-lg ${t.btnBg} ${t.textMuted}`}>
                        {uploading === `${ci}_${si}` ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      </button>
                      <button onClick={() => patchComponents((cs) => cs.map((x, i) => (i === ci ? { ...x, steps: x.steps.filter((_, j) => j !== si) } : x)))}
                        className={`p-1.5 ${STATUS.danger.text}`}><X size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => addStep(ci)} className={`w-full py-2 mt-4 rounded-xl border border-dashed ${t.borderDashed} caption ${t.textMuted} flex items-center justify-center gap-1.5`}>
                <Plus size={13} /> Tambah langkah
              </button>
            </div>
          ))}

          <button onClick={addComponent} className={`w-full py-3 rounded-2xl border-2 border-dashed ${t.borderDashed} body-md ${t.textMuted} flex items-center justify-center gap-2`}>
            <Plus size={16} /> Tambah komponen masakan
          </button>
        </div>
      )}

      {/* Spasi tambahan biar ngga ketutup CTA fixed */}
      <div className="h-24"></div>

      {/* ---------- CTA ---------- */}
      <div className={`fixed bottom-0 inset-x-0 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-50 ${isDark ? 'bg-[#0a1510]/90' : 'bg-white/90'} backdrop-blur-xl border-t ${t.border}`}>
        <button disabled={!canSave} onClick={save}
          className={`w-full max-w-2xl mx-auto py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40 flex items-center justify-center`}>
          Simpan Resep
        </button>
      </div>
      {/* Modal Detail Nutrisi Bahan */}
      {detailIng && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDetailIng(null)}>
          <div className={`w-full max-w-sm ${isDark ? 'bg-[#0a1510]' : 'bg-white'} rounded-[2rem] shadow-xl overflow-hidden flex flex-col max-h-[85vh]`} onClick={e => e.stopPropagation()}>
            <div className={`p-4 border-b ${t.border} flex justify-between items-center bg-white/[0.02]`}>
              <div>
                <h2 className={`h3 ${t.textMain}`}>{detailIng.name}</h2>
                <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>{detailIng.grams}g</p>
              </div>
              <button onClick={() => setDetailIng(null)} className={`w-8 h-8 rounded-full ${t.bgCard} flex items-center justify-center text-gray-500`}><X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl ${t.bgSunken}`}>
                {[['kcal', 'kkal'], ['protein', 'P (g)'], ['carbs', 'K (g)'], ['fat', 'L (g)']].map(([k, label]) => (
                  <div key={k} className="text-center">
                    <p className={`text-sm font-black tabular-nums ${t.textMain}`}>{Math.round(detailIng.nutrition[k] || 0)}</p>
                    <p className={`caption ${t.textMuted}`}>{label}</p>
                  </div>
                ))}
              </div>
              <div className={`rounded-2xl border ${t.border} ${t.bgCard} divide-y ${t.border}`}>
                {NUTRIENTS.filter(n => !n.macro && detailIng.nutrition[n.key] && detailIng.nutrition[n.key] !== 0).map(n => (
                  <div key={n.key} className="flex justify-between px-4 py-2.5">
                    <span className={`body-md ${t.textMuted}`}>{n.label}</span>
                    <span className={`body-md font-bold tabular-nums ${t.textMain}`}>{Math.round((detailIng.nutrition[n.key] || 0) * 10) / 10} {n.unit}</span>
                  </div>
                ))}
                {NUTRIENTS.filter(n => !n.macro && detailIng.nutrition[n.key] && detailIng.nutrition[n.key] !== 0).length === 0 && (
                  <div className={`px-4 py-3 caption text-center ${t.textMuted}`}>Tidak ada data nutrisi mikro.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeBuilder;
