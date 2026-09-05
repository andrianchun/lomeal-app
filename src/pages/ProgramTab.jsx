import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChefHat, Plus, X, Clock, CalendarPlus, Warehouse, ClipboardList, Send, Trash2, Utensils, Calculator, Coins, Loader2, Search, Box, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { EMPTY_NUTRITION, DIET_PROFILES, DIET_GOALS, ACTIVITY_LEVELS } from '../data/nutrition';
import { MEAL_SESSIONS, DEFAULT_SESSION_TIMES, macroText, getLocalYMD, DAY_NAMES_ID, heroForRecipe, formatDuration } from '../data/constants';
import { STATUS } from '../theme';
import { makeEntry } from '../utils/foodLog';
import { generateDietRecipe, buildAiRecipe, buildRecipeProfileInput } from '../utils/aiFood';
import { createDomusItem, requestShoppingListDomus, updateDomusItemQuantity, zeroDomusItemStock, discardDomusItem, addPortionsToDomusItem, cookEntry, matchDomusItem } from '../utils/domusSync';
import { deductStock, stockInGrams, itemStock, formatStock, unitToGrams } from '../utils/stockConverter';
import { blockingShortages, formatShortfall, ingredientAvailability } from '../utils/recipeStock.js';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import RecipeBuilder from '../components/RecipeBuilder';
import RecipeDetail from '../components/RecipeDetail';
import CookingSession from '../components/CookingSession';
import InboxProcessor from '../components/InboxProcessor';
import { loadCookSession, clearCookSession } from '../hooks/useCookTimers';
import { markInboxClaimed, updateInboxNutrition } from '../utils/foodLog';
import { runLocalNlpParse } from '../utils/nlpParser';
import DietQuestionnaireModal from '../components/DietQuestionnaireModal';
import useBackClose from '../hooks/useBackClose';



/**
 * TAB 4: RENCANA & PROGRAM
 */
const ProgramTab = ({ t, theme, user, logymUser, domusItems, domusLocations, recipes, saveRecipesFn, mealPreps, saveMealPrepsFn, inboxItems = [], customFoods, daysMap, saveDay, shareRecipe, showAlert, showToast, showConfirm, profile, saveProfilePatch, aiKey }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(location.state?.swipeDir === 'right' ? 'meal_prep' : 'resep'); // 'resep', 'meal_prep'
  
  const swipeXRef = useRef({ start: 0, end: 0 });
  // `end` WAJIB di-reset ke posisi awal tiap sentuhan baru. Kalau tidak, tap biasa (yang
  // sama sekali tidak memicu touchmove) dihitung pakai `end` sisa swipe sebelumnya — jaraknya
  // lewat 50px, jadi tap di kartu resep malah lompat ganti sub-tab dan kartunya terasa
  // "tidak bisa diklik".
  const handleSubTabTouchStart = (e) => {
    swipeXRef.current.start = e.touches[0].clientX;
    swipeXRef.current.end = e.touches[0].clientX;
  };
  const handleSubTabTouchMove = (e) => { swipeXRef.current.end = e.touches[0].clientX; };
  const handleSubTabTouchEnd = (e) => {
    const diff = swipeXRef.current.end - swipeXRef.current.start;
    if (diff > 50 && activeTab === 'meal_prep') setActiveTab('resep');
    if (diff < -50 && activeTab === 'resep') setActiveTab('meal_prep');
  };
  const [editing, setEditing] = useState(null); // recipe to edit/create
  const [viewingId, setViewingId] = useState(null); // recipe to view details
  const [assigning, setAssigning] = useState(null); // recipe to plan to calendar
  const [cooking, setCooking] = useState(null); // { recipe, servings } — sesi masak yang lagi jalan
  const [shareBusy, setShareBusy] = useState(null);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showQuickAiModal, setShowQuickAiModal] = useState(false);
  const [showTargetDetails, setShowTargetDetails] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [processingInbox, setProcessingInbox] = useState(null);
  const [openPrepSection, setOpenPrepSection] = useState('lomeal'); // 'lomeal', 'domus', 'darka'
  const [autoParsingIds, setAutoParsingIds] = useState(new Set()); // track which inbox items are being auto-parsed


  // Tombol back nutup/mundurin layar builder & sheet, bukan lompat keluar tab.
  // editingSupplement/editingMedicine/showQuestionnaire SENGAJA gak didaftar di sini —
  // udah dihandle sendiri-sendiri di dalam SupplementBuilder/MedicineBuilder/
  // DietQuestionnaireModal (daftar dobel bikin dua entri history buat satu modal).
  useBackClose(!!editing, () => setEditing(null));
  useBackClose(!!assigning, () => setAssigning(null));

  const isDark = theme === 'dark';

  const viewing = useMemo(() => recipes.find(r => r.id === viewingId) || null, [recipes, viewingId]);

  const dietLabel = useMemo(() => {
    return DIET_PROFILES.find((d) => d.id === profile?.dietProfile)?.label || profile?.dietProfile || 'Seimbang';
  }, [profile?.dietProfile]);

  const goalLabel = useMemo(() => {
    return DIET_GOALS.find((g) => g.id === profile?.dietGoal)?.label || null;
  }, [profile?.dietGoal]);

  const activityLabel = useMemo(() => {
    return ACTIVITY_LEVELS.find((a) => a.id === profile?.activityLevel)?.label || 'Sedang';
  }, [profile?.activityLevel]);

  // Sync selectedIngredients from profile when opening quick modal
  useEffect(() => {
    if (showQuickAiModal) {
      const init = (profile?.kulkas || []).map((k) => (typeof k === 'string' ? k : k?.name)).filter(Boolean);
      setSelectedIngredients(init);
      setIngredientSearch('');
      setShowTargetDetails(false);
    }
  }, [showQuickAiModal, profile?.kulkas]);

  // Bahan yang dikelompokkan: Domus (atas) & Database/Umum
  const { domusList, dbList } = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();

    // 1. Group Domus (di atas sendiri):
    const dList = (domusItems || [])
      .filter((it) => it && it.name && !it.discardedAt)
      .map((it) => ({
        name: it.name,
        stock: it.qtyValue ? `${it.qtyValue} ${it.qtyUnit || ''}`.trim() : null,
        isDomus: true,
      }))
      .filter((it) => !q || it.name.toLowerCase().includes(q));

    // Deduplicate Domus by name
    const seenNames = new Set(dList.map((d) => d.name.toLowerCase()));

    // 2. Group Database & Makanan Populer:
    const fromCustom = (customFoods || []).map((f) => f.name).filter(Boolean);
    const commonStaples = [
      'Dada Ayam', 'Telur', 'Tahu', 'Tempe', 'Daging Sapi', 'Ikan Salmon', 'Udang',
      'Bayam', 'Brokoli', 'Nasi Merah', 'Nasi Putih', 'Kentang', 'Oatmeal', 'Wortel',
      'Tomat', 'Alpukat', 'Bawang Putih', 'Bawang Merah', 'Minyak Zaitun', 'Cabai', 'Keju'
    ];

    const generalNames = Array.from(new Set([...fromCustom, ...commonStaples]))
      .filter((name) => !seenNames.has(name.toLowerCase()))
      .filter((name) => !q || name.toLowerCase().includes(q))
      .map((name) => ({ name, isDomus: false }));

    return { domusList: dList, dbList: generalNames };
  }, [domusItems, customFoods, ingredientSearch]);

  const unselectedDomus = useMemo(() => {
    return domusList.filter(d => !selectedIngredients.some(s => s.toLowerCase() === d.name.toLowerCase()));
  }, [domusList, selectedIngredients]);

  const unselectedDb = useMemo(() => {
    return dbList.filter(d => !selectedIngredients.some(s => s.toLowerCase() === d.name.toLowerCase()));
  }, [dbList, selectedIngredients]);

  const handleAddIngredient = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (!selectedIngredients.includes(trimmed)) {
      setSelectedIngredients((prev) => [...prev, trimmed]);
    }
    setIngredientSearch('');
  };

  const handleToggleIngredient = (name) => {
    if (selectedIngredients.includes(name)) {
      setSelectedIngredients((prev) => prev.filter((x) => x !== name));
    } else {
      setSelectedIngredients((prev) => [...prev, name]);
    }
  };

  // Item Domus yang sebenarnya cerminan batch Lomeal dilewati — kalau tidak, satu stok
  // tampil dua kali (di seksi Lomeal dengan badge Domus, dan lagi di seksi Domus).
  const mirroredDomusIds = useMemo(() => new Set(
    mealPreps?.filter(m => m.domusItemId).map(m => m.domusItemId) || []
  ), [mealPreps]);

  const domusMatang = useMemo(() => (
    domusItems?.filter(i => i.isFood && !mirroredDomusIds.has(i.id)) || []
  ), [domusItems, mirroredDomusIds]);

  // Balik ke sesi masak yang timernya masih jalan (mis. user ketuk notifikasi "Sedang masak"
  // sesudah app dibunuh Android). Sekali saja per mount — kalau user nutup sendiri, ya sudah.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || recipes.length === 0) return;
    const s = loadCookSession();
    if (!s?.recipeId) return;
    resumedRef.current = true;
    const r = recipes.find(x => x.id === s.recipeId);
    if (!r) { clearCookSession(); return; }
    if (s.timers?.length > 0) setCooking({ recipe: r, servings: s.servings || r.portions });
  }, [recipes]);

  // ========== AUTO-PARSE INBOX ITEMS (Client-Side, Free) ==========
  const autoParsedRef = useRef(new Set());
  useEffect(() => {
    if (!inboxItems || inboxItems.length === 0) return;
    const toParse = inboxItems.filter(inb =>
      !inb.nutrition && !inb.autoParseFailed && !autoParsedRef.current.has(inb.id) && !autoParsingIds.has(inb.id)
    );
    if (toParse.length === 0) return;

    toParse.forEach(inb => {
      autoParsedRef.current.add(inb.id);
      setAutoParsingIds(prev => new Set([...prev, inb.id]));
      try {
        const res = runLocalNlpParse(inb.text);
        if (res && res.foods && res.foods.length > 0) {
          const nutrition = {
            kcal: res.foods.reduce((a, f) => a + (f.nutrition?.kcal || 0), 0),
            protein: res.foods.reduce((a, f) => a + (f.nutrition?.protein || 0), 0),
            carbs: res.foods.reduce((a, f) => a + (f.nutrition?.carbs || 0), 0),
            fat: res.foods.reduce((a, f) => a + (f.nutrition?.fat || 0), 0),
          };
          updateInboxNutrition(inb.id, nutrition).catch(e => console.error('Auto-parse save fail', e));
        } else {
          updateInboxNutrition(inb.id, null, true).catch(e => console.error('Auto-parse mark fail', e));
        }
      } catch (e) {
        console.error('Auto-parse error', e);
        updateInboxNutrition(inb.id, null, true).catch(() => {});
      }
      setAutoParsingIds(prev => { const n = new Set(prev); n.delete(inb.id); return n; });
    });
  }, [inboxItems]);

  const newRecipe = () => setEditing({
    id: `r_${Date.now()}`, name: '', portions: 2, durationMin: 30,
    ingredients: [], components: [], note: '',
    authorName: logymUser?.displayName || user?.displayName || 'Kamu',
    authorUid: user?.uid || null,
    createdAt: new Date().toISOString(),
  });

  const saveRecipe = (recipe) => {
    const others = recipes.filter(r => r.id !== recipe.id);
    saveRecipesFn([recipe, ...others]);
    setEditing(null);
  };

  const deleteRecipe = async (r) => {
    if (!(await showConfirm(`Hapus resep "${r.name}"?`))) return;
    if (viewingId === r.id) setViewingId(null);
    saveRecipesFn(recipes.filter(x => x.id !== r.id));
  };

  // ---------- Meal Prep Assigner ----------
  const [assignDays, setAssignDays] = useState([1, 2, 3, 4, 5]); // Sen-Jum default
  const [assignSession, setAssignSession] = useState('lunch');
  const [assignWeeks, setAssignWeeks] = useState(1);
  const [assignSelectedDates, setAssignSelectedDates] = useState([]);
  const [assignCalMonth, setAssignCalMonth] = useState(null); // null = current month
  const [movingBatch, setMovingBatch] = useState(null); // batch yang lagi pilih lokasi Domus
  const [eating, setEating] = useState(null); // { batch, sessionId, time } konfirmasi sebelum masuk Catat

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

  /**
   * Gerbang kedua sebelum layar masak kebuka. Tombol di layar resep udah mati duluan kalau
   * bahannya kurang, tapi pintunya dijaga hitungan yang SAMA (utils/recipeStock.js) — dua pintu
   * dengan dua hitungan cepat atau lambat bakal beda pendapat.
   */
  const startCook = (r, servings) => {
    const portions = Math.max(1, Number(servings) || Number(r.portions) || 1);
    const factor = portions / Math.max(1, Number(r.portions) || 1);
    const blockers = blockingShortages(ingredientAvailability(r, factor, domusItems));
    if (blockers.length > 0) {
      showToast(`Bahan belum cukup — ${blockers.map(formatShortfall).join(', ')}`);
      return;
    }
    setCooking({ recipe: r, servings: portions });
  };

  // Potong stok bahan di Domus sesuai porsi yang BENAR-BENAR dimasak (bukan porsi resep),
  // lalu bahan yang habis/tidak ada langsung diusulkan ke keranjang belanja Domus.
  const syncIngredientsToDomus = async (recipe, factor) => {
    if (!domusItems?.length) return;
    const missing = new Map();
    for (const ing of recipe.ingredients) {
      const match = matchDomusItem(domusItems, ing.name);
      // Bahan yang belum pernah kecatat di Domus tetap diusulkan belanja, cuma tanpa `itemId` —
      // gak ada entitas yang bisa ditunjuk. Nyocokinnya nanti balik lewat nama.
      if (!match) { missing.set(ing.name, { name: ing.name }); continue; }
      try {
        const needed = Number(ing.grams || 0) * factor;
        const res = deductStock(match, needed);
        // `ok: false` = jumlahnya tidak bisa dihitung (kosong / "secukupnya"), BUKAN habis.
        // Dulu keduanya sama-sama null dan itemnya ikut ditandai habis lalu lenyap dari Domus.
        if (!res.ok) continue;
        if (res.depleted) {
          // Stoknya nol, BARANGNYA TETAP ADA. Dulu di sini barangnya dipensiunkan
          // (`markDomusItemConsumed`) dan itu bikin belanjaan berikutnya dari Darka mendarat di
          // barang kembar — lihat domus-app/model-barang.md.
          await zeroDomusItemStock(match.id);
          const have = stockInGrams(match);
          const shortGrams = have != null && have > 0 ? needed - have : needed;
          // Jumlah kekurangannya dikirim sebagai ANGKA + SATUAN barangnya, bukan ditempel ke nama
          // ("Telur (200 g lagi)"): nama begitu gak akan pernah cocok balik waktu belanjaannya
          // masuk lewat nota Darka. `itemId` yang bikin entri belanja nunjuk ke barang ini.
          const perUnit = unitToGrams(match.qtyUnit, match);
          missing.set(match.id, {
            name: match.name,
            itemId: match.id,
            qtyValue: perUnit ? Math.ceil(shortGrams / perUnit) : Math.ceil(shortGrams),
            qtyUnit: perUnit ? (match.qtyUnit || 'g') : 'g',
          });
        } else {
          await updateDomusItemQuantity(match.id, res.value, res.unit);
        }
      } catch (e) {
        console.error(`Gagal potong stok untuk ${ing.name}`, e);
      }
    }
    for (const m of missing.values()) {
      try { await requestShoppingListDomus(user.uid, m.name, { qtyValue: m.qtyValue ?? null, qtyUnit: m.qtyUnit ?? null, itemId: m.itemId ?? null }); }
      catch (e) { console.error('Gagal tambah ke shopping list', e); }
    }
  };

  // Porsi yang tidak langsung dimakan masuk ke stok Meal Prep. Kalau resep yang sama
  // pernah dimasak dan stoknya belum habis, batch-nya ditambahkan, bukan bikin baris baru.
  // `domus` diisi kalau stoknya juga tercatat di inventaris Domus — dipakai buat badge.
  const addMealPrepStock = (recipe, portions, grams, domus = null) => {
    const idx = mealPreps.findIndex(b => b.recipeId === recipe.id);
    if (idx >= 0) {
      const existing = mealPreps[idx];
      const next = [...mealPreps];
      next[idx] = {
        ...existing,
        initialPortions: existing.initialPortions + portions,
        remainingPortions: existing.remainingPortions + portions,
        totalGrams: (existing.totalGrams || 0) + grams,
        perPortion: recipe.perPortion,
        ...(domus || {}),
      };
      saveMealPrepsFn(next);
    } else {
      saveMealPrepsFn([{
        id: `b_${Date.now()}`,
        recipeId: recipe.id,
        name: recipe.name,
        initialPortions: portions,
        remainingPortions: portions,
        perPortion: recipe.perPortion,
        totalGrams: grams,
        createdAt: new Date().toISOString(),
        ...(domus || {}),
      }, ...mealPreps]);
    }
  };

  // Dipanggil dari layar "Selesai Masak": mode 'eat' → 1 porsi langsung naik ke Meja Makan
  // hari ini, sisanya jadi stok. mode 'prep' → semuanya jadi stok + item di Domus.
  const finishCook = async ({ mode, sessionId, locationId, photoUrl, photoUrls = [], servings }) => {
    const r = cooking.recipe;
    const base = Math.max(1, Number(r.portions) || 1);
    const cooked = Math.max(1, Number(servings) || base);
    const gramsPerPortion = Math.round((r.totalGrams || 0) / base);

    await syncIngredientsToDomus(r, cooked / base);

    if (mode === 'eat') {
      const ymd = getLocalYMD();
      const day = daysMap[ymd] || { meals: {} };
      const meals = { ...(day.meals || {}) };
      meals[sessionId] = [
        ...(meals[sessionId] || []),
        makeEntry({
          name: `${r.name} (1 porsi)`,
          grams: gramsPerPortion, unit: 'g',
          nutrition: r.perPortion,
          recipeId: r.id, source: 'recipe',
          isEaten: true,
          ...(photoUrl ? { photoUrl } : {}),
          ...(photoUrls.length > 1 ? { photoUrls } : {}),
        }),
      ];
      await saveDay(ymd, { ...day, meals });
    }

    const stockPortions = cooked - (mode === 'eat' ? 1 : 0);
    if (stockPortions > 0) {
      // Domus duluan supaya id-nya bisa ikut disimpan di batch (badge "Domus · Kulkas").
      let domus = null;
      if (locationId) {
        try {
          // Resep yang sama pernah dimasak -> porsinya NUMPANG barang yang udah ada, bukan bikin
          // entitas baru tiap masak. Meal prep itu barang yang dirotasi, dan id-nya harus tetap:
          // riwayat masaknya numpuk di satu tempat, dan batch di sini gak pindah-pindah tuan.
          const existing = domusItems.find((i) => i.recipeId === r.id && !i.discardedAt);
          let domusItemId;
          if (existing) {
            await addPortionsToDomusItem(existing.id, stockPortions, { recipeId: r.id, locationId });
            domusItemId = existing.id;
          } else {
            domusItemId = await createDomusItem(user.uid, {
            name: `${r.name} (Meal Prep)`,
            locationId,
            qtyValue: stockPortions,
            qtyUnit: 'porsi',
            isFood: true,
            sourceApp: 'lomeal',
            // Masakan matang: kategorinya jelas, jangan biarkan Domus menerima barang tanpa
            // kategori. Kosakatanya milik Domus (domus-app/src/lib/items.js#CATEGORIES) — di sana
            // mentah & matang sudah disatukan jadi satu 'Makanan', 'Makanan Jadi' tidak ada lagi.
            category: 'Makanan',
            // `kind: 'mealprep'` DIHAPUS — Domus sekarang memakai `kind` untuk tipe barang
            // (stok/aset/dokumen/langganan), jadi nilai asing bikin kartunya tidak dikenali.
            // Penanda meal prep sudah cukup dari `recipeId` + `portions` + `sourceApp`.
            portions: stockPortions,
            kcalPerPortion: Math.round(r.perPortion?.kcal || 0),
            cookedAt: new Date().toISOString(),
            recipeId: r.id,
            // Riwayat masak dimulai dari masakan pertama ini (bentuknya niru `priceLog` Domus).
            cookLog: [cookEntry(stockPortions, r.id)],
            ...(photoUrl ? { photoUrl } : {}),
            });
          }
          domus = {
            domusItemId,
            domusLocationName: domusLocations?.find(l => l.id === locationId)?.name || '',
          };
        } catch (err) {
          console.error('Gagal tambah ke Domus', err);
          showToast('Gagal menyinkronkan dengan Domus.');
        }
      }
      addMealPrepStock(r, stockPortions, gramsPerPortion * stockPortions, domus);
    }

    // Foto hasil masakan pertama sekalian jadi foto hero resepnya.
    if (photoUrl && !r.photoUrl) {
      saveRecipesFn(recipes.map(x => (x.id === r.id ? { ...x, photoUrl } : x)));
    }

    showToast(mode === 'eat'
      ? `Selamat makan! ${stockPortions > 0 ? `${stockPortions} porsi masuk stok.` : ''} 🍽️`
      : `${stockPortions} porsi ${r.name} masuk stok Meal Prep! 👨‍🍳`);
  };

  const nowHHMM = () => new Date().toTimeString().slice(0, 5);

  // Sesi yang jamnya paling dekat dengan sekarang — jadi tebakan awal di modal konfirmasi.
  const nearestSessionId = () => {
    const times = { ...DEFAULT_SESSION_TIMES, ...(profile?.settings?.defaultSessionTimes || {}) };
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return MEAL_SESSIONS.filter(s => s.id !== 'drink')
      .map(s => {
        const [h, m] = (times[s.id] || '12:00').split(':').map(Number);
        return { id: s.id, diff: Math.abs(h * 60 + m - now) };
      })
      .sort((a, b) => a.diff - b.diff)[0]?.id || 'lunch';
  };

  // Konfirmasi "Makan": porsi dicatat ke hari ini pada sesi + jam pilihan user,
  // lalu langsung dilempar ke tab Catat dengan sesi itu kebuka.
  const confirmEat = async () => {
    const { batch: b, sessionId, time } = eating;
    const entry = makeEntry({
      name: `${b.name} (1 porsi)`, time,
      grams: Math.round((b.totalGrams || 0) / b.initialPortions), unit: 'g',
      nutrition: b.perPortion, recipeId: b.recipeId, batchId: b.id,
      source: 'recipe', isMealPrep: true, isEaten: true, planned: false,
    });
    const ymd = getLocalYMD(new Date());
    const day = daysMap[ymd] || { meals: {} };
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = [...(meals[sessionId] || []), entry];
    await saveDay(ymd, { ...day, meals });
    saveMealPrepsFn(mealPreps.map(x => (x.id === b.id ? { ...x, remainingPortions: x.remainingPortions - 1 } : x)));
    setEating(null);
    navigate('/log', { state: { openSession: sessionId } });
  };

  // Stok Lomeal dipindah ke inventaris Domus (buat user yang mulai pakai Domus). Batch-nya
  // tetap di Lomeal supaya jadwal yang sudah nempel ke batchId gak putus — cuma dapat lokasi.
  const moveBatchToDomus = async (b, locationId) => {
    setMovingBatch(null);
    try {
      const domusItemId = await createDomusItem(user.uid, {
        name: `${b.name} (Meal Prep)`,
        locationId,
        // ANGKA + SATUAN terpisah, bukan string "2 porsi": Domus menyimpan jumlah di `qtyValue`/
        // `qtyUnit` dan indikator sisanya dihitung dari situ. String-nya cuma turunan — dulu
        // dikirim string saja, hasilnya kartu menampilkan "2 porsi" tapi isian jumlahnya kosong
        // waktu dibuka, dan sisa stoknya tidak bisa dihitung siapa pun.
        qtyValue: b.remainingPortions,
        qtyUnit: 'porsi',
        isFood: true,
        sourceApp: 'lomeal',
        // Kosakata kategori milik Domus — mentah & matang sudah satu 'Makanan' di sana.
        category: 'Makanan',
        portions: b.remainingPortions,
      });
      saveMealPrepsFn(mealPreps.map(x => x.id === b.id ? {
        ...x, domusItemId, domusLocationName: domusLocations?.find(l => l.id === locationId)?.name || '',
      } : x));
      showToast('Stok dipindah ke Domus! 📦');
    } catch (err) {
      console.error('Gagal pindah ke Domus', err);
      showToast('Gagal memindahkan ke Domus.');
    }
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

  // ============ BUILDER VIEWS ============
  if (editing) return (
    <RecipeBuilder
      t={t} theme={theme} user={user} customFoods={customFoods} domusItems={domusItems} showToast={showToast}
      editing={editing} setEditing={setEditing}
      onCancel={() => setEditing(null)}
      onSave={saveRecipe}
    />
  );


  // ============ LIST VIEW ============
  // `freshProfile` datang dari DietQuestionnaireModal begitu kuesioner selesai. WAJIB dipakai
  // kalau ada: prop `profile` baru saja disimpan lewat saveProfilePatch dan belum tentu
  // sampai ke render ini, jadi memakainya = mengirim jawaban kuesioner yang lama ke Lomy.
  const generateTrueAIRecipes = async (freshProfile, customPrompt, customIngredients = null) => {
    const src = freshProfile || profile;
    const promptToUse = customPrompt !== undefined ? customPrompt : (src?.recipePrompt || '');
    const input = buildRecipeProfileInput(src, promptToUse, customIngredients);
    const dietName = input.dietName;

    try {
      const generated = await generateDietRecipe(aiKey, input);
      const aiRecipe = buildAiRecipe(generated, dietName);
      saveRecipesFn([aiRecipe, ...recipes]);
      showToast(`Resep "${aiRecipe.name}" berhasil dibuat! 🍲`);
      setViewingId(aiRecipe.id);
    } catch (err) {
      if (err.message === 'RATE_LIMIT_EXCEEDED') {
        showAlert('Limit harian habis! Masukkan API Key pribadimu di Pengaturan untuk lanjut buat resep.');
      } else {
        showAlert(`Gagal membuat resep: ${err.message}`);
      }
    }
  };

  const handleQuickGenerate = async () => {
    if (isQuickGenerating) return;
    setIsQuickGenerating(true);
    try {
      await generateTrueAIRecipes(profile, quickPrompt, selectedIngredients);
      setShowQuickAiModal(false);
      setQuickPrompt('');
    } finally {
      setIsQuickGenerating(false);
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
            backgroundSize: '165%',
            backgroundPosition: '20% 10%',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className={`absolute inset-0 z-0 bg-gradient-to-t ${isDark ? 'from-[#070a08]/90 via-[#070a08]/50 to-transparent' : 'from-black/80 via-black/40 to-transparent'} pointer-events-none`} />
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
                onClick={() => setShowQuickAiModal(true)}
                className={`w-full py-3.5 rounded-[14px] font-black text-black bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95 transition-all flex items-center justify-center text-sm`}
              >
                Buat Resep
              </button>
              <button 
                onClick={() => newRecipe()}
                className={`w-full py-3.5 rounded-[14px] font-bold text-white transition-all active:scale-95 flex items-center justify-center text-sm bg-white/10 hover:bg-white/20 border border-white/20 shadow-sm`}
              >
                Resep Manual
              </button>
            </div>
          </div>
        </div>
      </div>

      {showQuickAiModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={() => !isQuickGenerating && setShowQuickAiModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto hide-scrollbar rounded-[2rem] border ${theme === 'dark' ? 'border-white/10 bg-[#0a1510]' : 'border-black/10 bg-white'} backdrop-blur-2xl p-5 sm:p-6 flex flex-col shadow-2xl anim-rise`}
          >
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <ChefHat size={20} className="text-emerald-400" />
                <h3 className={`h2 ${t.textMain}`}>Buat Resep</h3>
              </div>
              <button onClick={() => !isQuickGenerating && setShowQuickAiModal(false)} className={`p-1.5 rounded-full ${t.btnBg} ${t.textMuted} hover:${t.textMain} transition-colors`} aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <div className="py-3.5 space-y-4">
              {/* TARGET NUTRISI - SLEEK COMPACT STRIP (NO HEAVY NESTED BOXES) */}
              <div className={`rounded-2xl ${theme === 'dark' ? 'bg-white/[0.04] border border-white/5' : 'bg-black/[0.03] border border-black/5'} transition-all overflow-hidden`}>
                <div 
                  onClick={() => setShowTargetDetails(!showTargetDetails)}
                  className="p-3 flex items-center justify-between cursor-pointer active:opacity-80 select-none"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="caption font-black uppercase tracking-wider text-emerald-400 shrink-0">Target</span>
                    <span className={`caption ${t.textMuted}`}>•</span>
                    <span className={`caption font-bold ${t.textMain} truncate`}>
                      {Math.round(profile?.targets?.kcal || 2000).toLocaleString('id-ID')} kkal · P {Math.round(profile?.targets?.protein || 0)}g K {Math.round(profile?.targets?.carbs || 0)}g L {Math.round(profile?.targets?.fat || 0)}g
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 shrink-0">
                    <span>{showTargetDetails ? 'Ringkas' : 'Detail'}</span>
                    {showTargetDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {showTargetDetails && (
                  <div className="px-3 pb-3 pt-1 border-t border-black/5 dark:border-white/5 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <span className={`text-[10px] ${t.textMuted} block`}>Fisik (BB / TB)</span>
                        <span className={`font-semibold ${t.textMain}`}>
                          {profile?.physical?.weight || profile?.weight || '—'} kg · {profile?.physical?.height || profile?.height || '—'} cm
                        </span>
                      </div>
                      <div>
                        <span className={`text-[10px] ${t.textMuted} block`}>Diet & Fase</span>
                        <span className={`font-semibold ${t.textMain} truncate block`}>
                          {dietLabel} {goalLabel ? `(${goalLabel})` : ''}
                        </span>
                      </div>
                      <div>
                        <span className={`text-[10px] ${t.textMuted} block`}>Aktivitas</span>
                        <span className={`font-semibold ${t.textMain} truncate block`}>
                          {activityLabel}
                        </span>
                      </div>
                    </div>

                    {(profile?.allergies?.trim() || (profile?.medicalHistory || []).length > 0) && (
                      <div className="pt-1.5 border-t border-black/5 dark:border-white/5 flex items-baseline gap-1.5 flex-wrap text-xs">
                        <span className={`text-[10px] ${t.textMuted}`}>Pantangan / Alergi:</span>
                        <span className="text-xs text-rose-400 font-bold">
                          {[profile?.allergies?.trim(), ...(profile?.medicalHistory || [])].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* BAHAN YANG TERSEDIA */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`caption font-bold ${t.textMain}`}>Bahan yang Dipilih</label>
                  <span className={`caption font-semibold ${t.textMuted}`}>{selectedIngredients.length} bahan</span>
                </div>

                {/* Selected Ingredients (Green Chips) */}
                {selectedIngredients.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto hide-scrollbar py-0.5">
                    {selectedIngredients.map((name, i) => (
                      <span
                        key={`${name}-${i}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-sm transition-all"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => setSelectedIngredients(prev => prev.filter((_, idx) => idx !== i))}
                          className="hover:opacity-80 p-0.5"
                          aria-label={`Hapus ${name}`}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs italic ${t.textMuted} py-1`}>Pilih bahan dari stok Domus atau cari di bawah ini.</p>
                )}

                {/* Search & Add Input */}
                <div className="flex items-center gap-2 pt-1">
                  <div className={`flex items-center gap-2 flex-1 px-3.5 py-2.5 rounded-xl border ${t.border} ${t.inputBg} transition-all focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30`}>
                    <Search size={15} className={`shrink-0 ${t.textMuted}`} />
                    <input
                      type="text"
                      placeholder="Cari / ketik bahan..."
                      value={ingredientSearch}
                      onChange={(e) => setIngredientSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && ingredientSearch.trim()) {
                          e.preventDefault();
                          handleAddIngredient(ingredientSearch);
                        }
                      }}
                      className={`w-full bg-transparent ${t.textMain} text-sm outline-none placeholder:opacity-40 placeholder:${t.textMuted}`}
                    />
                    {ingredientSearch && (
                      <button
                        type="button"
                        onClick={() => setIngredientSearch('')}
                        className={`p-0.5 ${t.textMuted} hover:${t.textMain} transition-colors`}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {ingredientSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => handleAddIngredient(ingredientSearch)}
                      className={`px-3 py-2.5 rounded-xl ${t.bgAccent} text-white text-xs font-bold shrink-0 active:scale-95 transition-transform shadow-sm`}
                    >
                      + Tambah
                    </button>
                  )}
                </div>

                {/* Quick Add Custom Query if not already in suggestions */}
                {ingredientSearch.trim() && !domusList.some(d => d.name.toLowerCase() === ingredientSearch.trim().toLowerCase()) && !dbList.some(d => d.name.toLowerCase() === ingredientSearch.trim().toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => handleAddIngredient(ingredientSearch)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-95 transition-all"
                  >
                    <Plus size={13} />
                    <span>Tambah &ldquo;{ingredientSearch.trim()}&rdquo;</span>
                  </button>
                )}

                {/* AVAILABLE INGREDIENTS AS CLEAN CHIPS (NO NESTED BOXES!) */}
                <div className="space-y-3 pt-1">
                  {/* Stok Dapur Domus Chips */}
                  {unselectedDomus.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Box size={13} className="text-sky-400 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                          Stok Dapur Domus ({unselectedDomus.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto hide-scrollbar">
                        {unselectedDomus.map((item) => (
                          <button
                            key={`domus-${item.name}`}
                            type="button"
                            onClick={() => handleAddIngredient(item.name)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                              theme === 'dark'
                                ? 'bg-sky-950/40 border border-sky-800/40 text-sky-300 hover:bg-sky-900/50'
                                : 'bg-sky-50 border border-sky-200 text-sky-800 hover:bg-sky-100'
                            }`}
                          >
                            <Plus size={12} className="text-sky-400 shrink-0" />
                            <span>{item.name}</span>
                            {item.stock && (
                              <span className="text-[10px] opacity-70 font-normal ml-0.5">({item.stock})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bahan Populer Chips */}
                  {unselectedDb.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Utensils size={13} className="text-neutral-400 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                          {ingredientSearch.trim() ? 'Hasil Lainnya' : 'Bahan Populer'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto hide-scrollbar">
                        {unselectedDb.map((item) => (
                          <button
                            key={`db-${item.name}`}
                            type="button"
                            onClick={() => handleAddIngredient(item.name)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                              theme === 'dark'
                                ? 'bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10'
                                : 'bg-black/5 border border-black/5 text-neutral-700 hover:bg-black/10'
                            }`}
                          >
                            <Plus size={12} className="opacity-50 shrink-0" />
                            <span>{item.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {unselectedDomus.length === 0 && unselectedDb.length === 0 && !ingredientSearch.trim() && (
                    <p className={`text-xs ${t.textMuted} text-center py-2 italic`}>Semua bahan yang tersedia sudah dipilih.</p>
                  )}
                </div>
              </div>

              {/* Konsep Masakan */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`caption font-bold ${t.textMain}`}>Konsep Masakan (Opsional)</label>
                  <span className={`caption ${quickPrompt.length >= 150 ? 'text-amber-500' : t.textMuted}`}>
                    {quickPrompt.length}/150
                  </span>
                </div>
                <textarea
                  maxLength={150}
                  rows={2}
                  placeholder="Misal: aglio e olio, ala Korea, tomyam segar, pasta rendah kalori..."
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value.slice(0, 150))}
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} text-sm outline-none resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder:opacity-35 placeholder:${t.textMuted}`}
                />
              </div>
            </div>

            <div className="pt-2 space-y-2 shrink-0">
              <button
                disabled={isQuickGenerating}
                onClick={handleQuickGenerate}
                className={`w-full py-3.5 rounded-2xl body-md ${t.bgAccent} font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${isQuickGenerating ? 'opacity-80 cursor-not-allowed' : ''}`}
              >
                {isQuickGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sedang Membuat Resep...</span>
                  </>
                ) : (
                  'Buat Resep'
                )}
              </button>

              <button
                type="button"
                disabled={isQuickGenerating}
                onClick={() => {
                  setShowQuickAiModal(false);
                  setShowQuestionnaire(true);
                }}
                className={`w-full py-2.5 rounded-xl caption ${t.btnBg} ${t.textMuted} text-center hover:opacity-80 transition-opacity`}
              >
                Ubah Profil / Program
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showQuestionnaire && (
        <DietQuestionnaireModal
          t={t} theme={theme} profile={profile} user={user} logymUser={logymUser} showAlert={showAlert}
          onClose={() => setShowQuestionnaire(false)}
          onSave={async (newProfileData, showAlertMsg = true) => {
              await saveProfilePatch(newProfileData);
              if (showAlertMsg) {
                  showToast('Profil Medis & Target Diet berhasil diperbarui! ✅');
              }
          }}
          generateTrueAIRecipes={generateTrueAIRecipes}
        />
      )}

      <div className={`relative flex items-center p-1 rounded-full ${t.btnBg} border ${t.border} mb-5`}>
        {[
          { id: 'resep', label: 'Buku Resep' },
          { id: 'meal_prep', label: 'Stok Matang' },
        ].map(tb => (
          <button key={tb.id} onClick={() => setActiveTab(tb.id)}
            className={`flex-1 py-2.5 rounded-full text-sm font-black transition-all relative z-10 ${activeTab === tb.id ? `${t.bgAccent} text-white shadow-sm` : t.textMuted}`}>
            {tb.label}
            {tb.id === 'meal_prep' && inboxItems?.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className={`relative inline-flex rounded-full h-4 w-4 ${activeTab === 'meal_prep' ? 'bg-white text-emerald-600' : 'bg-emerald-500 text-white'} text-[9px] font-black items-center justify-center`}>
                  {inboxItems.length}
                </span>
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'resep' && (
        <>
          {recipes.length === 0 && (
            <div className={`rounded-3xl border-2 border-dashed ${t.borderDashed} p-8 text-center`}>
              <ChefHat size={32} className={`mx-auto mb-2 ${t.textMuted}`} />
              <p className={`body-md ${t.textMuted}`}>Belum ada resep. Buat resep pertamamu — bahan, langkah memasak, dan estimasi nutrisinya dihitung otomatis.</p>
            </div>
          )}

          <div className="space-y-4">
            {recipes.map(r => (
              <button key={r.id} onClick={() => setViewingId(r.id)}
                className={`relative w-full text-left rounded-3xl overflow-hidden border ${t.border} ${t.bgCard} anim-rise active:scale-[0.99] transition-transform`}>
                
                <div className="absolute inset-y-0 left-0 w-[45%] bg-cover bg-center" 
                  style={{ backgroundImage: `url('${heroForRecipe(r)}')`, WebkitMaskImage: 'linear-gradient(to right, black 50%, transparent)', maskImage: 'linear-gradient(to right, black 50%, transparent)' }} />
                
                <div className="relative z-10 p-4 pl-[45%] flex flex-col justify-center min-h-[140px]">
                  <div className="pr-6">
                    <p className={`h2 line-clamp-3 leading-tight ${t.textMain}`}>{r.name}</p>
                    <p className={`caption font-medium mt-1 ${t.textMuted}`}>{r.authorName || 'Resep kamu'}</p>
                  </div>
                  
                  <div className={`flex items-center gap-2 caption font-medium ${t.textMuted} mt-2.5 flex-wrap`}>
                    <span><strong className={t.textAccent}>{Math.round(r.perPortion?.kcal || 0)} kkal</strong></span>
                    <span className="flex items-center gap-1">· <Clock size={11} /> {formatDuration(r.durationMin)}</span>
                    <span>· {r.portions} porsi</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    {[['P', r.perPortion?.protein], ['K', r.perPortion?.carbs], ['L', r.perPortion?.fat]].map(([lbl, val]) => (
                      <div key={lbl} className={`caption text-[10px] px-2 py-0.5 rounded-md border ${t.border} ${t.bgSunken} ${t.textMuted}`}>
                        <span className="font-bold mr-0.5">{lbl}</span>{Math.round(val || 0)}g
                      </div>
                    ))}
                  </div>
                </div>

                <span onClick={(e) => { e.stopPropagation(); deleteRecipe(r); }} 
                  className={`absolute top-3 right-3 p-2 text-red-400 opacity-60 z-20`}>
                  <X size={16} />
                </span>
              </button>
            ))}
          </div>

        </>
      )}

      {activeTab === 'meal_prep' && (
        <div className="space-y-4">
          
          {/* LOMEAL SECTION */}
          <div className={`rounded-3xl border ${t.border} ${t.bgCard} overflow-hidden`}>
            <button onClick={() => setOpenPrepSection(openPrepSection === 'lomeal' ? '' : 'lomeal')} className="w-full flex items-center justify-between p-4 bg-black/5 dark:bg-white/5">
              <div className="flex items-center gap-2 text-emerald-500 font-bold">
                <ChefHat size={18} /> Lomeal ({mealPreps.length})
              </div>
            </button>
            {openPrepSection === 'lomeal' && (
              <div className="px-4 border-t border-black/5 dark:border-white/5">
                {mealPreps.length === 0 ? (
                  <p className={`caption text-center ${t.textMuted} py-6`}>Saat ini tidak ada meal prep di Lomeal.</p>
                ) : (
                  mealPreps.map(b => (
                    <div key={b.id} className={`py-4 border-b last:border-b-0 border-black/5 dark:border-white/5 anim-rise`}>
                      <div className="flex items-start gap-3">
                        {b.recipeImage && (
                          <img src={b.recipeImage} alt="thumb" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black/5 dark:bg-white/5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold ${t.textMain} line-clamp-3`}>{b.name}</p>
                          <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>
                            Sisa <span className={b.remainingPortions > 0 ? 'text-emerald-500 font-bold' : 'text-red-400 font-bold'}>{b.remainingPortions}</span>/{b.initialPortions} porsi
                            {b.perPortion?.kcal ? ` · ${Math.round(b.perPortion.kcal)}Kcal · ${macroText(b.perPortion)}` : ''}
                          </p>
                          {b.domusItemId && (
                            <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full caption border ${STATUS.info.soft} ${STATUS.info.text} ${STATUS.info.border}`}>
                              <Warehouse size={12} /> Domus{b.domusLocationName ? ` · ${b.domusLocationName}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 overflow-x-auto hide-scrollbar">
                        {!b.recipeId && (
                          <button onClick={() => setProcessingInbox({ id: b.id, text: b.name, source: 'lomeal', nutrition: b.perPortion })} className={`px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 caption font-bold flex items-center gap-1 shrink-0`}>
                            <Calculator size={12} /> Hitung
                          </button>
                        )}
                        <button disabled={b.remainingPortions <= 0} onClick={() => setEating({ batch: b, sessionId: nearestSessionId(), time: nowHHMM() })}
                          className={`px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                          <Utensils size={12} /> Makan
                        </button>
                        <button onClick={() => setAssigning({ ...b, _source: 'lomeal' })} disabled={b.remainingPortions <= 0}
                          className={`px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                          <CalendarPlus size={12} /> Jadwal
                        </button>
                        {!b.domusItemId && domusLocations?.length > 0 && (
                          <button onClick={() => setMovingBatch(b)}
                            className={`px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 caption font-bold flex items-center gap-1 shrink-0`}>
                            <Warehouse size={12} /> Pindah
                          </button>
                        )}
                        <button onClick={() => deleteBatch(b)} title="Buang" className={`p-1.5 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 ml-auto hover:bg-red-500/20 active:scale-95 transition-all`}>
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* DOMUS SECTION */}
          <div className={`rounded-3xl border ${t.border} ${t.bgCard} overflow-hidden`}>
            <button onClick={() => setOpenPrepSection(openPrepSection === 'domus' ? '' : 'domus')} className="w-full flex items-center justify-between p-4 bg-black/5 dark:bg-white/5">
              <div className="flex items-center gap-2 text-amber-500 font-bold">
                <Warehouse size={18} /> Domus ({domusMatang.length})
              </div>
            </button>
            {openPrepSection === 'domus' && (
              <div className="px-4 border-t border-black/5 dark:border-white/5">
                {(() => {
                  if (domusMatang.length === 0) {
                    return <p className={`caption text-center ${t.textMuted} py-6`}>Saat ini tidak ada makanan matang di Domus.</p>;
                  }

                  // Group by location
                  const grouped = domusMatang.reduce((acc, item) => {
                    const locName = domusLocations?.find(l => l.id === item.locationId)?.name || 'Tanpa Lokasi';
                    if (!acc[locName]) acc[locName] = [];
                    acc[locName].push(item);
                    return acc;
                  }, {});

                  return Object.entries(grouped).map(([locName, items]) => (
                    <div key={locName} className="py-4 border-b last:border-b-0 border-black/5 dark:border-white/5">
                      <p className={`caption font-bold text-amber-500 mb-3`}>{locName.toUpperCase()}</p>
                      <div className="space-y-4">
                        {items.map(i => (
                          <div key={i.id} className="anim-rise py-3">
                            <div className="flex items-start gap-3">
                              {(i.imageUrl || i.image) && (
                                <img src={i.imageUrl || i.image} alt="thumb" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black/5 dark:bg-white/5" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`font-bold ${t.textMain} line-clamp-3`}>{i.name}</p>
                                <p className={`caption mt-0.5 ${t.textMuted}`}>
                                  Sisa: {formatStock(itemStock(i)) || '?'}
                                  {i.nutrition?.kcal ? ` · ${Math.round(i.nutrition.kcal)}Kcal · ${macroText(i.nutrition)}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-3 overflow-x-auto hide-scrollbar">
                              <button onClick={() => setProcessingInbox({ id: i.id, text: i.name, source: 'domus', originalData: i })} className={`px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 caption font-bold flex items-center gap-1 shrink-0`}>
                                <Calculator size={12} /> Hitung
                              </button>
                              <button disabled={!i.nutrition?.kcal} onClick={() => setProcessingInbox({ id: i.id, text: i.name, source: 'domus', originalData: i, skipToStep2: true })} className={`px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                                <Utensils size={12} /> Makan
                              </button>
                              <button disabled={!i.nutrition?.kcal} onClick={() => setAssigning({ id: i.id, name: i.name, nutrition: i.nutrition, remainingPortions: 1, initialPortions: 1, _source: 'domus' })} className={`px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                                <CalendarPlus size={12} /> Jadwal
                              </button>
                              <button onClick={() => {
                                const cur = itemStock(i);
                                const input = window.prompt(`Sisa stok tinggal berapa? (0 untuk buang semua)\nSaat ini: ${formatStock(cur) || '-'}`, cur ? String(cur.value) : '');
                                if (input === null) return;
                                const val = Number(input);
                                if (!Number.isFinite(val)) return showToast('Isi dengan angka ya.');
                                if (val <= 0) {
                                  discardDomusItem(i.id, 'dibuang').then(() => showToast('Masuk kotak sampah Domus.'));
                                } else {
                                  updateDomusItemQuantity(i.id, val, cur?.unit || i.qtyUnit || '').then(() => showToast('Sisa stok diupdate!'));
                                }
                              }} title="Buang" className={`p-1.5 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 ml-auto hover:bg-red-500/20 active:scale-95 transition-all`}>
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* DARKA SECTION */}
          <div className={`rounded-3xl border ${t.border} ${t.bgCard} overflow-hidden`}>
            <button onClick={() => setOpenPrepSection(openPrepSection === 'darka' ? '' : 'darka')} className="w-full flex items-center justify-between p-4 bg-black/5 dark:bg-white/5">
              <div className="flex items-center gap-2 text-lime-500 font-bold">
                <Coins size={18} /> Darka ({inboxItems?.length || 0})
              </div>
            </button>
            {openPrepSection === 'darka' && (
              <div className="px-4 border-t border-black/5 dark:border-white/5">
                {(!inboxItems || inboxItems.length === 0) ? (
                  <p className={`caption text-center ${t.textMuted} py-6`}>Saat ini tidak ada makanan masuk dari Darka.</p>
                ) : (
                  inboxItems.map(inb => (
                    <div key={inb.id} className={`py-4 border-b last:border-b-0 border-black/5 dark:border-white/5 anim-rise`}>
                      <div className="flex items-start gap-3">
                        {inb.imageUrl && (
                          <img src={inb.imageUrl} alt="thumb" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black/5 dark:bg-white/5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold ${t.textMain} line-clamp-3`}>{inb.text}</p>
                          <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>
                            Sisa <span className="text-emerald-500 font-bold">{inb.quantity || 1}</span> porsi
                            {inb.nutrition?.kcal ? ` · ${Math.round(inb.nutrition.kcal)}Kcal · ${macroText(inb.nutrition)}` : ''}
                          </p>
                          {/* Item ini sudah pernah diproses, lalu notanya dikoreksi di Darka.
                              Entri food log yang lama TIDAK ikut berubah — jadi user perlu tahu,
                              biar tidak mencatat kalorinya untuk kedua kali. */}
                          {inb.isRevision && (
                            <p className="caption mt-1 text-amber-500 font-bold">
                              Dikoreksi di Darka — mungkin sudah kamu catat sebelumnya. Cek log hari itu dulu.
                            </p>
                          )}
                          {!inb.nutrition?.kcal && inb.autoParseFailed ? (
                            <p className={`caption mt-1 text-amber-500 italic`}>Silakan hitung nutrisi ulang</p>
                          ) : !inb.nutrition?.kcal && autoParsingIds.has(inb.id) ? (
                            <p className={`caption mt-1 ${t.textMuted} italic`}>Menghitung nutrisi...</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 overflow-x-auto hide-scrollbar">
                        <button onClick={() => setProcessingInbox(inb)} className={`px-3 py-1.5 rounded-xl bg-lime-500/10 text-lime-500 caption font-bold flex items-center gap-1 shrink-0`}>
                          <Calculator size={12} /> Hitung
                        </button>
                        <button disabled={!inb.nutrition?.kcal} onClick={() => setProcessingInbox({ ...inb, skipToStep2: true })} className={`px-3 py-1.5 rounded-xl bg-lime-500/10 text-lime-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                          <Utensils size={12} /> Makan
                        </button>
                        <button disabled={!inb.nutrition?.kcal} onClick={() => setAssigning({ id: inb.id, name: inb.text, nutrition: inb.nutrition, remainingPortions: inb.quantity || 1, initialPortions: inb.quantity || 1, _source: 'darka' })} className={`px-3 py-1.5 rounded-xl bg-lime-500/10 text-lime-500 caption font-bold flex items-center gap-1 shrink-0 disabled:opacity-30`}>
                          <CalendarPlus size={12} /> Jadwal
                        </button>
                        <button onClick={() => {
                          showConfirm(`Hapus jajanan ini dari inbox?`).then(yes => {
                            if (yes) markInboxClaimed(inb.id).then(() => showToast('Dihapus dari inbox!'));
                          });
                        }} title="Buang" className={`p-1.5 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 ml-auto hover:bg-red-500/20 active:scale-95 transition-all`}>
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      )}


      {/* ===== JADWAL CALENDAR MODAL ===== */}
      {assigning && (() => {
        const maxStock = assigning._source === 'lomeal' ? getAvailableStock(assigning) : (assigning.remainingPortions || 1);
        const today = new Date();
        const calMonth = assignCalMonth || new Date(today.getFullYear(), today.getMonth(), 1);
        const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
        const firstDow = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
        const monthName = calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const selectedCount = assignSelectedDates.length;

        const toggleDate = (ymd) => {
          if (assignSelectedDates.includes(ymd)) {
            setAssignSelectedDates(prev => prev.filter(d => d !== ymd));
            return;
          }
          if (assignSelectedDates.length >= maxStock) {
            showToast(`Maksimal ${maxStock} tanggal (sisa stok)`);
            return;
          }
          setAssignSelectedDates(prev => [...prev, ymd].sort());
        };

        const handleApply = () => {
          if (selectedCount === 0 || !assignSession) return;
          const batch = assigning;
          for (const ymd of assignSelectedDates) {
            const day = daysMap[ymd] || { meals: {} };
            const meals = { ...(day.meals || {}) };
            const nutrition = batch._source === 'lomeal' ? batch.perPortion : batch.nutrition;
            meals[assignSession] = [
              ...(meals[assignSession] || []),
              makeEntry({
                name: `${batch.name} (1 porsi)`,
                grams: batch._source === 'lomeal' ? Math.round((batch.totalGrams || 0) / batch.initialPortions) : 1,
                unit: batch._source === 'lomeal' ? 'g' : 'porsi',
                nutrition: nutrition,
                recipeId: batch.recipeId || null,
                batchId: batch.id,
                source: batch._source || 'lomeal',
                planned: true,
                isMealPrep: batch._source === 'lomeal',
              }),
            ];
            saveDay(ymd, { ...day, meals });
          }
          setAssigning(null);
          setAssignSelectedDates([]);
          showAlert(`Dijadwalkan ke ${selectedCount} hari! 📅`);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={() => { setAssigning(null); setAssignSelectedDates([]); }}>
            <div onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]/95 backdrop-blur-xl' : 'bg-white/95 backdrop-blur-xl'} p-5 anim-rise`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`h2 ${t.textMain} line-clamp-1`}>Jadwalkan "{assigning.name}"</h2>
                <button onClick={() => { setAssigning(null); setAssignSelectedDates([]); }} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
              </div>

              <p className={`caption font-medium ${t.textMuted} mb-4`}>
                Pilih tanggal di kalender. Maks <strong className={t.textAccent}>{maxStock}</strong> tanggal (sisa stok). Terpilih: <strong className={t.textAccent}>{selectedCount}</strong>.
              </p>

              {/* Sesi Makan */}
              <p className={`caption font-bold mb-1.5 ${t.textMuted}`}>Sesi Makan:</p>
              <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-4">
                {MEAL_SESSIONS.map(s => (
                  <button key={s.id} onClick={() => setAssignSession(s.id)}
                    className={`shrink-0 px-3 py-2 rounded-xl border caption ${assignSession === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>

              {/* Mini Calendar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setAssignCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} className={`p-1.5 rounded-lg ${t.btnBg} ${t.textMuted}`}>‹</button>
                  <span className={`caption font-bold ${t.textMain}`}>{monthName}</span>
                  <button onClick={() => setAssignCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} className={`p-1.5 rounded-lg ${t.btnBg} ${t.textMuted}`}>›</button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['M','S','S','R','K','J','S'].map((d,i) => <div key={i} className={`caption font-bold ${t.textMuted} py-1`}>{d}</div>)}
                  {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const d = new Date(calMonth.getFullYear(), calMonth.getMonth(), day);
                    const ymd = getLocalYMD(d);
                    const isPast = ymd <= getLocalYMD(today);
                    const isSelected = assignSelectedDates.includes(ymd);
                    return (
                      <button key={day} disabled={isPast}
                        onClick={() => toggleDate(ymd)}
                        className={`py-1.5 rounded-lg caption font-bold transition-all
                          ${isPast ? `${t.textMuted} opacity-30` : isSelected ? `bg-emerald-500 text-white` : `${t.textMain} hover:bg-emerald-500/20`}`}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button disabled={selectedCount === 0} onClick={handleApply}
                className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>
                Terapkan ke {selectedCount} Hari
              </button>
            </div>
          </div>
        );
      })()}
      {/* MODALS */}
      {viewing && (
        <RecipeDetail
          t={t} theme={theme} user={user} recipe={viewing}
          domusItems={domusItems} showToast={showToast}
          shareBusy={shareBusy === viewing.id}
          onClose={() => setViewingId(null)}
          onEdit={() => { setViewingId(null); setEditing(viewing); }}
          onShare={() => doShare(viewing)}
          onCook={(servings) => { setViewingId(null); startCook(viewing, servings); }}
        />
      )}

      {eating && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setEating(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]/95' : 'bg-white/95'} backdrop-blur-xl p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className={`h2 ${t.textMain}`}>Makan sekarang</h2>
              <button onClick={() => setEating(null)} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
            </div>
            <p className={`caption font-medium ${t.textMuted}`}>{eating.batch.name}</p>
            <p className={`caption font-medium mb-4 ${t.textMuted}`}>
              1 porsi · {Math.round(eating.batch.perPortion?.kcal || 0)} kkal · {macroText(eating.batch.perPortion)}
            </p>

            <p className={`caption font-bold mb-2 ${t.textMuted}`}>Sesi</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {MEAL_SESSIONS.filter(s => s.id !== 'drink').map(s => (
                <button key={s.id} onClick={() => setEating({ ...eating, sessionId: s.id })}
                  className={`px-3 py-2 rounded-xl border caption font-bold ${eating.sessionId === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            <p className={`caption font-bold mb-2 ${t.textMuted}`}>Jam</p>
            <input type="time" value={eating.time} onChange={(e) => setEating({ ...eating, time: e.target.value })}
              className={`w-full px-4 py-3 rounded-2xl border ${t.border} ${t.bgSunken} ${t.textMain} body-md outline-none mb-4`} />

            <button onClick={confirmEat} className={`w-full py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow flex items-center justify-center gap-2`}>
              <Utensils size={16} /> Catat
            </button>
          </div>
        </div>
      )}

      {movingBatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setMovingBatch(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]/95' : 'bg-white/95'} backdrop-blur-xl p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className={`h2 ${t.textMain}`}>Pindahkan ke Domus</h2>
              <button onClick={() => setMovingBatch(null)} className={`p-1.5 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
            </div>
            <p className={`caption font-medium ${t.textMuted}`}>{movingBatch.name}</p>
            <p className={`caption font-medium mb-4 ${t.textMuted}`}>{movingBatch.remainingPortions} porsi</p>
            <div className="space-y-2">
              {domusLocations.map(loc => (
                <button key={loc.id} onClick={() => moveBatchToDomus(movingBatch, loc.id)}
                  className={`w-full px-4 py-3 rounded-2xl border ${t.border} ${t.bgSunken} ${t.textMain} body-md text-left`}>
                  {loc.emoji} {loc.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {cooking && (
        <CookingSession
          t={t} theme={theme} user={user}
          recipe={cooking.recipe} servings={cooking.servings}
          domusLocations={domusLocations}
          showToast={showToast}
          onClose={() => setCooking(null)}
          onFinish={finishCook}
          onShare={({ photoUrl, photoUrls }) => doShare({ ...cooking.recipe, photoUrl, photoUrls })}
        />
      )}

      {processingInbox && (
        <InboxProcessor
          t={t} theme={theme}
          item={processingInbox}
          user={user} aiKey={aiKey} customFoods={customFoods}
          todayYmd={getLocalYMD(new Date())} showAlert={showAlert}
          onClose={() => setProcessingInbox(null)}
          onParseFailed={async () => {
            if (processingInbox.source === 'darka') {
              await updateInboxNutrition(processingInbox.id, null, true).catch(() => {});
            }
          }}
          onNutritionSaved={async (nutrition) => {
            // Autosave nutrition back to Firestore / State immediately
            try {
              if (processingInbox.source === 'darka') {
                await updateInboxNutrition(processingInbox.id, nutrition);
              } else if (processingInbox.source === 'domus') {
                await updateDoc(doc(db, 'domus_items', processingInbox.id), { nutrition });
              } else if (processingInbox.source === 'lomeal') {
                saveMealPrepsFn(mealPreps.map(b => b.id === processingInbox.id ? { ...b, perPortion: nutrition } : b));
              }
              showToast('Nutrisi berhasil dihitung & disimpan! 📊');
            } catch (e) {
              console.error('Failed to save nutrition:', e);
            }
          }}
          onSaveToLog={async (session, entry) => {
            const ymd = getLocalYMD(new Date());
            const day = daysMap[ymd] || { meals: {} };
            const meals = { ...(day.meals || {}) };
            meals[session] = [...(meals[session] || []), entry];
            await saveDay(ymd, { ...day, meals });
            
            if (processingInbox.source === 'darka') {
              await markInboxClaimed(processingInbox.id);
            } else if (processingInbox.source === 'domus') {
              await zeroDomusItemStock(processingInbox.id);
            }
            
            setProcessingInbox(null);
            showToast(`Dimasukkan ke jadwal ${session} hari ini! ✅`);
          }}
          onSaveToDomus={async (parsedData) => {
            showToast(`'${parsedData.name}' disimpan ke kulkas Domus!`);
            await markInboxClaimed(processingInbox.id);
            setProcessingInbox(null);
          }}
        />
      )}
    </div>
  );
};

export default ProgramTab;
