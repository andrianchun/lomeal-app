// src/pages/FoodDbTab.jsx — Fase 7-8 blueprint: perpustakaan data gizi mentah +
// Smart Nutrition Fact Scanner (OCR). Pola UI disamakan tab "Database" di
// FoodPickerModal.jsx biar konsisten vibe. Custom food yang disimpan di sini
// otomatis nongol di FoodPickerModal & ingredient search RecipesTab karena
// keduanya manggil searchFoods() yang sama.
import React, { useMemo, useState, useRef } from 'react';
import { Search, Plus, Camera, X, Trash2, Pencil, Loader2, ChevronLeft } from 'lucide-react';
import { searchFoods, FOOD_CATEGORIES } from '../data/foodDatabase';
import { compressImageTo100KB, scanNutritionLabel } from '../utils/aiFood';

const NUTRIENT_FIELDS = [
  ['kcal', 'Energi (kkal)'], ['protein', 'Protein (g)'], ['carbs', 'Karbo (g)'], ['fat', 'Lemak (g)'],
  ['sugar', 'Gula (g)'], ['sodium', 'Natrium (mg)'], ['cholesterol', 'Kolesterol (mg)'], ['satFat', 'Lemak Jenuh (g)'],
  ['iron', 'Zat Besi (mg)'], ['calcium', 'Kalsium (mg)'], ['purine', 'Purin (mg)'],
];

const emptyForm = () => ({
  name: '', grams: 100, kcal: '', protein: '', carbs: '', fat: '', sugar: '',
  sodium: '', cholesterol: '', satFat: '', iron: '', calcium: '', purine: '',
});

const FoodDbTab = ({ t, customFoods = [], saveCustomFoodsFn, aiKey, showAlert, showConfirm }) => {
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState(null);
  const [detail, setDetail] = useState(null); // food object
  const [editing, setEditing] = useState(null); // null | 'new' | food object (custom, being edited)
  const [form, setForm] = useState(emptyForm());
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef(null);

  const results = useMemo(() => {
    let list = searchFoods(term, customFoods);
    if (category) list = list.filter((f) => f.category === category);
    return list.slice(0, 80);
  }, [term, category, customFoods]);

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
        grams: 100, // hasil OCR selalu dinormalisasi ke per-100g (lihat prompt scanNutritionLabel)
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
    // Normalisasi ke per-100g biar konsisten dgn skema FOOD_DB (nutritionForAmount asumsikan per-100).
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

  // ---------- FORM TAMBAH/EDIT ----------
  if (editing) {
    return (
      <div className="p-4 pb-24 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setEditing(null)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={16} className={t.textMuted} /></button>
          <h2 className={`h2 ${t.textMain}`}>{editing === 'new' ? 'Tambah Bahan' : 'Edit Bahan'}</h2>
        </div>
        <input className={inputCls} placeholder="Nama bahan" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <div>
          <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Berat acuan nilai gizi di bawah (g)</p>
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
        <button disabled={!form.name} onClick={saveForm} className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>
          Simpan
        </button>
      </div>
    );
  }

  // ---------- DETAIL ----------
  if (detail) {
    return (
      <div className="p-4 pb-24">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setDetail(null)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={16} className={t.textMuted} /></button>
          <h2 className={`h2 ${t.textMain}`}>{detail.name}</h2>
        </div>
        <p className={`caption font-medium ${t.textMuted} mb-3`}>Sumber: {detail.source || 'Custom'} · per 100{detail.unit}</p>
        <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl ${t.bgSunken} mb-4`}>
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
        {detail.isCustom && (
          <div className="flex gap-2 mt-4">
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

  // ---------- LIST/CARI ----------
  return (
    <div className="p-4 pb-24">
      <h1 className={`h1 mb-3 ${t.textMain}`}>Database Gizi</h1>

      <div className="flex gap-2 mb-3">
        <button onClick={openNewForm} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl ${t.bgAccent} body-md shadow-glow`}>
          <Plus size={16} /> Tambah Bahan
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} ${t.textAccent} body-md disabled:opacity-50`}
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Scan Label Gizi
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleScanLabel} className="hidden" />
      </div>

      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} mb-2`}>
        <Search size={14} className={t.textMuted} />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cari nasi goreng, tempe…"
          className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} />
        {term && <button onClick={() => setTerm('')}><X size={14} className={t.textMuted} /></button>}
      </div>

      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3 -mx-1 px-1">
        {FOOD_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)}
            className={`shrink-0 px-2.5 py-1.5 rounded-xl border caption ${category === c.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {results.map((f) => (
          <button key={f.id} onClick={() => setDetail(f)}
            className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left ${t.border} ${t.bgCard}`}>
            <div>
              <p className={`body-md ${t.textMain}`}>{f.name}{f.isCustom ? ' ✏️' : ''}</p>
              <p className={`caption font-medium ${t.textMuted}`}>{f.portion.label} · {Math.round(f.nutrition.kcal * f.portion.grams / 100)} kkal</p>
            </div>
          </button>
        ))}
        {results.length === 0 && <p className={`body-md text-center py-6 ${t.textMuted}`}>Tidak ketemu — coba "+ Tambah Bahan".</p>}
      </div>
    </div>
  );
};

export default FoodDbTab;
