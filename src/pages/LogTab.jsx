import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Camera, Mic, Send, Plus, GlassWater, Pencil, Loader2, X, Trash2, Sparkles, ChevronRight, ChevronLeft, Check, Pill, Syringe, Tablets, Beaker, ShieldPlus, Coffee, CupSoda, Copy, Clock, Flame, Droplets, Target, Utensils, Search, Calendar, Edit2, Play, ChevronDown, Activity, AlignLeft, ChefHat } from 'lucide-react';
import RingChart from '../components/RingChart';
import NutritionChart from '../components/NutritionChart';
import FoodPickerModal from '../components/FoodPickerModal';
import { MEAL_SESSIONS, WATER_STEP_ML, getLocalYMD, DAY_NAMES_ID, AI_DAILY_LIMIT, DEFAULT_SESSION_TIMES, DEFAULT_ACTIVE_SESSIONS } from '../data/constants';
import { computeDayTotals, addNutrition, EMPTY_NUTRITION } from '../data/nutrition';
import { MACRO_COLORS } from '../theme';
import { parseFoodText, analyzeFoodPhoto, compressImageTo100KB } from '../utils/aiFood';
import { makeEntry, checkAndCountAiUsage } from '../utils/foodLog';
import { uploadToCloudinary } from '../utils/cloudinary';

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
const LogTab = ({ t, theme, user, profile, daysMap, saveDay, customFoods, recipes, mealPreps, saveMealPrepsFn, aiKey, showAlert, waterGoal }) => {
  const todayYmd = getLocalYMD();
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const [pickerSession, setPickerSession] = useState(null); // sessionId saat FoodPicker terbuka
  const [detailSession, setDetailSession] = useState(null); // sessionId sheet detail
  const [copySourceSession, setCopySourceSession] = useState(null);
  const [copyTargetSessions, setCopyTargetSessions] = useState([]);
  const [showDayStatsModal, setShowDayStatsModal] = useState(false);
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [chatText, setChatText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null); // { foods:[...], photoDataUrl? }
  const [aiTargetSession, setAiTargetSession] = useState('lunch');
  const [waterEdit, setWaterEdit] = useState(false);
  const [listening, setListening] = useState(false);
  const [rackExpanded, setRackExpanded] = useState(false);
  const fileRef = useRef(null);
  const recogRef = useRef(null);

  const drinkTemplates = profile?.drinkTemplates || [];
  const medicines = profile?.medicines || [];

  const day = daysMap[selectedYmd] || { meals: {}, water: 0 };
  const isFuture = selectedYmd > todayYmd;
  const totals = useMemo(() => computeDayTotals(day, !isFuture), [day, isFuture]);
  const targets = profile?.targets || {};

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
  useEffect(() => {
    if (stripRef.current) {
      const activeBtn = stripRef.current.querySelector(`button[data-ymd="${selectedYmd}"]`);
      if (activeBtn) {
        const container = stripRef.current;
        const scrollLeft = activeBtn.offsetLeft - container.offsetWidth / 2 + activeBtn.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [selectedYmd]);

  const persistDay = (newDay) => saveDay(selectedYmd, newDay);

  const addEntryToSession = (sessionId, entry) => {
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = [...(meals[sessionId] || []), entry];
    persistDay({ ...day, meals });
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

  const executeCopy = () => {
    if (!copySourceSession || copyTargetSessions.length === 0) return;
    const sourceMeals = day.meals?.[copySourceSession] || [];
    if (sourceMeals.length === 0) return;
    
    const meals = { ...(day.meals || {}) };
    copyTargetSessions.forEach(targetId => {
      const cloned = sourceMeals.map(e => ({ ...e, id: Math.random().toString(36).substr(2, 9) }));
      meals[targetId] = [...(meals[targetId] || []), ...cloned];
    });
    persistDay({ ...day, meals });
    setCopySourceSession(null);
    setCopyTargetSessions([]);
    showAlert('Berhasil menyalin menu!');
  };

  // ---------- Water Tracker ----------
  const addWater = (ml) => {
    const meals = { ...(day.meals || {}) };
    meals['drink'] = [...(meals['drink'] || []), makeEntry({ name: 'Air Putih', grams: ml, unit: 'ml', nutrition: { ...EMPTY_NUTRITION }, source: 'manual' })];
    persistDay({ ...day, meals, water: Math.max(0, (day.water || 0) + ml) });
  };

  // ---------- AI: Satpam + Magic Prompt ----------
  const guardAi = async () => {
    if (!aiKey) {
      await showAlert('Masukkan Gemini API Key dulu di Pengaturan untuk memakai fitur AI. Kamu tetap bisa input manual via tombol +');
      return false;
    }
    const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
    if (!quota.allowed) {
      await showAlert(`Kuota AI harian habis (${AI_DAILY_LIMIT} request/hari). Gunakan input manual — besok kuota reset. 🙏`);
      return false;
    }
    return true;
  };

  const runMagicPrompt = async () => {
    const text = chatText.trim();
    if (!text || aiBusy) return;
    if (!(await guardAi())) return;
    setAiBusy(true);
    try {
      const res = await parseFoodText(aiKey, text);
      if (res.foods?.length) { 
         setAiTargetSession(getNearestSessionId());
         setAiResult({ foods: res.foods }); 
         setChatText(''); 
      }
      else await showAlert('AI tidak menemukan makanan pada teks itu. Coba lebih spesifik, mis. "nasi 1 centong, ayam goreng 1 potong".');
    } catch (e) {
      await showAlert(e.message === 'OUT_OF_SCOPE' ? 'Smart Input hanya melayani topik makanan & gizi ya 😄' : `Gagal memproses: ${e.message}`);
    } finally { setAiBusy(false); }
  };

  const runPhotoScan = async (file) => {
    if (!file || aiBusy) return;
    if (!(await guardAi())) return;
    setAiBusy(true);
    try {
      // Kompresi on-device ≤100KB → base64 inlineData (tanpa Cloud Storage, sesuai blueprint)
      const { base64, dataUrl, mimeType } = await compressImageTo100KB(file);
      const res = await analyzeFoodPhoto(aiKey, base64, mimeType);
      if (res.foods?.length) {
         setAiTargetSession(getNearestSessionId());
         setAiResult({ foods: res.foods, photoDataUrl: dataUrl, photoFile: file });
      }
      else await showAlert('AI tidak mengenali makanan di foto. Coba sudut/cahaya lain, atau input manual.');
    } catch (e) {
      await showAlert(`Gagal memindai foto: ${e.message}`);
    } finally { setAiBusy(false); }
  };

  const confirmAiResult = async () => {
    const { foods, photoDataUrl, photoFile } = aiResult;
    let photoUrl = null;
    if (photoFile) {
      try { const up = await uploadToCloudinary(photoFile, null, 'lomeal_meals'); photoUrl = up?.secure_url || null; }
      catch { photoUrl = null; }
    }
    const meals = { ...(day.meals || {}) };
    meals[aiTargetSession] = [
      ...(meals[aiTargetSession] || []),
      ...foods.map(f => makeEntry({ name: f.name, grams: f.grams, unit: 'g', nutrition: { ...EMPTY_NUTRITION, ...f.nutrition }, source: 'ai' })),
    ];
    const photos = { ...(day.photos || {}) };
    if (photoUrl || photoDataUrl) photos[aiTargetSession] = photoUrl || undefined;
    persistDay({ ...day, meals, ...(photoUrl ? { photos } : {}) });
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
    const mc = mkey === 'kcal' ? { label: 'Kalori', hex: value > (target || Infinity) ? '#ef4444' : '#22c55e' } : MACRO_COLORS[mkey];
    return (
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className={`caption ${t.textMuted}`}>{mc.label}</span>
            <div className="flex items-center gap-2">
              {mkey !== 'kcal' && <span className="caption font-black bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded" style={{ color: mc.hex }}>{Math.round(pct)}% AKG</span>}
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
      return e.isEaten !== undefined ? e.isEaten : !isMealPrep;
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
            `${Math.round(day.water || 0)} mL`
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
              className={`shrink-0 w-11 flex flex-col items-center justify-center rounded-2xl transition-all ${active ? `py-[10px] border-0 ${t.bgAccent} shadow-glow` : `py-2 border-2 ${isTodayBtn ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : `border-transparent ${t.bgCardSoft}`} ${future ? 'opacity-50' : ''}`}`}>
              <span className={`caption ${active ? 'text-white/80' : isTodayBtn ? 'text-emerald-500' : t.textMuted}`}>{d.dow}</span>
              <span className={`text-sm font-black ${active ? 'text-white' : isTodayBtn ? 'text-emerald-500' : t.textMain}`}>{d.day}</span>
            </button>
          );
        })}
      </div>

      {/* ===== QUICK STATS ===== */}
      <button onClick={() => setShowDayStatsModal(true)} className={`mt-3 w-full rounded-3xl border ${t.border} ${t.bgCard} p-4 flex flex-col gap-3 anim-rise text-left`}>
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
      <div className="fixed bottom-[136px] right-3 z-30 pointer-events-none flex justify-end">
         <div className="pointer-events-auto flex items-center gap-2 no-swipe overflow-x-auto hide-scrollbar max-w-[calc(100vw-24px)] pl-4 py-2">
             {rackExpanded && medicines.map(med => {
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
             
             {rackExpanded && drinkTemplates.map(drink => {
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
             
             {(drinkTemplates.length > 0 || medicines.length > 0) && (
               <button onClick={() => setRackExpanded(!rackExpanded)} className={`shrink-0 flex items-center justify-center w-6 h-12 rounded-xl bg-black/10 dark:bg-white/10 active:scale-95 transition-all backdrop-blur-md`}>
                  {rackExpanded ? <ChevronRight size={14} className={t.textMuted}/> : <ChevronLeft size={14} className={t.textMuted}/>}
               </button>
             )}
             
             <button onClick={() => addWater(WATER_STEP_ML)} className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl border ${theme==='dark'?'border-sky-900':'border-sky-200'} bg-sky-500/10 active:scale-95 transition-all relative shadow-lg backdrop-blur-md`}>
                <GlassWater size={20} className="text-sky-500 mb-0.5" />
                <span className="text-[10px] font-bold text-sky-500">+{WATER_STEP_ML}</span>
                {water > 0 && <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">{water}</span>}
             </button>
         </div>
      </div>

      {/* ===== SMART INPUT BAR (menempel di atas BottomNav) ===== */}
      <div className="fixed bottom-[76px] left-0 right-0 z-30 px-3 pb-2 pointer-events-none">
        <div className={`pointer-events-auto max-w-2xl mx-auto flex items-center gap-1.5 px-2 py-1.5 rounded-[24px] border ${t.border} ${t.navBg} ${t.glow}`}>
          <button onClick={() => fileRef.current?.click()} disabled={aiBusy}
            className={`p-2.5 rounded-2xl ${t.btnBg} ${t.textAccent}`} aria-label="Scan foto makanan">
            <Camera size={18} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { runPhotoScan(e.target.files?.[0]); e.target.value = ''; }} />
          <input
            value={chatText} onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runMagicPrompt()}
            placeholder='Coba: "nasi 2 centong, ayam goreng"…'
            className={`flex-1 bg-transparent outline-none body-md px-1 ${t.textMain} placeholder:${t.textMuted}`} />
          <button onClick={toggleVoice} className={`p-2.5 rounded-2xl ${t.btnBg} ${listening ? 'text-red-500 animate-pulse' : t.textMuted}`} aria-label="Input suara">
            <Mic size={18} />
          </button>
          {chatText.trim() ? (
            <button onClick={runMagicPrompt} disabled={aiBusy} className={`p-2.5 rounded-2xl ${t.bgAccent} shadow-glow`} aria-label="Kirim">
              {aiBusy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          ) : (
            <button onClick={() => setPickerSession(detailSession || getNearestSessionId())} className={`p-2.5 rounded-2xl ${t.bgAccent} shadow-glow`} aria-label="Input manual presisi">
              {aiBusy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
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
              <h2 className={`h2 ${t.textMain}`}>Hasil AI — cek dulu ya</h2>
              <button onClick={() => setAiResult(null)} className={`ml-auto p-2 rounded-xl ${t.btnBg}`}><X size={15} className={t.textMuted} /></button>
            </div>
            {aiResult.photoDataUrl && (
              <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-3 border-2 border-green-500/40">
                <img src={aiResult.photoDataUrl} alt="foto" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="space-y-1.5 mb-3">
              {aiResult.foods.map((f, i) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                  <div className="flex-1 mr-2">
                    <p className={`body-md ${t.textMain}`}>{f.name}</p>
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
                  <button onClick={() => setAiResult(r => ({ ...r, foods: r.foods.filter((_, j) => j !== i) }))}
                    className="p-2 rounded-xl text-red-400"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <p className={`caption font-medium mb-1.5 ${t.textMuted}`}>Masukkan ke sesi:</p>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-4">
              {MEAL_SESSIONS.map(s => (
                <button key={s.id} onClick={() => setAiTargetSession(s.id)}
                  className={`shrink-0 px-3 py-2 rounded-xl border caption ${aiTargetSession === s.id ? `${t.bgAccentSoft} ${t.borderAccentSoft} ${t.textAccent}` : `${t.border} ${t.textMuted}`}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
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
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
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
                <button onClick={() => setDeleteConfirm(detailSession)} className={`p-2 rounded-xl bg-red-500/10 text-red-500`}><Trash2 size={15} /></button>
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
                        <span className="truncate">{e.grams}{e.unit || 'g'} · {Math.round(e.nutrition?.kcal || 0)} kkal</span>
                        {e.source === 'ai' && ' · ✨AI'}{e.source === 'recipe' && <span className="inline-flex items-center gap-1 ml-1 text-emerald-500">· <ChefHat size={14} strokeWidth={2.5} /></span>}
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
      )}

      {/* ===== SHEET COPY SESI ===== */}
      {copySourceSession && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setCopySourceSession(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] flex flex-col rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
            <h2 className={`h2 mb-2 ${t.textMain}`}>Salin Menu</h2>
            <p className={`caption ${t.textMuted} mb-4`}>Pilih sesi tujuan untuk menyalin menu dari <span className="font-bold">{activeSessions.find(s => s.id === copySourceSession)?.label}</span>:</p>
            
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
              <button onClick={executeCopy} disabled={copyTargetSessions.length === 0} className={`flex-1 py-3 rounded-2xl ${t.bgAccent} body-md font-bold disabled:opacity-50`}>Salin</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAY STATS MODAL (Dari MacroBar yang di-klik) ===== */}
      {showDayStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-swipe" onClick={() => setShowDayStatsModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm max-h-[85vh] overflow-y-auto hide-scrollbar rounded-3xl border ${theme === 'dark' ? 'bg-[#0a1510]/80 border-white/10' : 'bg-white/80 border-black/10'} backdrop-blur-3xl shadow-2xl p-5 anim-rise`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`h2 ${t.textMain}`}>Rincian Nutrisi</h2>
              <button onClick={() => setShowDayStatsModal(false)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={15} className={t.textMuted} /></button>
            </div>
            
            <div className="mt-4">
               <NutritionChart t={t} theme={theme} daysMap={daysMap} targets={targets} date={selectedYmd} />
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
            <div className="w-14 h-14 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <Trash2 size={24} />
            </div>
            <h3 className={`h2 ${t.textMain} mb-2`}>Hapus Sesi?</h3>
            <p className={`body-md ${t.textMuted} mb-6`}>Yakin ingin menghapus sesi {activeSessions.find(s => s.id === deleteConfirm)?.label} beserta isinya dari hari ini?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className={`flex-1 py-3 rounded-2xl border ${t.border} ${t.btnBg} body-md font-medium ${t.textMain}`}>Batal</button>
              <button onClick={() => {
                const meals = { ...(day.meals || {}) };
                delete meals[deleteConfirm];
                const hidden = [...(day.hiddenSessions || []), deleteConfirm];
                persistDay({ ...day, meals, hiddenSessions: hidden });
                setDeleteConfirm(null);
                setDetailSession(null);
              }} className="flex-1 py-3 rounded-2xl bg-red-500 text-white body-md font-medium shadow-glow">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogTab;
