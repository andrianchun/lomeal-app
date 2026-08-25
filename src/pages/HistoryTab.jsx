import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Bell, BellOff, Clock, ChefHat, Box, Droplet, Pill, Check, Droplets } from 'lucide-react';
import FoodPickerModal from '../components/FoodPickerModal';
import { MEAL_SESSIONS, DAY_NAMES_ID, MONTH_NAMES_ID, getLocalYMD, getMonthKey, DEFAULT_SESSION_TIMES } from '../data/constants';
import { computeDayTotals, NUTRIENTS } from '../data/nutrition';
import { STATUS } from '../theme';
import useBackClose from '../hooks/useBackClose';

const shiftYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return getLocalYMD(new Date(y, m - 1, d + days));
};
const startOfWeek = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return getLocalYMD(new Date(y, m - 1, d - date.getDay()));
};
const prettyDate = (ymd) => `${Number(ymd.slice(8))} ${MONTH_NAMES_ID[Number(ymd.slice(5, 7)) - 1]}`;

/**
 * TAB 3: KALENDER.
 * Mode bulanan atau mingguan; ketuk tanggal → bottom sheet berisi detail hari itu,
 * dipilah lewat toggle: Makan / Nutrisi / Health. Tanggal maju = rencana meal prep.
 */
const HistoryTab = ({ t, theme, profile, daysMap, saveDay, ensureMonth, customFoods, recipes, domusItems, showAlert, showToast, saveProfilePatch }) => {
  const todayYmd = getLocalYMD();
  const [mode, setMode] = useState('bulan'); // 'bulan' | 'minggu'
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayYmd));
  const [sheetYmd, setSheetYmd] = useState(null);
  const [sheetTab, setSheetTab] = useState('makan'); // 'makan' | 'nutrisi' | 'health'
  const [picker, setPicker] = useState(null);

  const targets = profile?.targets || {};
  const medicines = profile?.medicines || [];
  const drinkTemplates = profile?.drinkTemplates || [];
  const trackCycle = !!profile?.settings?.trackCycle;

  useBackClose(!!sheetYmd, () => setSheetYmd(null));

  const changeMonth = (delta) => {
    setViewDate(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      ensureMonth(getMonthKey(getLocalYMD(d)));
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const changeWeek = (delta) => {
    setWeekStart((w) => {
      const next = shiftYmd(w, delta * 7);
      ensureMonth(getMonthKey(next));
      return next;
    });
  };

  const weeks = useMemo(() => {
    if (mode === 'minggu') return [Array.from({ length: 7 }, (_, i) => shiftYmd(weekStart, i))];
    const first = new Date(viewDate.y, viewDate.m, 1);
    const daysInMonth = new Date(viewDate.y, viewDate.m + 1, 0).getDate();
    const cells = Array(first.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(getLocalYMD(new Date(viewDate.y, viewDate.m, d)));
    while (cells.length % 7 !== 0) cells.push(null);
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [mode, weekStart, viewDate]);

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

  const PHASE_RING = { cutting: 'ring-2 ring-rose-500/70', bulk: 'ring-2 ring-emerald-500/70' };
  const phaseRing = (ymd) => PHASE_RING[daysMap[ymd]?.targetSnapshot?.dietGoal] || '';

  // ---------- CRUD ----------
  const patchDay = (ymd, patch) => {
    const day = daysMap[ymd] || { meals: {} };
    saveDay(ymd, { ...day, ...patch });
  };

  const patchMeals = (ymd, fn) => {
    const day = daysMap[ymd] || { meals: {} };
    saveDay(ymd, { ...day, meals: fn({ ...(day.meals || {}) }) });
  };

  const removeEntry = (ymd, sessionId, entryId) =>
    patchMeals(ymd, (meals) => ({ ...meals, [sessionId]: (meals[sessionId] || []).filter((e) => e.id !== entryId) }));

  const editEntryGrams = (ymd, sessionId, entryId, grams) =>
    patchMeals(ymd, (meals) => ({
      ...meals,
      [sessionId]: (meals[sessionId] || []).map((e) => {
        if (e.id !== entryId) return e;
        const bg = e.baseGrams || (e.grams > 0 ? e.grams : 100);
        const bn = e.baseNutrition || e.nutrition || {};
        const factor = bg > 0 ? grams / bg : 0;
        return { ...e, grams, baseGrams: bg, baseNutrition: bn, nutrition: Object.fromEntries(Object.entries(bn).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])) };
      }),
    }));

  const addEntry = (ymd, sessionId, entry) => {
    patchMeals(ymd, (meals) => ({ ...meals, [sessionId]: [...(meals[sessionId] || []), entry] }));
    showToast(`${entry.name} dicatat!`);
  };

  const setSessionTime = (ymd, sessionId, timeStr) =>
    patchDay(ymd, { sessionTimes: { ...(daysMap[ymd]?.sessionTimes || {}), [sessionId]: timeStr } });

  const toggleReminder = (ymd, sessionId) => {
    const reminders = { ...(daysMap[ymd]?.reminders || {}) };
    reminders[sessionId] = !(reminders[sessionId] ?? profile?.settings?.reminderEnabled ?? false);
    patchDay(ymd, { reminders });
    showAlert(reminders[sessionId] ? `Pengingat aktif untuk ${MEAL_SESSIONS.find((s) => s.id === sessionId)?.label}` : 'Pengingat dimatikan');
  };

  const toggleMed = (ymd, medId) =>
    patchDay(ymd, { medChecks: { ...(daysMap[ymd]?.medChecks || {}), [medId]: !(daysMap[ymd]?.medChecks || {})[medId] } });

  const toggleMenstruation = (ymd) => patchDay(ymd, { menstruation: !daysMap[ymd]?.menstruation });

  // ---------- Kalender ----------
  const headerLabel = mode === 'minggu'
    ? `${prettyDate(weekStart)} – ${prettyDate(shiftYmd(weekStart, 6))}`
    : `${MONTH_NAMES_ID[viewDate.m]} ${viewDate.y}`;

  const openDay = (ymd) => {
    setSheetYmd(ymd);
    setSheetTab('makan');
  };

  const day = sheetYmd ? (daysMap[sheetYmd] || { meals: {}, water: 0 }) : null;
  const totals = day ? computeDayTotals(day) : null;
  const isFuture = sheetYmd ? sheetYmd > todayYmd : false;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-4">
      <div className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise`}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => (mode === 'minggu' ? changeWeek(-1) : changeMonth(-1))} className={`p-2 rounded-xl ${t.btnBg}`}>
            <ChevronLeft size={16} className={t.textMuted} />
          </button>
          <span className={`h2 ${t.textMain}`}>{headerLabel}</span>
          <button onClick={() => (mode === 'minggu' ? changeWeek(1) : changeMonth(1))} className={`p-2 rounded-xl ${t.btnBg}`}>
            <ChevronRight size={16} className={t.textMuted} />
          </button>
        </div>

        <div className={`flex gap-1 p-1 rounded-xl ${t.bgSunken} mb-3`}>
          {[['bulan', 'Bulanan'], ['minggu', 'Mingguan']].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); if (id === 'minggu') setWeekStart(startOfWeek(todayYmd)); }}
              className={`flex-1 py-1.5 rounded-lg caption font-bold transition-all ${mode === id ? `${t.bgAccent} text-white` : t.textMuted}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES_ID.map((d) => <span key={d} className={`text-center h3 ${t.textMuted}`}>{d}</span>)}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-y-1">
            {week.map((ymd, di) => {
              if (!ymd) return <span key={di} />;
              const isToday = ymd === todayYmd;
              const dot = dotsByYmd[ymd];
              return (
                <button key={di} onClick={() => openDay(ymd)} className="relative py-1.5 flex flex-col items-center rounded-xl">
                  <span className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full ${phaseRing(ymd)} ${
                    isToday ? `${t.bgAccent} text-white` : ymd > todayYmd ? t.textMuted : t.textMain}`}>
                    {Number(ymd.slice(8))}
                  </span>
                  <span className="flex items-center gap-0.5 mt-0.5 h-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot ? dot.bg : 'bg-transparent'}`} />
                    {trackCycle && daysMap[ymd]?.menstruation && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
          {[['On-target', STATUS.ok], ['Kurang log', STATUS.warn], ['Over', STATUS.danger]].map(([label, s]) => (
            <span key={label} className={`flex items-center gap-1 caption font-medium ${t.textMuted}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.bg}`} /> {label}
            </span>
          ))}
          {trackCycle && (
            <span className={`flex items-center gap-1 caption font-medium ${t.textMuted}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Menstruasi
            </span>
          )}
        </div>
      </div>

      {/* ===== BOTTOM SHEET DETAIL HARI ===== */}
      {sheetYmd && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end no-swipe">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheetYmd(null)} />
          <div className={`relative ${t.bgCardSolid} border-t ${t.border} rounded-t-3xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-8 duration-300`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border} shrink-0`}>
              <div>
                <p className={`h2 ${t.textMain}`}>{prettyDate(sheetYmd)}</p>
                <p className={`caption ${t.textMuted}`}>
                  {isFuture ? '📅 Rencana Meal Prep' : '📖 Riwayat'} · {Math.round(totals.kcal)} kkal
                </p>
              </div>
              <button onClick={() => setSheetYmd(null)} className={`p-2 rounded-xl ${t.btnBg} ${t.textMuted}`}><X size={16} /></button>
            </div>

            <div className={`flex gap-1 p-1 m-4 mb-2 rounded-xl ${t.bgSunken} shrink-0`}>
              {[['makan', isFuture ? 'Rencana' : 'Makan'], ['nutrisi', 'Nutrisi'], ['health', 'Health']].map(([id, label]) => (
                <button key={id} onClick={() => setSheetTab(id)}
                  className={`flex-1 py-1.5 rounded-lg caption font-bold transition-all ${sheetTab === id ? `${t.bgAccent} text-white` : t.textMuted}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
              {sheetTab === 'makan' && MEAL_SESSIONS.map((s) => {
                const entries = day.meals?.[s.id] || [];
                const sessionTime = day.sessionTimes?.[s.id] || profile?.settings?.defaultSessionTimes?.[s.id] || DEFAULT_SESSION_TIMES[s.id] || '12:00';
                const reminderEnabled = day.reminders?.[s.id] ?? (profile?.settings?.reminderEnabled ?? false);
                return (
                  <div key={s.id} className="mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className={`caption font-bold ${t.textMuted}`}>{s.emoji} {s.label}</p>
                        <div className={`flex items-center border ${t.border} rounded-md px-1.5 py-0.5`}>
                          <Clock size={10} className={`${t.textMuted} mr-1`} />
                          <input type="time" value={sessionTime} onChange={(e) => setSessionTime(sheetYmd, s.id, e.target.value)}
                            className={`bg-transparent outline-none text-[10px] font-bold ${t.textMain} w-[42px] p-0 border-none no-spinners`} />
                        </div>
                        <button onClick={() => toggleReminder(sheetYmd, s.id)}
                          className={`p-1 rounded-md transition-colors ${reminderEnabled ? 'bg-sky-500/10 text-sky-500' : 'text-zinc-500'}`}>
                          {reminderEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                        </button>
                      </div>
                      <button onClick={() => setPicker({ ymd: sheetYmd, session: s.id })} className={`p-1 rounded-lg ${t.textAccent}`}><Plus size={13} /></button>
                    </div>
                    {entries.map((e) => (
                      <div key={e.id} className={`flex items-center justify-between pl-3 pr-1 py-1.5 mt-1 rounded-xl ${t.bgSunken}`}>
                        <p className={`caption font-semibold flex-1 ${t.textMain}`}>
                          {e.name}
                          {e.source === 'recipe' && <ChefHat size={12} strokeWidth={2.5} className="inline ml-1 text-emerald-500" />}
                          {e.source === 'domus' && <Box size={12} strokeWidth={2.5} className="inline ml-1 text-blue-500" />}
                        </p>
                        <input type="number" inputMode="numeric" value={e.grams || ''} placeholder="0"
                          onBlur={(ev) => { const g = Number(ev.target.value) || 0; if (g !== e.grams) editEntryGrams(sheetYmd, s.id, e.id, g); }}
                          className={`w-12 text-right caption bg-transparent border-b ${t.border} outline-none no-spinners ${t.textMain}`} />
                        <span className={`caption ${t.textMuted} ml-0.5 mr-1`}>g</span>
                        <span className={`caption ${t.textMuted} w-14 text-right`}>{Math.round(e.nutrition?.kcal || 0)} kkal</span>
                        <button onClick={() => removeEntry(sheetYmd, s.id, e.id)} className="p-1.5 text-red-400"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                );
              })}

              {sheetTab === 'nutrisi' && (() => {
                const dayTargets = day.targetSnapshot || targets;
                const rows = NUTRIENTS.filter((n) => (totals[n.key] || 0) > 0);
                if (rows.length === 0) return <p className={`caption ${t.textMuted} py-4 text-center`}>Belum ada yang dicatat di tanggal ini.</p>;
                return (
                  <div className="space-y-2.5">
                    {rows.map((n) => {
                      const target = dayTargets[n.key];
                      const val = totals[n.key] || 0;
                      const pct = target ? Math.min(100, (val / target) * 100) : 0;
                      return (
                        <div key={n.key}>
                          <div className="flex justify-between items-baseline">
                            <span className={`caption ${t.textMuted}`}>{n.label}</span>
                            <span className={`caption ${t.textMain} tabular-nums`}>
                              {val < 10 ? Number(val.toFixed(2)) : Math.round(val)}
                              <span className={t.textMuted}>{target ? `/${Math.round(target)}` : ''} {n.unit}</span>
                            </span>
                          </div>
                          {target > 0 && (
                            <div className={`h-1.5 rounded-full overflow-hidden ${t.bgSunken} mt-1`}>
                              <div className={`h-full rounded-full ${t.bgAccent}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {sheetTab === 'health' && (
                <div className="space-y-5">
                  <div>
                    <p className={`caption font-bold ${t.textMuted} uppercase tracking-wider mb-2`}>Obat</p>
                    {medicines.length === 0 && <p className={`caption ${t.textMuted}`}>Belum ada obat di rak.</p>}
                    <div className="space-y-1">
                      {medicines.map((m) => {
                        const checked = !!(day.medChecks || {})[m.id];
                        return (
                          <button key={m.id} onClick={() => toggleMed(sheetYmd, m.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl ${t.bgSunken}`}>
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${checked ? t.bgAccent : `border ${t.border}`}`}>
                              {checked ? <Check size={12} className="text-white" /> : <Pill size={11} className={t.textMuted} />}
                            </span>
                            <span className={`caption font-semibold flex-1 text-left ${checked ? t.textMuted : t.textMain}`}>{m.name}</span>
                            {m.signa && <span className={`caption ${t.textMuted}`}>{m.signa}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className={`caption font-bold ${t.textMuted} uppercase tracking-wider mb-2`}>Minuman &amp; Suplemen</p>
                    {(() => {
                      const drinks = day.meals?.drink || [];
                      if (drinks.length === 0) return <p className={`caption ${t.textMuted}`}>Belum ada yang dicatat.</p>;
                      return (
                        <div className="space-y-1">
                          {drinks.map((e) => (
                            <div key={e.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${t.bgSunken}`}>
                              <Droplet size={12} className={t.textAccent} />
                              <span className={`caption font-semibold flex-1 ${t.textMain}`}>{e.name}</span>
                              <span className={`caption ${t.textMuted}`}>{Math.round(e.nutrition?.kcal || 0)} kkal</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {drinkTemplates.length > 0 && (
                      <p className={`caption ${t.textMuted} mt-2`}>Catat cepat dari rak lewat tab Catat.</p>
                    )}
                  </div>

                  <div>
                    <p className={`caption font-bold ${t.textMuted} uppercase tracking-wider mb-2`}>Air</p>
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${t.bgSunken}`}>
                      <Droplets size={14} className="text-sky-500" />
                      <span className={`caption ${t.textMain} flex-1`}>{day.water || 0} ml</span>
                      {targets.waterGoal ? <span className={`caption ${t.textMuted}`}>target {targets.waterGoal} ml</span> : null}
                    </div>
                  </div>

                  {trackCycle && (
                    <div>
                      <p className={`caption font-bold ${t.textMuted} uppercase tracking-wider mb-2`}>Siklus</p>
                      <button onClick={() => toggleMenstruation(sheetYmd)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl ${day.menstruation ? 'bg-rose-500/10' : t.bgSunken}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${day.menstruation ? 'bg-rose-500' : `border ${t.border}`}`} />
                        <span className={`caption font-semibold flex-1 text-left ${day.menstruation ? 'text-rose-500' : t.textMain}`}>
                          {day.menstruation ? 'Hari menstruasi' : 'Tandai hari menstruasi'}
                        </span>
                      </button>
                      <p className={`caption ${t.textMuted} mt-2 leading-relaxed`}>
                        Cuma penanda pribadi buat konteks gizi (mis. kebutuhan zat besi) — bukan prediksi medis.
                      </p>
                    </div>
                  )}

                  {!trackCycle && (
                    <button onClick={() => saveProfilePatch({ settings: { trackCycle: true } })}
                      className={`w-full py-2.5 rounded-xl border ${t.border} ${t.textMuted} caption font-bold`}>
                      Aktifkan pelacakan siklus menstruasi
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <FoodPickerModal
        t={t} theme={theme} open={!!picker}
        onClose={() => setPicker(null)}
        customFoods={customFoods} recipes={recipes} domusItems={domusItems}
        favoriteFoods={profile?.favoriteFoods || []}
        onAdd={(entry) => picker && addEntry(picker.ymd, picker.session, entry)}
      />
    </div>
  );
};

export default HistoryTab;
