import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { doc, setDoc, increment } from 'firebase/firestore';
import { Search, Plus, Camera, Image, X, Pencil, Loader2, ChevronLeft, Database, Globe, Star, AlertTriangle, Heart, Filter, ChevronDown, Home, Beaker, Coffee, CupSoda, GlassWater, Pill, Syringe, Tablets, ShieldPlus } from 'lucide-react';
import { searchFoods, FOOD_CATEGORIES, getDefaultImageForFood, nutritionForAmount } from '../data/foodDatabase';
import { AI_DAILY_LIMIT } from '../data/constants';
import { NUTRIENTS, EMPTY_NUTRITION } from '../data/nutrition';
import SupplementBuilder from '../components/SupplementBuilder';
import MedicineBuilder from '../components/MedicineBuilder';
import { compressImageForAI, analyzeSmartPhoto } from '../utils/aiFood';
import { playSoundEffect } from '../utils/audio';
import { checkAndCountAiUsage, refundAiUsage } from '../utils/foodLog';
import { isNativeApp, captureToFile } from '../utils/nativeCamera';
import { sortFoodsByUsage } from '../utils/foodUsage';
import ImageCropperModal from '../components/ImageCropperModal';
import AttachmentMenu from '../components/AttachmentMenu';
import useBackClose from '../hooks/useBackClose';

const SHELF_ICONS = { Beaker, Coffee, CupSoda, GlassWater, Pill, Syringe, Tablets, ShieldPlus };
const SHELF_COLORS = [
  { id: 'sky', bg: 'bg-sky-500' }, { id: 'blue', bg: 'bg-blue-500' }, { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'purple', bg: 'bg-purple-500' }, { id: 'pink', bg: 'bg-pink-500' }, { id: 'rose', bg: 'bg-rose-500' },
  { id: 'orange', bg: 'bg-orange-500' }, { id: 'amber', bg: 'bg-amber-600' }, { id: 'emerald', bg: 'bg-emerald-500' },
  { id: 'zinc', bg: 'bg-zinc-600' },
];

// Badge angka kecil di samping label tab — bukan "(123)" yang bikin labelnya kepanjangan.
const CountBadge = ({ n, active }) => (
  <span className={`ml-1.5 px-1.5 py-px rounded-full text-[10px] font-black tabular-nums ${
    active ? 'bg-white/25 text-white' : 'bg-black/10 dark:bg-white/10'}`}>{n}</span>
);

const NUTRIENT_FIELDS = NUTRIENTS.filter(n => n.key !== 'kcal').map(n => [n.key, `${n.label} (${n.unit})`]);
const EXTRA_NUTRIENT_FIELDS = NUTRIENTS.filter(n => !n.macro).map(n => [n.key, `${n.label} (${n.unit})`]);

const emptyForm = () => {
  const obj = { name: '', grams: 100, kcal: '', portionLabel: '', portionGrams: 100, isDrink: false, type: 'raw_ingredient' };
  NUTRIENT_FIELDS.forEach(([k]) => obj[k] = '');
  return obj;
};

const UnifiedFoodCard = ({ f, t, favoriteFoods, toggleFavorite, setDetail, openEditForm, soundEnabled, domusItems }) => {
  const isFavorite = favoriteFoods.includes(f.id);
  const domusMatch = domusItems.find(d => d.name.toLowerCase() === f.name.toLowerCase());
  
  const micros = Object.entries(f.nutrition)
    .filter(([k, v]) => !['kcal', 'protein', 'carbs', 'fat'].includes(k) && v > 0)
    .sort((a, b) => b[1] - a[1]);
  const highestMicroStr = micros.length > 0 
    ? `Tinggi ${NUTRIENTS[micros[0][0]]?.label || micros[0][0]}` 
    : '';

  const isValidCustomImg = typeof f.image === 'string' && (f.image.startsWith('http') || f.image.startsWith('data:image/'));
  const bgImg = isValidCustomImg ? f.image : getDefaultImageForFood(f.name);

  return (
    <div onClick={() => { setDetail(f); playSoundEffect('click', soundEnabled); }} className={`w-full min-h-[90px] flex items-center justify-between p-3 rounded-2xl border transition-all active:scale-[0.98] ${t.border} ${t.bgCard} cursor-pointer relative overflow-hidden`}>
      
      {/* Background Image Layer (Right Side) */}
      {bgImg && (
        <div 
          className="absolute inset-y-0 right-0 w-2/3 pointer-events-none" 
          style={{ 
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 60%)', 
            maskImage: 'linear-gradient(to right, transparent, black 60%)' 
          }}
        >
          <img 
            src={bgImg} 
            alt="" 
            className="w-full h-full object-cover opacity-60" 
            onError={(e) => { e.target.style.display = 'none'; }} 
          />
        </div>
      )}

      {/* Content Layer (Left Side) */}
      <div className="flex-1 text-left flex flex-col justify-center pr-3 min-w-0 relative z-10">
        <div className={`body-md font-bold ${t.textMain} line-clamp-2 leading-tight`}>{f.name}</div>
        
        <div className={`text-[10px] mt-1.5 ${t.textMuted} flex flex-wrap gap-x-2 gap-y-1 items-center`}>
          <span className={`font-bold ${t.textMain}`}>{Math.round(f.nutrition.kcal * f.portion.grams / 100)} kkal</span>
          <span className="opacity-40">•</span>
          <span>P {Math.round(f.nutrition.protein * f.portion.grams / 100)}g</span>
          <span>K {Math.round(f.nutrition.carbs * f.portion.grams / 100)}g</span>
          <span>L {Math.round(f.nutrition.fat * f.portion.grams / 100)}g</span>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {f.isCustom && <span className={`px-1.5 py-0.5 rounded text-[8px] ${t.bgAccentSoft} ${t.textAccent} uppercase tracking-widest font-bold`}>Custom</span>}
          {domusMatch && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] bg-orange-500/10 text-orange-500 uppercase tracking-widest font-bold`}>
              <Home size={8} /> {domusMatch.quantity} {domusMatch.unit || ''}
            </span>
          )}
          {highestMicroStr && <span className={`text-[9px] ${t.textMuted} italic`}>{highestMicroStr}</span>}
        </div>
      </div>

      {/* Buttons Layer (Right Side) */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 relative z-10 pl-2">
        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(f.id); }} 
                className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all ${isFavorite ? 'bg-rose-500/20 text-rose-500 shadow-[0_4px_12px_rgba(244,63,94,0.15)] backdrop-blur-md border border-rose-500/30' : 'bg-white/5 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'}`} aria-label="Favoritkan">
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        {f.isCustom && openEditForm && (
          <button onClick={(e) => { e.stopPropagation(); openEditForm(f); }} 
                  className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/10 hover:text-white">
            <Pencil size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

const FoodDbTab = ({ t, customFoods = [], saveCustomFoodsFn, aiKey, showAlert, showConfirm, showToast, soundEnabled, user, todayYmd, domusItems = [], theme, profile, saveProfilePatch }) => {
  const favoriteFoods = profile?.favoriteFoods || [];
  const toggleFavorite = (foodId) => {
    const next = favoriteFoods.includes(foodId) ? favoriteFoods.filter((id) => id !== foodId) : [...favoriteFoods, foodId];
    saveProfilePatch({ favoriteFoods: next });
  };
  const location = useLocation();
  // ── Tab State ────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState(location.state?.swipeDir === 'right' ? 'custom' : 'all'); // 'all' | 'custom'

  const swipeXRef = useRef({ start: 0, end: 0 });
  // `end` di-reset tiap sentuhan baru — tap tanpa touchmove kalau tidak begini bakal
  // dihitung pakai sisa swipe sebelumnya dan malah ganti sub-tab. Lihat ProgramTab.jsx.
  const handleSubTabTouchStart = (e) => {
    swipeXRef.current.start = e.touches[0].clientX;
    swipeXRef.current.end = e.touches[0].clientX;
  };
  const handleSubTabTouchMove = (e) => { swipeXRef.current.end = e.touches[0].clientX; };
  const handleSubTabTouchEnd = (e) => {
    const dist = swipeXRef.current.start - swipeXRef.current.end;
    if (Math.abs(dist) < 50) return;
    if (dist > 0 && viewMode === 'all') { setViewMode('custom'); e.stopPropagation(); }
    else if (dist < 0 && viewMode === 'custom') { setViewMode('all'); e.stopPropagation(); }
  };

  // Rak suplemen & obat — inventori non-makanan, satu tempat dengan database bahan.
  const [shelfTab, setShelfTab] = useState('suplemen'); // 'suplemen' | 'obat'
  const [editingSupplement, setEditingSupplement] = useState(null);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const drinkTemplates = profile?.drinkTemplates || [];
  const medicines = profile?.medicines || [];

  const [term, setTerm] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState('popular');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [macroFilter, setMacroFilter] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailViewMode, setDetailViewMode] = useState('100g'); // '100g' | 'portion'

  const MACRO_FILTERS = useMemo(() => {
    return [
      { id: 'protein', label: 'Protein' },
      { id: 'carbs', label: 'Karbohidrat' },
      { id: 'fat', label: 'Lemak' },
      ...NUTRIENTS.filter(n => !n.macro && n.key !== 'kcal').map(n => ({
        id: n.key, label: n.label
      }))
    ];
  }, []);

  const reportData = (item) => {
    if (!item || !item.name) return;
    const safeName = item.name.trim().toLowerCase().replace(/\//g, '_').substring(0, 100);
    setDoc(doc(db, 'lomeal_correction_signals', safeName), {
      foodName: item.name,
      source: item.source || 'Unknown',
      count: increment(1),
      reportedAt: new Date().toISOString(),
      type: 'flag'
    }, { merge: true })
    .then(() => showToast('Terima kasih! Data gizi ini akan ditinjau oleh tim kami.'))
    .catch(() => showToast('Gagal mengirim laporan.'));
  };
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [scanning, setScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [cropFile, setCropFile] = useState(null);
  const scanAbortRef = useRef(null);
  // Cropper minta URL, bukan File. Object URL-nya dilepas lagi biar gak bocor memori.
  const [cropSrc, setCropSrc] = useState(null);
  useEffect(() => {
    if (!cropFile) { setCropSrc(null); return; }
    const url = URL.createObjectURL(cropFile);
    setCropSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [cropFile]);

  // Tombol back nutup layar edit/detail (balik ke daftar) dan popover urutan, bukan
  // lompat keluar tab. `editing`/`detail` gantiin seluruh isi halaman (bukan overlay),
  // tapi transisinya sama aja — back tetap harus "mundur satu langkah".
  useBackClose(!!editing, () => setEditing(null));
  useBackClose(!!detail, () => setDetail(null));
  useBackClose(showSortMenu, () => setShowSortMenu(false));
  // cropFile (ImageCropperModal) sudah dihandle di dalam komponennya sendiri lewat prop `open`.
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // Pencarian online (OpenFoodFacts) sudah dimatikan sejak lama karena lambat dan data
  // mikronya kosong — state, debounce 800ms, dan spinner-nya ikut dibuang. Database bawaan
  // (TKPI) + custom milik user semuanya offline, jadi hasilnya langsung keluar.
  const dbCount = useMemo(() => searchFoods('', customFoods).length, [customFoods]);

  const results = useMemo(() => {
    let list = searchFoods(term, customFoods);
    if (viewMode === 'custom') list = list.filter((f) => f.isCustom);
    if (showFavoritesOnly) list = list.filter((f) => favoriteFoods.includes(f.id));

    if (sortOrder === 'popular') {
      list = sortFoodsByUsage(list, favoriteFoods);
    } else if (sortOrder === 'az') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'za') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOrder === 'nutrisi_asc' || sortOrder === 'nutrisi_desc') {
      const keys = macroFilter.length > 0 ? macroFilter : ['kcal'];
      list.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        keys.forEach(k => {
          scoreA += (a.nutrition[k] || 0);
          scoreB += (b.nutrition[k] || 0);
        });
        return sortOrder === 'nutrisi_asc' ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    return list.slice(0, viewMode === 'custom' ? 80 : 150);
  }, [term, customFoods, viewMode, favoriteFoods, showFavoritesOnly, sortOrder, macroFilter]);

  const inputCls = `w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} body-md outline-none`;

  // Sebelum ini, tiap catatan Lomy selalu bikin entri custom baru tanpa cek nama, jadi satu
  // "Matcha Latte" bisa numpuk puluhan kali. Pembuatannya sudah dicegah di LogTab; ini
  // buat beresin yang terlanjur numpuk.
  const duplicateNames = useMemo(() => {
    const seen = new Set();
    return customFoods.filter((f) => {
      const key = f.name?.trim().toLowerCase();
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    }).length;
  }, [customFoods]);

  const cleanDuplicates = async () => {
    if (!(await showConfirm(`Ada ${duplicateNames} makanan dengan nama dobel. Sisakan satu saja untuk tiap nama?`, { title: 'Bersihkan Duplikat', confirmText: 'Bersihkan' }))) return;
    const seen = new Set();
    const cleaned = customFoods.filter((f) => {
      const key = f.name?.trim().toLowerCase();
      if (seen.has(key)) return false; // yang disisakan entri paling awal
      seen.add(key);
      return true;
    });
    saveCustomFoodsFn(cleaned);
    await showAlert(`${customFoods.length - cleaned.length} entri dobel dihapus.`);
  };

  // Entri custom yang dibuat sebelum perbaikan satuan tersimpan isDrink:false & unit:'g',
  // jadi minuman lama kecatat gram kalau diketik tanpa satuan. Ditandai ulang sekali jalan.
  // Cocokkan per KATA UTUH biar "es" gak nyeret "es krim", dan kecualikan bentuk non-cair.
  useEffect(() => {
    if (!customFoods.length) return;
    const DRINK_WORDS = /\b(latte|kopi|coffee|teh|tea|jus|juice|susu|milk|soda|smoothie|matcha|boba|sirup|kefir|kombucha)\b/i;
    const NOT_DRINK = /\b(krim|kental|bubuk|powder|keripik|permen|roti|kue)\b/i;
    const fixed = customFoods.map((f) => {
      if (f.isDrink || !f.name || !DRINK_WORDS.test(f.name) || NOT_DRINK.test(f.name)) return f;
      return { ...f, isDrink: true, unit: 'ml', category: 'drink', portion: { ...f.portion, label: '100ml' } };
    });
    if (fixed.some((f, i) => f !== customFoods[i])) saveCustomFoodsFn(fixed);
  }, [customFoods, saveCustomFoodsFn]);

  // --- Custom Food form ---
  const editGalleryRef = useRef(null);

  const handleEditImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSaving(true);
      const res = await compressImageForAI(file);
      setForm(prev => ({ ...prev, image: res.dataUrl }));
    } catch(err) {
      console.error(err);
      showAlert("Gagal memproses gambar.");
    } finally {
      setSaving(false);
      if (editGalleryRef.current) editGalleryRef.current.value = '';
    }
  };

  const openNewForm = () => { setForm(emptyForm()); setEditing('new'); };
  const openEditForm = (food) => {
    const pGrams = food.portion?.grams || 100;
    const factor = pGrams / 100;
    
    // Bersihkan label lama bawaan sistem ("100g" / "100ml") agar placeholder/fallback "1 porsi" bisa muncul
    let pLabel = food.portion?.label || '';
    if (pLabel === '100g' || pLabel === '100ml') pLabel = '';

    setForm({
      name: food.name, 
      grams: pGrams,
      portionLabel: pLabel,
      portionGrams: pGrams,
      isDrink: !!food.isDrink,
      kcal: food.nutrition?.kcal ? Math.round(food.nutrition.kcal * factor * 1000) / 1000 : '',
      ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, food.nutrition?.[k] ? Math.round(food.nutrition[k] * factor * 1000) / 1000 : ''])),
    });
    setEditing(food);
  };

  const runOcrScan = async (file) => {
    if (scanning || ocrStatus) return;
    setScanning(true);
    setOcrStatus('Menganalisis foto...');
    const controller = new AbortController();
    scanAbortRef.current = controller;
    try {
      const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
      if (!quota.allowed) { await showAlert(`Kuota Lomy harian habis (${AI_DAILY_LIMIT}/hari). Coba lagi besok ya.`); return; }

      const { base64, mimeType } = await compressImageForAI(file);
      const res = await analyzeSmartPhoto(aiKey, base64, mimeType, controller.signal);

      let parsed = {};
      if (res.type === 'label') {
        const grams = Number(res.servingGrams) > 0 ? Number(res.servingGrams) : 100;
        const perServing = res.nutrition || {};
        const servingText = (res.servingSize || '').toLowerCase();
        const isDrink = servingText.includes('ml') || servingText.includes('liter') || servingText.includes(' l');
        parsed = {
          name: res.name || '',
          grams,
          portionLabel: res.servingSize || (grams === 100 ? (isDrink ? '100ml' : '100g') : (isDrink ? `${grams}ml` : `${grams}g`)),
          portionGrams: grams,
          isDrink,
          kcal: perServing.kcal ?? '',
          ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, perServing[k] ?? ''])),
        };
      } else {
        const first = res.foods?.[0];
        if (!first) throw new Error("Tidak menemukan makanan.");
        parsed = {
          name: first.name || '',
          grams: first.grams || 100,
          portionLabel: first.unit === 'ml' ? '1 gelas' : '1 porsi',
          portionGrams: first.grams || 100,
          isDrink: first.unit === 'ml' || !!first.isDrink,
          kcal: first.nutrition?.kcal ?? '',
          ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, first.nutrition?.[k] ?? ''])),
        };
      }

      setForm(parsed);
      setEditing('new');
      await showAlert(res.type === 'label' 
        ? 'Tabel nutrisi berhasil dipindai oleh Lomy! Silakan cek & koreksi angkanya.' 
        : 'Makanan di piring berhasil ditebak Lomy! Silakan simpan ke database.');
    } catch (err) {
      if (err.name === 'AbortError') return refundAiUsage(user.uid); // dibatalin user — kuota dibalikin
      await showAlert(err.message === 'OUT_OF_SCOPE' ? 'Foto ini tidak terbaca sebagai tabel gizi atau makanan.' : `Gagal scan: ${err.message}`);
    } finally {
      setOcrStatus('');
      setScanning(false);
      scanAbortRef.current = null;
    }
  };

  const cancelScan = () => scanAbortRef.current?.abort();

  // Di APK: kamera native (jepretannya sekalian masuk galeri HP). Di browser: input file biasa.
  const openCamera = async () => {
    if (isNativeApp()) {
      try {
        const file = await captureToFile();
        if (file) return setCropFile(file);
      } catch (e) {
        if (!/cancel/i.test(e.message || '')) showAlert(`Gagal membuka kamera: ${e.message}`);
        return;
      }
    }
    cameraRef.current?.click();
  };

  const handleScanLabel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropFile(file);
  };

  const parseNum = (v) => Number(String(v || 0).replace(',', '.')) || 0;

  const saveForm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nutrition = { kcal: parseNum(form.kcal) };
      NUTRIENT_FIELDS.forEach(([k]) => { nutrition[k] = parseNum(form[k]); });
      let grams = parseNum(form.grams);
      if (grams <= 0) grams = 100;
      const factor = 100 / grams;
      const per100 = {};
      // 3 desimal, bukan 1: nutrien berskala mcg (B12, vit D) hilang jadi 0 kalau dibulatkan
      // ke 0,1. Tampilan tetap membulatkan sendiri, jadi tidak ada bedanya di layar.
      Object.entries(nutrition).forEach(([k, v]) => { per100[k] = Math.round(v * factor * 1000) / 1000; });

    const isNew = editing === 'new';
    const isDrink = !!form.isDrink;
    const pLabel = form.portionLabel || (isDrink ? '1 porsi' : '1 porsi');
    const pGrams = Number(form.portionGrams) || 100;
    const item = {
      id: isNew ? `custom_${Date.now()}` : editing.id,
      name: form.name || 'Bahan Custom',
      image: form.image || null,
      category: isNew ? 'packaged' : editing.category,
      unit: isDrink ? 'ml' : 'g',
      isDrink,
      portion: { label: pLabel, grams: pGrams },
      nutrition: per100,
      source: 'Custom',
      isCustom: true,
    };

    const next = isNew ? [...customFoods, item] : customFoods.map((f) => (f.id === item.id ? item : f));
    await saveCustomFoodsFn(next);
    setEditing(null);
    setDetail(null);
    } finally {
      setSaving(false);
    }
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
          <div className="flex gap-3">
             <div onClick={() => editGalleryRef.current?.click()} className={`w-20 h-20 shrink-0 rounded-2xl border-2 border-dashed ${t.border} flex flex-col items-center justify-center ${t.textMuted} cursor-pointer overflow-hidden relative`}>
                {form.image ? <img src={form.image} className="w-full h-full object-cover absolute inset-0" /> : <><Camera size={20} className="mb-1" /><span className="text-[10px] font-bold">Foto</span></>}
             </div>
             <div className="flex-1 flex flex-col justify-center">
                <input className={inputCls} placeholder="Nama bahan" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
             </div>
          </div>
          <input ref={editGalleryRef} type="file" accept="image/*" onChange={handleEditImage} className="hidden" />
          
          <div className="mb-2">
            <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Jenis Makanan</p>
            <div className={`flex rounded-xl p-1 border ${t.border} ${t.inputBg}`}>
              <button type="button" onClick={() => setForm(f => ({ ...f, type: 'raw_ingredient' }))} className={`flex-1 py-1.5 rounded-lg caption font-bold ${form.type !== 'ready_to_eat' ? `${t.bgCard} shadow-sm text-white` : t.textMuted}`}>Bahan Mentah</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, type: 'ready_to_eat' }))} className={`flex-1 py-1.5 rounded-lg caption font-bold ${form.type === 'ready_to_eat' ? `${t.bgCard} shadow-sm text-white` : t.textMuted}`}>Siap Santap</button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Wujud</p>
              <div className={`flex rounded-xl p-1 border ${t.border} ${t.inputBg}`}>
                <button type="button" onClick={() => setForm(f => ({ ...f, isDrink: false }))} className={`flex-1 py-1.5 rounded-lg caption font-bold ${!form.isDrink ? `${t.bgCard} shadow-sm text-white` : t.textMuted}`}>Makanan</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, isDrink: true }))} className={`flex-1 py-1.5 rounded-lg caption font-bold ${form.isDrink ? `${t.bgCard} shadow-sm text-white` : t.textMuted}`}>Minuman</button>
              </div>
            </div>
            <div>
              <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Label 1 Porsi (opsional)</p>
              <input type="text" className={inputCls} value={form.portionLabel} onChange={(e) => setForm(f => ({ ...f, portionLabel: e.target.value }))} placeholder={form.isDrink ? '1 gelas' : '1 bungkus'} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Berat 1 Porsi ({form.isDrink ? 'ml' : 'g'})</p>
              <input type="number" inputMode="numeric" className={`${inputCls} no-spinners`} value={form.portionGrams} onChange={(e) => setForm((f) => ({ ...f, portionGrams: e.target.value }))} placeholder="100" />
            </div>
            <div>
              <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Acuan gizi di bawah ({form.isDrink ? 'ml' : 'g'})</p>
              <input type="number" inputMode="numeric" className={`${inputCls} no-spinners`} value={form.grams} onChange={(e) => setForm((f) => ({ ...f, grams: e.target.value }))} placeholder="100" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className={`caption font-medium mb-0.5 ${t.textMuted}`}>Energi (kkal)</p>
              <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={form.kcal} onChange={(e) => setForm(f => ({ ...f, kcal: e.target.value }))} placeholder="0" />
            </div>
            {NUTRIENT_FIELDS.filter(([k]) => ['protein','carbs','fat','sodium','sugar','cholesterol','satFat','transFat'].includes(k)).map(([k, label]) => (
              <div key={k}>
                <p className={`caption font-medium mb-0.5 ${t.textMuted} truncate`}>{label}</p>
                <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>
          
          <details className={`mt-2 rounded-xl border ${t.border} p-3 ${t.bgSunken}`}>
            <summary className={`caption font-bold ${t.textMain} cursor-pointer outline-none select-none`}>Lihat Nutrisi Ekstra (Vitamin, Mineral, dll)</summary>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {NUTRIENT_FIELDS.filter(([k]) => !['protein','carbs','fat','sodium','sugar','cholesterol','satFat','transFat'].includes(k)).map(([k, label]) => (
                <div key={k}>
                  <p className={`caption font-medium mb-0.5 ${t.textMuted} truncate`}>{label}</p>
                  <input type="number" inputMode="decimal" className={`${inputCls} no-spinners`} value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="0" />
                </div>
              ))}
            </div>
          </details>
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
          <h2 className={`h2 ${t.textMain} line-clamp-2 flex-1`}>{detail.name}</h2>
          <button onClick={() => toggleFavorite(detail.id)} className={`p-2 rounded-xl ${t.btnBg} shrink-0`} aria-label="Favoritkan">
            <Heart size={18} fill={favoriteFoods.includes(detail.id) ? "currentColor" : "none"} className={favoriteFoods.includes(detail.id) ? 'text-rose-500' : t.textMuted} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-4 px-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className={`caption font-medium ${t.textMuted}`}>Sumber: {detail.source || 'Custom'}</p>
            {(!detail.isCustom && detail.source !== 'TKPI') && (
               <button onClick={() => reportData(detail)} className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md active:scale-95 transition-transform">
                 <AlertTriangle size={12} /> Laporkan Data
               </button>
            )}
          </div>
          
          <div className={`flex rounded-xl p-1 border ${t.border} ${t.inputBg}`}>
            <button onClick={() => setDetailViewMode('100g')} className={`flex-1 py-2 rounded-lg body-md font-bold transition-all ${detailViewMode === '100g' ? `${t.bgCard} shadow-sm ${t.textMain}` : t.textMuted}`}>Per 100{detail.unit}</button>
            <button onClick={() => setDetailViewMode('portion')} className={`flex-1 py-2 rounded-lg body-md font-bold transition-all ${detailViewMode === 'portion' ? `${t.bgCard} shadow-sm ${t.textMain}` : t.textMuted}`}>
              Per {(() => {
                const label = detail.portion?.label || '1 porsi';
                // Hindari duplikasi teks jika label porsi persis "100g" atau "100ml" (data lama)
                if (label === `100${detail.unit}` || label === `100 ${detail.unit}`) {
                  return `Sajian (${detail.portion?.grams || 100}${detail.unit})`;
                }
                return label;
              })()}
            </button>
          </div>
          
          {(() => {
            const factor = detailViewMode === 'portion' ? ((detail.portion?.grams || 100) / 100) : 1;
            return (
              <>
                <div className={`grid grid-cols-4 gap-2 p-3 rounded-2xl ${t.bgSunken}`}>
                  {[['kcal', 'kkal'], ['protein', 'P (g)'], ['carbs', 'K (g)'], ['fat', 'L (g)']].map(([k, label]) => (
                    <div key={k} className="text-center">
                      <p className={`text-sm font-black tabular-nums ${t.textMain}`}>{Math.round((detail.nutrition[k] || 0) * factor)}</p>
                      <p className={`caption ${t.textMuted}`}>{label}</p>
                    </div>
                  ))}
                </div>
                <div className={`rounded-2xl border ${t.border} ${t.bgCard} divide-y ${t.border}`}>
                  {EXTRA_NUTRIENT_FIELDS.filter(([k]) => detail.nutrition[k] && detail.nutrition[k] !== 0).map(([k, label]) => (
                    <div key={k} className="flex justify-between px-4 py-2.5">
                      <span className={`body-md ${t.textMuted}`}>{label}</span>
                      <span className={`body-md font-bold ${t.textMain}`}>{Math.round((detail.nutrition[k] || 0) * factor * 10) / 10}</span>
                    </div>
                  ))}
                  {EXTRA_NUTRIENT_FIELDS.filter(([k]) => detail.nutrition[k] && detail.nutrition[k] !== 0).length === 0 && (
                    <div className={`px-4 py-3 caption text-center ${t.textMuted}`}>Tidak ada data nutrisi mikro.</div>
                  )}
                </div>
              </>
            );
          })()}
          
          {(() => {
            const domusMatch = domusItems.find(d => d.name.toLowerCase() === detail.name.toLowerCase());
            if (!domusMatch) return null;
            return (
              <div className={`mt-4 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex flex-col items-center justify-center text-center space-y-1`}>
                <Home size={24} className="text-orange-500 mb-1" />
                <p className="text-orange-500 font-bold body-lg">Stok Domus: {domusMatch.quantity} {domusMatch.unit || ''}</p>
                <p className="text-orange-500/70 caption">Bahan ini tersedia di inventori rumah.</p>
              </div>
            );
          })()}
        </div>
        
        {detail.isCustom && (
          <div className="flex gap-2 mt-4 shrink-0">
            <button onClick={() => openEditForm(detail)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md ${t.textMain}`}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => deleteCustom(detail)} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-rose-500/10 text-rose-500 body-md">
              <X size={14} /> Hapus
            </button>
          </div>
        )}
      </div>
    );
  }

  if (editingSupplement) return (
    <SupplementBuilder t={t} theme={theme} editing={editingSupplement} setEditing={setEditingSupplement}
      customFoods={customFoods}
      onSave={(item) => {
        saveProfilePatch({ drinkTemplates: [item, ...drinkTemplates.filter(d => d.id !== item.id)] });
        setEditingSupplement(null);
      }} />
  );

  if (editingMedicine) return (
    <MedicineBuilder t={t} editing={editingMedicine} setEditing={setEditingMedicine}
      onSave={(item) => {
        saveProfilePatch({ medicines: [item, ...medicines.filter(m => m.id !== item.id)] });
        setEditingMedicine(null);
      }} />
  );

  const shelfItems = shelfTab === 'suplemen' ? drinkTemplates : medicines;

  return (
    <div className="p-4 pb-24 h-full flex flex-col">
      {/* ===== RAK SUPLEMEN & OBAT ===== */}
      <div className={`relative flex p-1.5 rounded-full ${t.btnBg} w-full shrink-0 border ${t.border} mb-3`}>
        <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-full transition-transform duration-300 ease-out ${t.bgAccent} shadow-sm`} style={{ transform: shelfTab === 'suplemen' ? 'translateX(0)' : 'translateX(100%)', left: '6px' }}></div>
        {[['suplemen', 'Suplemen'], ['obat', 'Obat']].map(([id, label]) => (
          <button key={id} onClick={() => { setShelfTab(id); playSoundEffect('click', soundEnabled); }}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-full relative z-10 body-md font-black transition-colors duration-300 ${shelfTab === id ? 'text-white' : t.textMuted}`}>
            {label} <CountBadge n={id === 'suplemen' ? drinkTemplates.length : medicines.length} active={shelfTab === id} />
          </button>
        ))}
      </div>

      <div className="shrink-0 mb-3">
        <button
          onClick={() => shelfTab === 'suplemen'
            ? setEditingSupplement({ id: `ds_${Date.now()}`, name: '', icon: 'CupSoda', color: 'sky', ingredients: [], nutrition: { ...EMPTY_NUTRITION } })
            : setEditingMedicine({ id: `med_${Date.now()}`, name: '', icon: 'Pill', color: 'rose', signa: '', note: '' })}
          className={`w-full py-2.5 rounded-2xl border-2 border-dashed ${t.borderDashed} ${t.textMuted} caption font-bold flex items-center justify-center gap-1.5`}>
          <Plus size={14} /> Tambah {shelfTab === 'suplemen' ? 'suplemen' : 'obat'}
        </button>
      </div>

      {/* Maks 3 rak kelihatan; sisanya di-scroll biar database bahan tetap dapat ruang. */}
      <div className="shrink-0 max-h-[216px] overflow-y-auto mb-4 space-y-2">
        {shelfItems.map(item => {
          const IconComp = SHELF_ICONS[item.icon] || (shelfTab === 'suplemen' ? CupSoda : Pill);
          const bgClass = SHELF_COLORS.find(c => c.id === item.color)?.bg || 'bg-zinc-500';
          return (
            <div key={item.id} className={`rounded-2xl border ${t.border} ${t.bgCard} p-3 flex items-center gap-3`}>
              <button onClick={() => shelfTab === 'suplemen' ? setEditingSupplement(item) : setEditingMedicine(item)}
                className="flex-1 flex items-center gap-3 text-left min-w-0">
                <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white ${bgClass}`}>
                  <IconComp size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <p className={`body-md font-bold truncate ${t.textMain}`}>{item.name}</p>
                  <p className={`caption font-medium truncate ${shelfTab === 'obat' ? 'text-rose-500' : t.textMuted}`}>
                    {shelfTab === 'suplemen'
                      ? `${Math.round(item.nutrition?.kcal || 0)} kkal · P ${Math.round(item.nutrition?.protein || 0)}g`
                      : item.signa}
                  </p>
                </span>
              </button>
              <button onClick={async () => {
                if (!(await showConfirm(`Hapus "${item.name}"?`))) return;
                shelfTab === 'suplemen'
                  ? saveProfilePatch({ drinkTemplates: drinkTemplates.filter(x => x.id !== item.id) })
                  : saveProfilePatch({ medicines: medicines.filter(x => x.id !== item.id) });
              }} className="p-2 text-red-400 shrink-0"><X size={15} /></button>
            </div>
          );
        })}
      </div>

      <div className={`relative flex p-1.5 rounded-full ${t.btnBg} w-full shrink-0 border ${t.border} mb-4`}>
        <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-full transition-transform duration-300 ease-out ${t.bgAccent} shadow-sm`} style={{ transform: viewMode === 'all' ? 'translateX(0)' : 'translateX(100%)', left: '6px' }}></div>
        <button
          onClick={() => { setViewMode('all'); playSoundEffect('click', soundEnabled); }}
          className={`flex-1 flex items-center justify-center py-2.5 rounded-full relative z-10 body-md font-black transition-colors duration-300 ${
            viewMode === 'all' ? 'text-white' : t.textMuted
          }`}
        >
          Semua <CountBadge n={dbCount} active={viewMode === 'all'} />
        </button>
        <button
          onClick={() => { setViewMode('custom'); playSoundEffect('click', soundEnabled); }}
          className={`flex-1 flex items-center justify-center py-2.5 rounded-full relative z-10 body-md font-black transition-colors duration-300 ${
            viewMode === 'custom' ? 'text-white' : t.textMuted
          }`}
        >
          Custom <CountBadge n={customFoods.length} active={viewMode === 'custom'} />
        </button>
      </div>

      <div className="flex gap-2 items-center mb-3 shrink-0">
        <div className={`flex-1 flex items-center gap-2 px-3 py-3 rounded-xl border ${t.border} ${t.inputBg} focus-within:ring-2 focus-within:${t.ringAccent} transition-all`}>
          <Search size={16} className={t.textMuted} />
          <input 
            value={term} 
            onChange={(e) => setTerm(e.target.value)} 
            placeholder="Cari"
            className={`flex-1 bg-transparent outline-none body-md ${t.textMain}`} 
          />
          {term && <button onClick={() => setTerm('')}><X size={16} className={t.textMuted} /></button>}
        </div>

        <button
          onClick={() => { setShowFavoritesOnly(!showFavoritesOnly); playSoundEffect('click', soundEnabled); }}
          className={`p-3 rounded-xl transition-all border ${t.border} ${
            showFavoritesOnly
              ? `bg-rose-500 border-rose-500 text-white shadow-sm`
              : `${t.inputBg} ${t.textMuted}`
          }`}
          title="Filter Favorit"
        >
          <Heart size={18} fill={showFavoritesOnly ? "currentColor" : "none"} />
        </button>

        <button
          onClick={() => { setShowFilters(!showFilters); playSoundEffect('click', soundEnabled); }}
          className={`p-3 rounded-xl transition-all border ${t.border} ${
            showFilters || macroFilter.length > 0
              ? `${t.bgAccent} border-transparent text-white shadow-sm`
              : `${t.inputBg} ${t.textMuted}`
          }`}
        >
          <Filter size={18} />
        </button>
      </div>

      {showFilters && (
        <div className={`p-3 rounded-xl border ${t.border} ${t.bgCard} space-y-3 mb-3 shrink-0 animate-in fade-in duration-200 relative z-50`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider ${t.textMuted} shrink-0`}>Fokus Nutrisi</span>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1 no-swipe">
              {MACRO_FILTERS.map((c) => {
                const isActive = macroFilter.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (isActive) setMacroFilter(prev => prev.filter(p => p !== c.id));
                      else setMacroFilter(prev => [...prev, c.id]);
                      playSoundEffect('click', soundEnabled);
                    }}
                    className={`shrink-0 px-3 py-1 rounded-lg border caption font-bold transition-all ${isActive ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={`flex items-center justify-between pt-3 border-t ${t.border}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${t.textMuted}`}>Urutkan</span>
              <div className="relative">
                <div 
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className={`px-3 py-1.5 rounded-lg ${t.inputBg} ${t.textMain} body-md outline-none cursor-pointer flex items-center justify-between min-w-[120px] gap-2`}
                >
                  <span className="truncate whitespace-nowrap">
                    {sortOrder === 'popular' ? 'Terpopuler' 
                    : sortOrder === 'az' ? 'A - Z' 
                    : sortOrder === 'za' ? 'Z - A'
                    : sortOrder === 'nutrisi_desc' ? 'Nutrisi (Tinggi -> Rendah)'
                    : 'Nutrisi (Rendah -> Tinggi)'}
                  </span>
                  <ChevronDown size={12} className={`${t.textMuted} shrink-0`} />
                </div>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)}></div>
                    <div className={`absolute top-full left-0 mt-1 min-w-[160px] z-50 bg-white dark:bg-[#1a1a1a] border ${t.border} rounded-xl shadow-lg overflow-hidden py-1`}>
                      {[
                        { id: 'popular', label: 'Terpopuler' },
                        { id: 'az', label: 'A - Z' },
                        { id: 'za', label: 'Z - A' },
                        { id: 'nutrisi_desc', label: 'Nutrisi (Tinggi -> Rendah)' },
                        { id: 'nutrisi_asc', label: 'Nutrisi (Rendah -> Tinggi)' },
                      ].map(opt => (
                        <div key={opt.id} onClick={() => { setSortOrder(opt.id); setShowSortMenu(false); }} className={`px-3 py-2 text-sm cursor-pointer whitespace-nowrap hover:${t.bgAccentSoft} ${sortOrder === opt.id ? t.textAccent : t.textMain}`}>
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'custom' && (
        <div className="flex gap-2 mb-3 shrink-0">
          <button onClick={() => { openNewForm(); playSoundEffect('click', soundEnabled); }} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl ${t.bgAccent} body-md shadow-glow`}>
            <Plus size={16} /> Tambah Manual
          </button>
          {duplicateNames > 0 && (
            <button onClick={cleanDuplicates} className={`shrink-0 px-3 h-[48px] rounded-2xl border ${t.border} ${t.btnBg} ${t.textMain} caption font-bold flex items-center gap-1.5`}>
              <X size={14} /> {duplicateNames} dobel
            </button>
          )}
          <div className="flex gap-2 shrink-0">
            {ocrStatus ? (
              <div className={`flex-1 h-[48px] rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} relative flex items-center justify-center`}>
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-amber-500/20 dark:bg-amber-400/20 w-full origin-left" style={{ animation: 'progressFill 10s cubic-bezier(0.1, 0.8, 0.2, 1) forwards' }} />
                </div>
                {scanning && (
                  <button onClick={cancelScan} aria-label="Batalkan scan"
                    className="relative z-10 p-2 rounded-xl bg-red-500 text-white active:scale-95">
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <button onClick={openCamera} className={`w-14 flex items-center justify-center py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md ${t.textMain} active:scale-[0.98]`}>
                  <Camera size={18} />
                </button>
                <button onClick={() => galleryRef.current?.click()} className={`w-14 flex items-center justify-center py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md ${t.textMain} active:scale-[0.98]`}>
                  <Image size={18} />
                </button>
              </>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleScanLabel} className="hidden" />
          <input ref={galleryRef} type="file" accept="image/*" onChange={handleScanLabel} className="hidden" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-10 hide-scrollbar -mx-4 px-4 pt-1"
        onTouchStart={handleSubTabTouchStart} onTouchMove={handleSubTabTouchMove} onTouchEnd={handleSubTabTouchEnd}>
        <div key={viewMode} className={`animate-in fade-in duration-300 ${viewMode === 'all' ? 'slide-in-from-left-12' : 'slide-in-from-right-12'}`}>
          <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 space-y-3 sm:space-y-0">
            {results.map((f) => (
              <UnifiedFoodCard 
                key={f.id} 
                f={f} 
                t={t} 
                favoriteFoods={favoriteFoods} 
                toggleFavorite={toggleFavorite} 
                setDetail={setDetail} 
                openEditForm={openEditForm}
                soundEnabled={soundEnabled} 
                domusItems={domusItems}
              />
            ))}
          </div>
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 opacity-60">
              <Database size={40} className={`mb-3 ${t.textMuted}`} />
              <p className={`body-md text-center ${t.textMuted}`}>Tidak ada hasil yang ditemukan.</p>
              {viewMode === 'all' && term.length > 0 && (
                <p className={`caption text-center mt-2 ${t.textAccent}`}>Belum ada di database? Tambahkan manual atau scan label kemasannya di tab Custom.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== CROPPER MODAL =====
          Props-nya dulu salah nama semua (isOpen/imageFile/onCropComplete) padahal komponennya
          minta open/imageSrc/onComplete — modalnya gak pernah kebuka, jadi scan-nya kelihatan
          kayak tombol mati. */}
      <ImageCropperModal
        open={!!cropFile}
        imageSrc={cropSrc}
        onClose={() => setCropFile(null)}
        onComplete={async (croppedDataUrl) => {
          setCropFile(null);
          const blob = await (await fetch(croppedDataUrl)).blob();
          runOcrScan(blob);
        }}
      />
    </div>
  );
};

export default FoodDbTab;
