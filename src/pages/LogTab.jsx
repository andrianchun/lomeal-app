import React, { useMemo, useRef, useState } from 'react';
import { Camera, Mic, Send, Plus, GlassWater, Pencil, Loader2, X, Trash2, Sparkles, ChevronRight, ChevronLeft, Check, Pill, Syringe, Tablets, Beaker, ShieldPlus, Coffee, CupSoda } from 'lucide-react';
import RingChart from '../components/RingChart';
import FoodPickerModal from '../components/FoodPickerModal';
import { MEAL_SESSIONS, WATER_STEP_ML, getLocalYMD, DAY_NAMES_ID, AI_DAILY_LIMIT } from '../data/constants';
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
const LogTab = ({ t, theme, user, profile, daysMap, saveDay, customFoods, recipes, aiKey, showAlert, waterGoal }) => {
  const todayYmd = getLocalYMD();
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);
  const [pickerSession, setPickerSession] = useState(null); // sessionId saat FoodPicker terbuka
  const [detailSession, setDetailSession] = useState(null); // sessionId sheet detail
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
  const totals = useMemo(() => computeDayTotals(day), [day]);
  const targets = profile?.targets || {};

  // ---------- Date Strip horizontal (±14 hari) ----------
  const dates = useMemo(() => {
    const out = [];
    for (let i = -14; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({ ymd: getLocalYMD(d), day: d.getDate(), dow: DAY_NAMES_ID[d.getDay()] });
    }
    return out;
  }, []);

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

  const setSessionPhoto = (sessionId, photoUrl) => {
    const photos = { ...(day.photos || {}) };
    photos[sessionId] = photoUrl;
    persistDay({ ...day, photos });
  };

  // ---------- Water Tracker ----------
  const addWater = (ml) => persistDay({ ...day, water: Math.max(0, (day.water || 0) + ml) });

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
      if (res.foods?.length) { setAiResult({ foods: res.foods }); setChatText(''); }
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
      if (res.foods?.length) setAiResult({ foods: res.foods, photoDataUrl: dataUrl, photoFile: file });
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
    const base = MEAL_SESSIONS.filter(s => s.id !== 'snack' && s.id !== 'drink');
    const extra = MEAL_SESSIONS.filter(s => (s.id === 'snack' || s.id === 'drink'));
    // snack/drink selalu tampil; sesi snack tambahan (snack2, snack3…) muncul dinamis
    const dynamicIds = Object.keys(day.meals || {}).filter(id => !MEAL_SESSIONS.find(s => s.id === id));
    const dynamic = dynamicIds.map(id => ({ id, label: `Camilan ${id.replace('snack', '')}`, emoji: '🍪' }));
    return [...base, ...extra, ...dynamic];
  }, [day.meals]);

  const addSnackSession = () => {
    const n = activeSessions.filter(s => s.id.startsWith('snack')).length + 1;
    setPickerSession(`snack${n}`);
  };

  const MiniBar = ({ label, value, target, color }) => {
    const pct = target ? Math.min(100, (value / target) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className={`w-full h-14 rounded-lg ${t.bgSunken} relative overflow-hidden flex items-end`}>
          <div className="w-full transition-all duration-500 rounded-t-sm" style={{ height: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className={`caption ${t.textMuted}`}>{label}</span>
      </div>
    );
  };

  const SessionCard = ({ session }) => {
    const entries = day.meals?.[session.id] || [];
    const sTotals = entries.reduce((acc, e) => addNutrition(acc, e.nutrition), { ...EMPTY_NUTRITION });
    const photo = day.photos?.[session.id];
    const hasFood = entries.length > 0;
    const segments = hasFood ? [
      { value: sTotals.protein * 4, color: MACRO_COLORS.protein.hex },
      { value: sTotals.carbs * 4, color: MACRO_COLORS.carbs.hex },
      { value: sTotals.fat * 9, color: MACRO_COLORS.fat.hex },
    ] : null;

    return (
      <button onClick={() => hasFood ? setDetailSession(session.id) : setPickerSession(session.id)}
        className={`rounded-3xl border p-3.5 flex flex-col items-center ${t.border} ${t.bgCard} transition-transform active:scale-[0.98]`}>
        {/* Piring lingkaran dililit Ring Chart makro sesi */}
        <RingChart size={104} stroke={7} segments={segments} progress={hasFood ? null : 0}>
          <div className="w-[78px] h-[78px] rounded-full overflow-hidden flex items-center justify-center">
            {photo
              ? <img src={photo} alt={session.label} className="w-full h-full object-cover" />
              : <span className="text-3xl">{session.emoji}</span>}
          </div>
        </RingChart>
        <p className={`body-md mt-2 ${t.textMain}`}>{session.label}</p>
        <p className={`caption font-medium ${t.textMuted}`}>
          {hasFood ? `${Math.round(sTotals.kcal)} kkal · ${entries.length} item` : 'Ketuk untuk isi'}
        </p>
      </button>
    );
  };

  const isToday = selectedYmd === todayYmd;
  const water = day.water || 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-3 pb-52">
      {/* ===== HORIZONTAL DATE STRIP ===== */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-1"
        ref={(el) => { if (el && !el._centered) { el._centered = true; el.scrollLeft = el.scrollWidth * 0.55; } }}>
        {dates.map(d => {
          const active = d.ymd === selectedYmd;
          const future = d.ymd > todayYmd;
          return (
            <button key={d.ymd} onClick={() => setSelectedYmd(d.ymd)}
              className={`shrink-0 w-11 py-2 rounded-2xl border flex flex-col items-center transition-all ${active ? `${t.bgAccent} border-transparent shadow-glow` : `${t.border} ${t.bgCardSoft} ${future ? 'opacity-50' : ''}`}`}>
              <span className={`caption ${active ? 'text-white/80' : t.textMuted}`}>{d.dow}</span>
              <span className={`text-sm font-black ${active ? 'text-white' : t.textMain}`}>{d.day}</span>
            </button>
          );
        })}
      </div>

      {/* ===== QUICK STATS ===== */}
      <div className={`mt-3 rounded-3xl border ${t.border} ${t.bgCard} p-4 flex gap-4 anim-rise`}>
        {/* Mini bar chart Aktual vs Target */}
        <div className="flex gap-2 flex-1">
          <MiniBar label="Kal" value={totals.kcal} target={targets.kcal} color={totals.kcal > (targets.kcal || Infinity) ? '#ef4444' : '#22c55e'} />
          <MiniBar label="P" value={totals.protein} target={targets.protein} color={MACRO_COLORS.protein.hex} />
          <MiniBar label="K" value={totals.carbs} target={targets.carbs} color={MACRO_COLORS.carbs.hex} />
          <MiniBar label="L" value={totals.fat} target={targets.fat} color={MACRO_COLORS.fat.hex} />
        </div>
      </div>

      {/* ===== RAK SUPLEMEN & OBAT ===== */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          <button onClick={() => setRackExpanded(!rackExpanded)} className={`shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-2xl border ${t.border} ${t.bgCard} active:scale-95 transition-all`}>
             {rackExpanded ? <ChevronLeft size={20} className={t.textMuted}/> : <ChevronRight size={20} className={t.textMuted}/>}
          </button>
          
          <button onClick={() => addWater(WATER_STEP_ML)} className={`shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl border border-transparent bg-sky-500/10 active:scale-95 transition-all relative`}>
            <GlassWater size={24} className="text-sky-500 mb-1" />
            <span className="text-[9px] font-bold text-sky-500">+{WATER_STEP_ML}ml</span>
            {water > 0 && <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{water}</span>}
          </button>
          
          {rackExpanded && drinkTemplates.map(drink => {
            const IconComp = ICONS[drink.icon] || CupSoda;
            const bgClass = COLORS.find(c => c.id === drink.color)?.bg || 'bg-zinc-500';
            return (
              <button key={drink.id} onClick={() => {
                const meals = { ...(day.meals || {}) };
                meals['drink'] = [...(meals['drink'] || []), makeEntry({ name: drink.name, grams: 1, unit: 'porsi', nutrition: drink.nutrition, source: 'manual' })];
                persistDay({ ...day, meals });
                showAlert(`${drink.name} ditambahkan ke sesi Minuman!`);
              }} className={`shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl border border-transparent text-white active:scale-95 transition-all ${bgClass}`}>
                <IconComp size={22} className="mb-1" />
                <span className="text-[9px] font-bold px-1 text-center truncate w-full">{drink.name}</span>
              </button>
            )
          })}
        </div>

        {medicines.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            <div className={`shrink-0 flex items-center justify-center w-14 h-16 rounded-2xl border ${t.border} ${t.bgCard}`}>
              <Pill size={20} className={t.textMuted} />
            </div>
            {medicines.map(med => {
              const IconComp = ICONS[med.icon] || Pill;
              const textClass = COLORS.find(c => c.id === med.color)?.bg.replace('bg-', 'text-') || 'text-zinc-500';
              const isChecked = (day.medChecks || {})[med.id];
              return (
                <button key={med.id} onClick={() => {
                  const medChecks = { ...(day.medChecks || {}), [med.id]: !isChecked };
                  persistDay({ ...day, medChecks });
                }} className={`shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl border transition-all ${isChecked ? `${t.bgAccent} border-transparent text-white` : `${t.bgCard} ${t.border} ${t.textMuted}`}`}>
                  {isChecked ? <Check size={22} className="mb-1" /> : <IconComp size={22} className={`mb-1 ${textClass}`} />}
                  <span className="text-[9px] font-bold px-1 text-center truncate w-full">{med.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== THE MEAL GRID (2 kolom dinamis) ===== */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {activeSessions.map(s => <SessionCard key={s.id} session={s} />)}
        <button onClick={addSnackSession}
          className={`rounded-3xl border-2 border-dashed ${t.borderDashed} min-h-[120px] flex flex-col items-center justify-center gap-1 ${t.textMuted}`}>
          <Plus size={20} /> <span className="caption">Sesi camilan</span>
        </button>
      </div>

      {!isToday && selectedYmd > todayYmd && (
        <p className={`caption font-medium text-center mt-3 ${t.textMuted}`}>📅 Mode Meal Prep — kamu sedang merencanakan makanan untuk tanggal ini.</p>
      )}

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
            <button onClick={() => setPickerSession(detailSession || 'lunch')} className={`p-2.5 rounded-2xl ${t.bgAccent} shadow-glow`} aria-label="Input manual presisi">
              {aiBusy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* ===== SHEET KONFIRMASI HASIL AI ===== */}
      {aiResult && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setAiResult(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]' : 'bg-white'} p-4 anim-rise`}>
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm no-swipe" onClick={() => setDetailSession(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border ${t.border} ${theme === 'dark' ? 'bg-[#0b1f16]' : 'bg-white'} p-4 anim-rise`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`h2 ${t.textMain}`}>{MEAL_SESSIONS.find(s => s.id === detailSession)?.label || 'Camilan'}</h2>
              <button onClick={() => setDetailSession(null)} className={`p-2 rounded-xl ${t.btnBg}`}><X size={15} className={t.textMuted} /></button>
            </div>
            <div className="space-y-1.5 mb-3">
              {(day.meals?.[detailSession] || []).map(e => (
                <div key={e.id} className={`flex items-center justify-between p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                  <div>
                    <p className={`body-md ${t.textMain}`}>{e.name}</p>
                    <p className={`caption font-medium ${t.textMuted}`}>
                      {e.grams}{e.unit || 'g'} · {Math.round(e.nutrition?.kcal || 0)} kkal
                      {e.source === 'ai' && ' · ✨AI'}{e.source === 'recipe' && ' · 👨‍🍳'}
                    </p>
                  </div>
                  <button onClick={() => removeEntry(detailSession, e.id)} className="p-2 rounded-xl text-red-400"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => { setPickerSession(detailSession); setDetailSession(null); }}
              className={`w-full py-3 rounded-2xl border-2 border-dashed ${t.borderDashed} body-md ${t.textMuted}`}>
              <Plus size={14} className="inline mr-1" />Tambah item
            </button>
          </div>
        </div>
      )}

      {/* ===== FOOD PICKER (Manual Fallback Presisi) ===== */}
      <FoodPickerModal
        t={t} theme={theme} open={!!pickerSession}
        onClose={() => setPickerSession(null)}
        customFoods={customFoods} recipes={recipes}
        onAdd={(entry) => addEntryToSession(pickerSession, entry)}
      />
    </div>
  );
};

export default LogTab;
