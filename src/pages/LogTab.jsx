import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Camera, Image, Mic, Send, Plus, GlassWater, Pencil, Loader2, X, Trash2, Sparkles, ChevronRight, ChevronLeft, Check, Pill, Syringe, Tablets, Beaker, ShieldPlus, Coffee, CupSoda, Copy, Clock, Flame, Droplets, Target, Utensils, Search, Calendar, Edit2, Play, ChevronDown, Activity, AlignLeft, ChefHat } from 'lucide-react';
import RingChart from '../components/RingChart';
import NutritionChart from '../components/NutritionChart';
import FoodPickerModal from '../components/FoodPickerModal';
import ImageCropperModal from '../components/ImageCropperModal';
import { MEAL_SESSIONS, WATER_STEP_ML, getLocalYMD, DAY_NAMES_ID, AI_DAILY_LIMIT, DEFAULT_SESSION_TIMES, DEFAULT_ACTIVE_SESSIONS } from '../data/constants';
import { computeDayTotals, addNutrition, EMPTY_NUTRITION, NUTRIENTS, MINIMUM_TARGETS } from '../data/nutrition';
import { searchFoods, nutritionForAmount } from '../data/foodDatabase';
import { MACRO_COLORS, statusFor } from '../theme';
import { parseFoodText, analyzeSmartPhoto, compressImageTo100KB } from '../utils/aiFood';
import { makeEntry, checkAndCountAiUsage } from '../utils/foodLog';
import { getLocalPatternCache, saveLocalPatternCache, checkGlobalPatternCache, saveGlobalPatternCache, runLocalNlpParse } from '../utils/nlpParser';
import { uploadToCloudinary } from '../utils/cloudinary';
import SpeedDialScanner from '../components/SpeedDialScanner';
import WaterSlider from '../components/WaterSlider';

const ICONS = { Beaker, Coffee, CupSoda, GlassWater, Pill, Syringe, Tablets, ShieldPlus };
const COLORS = [
  { id: 'sky', bg: 'bg-sky-500' }, { id: 'blue', bg: 'bg-blue-500' }, { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'purple', bg: 'bg-purple-500' }, { id: 'pink', bg: 'bg-pink-500' }, { id: 'rose', bg: 'bg-rose-500' },
  { id: 'orange', bg: 'bg-orange-500' }, { id: 'amber', bg: 'bg-amber-600' }, { id: 'emerald', bg: 'bg-emerald-500' },
  { id: 'zinc', bg: 'bg-zinc-600' },
];

/**
 * TAB 2: CATAT — Ruang Kerja Utama (Fase 5 blueprint).
 * Date strip → quick stats + water tracker → Meal Grid 2 kolom (piring + ring
 * makro) → Smart Input Bar (chat NL / kamera / voice / manual presisi).
 */
const LogTab = ({ t, theme, user, profile, daysMap, saveDay, customFoods, saveCustomFoodsFn, recipes, mealPreps, saveMealPrepsFn, aiKey, showAlert, waterGoal }) => {

  const todayYmd = getLocalYMD();
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const [pickerSession, setPickerSession] = useState(null); // sessionId saat FoodPicker terbuka
  const [detailSession, setDetailSession] = useState(null); // sessionId sheet detail
  const [copySourceSession, setCopySourceSession] = useState(null);
  const [copyTargetSessions, setCopyTargetSessions] = useState([]);
  const [showDayStatsModal, setShowDayStatsModal] = useState(false);
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingPhotoObj, setEditingPhotoObj] = useState(null);
  const [chatText, setChatText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAbortController, setAiAbortController] = useState(null);
  const [aiResult, setAiResult] = useState(null); // { foods:[...], photoDataUrl? }
  const [aiTargetSession, setAiTargetSession] = useState('lunch');
  const [waterEdit, setWaterEdit] = useState(false);
  const [listening, setListening] = useState(false);
  const [rackExpanded, setRackExpanded] = useState(false);
  const [saveToDb, setSaveToDb] = useState(true); // Default simpan ke custom DB
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const detailPhotoRef = useRef(null);
  const recogRef = useRef(null);

  const drinkTemplates = profile?.drinkTemplates || [];
  const medicines = profile?.medicines || [];

  const day = daysMap[selectedYmd] || { meals: {}, water: 0 };
  const isFuture = selectedYmd > todayYmd;
  const totals = useMemo(() => computeDayTotals(day, !isFuture), [day, isFuture]);
  const targets = day.targetSnapshot || profile?.targets || {};
  const dietGoal = targets.dietGoal || '';
  const kcalDiff = (targets.kcal || 0) - (targets.tdee || targets.kcal || 0);

  // ---------- Date Strip horizontal (±30 hari) ----------
  const dates = useMemo(() => {
    const out = [];
    for (let i = -30; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ ymd: getLocalYMD(d), day: d.getDate(), dow: DAY_NAMES_ID[d.getDay()] });
    }
    return out;
  }, []);

  const stripRef = useRef(null);
  const mountRef = useRef(true);
  
  useEffect(() => {
    if (stripRef.current && mountRef.current) {
      const activeBtn = stripRef.current.querySelector(`button[data-ymd="${selectedYmd}"]`);
      if (activeBtn) {
        const container = stripRef.current;
        const scrollLeft = activeBtn.offsetLeft - container.offsetWidth / 2 + activeBtn.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'instant' });
      }
      mountRef.current = false;
    }
  }, [selectedYmd]);

  const persistDay = (newDay) => saveDay(selectedYmd, newDay);

  const addEntryToSession = (sessionId, entry) => {
    const meals = { ...(day.meals || {}) };
    const isFirstEntry = (meals[sessionId] || []).length === 0;
    meals[sessionId] = [...(meals[sessionId] || []), entry];
    
    const newDay = { ...day, meals };
    if (selectedYmd === todayYmd && isFirstEntry) {
      const sessionTimes = { ...(day.sessionTimes || {}) };
      sessionTimes[sessionId] = entry.time || new Date().toTimeString().slice(0, 5);
      newDay.sessionTimes = sessionTimes;
    }
    
    persistDay(newDay);
  };

  const removeEntry = (sessionId, entryId) => {
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = (meals[sessionId] || []).filter(e => e.id !== entryId);
    persistDay({ ...day, meals });
  };

  const toggleEatenStatus = (sessionId, e, checked) => {
    // 1. Update log entry
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = meals[sessionId].map(x => x.id === e.id ? { ...x, isEaten: checked } : x);
    persistDay({ ...day, meals });

    // 2. Manage batch stock
    if (e.batchId && mealPreps) {
      const batch = mealPreps.find(b => b.id === e.batchId);
      if (batch) {
        const diff = checked ? -1 : 1;
        const newRemaining = Math.max(0, batch.remainingPortions + diff);
        const updatedBatch = { ...batch, remainingPortions: newRemaining };
        const otherBatches = mealPreps.filter(b => b.id !== batch.id);
        
        saveMealPrepsFn([updatedBatch, ...otherBatches]);

        if (checked) {
          // If eaten, check for deficit in future planned meals
          let scheduledUneaten = [];
          Object.entries(daysMap).forEach(([ymd, d]) => {
            if (!d.meals) return;
            Object.entries(d.meals).forEach(([sess, items]) => {
              items.forEach(item => {
                // Must be same batch, NOT eaten, and NOT the current item we just updated
                if (item.batchId === batch.id && !item.isEaten && item.id !== e.id) {
                  scheduledUneaten.push({ ymd, session: sess, entryId: item.id });
                }
              });
            });
          });

          // Sort descending (furthest future first)
          scheduledUneaten.sort((a, b) => b.ymd.localeCompare(a.ymd));
          
          if (scheduledUneaten.length > newRemaining) {
            const toDelete = scheduledUneaten.length - newRemaining;
            const itemsToDelete = scheduledUneaten.slice(0, toDelete);
            
            // Note: we fetch the latest state of the day from daysMap, remove the item, and saveDay
            // To avoid race conditions if multiple items are deleted from the same day, we group them.
            const deletesByYmd = {};
            itemsToDelete.forEach(target => {
              if (!deletesByYmd[target.ymd]) deletesByYmd[target.ymd] = [];
              deletesByYmd[target.ymd].push(target);
            });
            
            Object.entries(deletesByYmd).forEach(([ymd, targets]) => {
              const targetDay = daysMap[ymd];
              const targetMeals = { ...targetDay.meals };
              targets.forEach(target => {
                targetMeals[target.session] = targetMeals[target.session].filter(x => x.id !== target.entryId);
              });
              saveDay(ymd, { ...targetDay, meals: targetMeals });
            });
            
            showAlert(`Auto-Koreksi: ${toDelete} jadwal masa depan dihapus otomatis karena stok habis.`);
          }
        }
      }
    }
  };

  const setSessionPhoto = (sessionId, photoUrl) => {
    const photos = { ...(day.photos || {}) };
    photos[sessionId] = photoUrl;
    persistDay({ ...day, photos });
  };

  const setSessionTime = (sessionId, timeStr) => {
    const sessionTimes = { ...(day.sessionTimes || {}) };
    sessionTimes[sessionId] = timeStr;
    persistDay({ ...day, sessionTimes });
  };

  const executeCopyOrMove = (isMove) => {
    if (!copySourceSession || copyTargetSessions.length === 0) return;
    const sourceMeals = day.meals?.[copySourceSession] || [];
    if (sourceMeals.length === 0) return;
    
    const meals = { ...(day.meals || {}) };
    const sessionTimes = day.sessionTimes || profile?.settings?.defaultSessionTimes || DEFAULT_SESSION_TIMES;
    
    copyTargetSessions.forEach(targetId => {
      const targetTime = sessionTimes[targetId] || '12:00';
      const cloned = sourceMeals.map(e => ({ 
        ...e, 
        id: Math.random().toString(36).substr(2, 9),
        time: targetTime
      }));
      meals[targetId] = [...(meals[targetId] || []), ...cloned];
    });
    
    if (isMove) {
      delete meals[copySourceSession];
    }
    
    persistDay({ ...day, meals });
    setCopySourceSession(null);
    setCopyTargetSessions([]);
    showAlert(isMove ? 'Berhasil memindah menu!' : 'Berhasil menyalin menu!');
  };

  // ---------- Water Tracker ----------
  const addWater = (ml) => {
    const meals = { ...(day.meals || {}) };
    meals['drink'] = [...(meals['drink'] || []), makeEntry({ name: 'Air Putih', grams: ml, unit: 'ml', nutrition: { ...EMPTY_NUTRITION }, source: 'manual' })];
    persistDay({ ...day, meals, water: Math.max(0, (day.water || 0) + ml) });
  };

  // ---------- AI: Satpam + Magic Prompt ----------
  const guardAi = async () => {
    const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
    if (!quota.allowed) {
      await showAlert(`Kuota AI harian habis (${AI_DAILY_LIMIT} request/hari). Gunakan input manual — besok kuota reset. 🙏`);
      return false;
    }
    return true;
  };

  const runMagicPrompt = async (forcedText = null) => {
    const text = typeof forcedText === 'string' ? forcedText.trim() : chatText.trim();
    if (!text || aiBusy) return;

    const controller = new AbortController();
    setAiAbortController(controller);

    // 1. CEK CACHE LOKAL (0 Detik)
    const normalizedText = text.toLowerCase();
    const localCache = getLocalPatternCache();
    if (localCache[normalizedText]) {
       setAiTargetSession(getNearestSessionId());
       setAiResult({ foods: localCache[normalizedText], isOffline: true });
       setChatText('');
       setAiAbortController(null);
       return;
    }

    // 2. CEK FIREBASE GLOBAL CACHE
    setAiBusy(true); // Tampilkan indikator proses untuk network request
    const globalFoods = await checkGlobalPatternCache(normalizedText);
    if (globalFoods && globalFoods.length > 0) {
       saveLocalPatternCache(text, globalFoods);
       setAiTargetSession(getNearestSessionId());
       setAiResult({ foods: globalFoods, isOffline: true, source: 'global_cache' });
       setChatText('');
       setAiAbortController(null);
       setAiBusy(false);
       return;
    }

    // 3. OFFLINE NLP SMART SEARCH LOKAL
    try {
      const customFoods = Object.values(profile?.customFoods || {});
      const localResult = runLocalNlpParse(text, customFoods);
      
      if (localResult && localResult.foods?.length > 0) {
          saveLocalPatternCache(text, localResult.foods);
          // Optional: bisa save ke global pattern juga, tapi lokal mungkin kurang standar
          setAiTargetSession(getNearestSessionId());
          setAiResult({ foods: localResult.foods, isOffline: true }); // Tanda diproses lokal
          setChatText('');
          setAiAbortController(null);
          setAiBusy(false);
          return;
      }
    } catch (e) {
      console.warn("Offline NLP parsing failed, fallback ke AI:", e);
    }

    // 2. FALLBACK KE AI (Jika teks kompleks/nama makanan aneh)
    if (!(await guardAi())) {
       setAiAbortController(null);
       return;
    }
    setAiBusy(true);
    try {
      const res = await parseFoodText(aiKey, text, controller.signal, customFoods);
      if (res.foods?.length) { 
         saveLocalPatternCache(text, res.foods);
         saveGlobalPatternCache(text, res.foods);
         setAiTargetSession(getNearestSessionId());
         setAiResult({ foods: res.foods, isOffline: false, originalInput: text }); 
         setChatText(''); 
      }
      else await showAlert('AI tidak menemukan makanan pada teks itu. Coba lebih spesifik, mis. "nasi 1 centong, ayam goreng 1 potong".');
    } catch (e) {
      if (e.name === 'AbortError') return; // ignored
      await showAlert(`Maaf, gagal memproses: ${e.message}`);
    } finally {
      setAiBusy(false);
      setAiAbortController(null);
    }
  };

  const cancelAiRequest = () => {
    if (aiAbortController) {
      aiAbortController.abort();
      setAiAbortController(null);
      setAiBusy(false);
    }
  };

  const handleDetailPhotoUpload = async (e, sessionId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImageTo100KB(file);
      const photos = { ...(day.photos || {}) };
      photos[sessionId] = dataUrl;
      persistDay({ ...day, photos });
    } catch(err) {
      showAlert(`Gagal memproses foto: ${err.message}`);
    }
    e.target.value = null;
  };

  const handleReanalyzeSessionPhoto = async (sessionId) => {
    const photoBase64 = day.photos?.[sessionId];
    if (!photoBase64) return;
    if (!(await guardAi())) return;
    
    const controller = new AbortController();
    setAiAbortController(controller);
    setAiBusy(true);
    
    try {
      const mimeType = photoBase64.substring(photoBase64.indexOf(":") + 1, photoBase64.indexOf(";"));
      const rawBase64 = photoBase64.split(",")[1];
      const res = await analyzeSmartPhoto(aiKey, rawBase64, mimeType, controller.signal);
      
      let items = [];
      if (res.type === 'label') {
         items = [{ name: res.name || 'Produk Kemasan', grams: res.servingGrams || 100, unit: 'g', nutrition: { ...EMPTY_NUTRITION, ...res.per100 } }];
      } else {
         items = res.foods || [];
      }
      if (!items.length) throw new Error('AI tidak menemukan makanan.');
      
      const newEntries = items.map(f => makeEntry({ name: f.name, grams: f.grams, unit: 'g', nutrition: { ...EMPTY_NUTRITION, ...f.nutrition }, source: 'ai' }));
      const existingItems = day.meals?.[sessionId] || [];
      
      const stringSimilarity = (a, b) => {
        const aa = (a||'').toLowerCase();
        const bb = (b||'').toLowerCase();
        if (aa === bb) return 1;
        if (aa.includes(bb) || bb.includes(aa)) return 0.8;
        const wordsA = aa.split(' ');
        const wordsB = bb.split(' ');
        const common = wordsA.filter(w => wordsB.includes(w)).length;
        return common / Math.max(wordsA.length, wordsB.length);
      };

      let combined = [...existingItems, ...newEntries];
      let sorted = [];
      let processed = new Set();
      
      for (let i = 0; i < combined.length; i++) {
        if (processed.has(combined[i].id)) continue;
        sorted.push(combined[i]);
        processed.add(combined[i].id);
        
        let matches = [];
        for (let j = i + 1; j < combined.length; j++) {
          if (processed.has(combined[j].id)) continue;
          if (stringSimilarity(combined[i].name, combined[j].name) > 0.4) {
            matches.push(combined[j]);
          }
        }
        for (const match of matches) {
          sorted.push(match);
          processed.add(match.id);
        }
      }
      
      persistDay({ ...day, meals: { ...(day.meals || {}), [sessionId]: sorted } });
      showAlert('Berhasil dianalisa! Silakan hapus item yang berlipat/salah.');
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      showAlert(err.message || 'Gagal menganalisa foto.');
    } finally {
      setAiBusy(false);
      setAiAbortController(null);
    }
  };

  const runPhotoScan = async (file) => {
    if (!file || aiBusy) return;
    if (!(await guardAi())) return;

    const controller = new AbortController();
    setAiAbortController(controller);
    setAiBusy(true);
    try {
      const { base64, dataUrl, mimeType } = await compressImageTo100KB(file);
      const res = await analyzeSmartPhoto(aiKey, base64, mimeType, controller.signal);
      
      let items = [];
      if (res.type === 'label') {
         items = [{
            name: res.name || 'Produk Kemasan',
            grams: res.servingGrams || 100,
            unit: 'g',
            nutrition: { ...EMPTY_NUTRITION, ...res.per100 },
         }];
      } else {
         items = res.foods || [];
      }
      
      if (items.length) {
         setAiTargetSession(getNearestSessionId());
         setAiResult({ foods: items, photoDataUrl: dataUrl, photoFile: file, isOcr: res.type === 'label' });
      }
      else await showAlert('AI tidak mengenali makanan di foto. Coba sudut/cahaya lain, atau input manual.');
    } catch (e) {
      if (e.name === 'AbortError') return;
      await showAlert(`Gagal memindai foto: ${e.message}`);
    } finally { 
      setAiBusy(false); 
      setAiAbortController(null);
    }
  };

  const confirmAiResult = async () => {
    const { foods, photoDataUrl } = aiResult;
    const meals = { ...(day.meals || {}) };
    const isFirstEntry = (meals[aiTargetSession] || []).length === 0;
    const newEntries = foods.map(f => makeEntry({ name: f.name, grams: f.grams, unit: 'g', nutrition: { ...EMPTY_NUTRITION, ...f.nutrition }, source: 'ai' }));
    
    meals[aiTargetSession] = [
      ...(meals[aiTargetSession] || []),
      ...newEntries,
    ];
    
    let newDay = { ...day, meals };
    
    if (selectedYmd === todayYmd && isFirstEntry && newEntries.length > 0) {
      const sessionTimes = { ...(day.sessionTimes || {}) };
      sessionTimes[aiTargetSession] = newEntries[0].time;
      newDay.sessionTimes = sessionTimes;
    }
    // Simpan foto lokal super cepat (tanpa Cloud Storage)
    if (photoDataUrl) {
      const photos = { ...(day.photos || {}) };
      photos[aiTargetSession] = photoDataUrl;
      newDay.photos = photos;
    }
    
    // Simpan ke DB Custom jika dicentang
    if (saveToDb && foods.length > 0) {
      const updatedCustomFoods = [...customFoods];
      foods.forEach(f => {
        const factor = f.grams > 0 ? (100 / f.grams) : 1;
        const per100 = {};
        Object.keys(f.nutrition || {}).forEach(k => { per100[k] = Math.round((f.nutrition[k] || 0) * factor * 10) / 10; });
        
        updatedCustomFoods.push({
          id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: f.name || 'Bahan Custom',
          category: 'packaged',
          unit: 'g',
          isDrink: false,
          portion: { label: '100g', grams: 100 },
          nutrition: per100,
          source: 'Custom',
          isCustom: true,
        });
      });
      saveCustomFoodsFn(updatedCustomFoods);
    }
    
    persistDay(newDay);
    setAiResult(null);
  };

  // ---------- Voice (Web Speech API bila tersedia) ----------
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showAlert('Input suara tidak didukung perangkat ini. Ketik saja ya 🙂'); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const r = new SR();
    r.lang = 'id-ID'; r.interimResults = false;
    r.onresult = (e) => setChatText(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    recogRef.current = r; setListening(true); r.start();
  };

  // ---------- Meal Grid: sesi aktif + dinamis ----------
  const activeSessions = useMemo(() => {
    const userDefaults = profile?.settings?.activeSessions || DEFAULT_ACTIVE_SESSIONS;
    const hidden = day.hiddenSessions || [];
    
    let activeIds = new Set();
    userDefaults.forEach(id => { if (!hidden.includes(id)) activeIds.add(id); });
    Object.keys(day.meals || {}).forEach(id => { if (!hidden.includes(id)) activeIds.add(id); });
    Object.keys(day.sessionLabels || {}).forEach(id => { if (!hidden.includes(id)) activeIds.add(id); });
    
    let allSessions = Array.from(activeIds).map(id => {
      const base = MEAL_SESSIONS.find(s => s.id === id);
      const customLabel = day.sessionLabels?.[id] || base?.label || `Camilan ${id.replace('snack', '')}`;
      return base ? { ...base, label: customLabel } : { id, label: customLabel, emoji: '🍽️' };
    });
    
    // Sort by time
    const userTimes = profile?.settings?.defaultSessionTimes || {};
    const times = day.sessionTimes || {};
    allSessions.forEach(s => {
      s.time = times[s.id] || userTimes[s.id] || DEFAULT_SESSION_TIMES[s.id] || '12:00';
    });
    
    allSessions.sort((a, b) => a.time.localeCompare(b.time));
    return allSessions;
  }, [day.meals, day.sessionTimes, day.hiddenSessions, day.sessionLabels, profile?.settings]);

  const getNearestSessionId = () => {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    let nearest = activeSessions.find(s => s.id !== 'drink') || activeSessions[0];
    let minDiff = Infinity;
    activeSessions.forEach(s => {
      if (s.id === 'drink') return;
      const [h, m] = s.time.split(':').map(Number);
      const diff = Math.abs((h * 60 + m) - nowMins);
      if (diff < minDiff) { minDiff = diff; nearest = s; }
    });
    return nearest?.id || 'lunch';
  };

  const MacroBar = ({ mkey }) => {
    const target = targets[mkey] || 1;
    const value = totals[mkey] || 0;
    const pct = Math.min(100, (value / target) * 100);
    const mc = mkey === 'kcal' ? { label: 'Kalori', hex: value > (target || Infinity) ? '#cd4a4a' : '#3daa5c' } : MACRO_COLORS[mkey];
    return (
        <div>
          <div className="flex justify-between items-baseline mb-1">
            {mkey === 'kcal' ? (
              <div className="flex items-center gap-2">
                <span className={`caption ${t.textMuted}`}>Kalori</span>
                {dietGoal && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dietGoal === 'cut' ? 'bg-amber-500/20 text-amber-500' : dietGoal === 'bulk' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    {dietGoal === 'cut' ? `Cut (${kcalDiff > 0 ? '+' : ''}${kcalDiff} kcal)` : dietGoal === 'bulk' ? `Bulk (+${kcalDiff} kcal)` : 'Maintenance'}
                  </span>
                )}
              </div>
            ) : (
              <span className={`caption ${t.textMuted}`}>{mc.label}</span>
            )}
            <div className="flex items-center gap-2">
              {mkey !== 'kcal' && <span className="caption font-black bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded" style={{ color: mc.hex }}>{Math.round(pct)}%</span>}
              <span className={`caption ${t.textMain}`}>{Math.round(value)}<span className={t.textMuted}>/{target}{mkey==='kcal'?'':'g'}</span></span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${t.bgSunken}`}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: mc.hex }} />
          </div>
        </div>
    );
  };

  const SessionCard = ({ session }) => {
    const entries = day.meals?.[session.id] || [];
    const eatenEntries = entries.filter(e => {
      const isMealPrep = e.isMealPrep || e.source === 'recipe';
      return e.isEaten !== undefined ? e.isEaten : (isMealPrep ? false : !isFuture);
    });
    const sTotals = eatenEntries.reduce((acc, e) => addNutrition(acc, e.nutrition), { ...EMPTY_NUTRITION });
    const photo = day.photos?.[session.id];
    const hasFood = entries.length > 0;
    const allPlanned = hasFood && eatenEntries.length === 0;
    const segments = eatenEntries.length > 0 ? [
      { value: sTotals.protein * 4, color: MACRO_COLORS.protein.hex },
      { value: sTotals.carbs * 4, color: MACRO_COLORS.carbs.hex },
      { value: sTotals.fat * 9, color: MACRO_COLORS.fat.hex },
    ] : null;

    return (
      <button onClick={() => setDetailSession(session.id)}
        className={`rounded-3xl border p-3.5 flex flex-col items-center ${t.border} ${t.bgCard} transition-transform active:scale-[0.98]`}>
        {/* Piring lingkaran dililit Ring Chart makro sesi */}
        <RingChart size={104} stroke={7} segments={segments} progress={hasFood && allPlanned ? 0 : (hasFood ? null : 0)}>
          <div className={`w-[78px] h-[78px] rounded-full overflow-hidden flex items-center justify-center transition-opacity duration-300 ${allPlanned ? 'opacity-30' : ''}`}>
            {photo
              ? <img src={photo} alt={session.label} className="w-full h-full object-cover" />
              : <span className="text-3xl">{session.emoji}</span>}
          </div>
        </RingChart>
        <p className={`body-md mt-2 ${t.textMain}`}>{session.label}</p>
        <p className={`caption font-medium ${t.textMuted} flex items-center justify-center gap-1`}>
          {session.id === 'drink' ? (
            <>{Math.round(day.water || 0)} mL {sTotals.kcal > 0 ? `· ${Math.round(sTotals.kcal)} kkal` : ''}</>
          ) : (
            <>{session.time} {eatenEntries.length > 0 ? `· ${Math.round(sTotals.kcal)} kkal` : (allPlanned ? '· Direncanakan' : '')}</>
          )}
        </p>
      </button>
    );
  };

  const isToday = selectedYmd === todayYmd;
  const water = day.water || 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-3 pb-52">
      {/* ===== HORIZONTAL DATE STRIP ===== */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-1 no-swipe"
        ref={stripRef}>
        {dates.map(d => {
          const active = d.ymd === selectedYmd;
          const future = d.ymd > todayYmd;
          const isTodayBtn = d.ymd === todayYmd;
          return (
            <button key={d.ymd} data-ymd={d.ymd} onClick={() => setSelectedYmd(d.ymd)}
              className={`shrink-0 w-11 flex flex-col items-center justify-center rounded-2xl transition-all py-2 border-2 ${active ? `border-transparent ${t.bgAccent} shadow-glow` : isTodayBtn ? `border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] ${t.bgCardSoft}` : `border-transparent ${t.bgCardSoft}`} ${future ? 'opacity-50' : ''}`}>
              <span className={`caption ${active ? 'text-white/80' : isTodayBtn ? 'text-emerald-500' : t.textMuted}`}>{d.dow}</span>
              <span className={`text-sm font-black ${active ? 'text-white' : isTodayBtn ? 'text-emerald-500' : t.textMain}`}>{d.day}</span>
            </button>
          );
        })}
      </div>

      {/* ===== QUICK STATS ===== */}
      <button onClick={() => setShowDayStatsModal(true)} className={`mt-3 w-full rounded-3xl border ${t.border} ${t.bgCard} p-4 flex flex-col gap-3 text-left transition-transform active:scale-[0.98]`}>
        <div className="w-full">
           <MacroBar mkey="kcal" />
        </div>
        <div className="w-full">
           <MacroBar mkey="protein" />
        </div>
        <div className="w-full">
           <MacroBar mkey="carbs" />
        </div>
        <div className="w-full">
           <MacroBar mkey="fat" />
        </div>
      </button>

      {/* ===== WATER TRACKER DIPINDAH KE BAWAH ===== */}

      {/* ===== THE MEAL GRID (2 kolom dinamis) ===== */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {activeSessions.map(s => <SessionCard key={s.id} session={s} />)}
        <button onClick={() => setShowAddSessionModal(true)}
          className={`rounded-3xl border-2 border-dashed ${t.borderDashed} min-h-[120px] flex flex-col items-center justify-center gap-1 ${t.textMuted}`}>
          <Plus size={20} /> <span className="caption">Tambah Sesi</span>
        </button>
      </div>

      {!isToday && selectedYmd > todayYmd && (
        <p className={`caption font-medium text-center mt-3 ${t.textMuted}`}>📅 Mode Meal Prep — kamu sedang merencanakan makanan untuk tanggal ini.</p>
      )}

      {/* ===== WATER TRACKER (Mengambang di atas input bar) ===== */}
      <div className="fixed left-0 right-0 z-30 pointer-events-none px-3" style={{ bottom: 'calc(180px + env(safe-area-inset-bottom, 20px))' }}>
         <div className="max-w-2xl mx-auto flex justify-end pointer-events-none">
             <div 
                 className={`pointer-events-auto flex items-end justify-end gap-2 rounded-[32px] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${rackExpanded ? `backdrop-blur-xl border ${theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white/40 border-black/5'} shadow-2xl pl-2 pr-2 py-2` : ''}`}
                 style={{ width: rackExpanded ? '100%' : '90px' }}
             >
                 
                 {(medicines.length > 0 || drinkTemplates.length > 0) && (
                     <div 
                         className="flex items-center gap-2 overflow-x-auto hide-scrollbar pl-2 no-swipe flex-1 transition-all duration-500"
                         style={{ 
                             opacity: rackExpanded ? 1 : 0, 
                             pointerEvents: rackExpanded ? 'auto' : 'none',
                             transform: rackExpanded ? 'translateX(0)' : 'translateX(20px)'
                         }}
                     >
                         {medicines.map(med => {
                           const IconComp = ICONS[med.icon] || Pill;
                           const textClass = COLORS.find(c => c.id === med.color)?.bg.replace('bg-', 'text-') || 'text-zinc-500';
                           const isChecked = (day.medChecks || {})[med.id];
                           return (
                             <button key={med.id} onClick={() => {
                               const medChecks = { ...(day.medChecks || {}), [med.id]: !isChecked };
                               persistDay({ ...day, medChecks });
                             }} className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border shadow-md transition-all ${isChecked ? `${t.bgAccent} border-transparent text-white` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
                               {isChecked ? <Check size={18} className="mb-0.5" /> : <IconComp size={18} className={`mb-0.5 ${textClass}`} />}
                               <span className="text-[8px] font-bold px-1 text-center truncate w-full">{med.name}</span>
                             </button>
                           )
                         })}
                         
                         {drinkTemplates.map(drink => {
                           const IconComp = ICONS[drink.icon] || CupSoda;
                           const bgClass = COLORS.find(c => c.id === drink.color)?.bg || 'bg-zinc-500';
                           return (
                             <button key={drink.id} onClick={() => {
                               const meals = { ...(day.meals || {}) };
                               meals['drink'] = [...(meals['drink'] || []), makeEntry({ name: drink.name, grams: 1, unit: 'porsi', nutrition: drink.nutrition, source: 'manual' })];
                               persistDay({ ...day, meals });
                               showAlert(`${drink.name} ditambahkan ke sesi Minuman!`);
                             }} className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border border-transparent shadow-md text-white active:scale-95 transition-all ${bgClass}`}>
                               <IconComp size={18} className="mb-0.5" />
                               <span className="text-[8px] font-bold px-1 text-center truncate w-full">{drink.name}</span>
                             </button>
                           )
                         })}
                     </div>
                 )}
                 
                 {(drinkTemplates.length > 0 || medicines.length > 0) && (
                   <button onClick={() => setRackExpanded(!rackExpanded)} className={`shrink-0 flex items-center justify-center w-6 h-12 rounded-xl bg-black/10 dark:bg-white/10 active:scale-95 transition-all backdrop-blur-md mb-1`}>
                      {rackExpanded ? <ChevronRight size={14} className={t.textMuted}/> : <ChevronLeft size={14} className={t.textMuted}/>}
                   </button>
                 )}
                 
                 <WaterSlider 
                    currentWater={water} 
                    maxWater={waterGoal || 4000}
                    onAdd={addWater} 
                    onSet={(val) => persistDay({ ...day, water: val })} 
                    theme={theme} 
                 />
             </div>
         </div>
      </div>

      {/* ===== SMART INPUT BAR (menempel di atas BottomNav, besar ala Logym) ===== */}
      <div className="fixed left-0 right-0 z-30 px-3 pb-2 pointer-events-none" style={{ bottom: 'calc(82px + env(safe-area-inset-bottom, 20px))' }}>
        <div className={`pointer-events-auto relative max-w-2xl mx-auto flex items-center gap-1.5 px-3 py-2.5 rounded-[32px] border ${t.border} ${t.navBg} shadow-2xl`}>
          {aiBusy ? (
            <div className="absolute inset-0 rounded-[32px] overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-green-500/20 dark:bg-green-400/20 w-full origin-left" style={{ animation: 'progressFill 10s cubic-bezier(0.1, 0.8, 0.2, 1) forwards' }} />
            </div>
          ) : null}
          <div className="shrink-0 relative z-10">
             <SpeedDialScanner 
               mainIcon={Camera} 
               mainColorClass={`p-3.5 rounded-full ${t.btnBg} ${t.textAccent}`}
               disabled={aiBusy}
               onSelectCamera={() => cameraRef.current?.click()}
               onSelectGallery={() => galleryRef.current?.click()}
             />
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { 
              runPhotoScan(e.target.files?.[0]);
              e.target.value = ''; 
            }} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { 
              runPhotoScan(e.target.files?.[0]);
              e.target.value = ''; 
            }} />
          
          {aiBusy ? (
            <div className="relative z-10 flex-1 px-2 body-lg font-bold text-green-600 dark:text-green-400 animate-pulse flex items-center gap-2 min-w-0">
              <Sparkles size={18} className="shrink-0" /> <span className="truncate">Memproses...</span>
            </div>
          ) : (
            <textarea
              value={chatText} 
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Ketik makananmu..."
              rows={Math.min(3, (chatText.match(/\n/g) || []).length + 1)}
              style={{ resize: 'none' }}
              className={`relative z-10 flex-1 min-w-0 bg-transparent outline-none body-lg px-2 py-3.5 font-medium ${t.textMain} placeholder:${t.textMuted} placeholder:opacity-50 hide-scrollbar`} />
          )}
          
          <button onClick={toggleVoice} className={`relative z-10 shrink-0 p-3.5 rounded-full ${t.btnBg} ${listening ? 'text-red-400 animate-pulse' : t.textMuted} transition-transform active:scale-95`} aria-label="Input suara">
            <Mic size={22} />
          </button>
          
          {aiBusy ? (
            <button onClick={cancelAiRequest} className={`relative z-10 shrink-0 p-3.5 rounded-full bg-red-500 text-white shadow-lg transition-transform active:scale-95`} aria-label="Batal">
              <X size={22} />
            </button>
          ) : chatText.trim() ? (
            <button onClick={() => runMagicPrompt()} className={`relative z-10 shrink-0 p-3.5 rounded-full bg-green-500 text-white shadow-lg transition-transform active:scale-95`} aria-label="Kirim">
              <Send size={22} />
            </button>
          ) : (
            <button onClick={() => setPickerSession(detailSession || getNearestSessionId())} className={`relative z-10 shrink-0 p-3.5 rounded-full ${t.bgAccent} shadow-lg transition-transform active:scale-95`} aria-label="Input manual presisi">
              <Plus size={22} />
            </button>
          )}
        </div>
      </div>

      {/* ===== SHEET KONFIRMASI HASIL AI ===== */}
      {aiResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setAiResult(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className={t.textAccent} />
              <h2 className={`h2 ${t.textMain}`}>Hasil Pemindaian AI</h2>
              <button onClick={() => setAiResult(null)} className={`ml-auto p-2 rounded-xl ${t.btnBg}`}><X size={15} className={t.textMuted} /></button>
            </div>
            {aiResult.photoDataUrl && (
              <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-3 border-2 border-green-500/40">
                <img src={aiResult.photoDataUrl} alt="foto" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-1.5 mb-3">
              {aiResult.foods.map((f, i) => (
                <div key={i} className={`relative flex flex-col p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                  <button onClick={() => setAiResult(r => ({ ...r, foods: r.foods.filter((_, j) => j !== i) }))}
                    className="absolute top-3 right-3 p-1.5 rounded-xl text-red-400 z-10"><Trash2 size={14} /></button>
                  
                  {aiResult.isOcr ? (
                    <div className="space-y-3 pt-1">
                       <input type="text" className={`w-11/12 bg-transparent border-b border-dashed ${t.border} outline-none body-md font-bold ${t.textMain}`} value={f.name} onChange={e => {
                          setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }));
                       }} placeholder="Nama Produk" />
                       
                       <div className="grid grid-cols-2 gap-3 mt-2">
                         <div className={`p-2 rounded-xl border ${t.border} ${t.bgSunken}`}>
                           <label className={`caption ${t.textMuted} flex items-center gap-1`}><Utensils size={12}/> Takaran (g/ml)</label>
                           <input type="number" className={`w-full bg-transparent font-bold outline-none body-md mt-1 ${t.textMain}`} value={f.grams || ''} onChange={e => {
                             setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, grams: Number(e.target.value) || 0 } : x) }));
                           }} />
                         </div>
                         <div className={`p-2 rounded-xl border ${t.border} ${t.bgSunken}`}>
                           <label className={`caption ${t.textMuted} flex items-center gap-1`}><Flame size={12}/> Kalori (kkal)</label>
                           <input type="number" className={`w-full bg-transparent font-bold outline-none body-md mt-1 ${t.textMain}`} value={f.nutrition.kcal || ''} onChange={e => {
                             setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, nutrition: { ...x.nutrition, kcal: Number(e.target.value) || 0 } } : x) }));
                           }} />
                         </div>
                         <div className={`p-2 rounded-xl border ${t.border} ${t.bgSunken}`}>
                           <label className={`caption ${t.textMuted} flex items-center gap-1`}><Activity size={12}/> Protein (g)</label>
                           <input type="number" className={`w-full bg-transparent font-bold outline-none body-md mt-1 ${t.textMain}`} value={f.nutrition.protein || ''} onChange={e => {
                             setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, nutrition: { ...x.nutrition, protein: Number(e.target.value) || 0 } } : x) }));
                           }} />
                         </div>
                         <div className={`p-2 rounded-xl border ${t.border} ${t.bgSunken}`}>
                           <label className={`caption ${t.textMuted} flex items-center gap-1`}><Activity size={12}/> Karbo (g)</label>
                           <input type="number" className={`w-full bg-transparent font-bold outline-none body-md mt-1 ${t.textMain}`} value={f.nutrition.carbs || ''} onChange={e => {
                             setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, nutrition: { ...x.nutrition, carbs: Number(e.target.value) || 0 } } : x) }));
                           }} />
                         </div>
                         <div className={`p-2 rounded-xl border ${t.border} ${t.bgSunken}`}>
                           <label className={`caption ${t.textMuted} flex items-center gap-1`}><Activity size={12}/> Lemak (g)</label>
                           <input type="number" className={`w-full bg-transparent font-bold outline-none body-md mt-1 ${t.textMain}`} value={f.nutrition.fat || ''} onChange={e => {
                             setAiResult(r => ({ ...r, foods: r.foods.map((x, j) => j === i ? { ...x, nutrition: { ...x.nutrition, fat: Number(e.target.value) || 0 } } : x) }));
                           }} />
                         </div>
                       </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 mr-2">
                        <p className={`body-md ${t.textMain} flex items-center gap-1.5`}>
                          {f.name}
                          {f.lowConfidence && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500" title="AI kurang yakin dengan estimasi ini — cek manual">⚠️ Perkiraan</span>
                          )}
                        </p>
                        <p className={`caption font-medium ${t.textMuted}`}>
                          <input type="number" inputMode="numeric" value={Math.round(f.grams)} onChange={(e) => {
                            const grams = Number(e.target.value) || 0;
                            const factor = f.grams > 0 ? grams / f.grams : 0;
                            setAiResult(r => ({
                              ...r,
                              foods: r.foods.map((x, j) => j === i ? {
                                ...x, grams,
                                nutrition: Object.fromEntries(Object.entries(x.nutrition).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])),
                              } : x),
                            }));
                          }} className={`w-14 bg-transparent border-b ${t.border} outline-none no-spinners text-center ${t.textMain}`} />g
                          &nbsp;· {Math.round(f.nutrition?.kcal || 0)} kkal · P{Math.round(f.nutrition?.protein || 0)} K{Math.round(f.nutrition?.carbs || 0)} L{Math.round(f.nutrition?.fat || 0)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chat Revisi AI */}
            {!aiResult.isOffline && (
              <div className={`mb-4 flex items-center gap-2 p-2 rounded-2xl border ${t.border} ${t.bgSunken}`}>
                <input
                  type="text"
                  placeholder="Koreksi (mis: nasi setengah aja)"
                  className={`flex-1 bg-transparent outline-none body-md px-2 ${t.textMain} placeholder:${t.textMuted}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const correction = e.target.value.trim();
                      e.target.value = '';
                      runMagicPrompt(`Koreksi input sebelumnya ("${aiResult.originalInput || 'foto'}") dengan instruksi ini: ${correction}`);
                      setAiResult(null); // Tutup sementara biar muncul loading di smart bar
                    }
                  }}
                />
                <div className={`p-2 rounded-xl ${t.bgAccent} pointer-events-none`}><Send size={16} /></div>
              </div>
            )}
            <p className={`caption font-medium mb-1.5 ${t.textMuted}`}>Masukkan ke sesi:</p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3">
              {MEAL_SESSIONS.map(s => (
                <button key={s.id} onClick={() => setAiTargetSession(s.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border caption ${aiTargetSession === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            <label className={`flex items-center gap-2 mb-4 p-3 rounded-xl border ${t.border} ${t.bgSunken} cursor-pointer`}>
               <input type="checkbox" checked={saveToDb} onChange={(e) => setSaveToDb(e.target.checked)} className="w-5 h-5 rounded accent-emerald-500" />
               <span className={`caption font-medium ${t.textMain}`}>Simpan ke Database Custom</span>
            </label>
            <button disabled={!aiResult.foods.length} onClick={confirmAiResult}
              className={`w-full py-3 rounded-2xl ${t.bgAccent} body-lg shadow-glow disabled:opacity-40`}>
              Catat {aiResult.foods.length} item
            </button>
          </div>
        </div>
      )}

      {/* ===== SHEET DETAIL SESI (edit/hapus entri) ===== */}
      {detailSession && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setDetailSession(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl anim-rise`}>
            
            {/* Header / Foto Section */}
            <div className={`relative h-48 w-full shrink-0 ${theme === 'dark' ? 'bg-black/40' : 'bg-black/5'} flex flex-col items-center justify-center overflow-hidden`}>
               {day.photos?.[detailSession] ? (
                 <>
                   <img src={day.photos[detailSession]} alt="Session" className="absolute inset-0 w-full h-full object-cover" />
                   <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
                   <div className="absolute top-3 right-3 flex gap-2">
                     <button onClick={() => setEditingPhotoObj({ sessionId: detailSession, url: day.photos[detailSession] })} className="p-2 rounded-full bg-black/40 text-white backdrop-blur-md active:scale-95"><Edit2 size={16} /></button>
                     <button onClick={() => {
                        const photos = { ...(day.photos || {}) };
                        delete photos[detailSession];
                        persistDay({ ...day, photos });
                     }} className="p-2 rounded-full bg-red-500/40 text-white backdrop-blur-md active:scale-95"><Trash2 size={16} /></button>
                   </div>
                   <div className="absolute bottom-4 inset-x-4 flex items-center gap-2">
                     <button onClick={() => handleReanalyzeSessionPhoto(detailSession)} disabled={aiBusy} className={`flex-1 py-2 rounded-xl bg-emerald-500/90 text-white caption font-bold shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 backdrop-blur-md ${aiBusy ? 'opacity-50' : ''}`}>
                       {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analisa Ulang
                     </button>
                   </div>
                 </>
               ) : (
                 <div className="flex flex-col items-center gap-2">
                   <button onClick={() => detailPhotoRef.current?.click()} className={`p-4 rounded-full ${t.btnBg} ${t.textAccent} active:scale-95 transition-transform`}>
                     <Camera size={24} />
                   </button>
                   <span className={`caption font-medium ${t.textMuted}`}>Tambah Foto</span>
                 </div>
               )}
               <input ref={detailPhotoRef} type="file" accept="image/*" onChange={(e) => handleDetailPhotoUpload(e, detailSession)} className="hidden" />
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col flex-1 mr-4">
                  <input key={detailSession} type="text" className={`bg-transparent outline-none h2 ${t.textMain} w-full`} 
                    placeholder="Sesi Baru"
                    defaultValue={activeSessions.find(s => s.id === detailSession)?.label || ''}
                    onBlur={(e) => {
                      const newVal = e.target.value.trim();
                      if (newVal && newVal !== activeSessions.find(s => s.id === detailSession)?.label) {
                        persistDay({ ...day, sessionLabels: { ...(day.sessionLabels || {}), [detailSession]: newVal } });
                      }
                    }} />
                </div>
                <div className="flex items-center gap-2">
                  {detailSession !== 'drink' && (
                    <input type="time" 
                      value={activeSessions.find(s => s.id === detailSession)?.time || '12:00'}
                      onChange={(e) => setSessionTime(detailSession, e.target.value)}
                      className={`bg-transparent outline-none ${t.textMain} caption font-bold border ${t.border} rounded-lg px-2 py-1`} />
                  )}
                  <button onClick={() => { setCopySourceSession(detailSession); setDetailSession(null); }} className={`p-2 rounded-xl ${t.btnBg} text-emerald-500`}><Copy size={15} /></button>
                  <button onClick={() => setDeleteConfirm(detailSession)} className={`p-2 rounded-xl bg-red-400/10 text-red-400`}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="space-y-1.5 mb-3">
                {(day.meals?.[detailSession] || []).map(e => {
                  const isMealPrep = e.isMealPrep || e.source === 'recipe';
                  const isEaten = e.isEaten !== undefined ? e.isEaten : !isMealPrep;
                  return (
                  <div key={e.id} className={`flex items-center justify-between p-3 rounded-2xl border ${theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-white/50 border-black/5'} transition-all ${isEaten === false ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      { isMealPrep && (
                        <input type="checkbox" checked={isEaten} onChange={(ev) => toggleEatenStatus(detailSession, e, ev.target.checked)} className="w-5 h-5 rounded accent-emerald-500 shrink-0" />
                      )}
                      <div className="truncate flex-1">
                        <p className={`body-md ${t.textMain} truncate`}>
                          {e.name}
                        </p>
                        <div className={`caption font-medium ${t.textMuted} flex flex-wrap items-center gap-1.5`}>
                          {detailSession === 'drink' && (
                            <input type="time" value={e.time || '12:00'} onChange={(ev) => {
                               const meals = { ...(day.meals || {}) };
                               meals[detailSession] = meals[detailSession].map(x => x.id === e.id ? { ...x, time: ev.target.value } : x);
                               persistDay({ ...day, meals });
                            }} className={`bg-transparent outline-none border-b border-dashed ${t.border} text-center`} style={{ width: '40px' }} />
                          )}
                          <span className="truncate flex items-center gap-1">
                            <input type="number" inputMode="numeric" value={Math.round(e.grams)} onChange={(ev) => {
                              const grams = Number(ev.target.value) || 0;
                              const meals = { ...(day.meals || {}) };
                              meals[detailSession] = meals[detailSession].map(x => {
                                if (x.id !== e.id) return x;
                                const baseGrams = x.baseGrams || (x.grams > 0 ? x.grams : 1);
                                const baseNutrition = x.baseNutrition || x.nutrition;
                                const factor = grams / baseGrams;
                                return {
                                  ...x,
                                  grams,
                                  baseGrams, // Preserve the fallback baseGrams
                                  baseNutrition, // Preserve the fallback baseNutrition
                                  nutrition: Object.fromEntries(Object.entries(baseNutrition).map(([k, v]) => [k, Math.round(v * factor * 10) / 10]))
                                };
                              });
                              persistDay({ ...day, meals });
                            }} className={`w-12 bg-transparent border-b border-dashed ${t.border} outline-none no-spinners text-center ${t.textMain}`} />
                            {e.unit || 'g'} · {Math.round(e.nutrition?.kcal || 0)} kkal
                          </span>
                          {e.source === 'ai' && <span className="inline-flex items-center gap-1 ml-1 text-emerald-500">· <Sparkles size={14} strokeWidth={2.5} /></span>}{e.source === 'recipe' && <span className="inline-flex items-center gap-1 ml-1 text-emerald-500">· <ChefHat size={14} strokeWidth={2.5} /></span>}
                          {e.isMealPrep && <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold border shrink-0 ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>Meal Prep</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeEntry(detailSession, e.id)} className="p-2 rounded-xl text-red-400 shrink-0"><Trash2 size={14} /></button>
                  </div>
                )})}
              </div>
              <button onClick={() => { setPickerSession(detailSession); setDetailSession(null); }}
                className={`w-full py-3 rounded-2xl border-2 border-dashed ${t.borderDashed} body-md ${t.textMuted}`}>
                <Plus size={14} className="inline mr-1" />Tambah item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SHEET COPY SESI ===== */}
      {copySourceSession && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setCopySourceSession(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] flex flex-col rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
            <h2 className={`h2 mb-2 ${t.textMain}`}>Salin / Pindah Menu</h2>
            <p className={`caption ${t.textMuted} mb-4`}>Pilih sesi tujuan untuk menu dari <span className="font-bold">{activeSessions.find(s => s.id === copySourceSession)?.label}</span>:</p>
            
            <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto">
              {activeSessions.filter(s => s.id !== copySourceSession).map(s => (
                <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${t.border} ${t.bgCard}`}>
                  <input type="checkbox" 
                    checked={copyTargetSessions.includes(s.id)} 
                    onChange={(e) => {
                      if (e.target.checked) setCopyTargetSessions(prev => [...prev, s.id]);
                      else setCopyTargetSessions(prev => prev.filter(id => id !== s.id));
                    }}
                    className="w-5 h-5 rounded accent-emerald-500" />
                  <span className={`body-md ${t.textMain}`}>{s.emoji} {s.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setCopySourceSession(null); setCopyTargetSessions([]); }} className={`flex-1 py-3 rounded-2xl ${t.btnBg} ${t.textMain} body-md font-bold`}>Batal</button>
              <button onClick={() => executeCopyOrMove(true)} disabled={copyTargetSessions.length === 0} className={`flex-1 py-3 rounded-2xl bg-orange-500 text-white body-md font-bold disabled:opacity-50`}>Pindah</button>
              <button onClick={() => executeCopyOrMove(false)} disabled={copyTargetSessions.length === 0} className={`flex-1 py-3 rounded-2xl ${t.bgAccent} text-white body-md font-bold disabled:opacity-50`}>Salin</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAY STATS MODAL (Rincian Makro & Mikro) ===== */}
      {showDayStatsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-swipe overscroll-none" onClick={() => setShowDayStatsModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto overscroll-contain hide-scrollbar rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510] border-white/10' : 'bg-white border-black/10'} shadow-2xl p-6 anim-rise`}>
            
            <div className="space-y-4 mb-6 mt-1">
               <h3 className={`caption ${t.textMuted} uppercase tracking-wider`}>Makro</h3>
               <MacroBar mkey="kcal" />
               <MacroBar mkey="protein" />
               <MacroBar mkey="carbs" />
               <MacroBar mkey="fat" />
            </div>

            <div className="space-y-4 mb-4">
               <h3 className={`caption ${t.textMuted} uppercase tracking-wider`}>Mikro & Lainnya</h3>
               {(() => {
                 const dietProfile = profile?.settings?.dietProfile || 'standard';
                 const microChips = NUTRIENTS.filter(n => !n.macro && (!n.conditional || dietProfile === 'low_purine'));
                 const activeMicros = microChips.filter(n => targets[n.key] && (totals[n.key] || 0) > 0);
                 
                 if (activeMicros.length === 0) {
                   return <p className={`caption ${t.textMuted} py-2`}>Belum ada data nutrisi mikro yang tercatat hari ini.</p>;
                 }

                 return activeMicros.map(n => {
                   const target = targets[n.key];
                   const ratio = (totals[n.key] || 0) / target;
                   const s = statusFor(ratio, { invert: MINIMUM_TARGETS.has(n.key) });
                   const pct = Math.min(100, ratio * 100);
                   return (
                     <div key={n.key} className="flex flex-col gap-1">
                       <div className="flex justify-between items-baseline">
                         <span className={`caption ${t.textMuted}`}>{n.label}</span>
                         <div className="flex items-center gap-2">
                            <span className={`caption font-black ${s.text} bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded`}>{Math.round(pct)}%</span>
                            <span className={`caption ${t.textMain} tabular-nums`}>{(totals[n.key] || 0) < 10 ? Number((totals[n.key] || 0).toFixed(2)) : Math.round(totals[n.key] || 0)}<span className={t.textMuted}>/{target}{n.unit || 'mg'}</span></span>
                         </div>
                       </div>
                       <div className={`h-2 rounded-full overflow-hidden ${t.bgSunken}`}>
                         <div className={`h-full rounded-full transition-all duration-500 ${s.bg}`} style={{ width: `${pct}%` }} />
                       </div>
                     </div>
                   );
                 });
               })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== SHEET ADD SESSION ===== */}
      {showAddSessionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setShowAddSessionModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`h2 ${t.textMain}`}>Tambah Sesi</h2>
              <button onClick={() => setShowAddSessionModal(false)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={15} className={t.textMuted} /></button>
            </div>
            <p className={`caption ${t.textMuted} mb-4`}>Pilih sesi standar yang disembunyikan atau buat sesi kustom.</p>
            
            <div className="space-y-2 mb-4 max-h-[50vh] overflow-y-auto">
              {MEAL_SESSIONS.filter(s => !activeSessions.find(a => a.id === s.id)).map(s => (
                <button key={s.id} onClick={() => {
                  const hidden = (day.hiddenSessions || []).filter(id => id !== s.id);
                  persistDay({ ...day, hiddenSessions: hidden, sessionLabels: { ...(day.sessionLabels || {}), [s.id]: s.label } });
                  setShowAddSessionModal(false);
                }} className={`w-full flex items-center gap-3 p-3 rounded-xl border ${t.border} ${t.bgCard}`}>
                  <span className={`body-md ${t.textMain}`}>{s.emoji} {s.label}</span>
                  <Plus size={16} className={`ml-auto ${t.textAccent}`} />
                </button>
              ))}
              <button onClick={() => {
                const n = activeSessions.filter(s => s.id.startsWith('snack')).length + 1;
                const newId = `snack${n}`;
                persistDay({ ...day, sessionLabels: { ...(day.sessionLabels || {}), [newId]: `Camilan ${n}` } });
                setShowAddSessionModal(false);
                setDetailSession(newId);
              }} className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed ${t.borderDashed} ${t.textMuted} font-medium`}>
                <Plus size={16} /> Buat Sesi Kustom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FOOD PICKER (Manual Fallback Presisi) ===== */}
      <FoodPickerModal
        t={t} theme={theme} open={!!pickerSession}
        onClose={() => setPickerSession(null)}
        customFoods={customFoods} recipes={recipes}
        onAdd={(entry) => addEntryToSession(pickerSession, entry)}
        onRemove={(entryId) => removeEntry(pickerSession, entryId)}
        targetSession={pickerSession}
        setTargetSession={setPickerSession}
        activeSessions={activeSessions}
        dayMeals={day.meals || {}}
      />
      
      {/* ===== SHEET KONFIRMASI HAPUS SESI ===== */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setDeleteConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`w-[90%] max-w-sm rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]' : 'bg-white'} p-6 anim-rise text-center`}>
            <div className="w-14 h-14 rounded-full bg-red-400/10 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-400/20">
              <Trash2 size={24} />
            </div>
            <h3 className={`h2 ${t.textMain} mb-2`}>Hapus Sesi?</h3>
            <p className={`body-md ${t.textMuted} mb-6`}>Yakin ingin menghapus sesi {activeSessions.find(s => s.id === deleteConfirm)?.label} beserta isinya dari hari ini?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className={`flex-1 py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md font-medium ${t.textMain}`}>Batal</button>
              <button onClick={() => {
                const meals = { ...(day.meals || {}) };
                delete meals[deleteConfirm];
                const photos = { ...(day.photos || {}) };
                delete photos[deleteConfirm];
                const hidden = [...(day.hiddenSessions || []), deleteConfirm];
                persistDay({ ...day, meals, photos, hiddenSessions: hidden });
                setDeleteConfirm(null);
                setDetailSession(null);
              }} className="flex-1 py-3 rounded-2xl bg-red-500/80 text-white body-md font-medium shadow-glow">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== IMAGE CROPPER MODAL ===== */}
      <ImageCropperModal 
        open={!!editingPhotoObj}
        imageSrc={editingPhotoObj?.url}
        onClose={() => setEditingPhotoObj(null)}
        onComplete={(croppedBase64) => {
          if (editingPhotoObj?.sessionId) {
            const photos = { ...(day.photos || {}) };
            photos[editingPhotoObj.sessionId] = croppedBase64;
            persistDay({ ...day, photos });
          }
          setEditingPhotoObj(null);
        }}
        t={t}
      />

    </div>
  );
};

export default LogTab;
