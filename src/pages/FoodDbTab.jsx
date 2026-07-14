import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, Plus, Camera, X, Trash2, Pencil, Loader2, ChevronLeft, Database, Globe } from 'lucide-react';
import { searchFoods, FOOD_CATEGORIES, fetchOpenFoodFacts } from '../data/foodDatabase';
import { compressImageTo100KB, scanNutritionLabel } from '../utils/aiFood';
import { playSoundEffect } from '../utils/audio';

const NUTRIENT_FIELDS = [
  ['kcal', 'Energi (kkal)'], ['protein', 'Protein (g)'], ['carbs', 'Karbo (g)'], ['fat', 'Lemak (g)'],
  ['sugar', 'Gula (g)'], ['sodium', 'Natrium (mg)'], ['cholesterol', 'Kolesterol (mg)'], ['satFat', 'Lemak Jenuh (g)'],
  ['iron', 'Zat Besi (mg)'], ['calcium', 'Kalsium (mg)'], ['purine', 'Purin (mg)'],
];

const emptyForm = () => ({
  name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sugar: '',
  sodium: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '',
});

const FoodDbTab = ({ t, customFoods = [], saveCustomFoodsFn, aiKey, showAlert, showConfirm, soundEnabled }) => {
  // ── Tab State ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'custom'

  const [term, setTerm] = useState('');
  const [category, setCategory] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef(null);

  // ── Online API State (OpenFoodFacts) ─────────────────────────────
  const [onlineFoods, setOnlineFoods] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    // Only search online if term is >= 3 chars
    if (term.trim().length >= 3) {
      setOnlineLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const fetched = await fetchOpenFoodFacts(term);
        setOnlineFoods(fetched);
        setOnlineLoading(false);
      }, 800);
    } else {
      setOnlineFoods([]);
      setOnlineLoading(false);
    }
    
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [term]);

  const results = useMemo(() => {
    if (viewMode === 'custom') {
      let list = searchFoods(term, customFoods).filter(f => f.isCustom);
      if (category) list = list.filter((f) => f.category === category);
      return list.slice(0, 80);
    } else {
      let localList = searchFoods(term, customFoods);
      let combined = [...localList, ...onlineFoods];
      
      const seen = new Set();
      let uniqueList = [];
      for (const item of combined) {
        const key = item.name.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueList.push(item);
        }
      }
      
      if (category) uniqueList = uniqueList.filter((f) => f.category === category);
      return uniqueList.slice(0, 150);
    }
  }, [term, category, customFoods, onlineFoods, viewMode]);

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  const openNewForm = () => { setForm(emptyForm()); setEditing('new'); };
  const openEditForm = (food) => {
    setForm({
      name: food.name, grams: food.portion?.grams || 100,
      ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, food.nutrition?.[k] ?? ''])),
    });
    setEditing(food);
  };

  const handleScanLabel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!aiKey) { await showAlert('Masukkan Gemini API Key dulu di Pengaturan untuk pakai Scan Label Gizi.'); return; }
    setScanning(true);
    try {
      const { base64, mimeType } = await compressImageTo100KB(file);
      const res = await scanNutritionLabel(aiKey, base64, mimeType);
      setForm({
        name: res.name || '',
        grams: 100,
        ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, res.per100?.[k] ?? ''])),
      });
      setEditing('new');
      await showAlert(`Berhasil dibaca dari label${res.servingSize ? ` (takaran saji tertulis: ${res.servingSize})` : ''}. Cek & koreksi angkanya sebelum simpan.`);
    } catch (err) {
      await showAlert(err.message === 'OUT_OF_SCOPE' ? 'Foto ini tidak terbaca sebagai label gizi.' : `Gagal scan: ${err.message}`);
    }
    setScanning(false);
  };

  const saveForm = async () => {
    const nutrition = {};
    NUTRIENT_FIELDS.forEach(([k]) => { nutrition[k] = Number(form[k]) || 0; });
    const grams = Number(form.grams) || 100;
    const factor = 100 / grams;
    const per100 = {};
    Object.entries(nutrition).forEach(([k, v]) => { per100[k] = Math.round(v * factor * 10) / 10; });

    const isNew = editing === 'new';
    const item = {
      id: isNew ? `custom_${Date.now()}` : editing.id,
      name: form.name || 'Bahan Custom',
      category: isNew ? 'packaged' : editing.category,
      unit: 'g',
      isDrink: isNew ? false : editing.isDrink,
      portion: { label: '100g', grams: 100 },
      nutrition: per100,
      source: 'Custom',
      isCustom: true,
    };

    const next = isNew ? [...customFoods, item] : customFoods.map((f) => (f.id === item.id ? item : f));
    await saveCustomFoodsFn(next);
    setEditing(null);
    setDetail(null);
  };

  const deleteCustom = async (food) => {
    if (!(await showConfirm(`Hapus "${food.name}" dari database custom?`, { danger: true }))) return;
    await saveCustomFoodsFn(customFoods.filter((f) => f.id !== food.id));
    setDetail(null);
  };

  if (editing) {
    return (
      <div className="p-4 pb-24 space-y-3 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <button onClick={() => setEditing(null)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={16} className={t.textMuted} /></button>
          <h2 className={`h2 ${t.textMain}`}>{editing === 'new' ? 'Tambah Bahan Custom' : 'Edit Bahan Custom'}</h2>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-6 hide-scrollbar -mx-4 px-4">
          <input className={inputCls} placeholder="Nama bahan" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div>
            <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Berat acuan nilai gizi di bawah (g/ml)</p>
            <input type="number" inputMode="numeric" className={`${inputCls} no-spinners`} value={form.grams} onChange={(e) => setForm((f) => ({ ...f, grams: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {NUTRIENT_FIELDS.map(([k, label]) => (
              <div key={k}>
                <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>{label}</p>
                <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>
        </div>
        <button disabled={!form.name} onClick={saveForm} className={`w-full py-3 shrink-0 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>
          Simpan
        </button>
      </div>
    );
  }

  if (detail) {
    return (
      <div className="p-4 pb-24 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <button onClick={() => setDetail(null)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={16} className={t.textMuted} /></button>
          <h2 className={`h2 ${t.textMain} line-clamp-2`}>{detail.name}</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-4 px-4 space-y-4">
          <p className={`caption font-medium ${t.textMuted}`}>Sumber: {detail.source || 'Custom'} · per 100{detail.unit}</p>
          <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl ${t.bgSunken}`}>
            {[['kcal', 'kkal'], ['protein', 'P (g)'], ['carbs', 'K (g)'], ['fat', 'L (g)']].map(([k, label]) => (
              <div key={k} className="text-center">
                <p className={`text-sm font-black tabular-nums ${t.textMain}`}>{Math.round(detail.nutrition[k])}</p>
                <p className={`caption ${t.textMuted}`}>{label}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-2xl border ${t.border} ${t.bgCard} divide-y ${t.border}`}>
            {NUTRIENT_FIELDS.slice(4).map(([k, label]) => (
              <div key={k} className="flex justify-between px-4 py-2.5">
                <span className={`body-md ${t.textMuted}`}>{label}</span>
                <span className={`body-md font-bold ${t.textMain}`}>{detail.nutrition[k] || 0}</span>
              </div>
            ))}
          </div>
        </div>
        
        {detail.isCustom && (
          <div className="flex gap-2 mt-4 shrink-0">
            <button onClick={() => openEditForm(detail)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md ${t.textMain}`}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => deleteCustom(detail)} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-rose-500/10 text-rose-500 body-md">
              <Trash2 size={14} /> Hapus
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className={`h1 ${t.textMain}`}>Database Gizi</h1>
        <div className={`relative flex p-1 rounded-full ${t.btnBg} w-44 shrink-0 border ${t.border}`}>
          <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out ${t.bgAccent} shadow-sm`} style={{ transform: viewMode === 'all' ? 'translateX(0)' : 'translateX(100%)', left: '4px' }}></div>
          <button
            onClick={() => { setViewMode('all'); playSoundEffect('click', soundEnabled); }}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-full relative z-10 text-xs font-bold transition-colors duration-300 ${
              viewMode === 'all' ? 'text-white' : t.textMuted
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => { setViewMode('custom'); playSoundEffect('click', soundEnabled); }}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-full relative z-10 text-xs font-bold transition-colors duration-300 ${
              viewMode === 'custom' ? 'text-white' : t.textMuted
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} mb-3 shrink-0 focus-within:ring-2 focus-within:${t.ringAccent} transition-all`}>
        <Search size={16} className={t.textMuted} />
        <input 
          value={term} 
          onChange={(e) => setTerm(e.target.value)} 
          placeholder={viewMode === 'all' ? "Cari dari 3jt+ produk (min 3 huruf)..." : "Cari bahan buatanmu..."}
          className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} 
        />
        {term && <button onClick={() => setTerm('')}><X size={16} className={t.textMuted} /></button>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3 -mx-1 px-1 shrink-0">
        {FOOD_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => { setCategory(category === c.id ? null : c.id); playSoundEffect('click', soundEnabled); }}
            className={`shrink-0 px-3 py-1.5 rounded-xl border caption font-bold transition-all ${category === c.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {viewMode === 'custom' && (
        <div className="flex gap-2 mb-3 shrink-0">
          <button onClick={() => { openNewForm(); playSoundEffect('click', soundEnabled); }} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl ${t.bgAccent} body-md shadow-glow`}>
            <Plus size={16} /> Tambah Manual
          </button>
          <button
            onClick={() => { fileInputRef.current?.click(); playSoundEffect('click', soundEnabled); }}
            disabled={scanning}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} ${t.textAccent} body-md disabled:opacity-50`}
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Scan OCR
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleScanLabel} className="hidden" />
        </div>
      )}

      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className={`text-[11px] font-bold ${t.textMuted}`}>Menampilkan {results.length} hasil</p>
        {viewMode === 'all' && (
          <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-md">
            {onlineLoading ? (
              <Loader2 size={10} className={`animate-spin text-blue-500`} />
            ) : (
              <Globe size={10} className="text-blue-500" />
            )}
            <p className={`text-[10px] font-bold text-blue-500 uppercase tracking-wide`}>OpenFoodFacts</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pb-10 hide-scrollbar -mx-4 px-4 pt-1">
        <div key={viewMode} className={`space-y-2 animate-in fade-in duration-300 ${viewMode === 'all' ? 'slide-in-from-left-12' : 'slide-in-from-right-12'}`}>
          {results.map((f) => (
            <button key={f.id} onClick={() => { setDetail(f); playSoundEffect('click', soundEnabled); }}
              className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${t.border} ${t.bgCard}`}>
              <div className="w-full">
                <div className={`body-md font-bold ${t.textMain} flex items-start justify-between gap-2`}>
                  <span className="line-clamp-2 pr-2">{f.name}</span>
                  <div className="flex shrink-0 gap-1 flex-col items-end">
                    {f.source === 'OpenFoodFacts' && <span className={`px-1.5 py-0.5 rounded text-[8px] bg-blue-500/10 text-blue-500 uppercase tracking-widest`}>Online</span>}
                    {f.isCustom && <span className={`px-1.5 py-0.5 rounded text-[8px] ${t.bgAccentSoft} ${t.textAccent} uppercase tracking-widest`}>Custom</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <p className={`text-[10px] font-medium ${t.textMuted} truncate max-w-[80px]`}>{f.portion.label}</p>
                  <div className={`w-1 h-1 rounded-full ${t.bgSunken}`}></div>
                  <p className={`text-[11px] font-bold ${t.textMain}`}>{Math.round(f.nutrition.kcal * f.portion.grams / 100)} kkal</p>
                  <p className={`text-[10px] font-medium ${t.textMuted}`}>P: {Math.round(f.nutrition.protein * f.portion.grams / 100)}g</p>
                </div>
              </div>
            </button>
          ))}
          {results.length === 0 && !onlineLoading && (
            <div className="flex flex-col items-center justify-center py-10 opacity-60">
              <Database size={40} className={`mb-3 ${t.textMuted}`} />
              <p className={`body-md text-center ${t.textMuted}`}>Tidak ada hasil yang ditemukan.</p>
              {viewMode === 'all' && term.length > 0 && term.length < 3 && (
                <p className={`caption text-center mt-2 ${t.textAccent}`}>Ketik minimal 3 huruf untuk mencari dari 3jt+ database online.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FoodDbTab;
