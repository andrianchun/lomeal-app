import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Plus, Sparkles, ImageDown, Loader2, X, Bell, BellOff, Clock } from 'lucide-react';
import FoodPickerModal from '../components/FoodPickerModal';
import { MEAL_SESSIONS, DAY_NAMES_ID, MONTH_NAMES_ID, getLocalYMD, getMonthKey, DEFAULT_SESSION_TIMES } from '../data/constants';
import { computeDayTotals } from '../data/nutrition';
import { STATUS } from '../theme';
import { generateWeeklyEvaluation } from '../utils/aiFood';
import { checkAndCountAiUsage } from '../utils/foodLog';
import { AI_DAILY_LIMIT } from '../data/constants';

/**
 * TAB 3: HISTORI & PERENCANAAN (Fase 5 blueprint).
 * Kalender penuh 1 bulan (daur ulang pola Lyfit). Tanggal mundur = histori,
 * tanggal maju = Meal Prep. Klik tanggal → dropdown sub-card CRUD inline.
 * Bawah: Generate Evaluasi Mingguan (Gemini, manual) + Export Image.
 */
const HistoryTab = ({ t, theme, user, profile, daysMap, saveDay, ensureMonth, customFoods, recipes, aiKey, showAlert, saveProfilePatch }) => {
  const todayYmd = getLocalYMD();
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [expandedYmd, setExpandedYmd] = useState(null);
  const [picker, setPicker] = useState(null); // { ymd, session }
  const [evalBusy, setEvalBusy] = useState(false);
  const [evaluation, setEvaluation] = useState(profile?.lastEvaluation?.text || null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportRef = useRef(null);

  const targets = profile?.targets || {};

  const changeMonth = (delta) => {
    setExpandedYmd(null);
    setViewDate(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      ensureMonth(getMonthKey(getLocalYMD(d)));
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  // Grid kalender bulan aktif
  const weeks = useMemo(() => {
    const first = new Date(viewDate.y, viewDate.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewDate.y, viewDate.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(getLocalYMD(new Date(viewDate.y, viewDate.m, d)));
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [viewDate]);

  const dotsByYmd = useMemo(() => {
    const out = {};
    weeks.flat().forEach((ymd) => {
      if (!ymd) return;
      const totals = computeDayTotals(daysMap[ymd]);
      if (!totals.kcal) { out[ymd] = null; return; }
      // Arsip: hari yang udah lewat pakai target yang berlaku WAKTU ITU (targetSnapshot),
      // bukan target sekarang — biar ganti Diet Profile gak nulis ulang riwayat kepatuhan.
      const dayTargets = daysMap[ymd]?.targetSnapshot || targets;
      const ratio = totals.kcal / (dayTargets.kcal || 1);
      out[ymd] = ratio > 1.05 ? STATUS.danger : ratio >= 0.7 ? STATUS.ok : STATUS.warn;
    });
    return out;
  }, [weeks, daysMap, targets]);
  const dayDot = (ymd) => dotsByYmd[ymd] ?? null;

  // Cincin warna di angka tanggal — fase (cutting/bulk) yang berlaku hari itu, diambil dari
  // arsip targetSnapshot (bukan target sekarang), biar riwayat fase kebaca kayak kalender.
  const PHASE_RING = { cutting: 'ring-2 ring-rose-500/70', bulk: 'ring-2 ring-emerald-500/70' };
  const phaseRing = (ymd) => PHASE_RING[daysMap[ymd]?.targetSnapshot?.dietGoal] || '';

  // ---------- CRUD dalam dropdown sub-card ----------
  const expandedDay = expandedYmd ? (daysMap[expandedYmd] || { meals: {}, water: 0 }) : null;

  const removeEntry = (ymd, sessionId, entryId) => {
    const day = daysMap[ymd] || { meals: {} };
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = (meals[sessionId] || []).filter(e => e.id !== entryId);
    saveDay(ymd, { ...day, meals });
  };

  const editEntryGrams = (ymd, sessionId, entryId, grams) => {
    const day = daysMap[ymd] || { meals: {} };
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = (meals[sessionId] || []).map(e => {
      if (e.id !== entryId) return e;
      const factor = e.grams > 0 ? grams / e.grams : 0;
      return { ...e, grams, nutrition: Object.fromEntries(Object.entries(e.nutrition || {}).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])) };
    });
    saveDay(ymd, { ...day, meals });
  };

  const addEntry = (ymd, sessionId, entry) => {
    const day = daysMap[ymd] || { meals: {} };
    const meals = { ...(day.meals || {}) };
    meals[sessionId] = [...(meals[sessionId] || []), entry];
    saveDay(ymd, { ...day, meals });
  };

  const setSessionTime = (ymd, sessionId, timeStr) => {
    const day = daysMap[ymd] || { meals: {} };
    const sessionTimes = { ...(day.sessionTimes || {}) };
    sessionTimes[sessionId] = timeStr;
    saveDay(ymd, { ...day, sessionTimes });
  };

  const toggleReminder = (ymd, sessionId) => {
    const day = daysMap[ymd] || { meals: {} };
    const reminders = { ...(day.reminders || {}) };
    const currentStatus = reminders[sessionId] ?? profile?.settings?.reminderEnabled ?? false;
    reminders[sessionId] = !currentStatus;
    saveDay(ymd, { ...day, reminders });
    showAlert(reminders[sessionId] ? `Pengingat aktif untuk ${MEAL_SESSIONS.find(s=>s.id===sessionId)?.label}` : 'Pengingat dimatikan');
  };

  // ---------- Evaluasi Mingguan (Gemini, HANYA manual trigger) ----------
  const runEvaluation = async () => {
    if (evalBusy) return;
    const quota = await checkAndCountAiUsage(user.uid, todayYmd, AI_DAILY_LIMIT);
    if (!quota.allowed) { await showAlert(`Kuota AI harian habis (${AI_DAILY_LIMIT}/hari). Coba lagi besok ya.`); return; }
    setEvalBusy(true);
    try {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ymd = getLocalYMD(d);
        const totals = computeDayTotals(daysMap[ymd]);
        days.push({ date: ymd, kcal: Math.round(totals.kcal), protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat), sodium: Math.round(totals.sodium), sugar: Math.round(totals.sugar), water: daysMap[ymd]?.water || 0 });
      }
      const summary = { targets: { kcal: targets.kcal, protein: targets.protein, carbs: targets.carbs, fat: targets.fat, sodium: targets.sodium, sugar: targets.sugar }, dietProfile: profile?.dietProfile, pace: profile?.pace, days };
      const text = await generateWeeklyEvaluation(aiKey, summary);
      setEvaluation(text);
      saveProfilePatch({ lastEvaluation: { text, at: new Date().toISOString() } });
    } catch (e) {
      await showAlert(`Gagal membuat evaluasi: ${e.message}`);
    } finally { setEvalBusy(false); }
  };

  // ---------- Export Image (Canvas → kartu Instagrammable) ----------
  const exportImage = async () => {
    if (exportBusy || !exportRef.current) return;
    setExportBusy(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `lomeal-${getMonthKey(todayYmd)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Progres Lomeal-ku' });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = file.name; a.click();
      }
    } catch (e) {
      if (e.name !== 'AbortError') await showAlert(`Gagal export: ${e.message}`);
    } finally { setExportBusy(false); }
  };

  const monthLabel = `${MONTH_NAMES_ID[viewDate.m]} ${viewDate.y}`;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-4">
      {/* ===== KALENDER UI HYBRID ===== */}
      <div ref={exportRef} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise`}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => changeMonth(-1)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronLeft size={16} className={t.textMuted} /></button>
          <span className={`h2 ${t.textMain}`}>{monthLabel}</span>
          <button onClick={() => changeMonth(1)} className={`p-2 rounded-xl ${t.btnBg}`}><ChevronRight size={16} className={t.textMuted} /></button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_ID.map(d => <span key={d} className={`text-center h3 ${t.textMuted}`}>{d}</span>)}
        </div>
        {weeks.map((week, wi) => (
          <React.Fragment key={wi}>
            <div className="grid grid-cols-7 gap-y-1">
              {week.map((ymd, di) => {
                if (!ymd) return <span key={di} />;
                const isToday = ymd === todayYmd;
                const isFuture = ymd > todayYmd;
                const dot = dayDot(ymd);
                const expanded = expandedYmd === ymd;
                return (
                  <button key={di} onClick={() => setExpandedYmd(expanded ? null : ymd)}
                    className={`relative py-1.5 flex flex-col items-center rounded-xl transition-all ${expanded ? `${t.bgAccentSoft} border ${t.borderAccentSoft}` : ''}`}>
                    <span className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full ${phaseRing(ymd)} ${isToday ? `${t.bgAccent} text-white` : isFuture ? t.textMuted : t.textMain}`}>
                      {Number(ymd.slice(8))}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dot ? dot.bg : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>

            {/* Dropdown Sub-Card inline (tanpa pindah halaman) */}
            {week.includes(expandedYmd) && expandedDay && (
              <div className={`my-2 rounded-2xl border ${t.border} ${t.bgCardSoft} p-3 anim-rise`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`body-md ${t.textMain}`}>
                    {expandedYmd > todayYmd ? '📅 Meal Prep' : '📖 Histori'} — {Number(expandedYmd.slice(8))} {MONTH_NAMES_ID[Number(expandedYmd.slice(5, 7)) - 1]}
                  </p>
                  <p className={`caption font-bold ${t.textAccent}`}>{Math.round(computeDayTotals(expandedDay).kcal)} kkal</p>
                </div>
                {MEAL_SESSIONS.map(s => {
                  const entries = expandedDay.meals?.[s.id] || [];
                  const sessionTime = expandedDay.sessionTimes?.[s.id] || profile?.settings?.defaultSessionTimes?.[s.id] || DEFAULT_SESSION_TIMES[s.id] || '12:00';
                  const reminderEnabled = expandedDay.reminders?.[s.id] ?? (profile?.settings?.reminderEnabled ?? false);
                  
                  return (
                    <div key={s.id} className="mb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className={`caption font-bold ${t.textMuted}`}>{s.emoji} {s.label}</p>
                          <div className={`flex items-center bg-transparent border ${t.border} rounded-md px-1.5 py-0.5`}>
                            <Clock size={10} className={`${t.textMuted} mr-1`} />
                            <input type="time" value={sessionTime} onChange={(e) => setSessionTime(expandedYmd, s.id, e.target.value)} className={`bg-transparent outline-none text-[10px] font-bold ${t.textMain} w-[42px] p-0 border-none no-spinners`} />
                          </div>
                          <button onClick={() => toggleReminder(expandedYmd, s.id)} className={`p-1 rounded-md transition-colors ${reminderEnabled ? 'bg-sky-500/10 text-sky-500' : `bg-transparent text-zinc-500 hover:${t.bgSunken}`}`}>
                            {reminderEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                          </button>
                        </div>
                        <button onClick={() => setPicker({ ymd: expandedYmd, session: s.id })} className={`p-1 rounded-lg ${t.textAccent}`}><Plus size={13} /></button>
                      </div>
                      {entries.map(e => (
                        <div key={e.id} className={`flex items-center justify-between pl-3 pr-1 py-1.5 mt-1 rounded-xl ${t.bgSunken}`}>
                          <p className={`caption font-semibold flex-1 ${t.textMain}`}>{e.name}</p>
                          <input type="number" inputMode="numeric" defaultValue={e.grams} key={`${e.id}_${e.grams}`}
                            onBlur={(ev) => { const g = Number(ev.target.value) || 0; if (g !== e.grams) editEntryGrams(expandedYmd, s.id, e.id, g); }}
                            className={`w-12 text-right caption bg-transparent border-b ${t.border} outline-none no-spinners ${t.textMain}`} />
                          <span className={`caption ${t.textMuted} ml-0.5 mr-1`}>g</span>
                          <span className={`caption ${t.textMuted} w-14 text-right`}>{Math.round(e.nutrition?.kcal || 0)} kkal</span>
                          <button onClick={() => removeEntry(expandedYmd, s.id, e.id)} className="p-1.5 text-red-400"><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </React.Fragment>
        ))}
        <div className="flex items-center justify-center gap-4 mt-2">
          {[['On-target', STATUS.ok], ['Kurang log', STATUS.warn], ['Over', STATUS.danger]].map(([label, s]) => (
            <span key={label} className={`flex items-center gap-1 caption font-medium ${t.textMuted}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.bg}`} /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* ===== PUSAT EVALUASI ===== */}
      {evaluation && (
        <div className={`rounded-3xl border ${t.borderAccentSoft} ${t.bgAccentSoft} p-4 anim-rise`}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} className={t.textAccent} />
            <span className={`h2 ${t.textMain}`}>Rapor Mingguan AI</span>
            <button onClick={() => setEvaluation(null)} className="ml-auto"><X size={14} className={t.textMuted} /></button>
          </div>
          <p className={`body-md font-medium leading-relaxed ${t.textMain}`}>{evaluation}</p>
        </div>
      )}
      <div className="flex gap-2.5">
        <button onClick={runEvaluation} disabled={evalBusy}
          className={`flex-1 py-3.5 rounded-2xl ${t.bgAccent} body-lg shadow-glow flex items-center justify-center gap-2 disabled:opacity-50`}>
          {evalBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Generate Evaluasi Mingguan
        </button>
        <button onClick={exportImage} disabled={exportBusy}
          className={`px-4 py-3.5 rounded-2xl border ${t.border} ${t.btnBg} ${t.textMain} flex items-center gap-1.5 body-md disabled:opacity-50`}>
          {exportBusy ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
        </button>
      </div>

      <FoodPickerModal
        t={t} theme={theme} open={!!picker}
        onClose={() => setPicker(null)}
        customFoods={customFoods} recipes={recipes}
        onAdd={(entry) => picker && addEntry(picker.ymd, picker.session, entry)}
      />
    </div>
  );
};

export default HistoryTab;
