import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, 
  Activity, HeartPulse, Plus, X, Bell, BellOff, Clock, 
  ChefHat, Box, Droplets, Droplet, Pill, Check, Sparkles, AlertCircle
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import SwipeInput from '../components/SwipeInput';
import PanoramicSlider from '../components/PanoramicSlider';
import FoodPickerModal from '../components/FoodPickerModal';
import { 
  MEAL_SESSIONS, DAY_NAMES_ID, MONTH_NAMES_ID, getLocalYMD, 
  getMonthKey, DEFAULT_SESSION_TIMES, weekStripDates, WATER_STEP_ML 
} from '../data/constants';
import { computeDayTotals, NUTRIENTS, calcTEF, calcBMR } from '../data/nutrition';
import { extractLyfitDay } from '../utils/lyfitSync';
import { STATUS } from '../theme';
import { URT_DICTIONARY, normalizeUnit, UNIT_OPTIONS } from '../utils/urtMapping';
import useBackClose from '../hooks/useBackClose';

const shiftYmd = (ymd, days) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return getLocalYMD(new Date(y, m - 1, d + days));
};

const formatPrettyDate = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayName = DAY_NAMES_ID[dateObj.getDay()];
  const monthName = MONTH_NAMES_ID[m - 1];
  return `${dayName}, ${d} ${monthName} ${y}`;
};

const formatShortDate = (ymd) => {
  if (!ymd) return '';
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTH_NAMES_ID[m - 1]}`;
};

/**
 * TAB KALENDER LOMEAL (LOGYM ARCHITECTURE)
 * - Mode Bulanan (continuous vertical scroll) & Mode Mingguan (panoramic horizontal swipe strip).
 * - Header interaktif: Month/Year picker & tombol 'Hari Ini'.
 * - Toggle Health (kiri atas): Beralih antara Makanan/Nutrisi vs Health (Obat, Suplemen/Minuman, Air, Siklus Menstruasi).
 * - Bottom Sheet interaktif dengan drag handle & swipe ganti hari.
 */
const HistoryTab = ({ 
  t, theme, logymUser, lyfitToday, lyfitYearData, profile, daysMap = {}, saveDay, ensureMonth, 
  recipes = [], mealPreps = [], saveMealPrepsFn, customFoods = [], 
  domusItems = [], showAlert, showToast, saveProfilePatch 
}) => {
  const todayStr = getLocalYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [calendarDate, setCalendarDate] = useState(() => {
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  const [calendarMode, setCalendarMode] = useState(() => {
    return localStorage.getItem('Lomeal_calendar_mode') || 'monthly';
  });

  useEffect(() => {
    if (calendarMode === 'weekly' || calendarMode === 'monthly') {
      localStorage.setItem('Lomeal_calendar_mode', calendarMode);
    }
  }, [calendarMode]);

  // Toggle Health Mode di kiri atas (seperti toggle Nadi/Activity di Logym)
  const [showHealthMode, setShowHealthMode] = useState(() => {
    return localStorage.getItem('Lomeal_calendar_health_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('Lomeal_calendar_health_mode', String(showHealthMode));
  }, [showHealthMode]);

  // Sub-tab di bottom sheet saat mode Makan (makan / nutrisi)
  const [sheetSubTab, setSheetSubTab] = useState('makan'); // 'makan' | 'nutrisi'
  const [picker, setPicker] = useState(null);

  const targets = profile?.targets || {};
  const medicines = profile?.medicines || [];
  const trackCycle = !!profile?.settings?.trackCycle;
  const waterGoal = profile?.targets?.waterGoal || 2000;

  // Mode Bulanan: Rentang -24 bulan s/d +12 bulan
  const [monthRange, setMonthRange] = useState(() => {
    const base = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const range = [];
    for (let i = -24; i <= 12; i++) {
      range.push(new Date(base.getFullYear(), base.getMonth() + i, 1));
    }
    return range;
  });

  const monthListRef = useRef(null);
  const isProgrammaticScroll = useRef(false);

  const ensureMonthInRange = (dateObj) => {
    const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    setMonthRange(prev => {
      const first = prev[0];
      const last = prev[prev.length - 1];
      if (target >= first && target <= last) return prev;
      const newStart = target < first ? target : first;
      const newEnd = target > last ? target : last;
      const range = [];
      let cursor = new Date(newStart);
      while (cursor <= newEnd) {
        range.push(new Date(cursor));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return range;
    });
  };

  const scrollToMonth = (dateObj, behavior = 'smooth') => {
    const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
    const container = monthListRef.current;
    const el = container?.querySelector(`[data-month-key="${key}"]`);
    if (el && container) {
      isProgrammaticScroll.current = true;
      const targetTop = container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top);
      container.scrollTo({ top: targetTop, behavior });
      setTimeout(() => { isProgrammaticScroll.current = false; }, behavior === 'smooth' ? 500 : 80);
    }
  };

  useEffect(() => {
    if (calendarMode === 'monthly') {
      ensureMonthInRange(calendarDate);
      const timer = setTimeout(() => scrollToMonth(calendarDate, 'auto'), 50);
      return () => clearTimeout(timer);
    }
  }, [calendarMode]);

  // Observer untuk sinkronisasi header saat scroll mode bulanan
  useEffect(() => {
    if (calendarMode !== 'monthly' || !monthListRef.current) return;
    const container = monthListRef.current;
    const observer = new IntersectionObserver((entries) => {
      if (isProgrammaticScroll.current) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const [y, m] = entry.target.dataset.monthKey.split('-').map(Number);
          setCalendarDate(prev => (prev.getFullYear() === y && prev.getMonth() === m) ? prev : new Date(y, m, 1));
          ensureMonth?.(`${y}-${String(m + 1).padStart(2, '0')}`);
        }
      });
    }, { root: container, rootMargin: '0px 0px -80% 0px', threshold: 0 });

    const panels = container.querySelectorAll('[data-month-key]');
    panels.forEach(p => observer.observe(p));
    return () => observer.disconnect();
  }, [calendarMode, monthRange, ensureMonth]);

  // Bottom Sheet references & heights
  const sheetRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const fixedHeaderRef = useRef(null);
  const weeklyRulerRef = useRef(null);

  const [peekHeight, setPeekHeight] = useState(60);
  const [bottomNavClearance, setBottomNavClearance] = useState(88);

  useEffect(() => {
    const measure = () => {
      const nav = document.getElementById('bottom-nav');
      if (nav) setBottomNavClearance(nav.getBoundingClientRect().height + 12);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (calendarMode === 'monthly') {
      setPeekHeight(110 + bottomNavClearance);
    }
  }, [calendarMode, bottomNavClearance]);

  // Drag State untuk Bottom Sheet
  const sheetDragStartRef = useRef({ y: 0, translate: 0 });
  const sheetVelocityRef = useRef({ lastY: 0, lastT: 0, v: 0 });
  const [sheetDragY, setSheetDragY] = useState(null);

  const handleSheetPointerDown = (e) => {
    const maxH = sheetRef.current?.offsetHeight || 500;
    const startTranslate = calendarMode === 'monthly' ? (maxH - peekHeight) : 0;
    sheetDragStartRef.current = { y: e.clientY, translate: startTranslate };
    sheetVelocityRef.current = { lastY: e.clientY, lastT: performance.now(), v: 0 };
    setSheetDragY(startTranslate);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSheetPointerMove = (e) => {
    if (sheetDragY === null) return;
    const { y, translate } = sheetDragStartRef.current;
    const maxH = sheetRef.current?.offsetHeight || 500;
    const delta = e.clientY - y;
    setSheetDragY(Math.min(maxH, Math.max(0, translate + delta)));

    const now = performance.now();
    const { lastY, lastT } = sheetVelocityRef.current;
    const dt = now - lastT;
    if (dt > 0) {
      const instantV = (e.clientY - lastY) / dt;
      sheetVelocityRef.current = { lastY: e.clientY, lastT: now, v: sheetVelocityRef.current.v * 0.5 + instantV * 0.5 };
    }
  };

  const handleSheetPointerUp = () => {
    if (sheetDragY === null) return;
    const maxH = sheetRef.current?.offsetHeight || 500;
    const { translate: startTranslate } = sheetDragStartRef.current;
    const moved = Math.abs(sheetDragY - startTranslate);
    const velocity = sheetVelocityRef.current.v;
    const FLICK_VELOCITY = 0.5;

    let nextMode;
    if (moved < 8) {
      nextMode = calendarMode === 'monthly' ? 'weekly' : 'monthly';
    } else if (Math.abs(velocity) > FLICK_VELOCITY) {
      nextMode = velocity < 0 ? 'weekly' : 'monthly';
    } else {
      nextMode = sheetDragY < maxH / 2 ? 'weekly' : 'monthly';
    }

    if (nextMode !== calendarMode) {
      setCalendarMode(nextMode);
    }
    setSheetDragY(null);
  };

  // Sinkronisasi tanggal saat berganti
  const changeSelectedDate = (newDateStr) => {
    if (!newDateStr) return;
    setSelectedDate(newDateStr);
    const [y, m] = newDateStr.split('-').map(Number);
    ensureMonth?.(`${y}-${String(m).padStart(2, '0')}`);
  };

  // Auto-sync mingguan
  useEffect(() => {
    if (calendarMode === 'weekly' && selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const sel = new Date(y, m - 1, d);
      const selDay = sel.getDay();
      const selWeekStart = new Date(y, m - 1, d - selDay);

      const calDay = calendarDate.getDay();
      const calWeekStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() - calDay);

      if (getLocalYMD(selWeekStart) !== getLocalYMD(calWeekStart)) {
        setCalendarDate(sel);
      }
    }
  }, [selectedDate, calendarMode]);

  // ---------- CRUD HANDLERS ----------
  const patchDay = (ymd, patch) => {
    const day = daysMap[ymd] || { meals: {} };
    saveDay(ymd, { ...day, ...patch });
  };

  const patchMeals = (ymd, fn) => {
    const day = daysMap[ymd] || { meals: {} };
    saveDay(ymd, { ...day, meals: fn({ ...(day.meals || {}) }) });
  };

  const removeEntry = (ymd, sessionId, entryId) => {
    patchMeals(ymd, (meals) => ({
      ...meals,
      [sessionId]: (meals[sessionId] || []).filter((e) => e.id !== entryId)
    }));
    showToast?.('Makanan dihapus');
  };

  const editEntryGrams = (ymd, sessionId, entryId, grams, nextUnit) => {
    patchMeals(ymd, (meals) => ({
      ...meals,
      [sessionId]: (meals[sessionId] || []).map((e) => {
        if (e.id !== entryId) return e;
        const bg = e.baseGrams || (e.grams > 0 ? e.grams : 100);
        const bn = e.baseNutrition || e.nutrition || {};
        const factor = bg > 0 ? grams / bg : 0;
        return { 
          ...e, 
          grams, 
          unit: nextUnit !== undefined ? nextUnit : e.unit,
          baseGrams: bg, 
          baseNutrition: bn, 
          nutrition: Object.fromEntries(Object.entries(bn).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])) 
        };
      }),
    }));
  };

  const addEntry = (ymd, sessionId, entry) => {
    patchMeals(ymd, (meals) => ({
      ...meals,
      [sessionId]: [...(meals[sessionId] || []), entry]
    }));
    showToast?.(`${entry.name} dicatat!`);
  };

  const setSessionTime = (ymd, sessionId, timeStr) => {
    patchDay(ymd, { 
      sessionTimes: { ...(daysMap[ymd]?.sessionTimes || {}), [sessionId]: timeStr } 
    });
  };

  const toggleReminder = async (ymd, sessionId) => {
    const reminders = { ...(daysMap[ymd]?.reminders || {}) };
    const nextVal = !(reminders[sessionId] ?? profile?.settings?.reminderEnabled ?? false);
    reminders[sessionId] = nextVal;
    patchDay(ymd, { reminders });

    const sessionObj = MEAL_SESSIONS.find((s) => s.id === sessionId);
    showAlert?.(nextVal ? `Pengingat aktif untuk ${sessionObj?.label || sessionId}` : 'Pengingat dimatikan');
  };

  const toggleMed = (ymd, medId) => {
    const medChecks = { ...(daysMap[ymd]?.medChecks || {}) };
    medChecks[medId] = !medChecks[medId];
    patchDay(ymd, { medChecks });
  };

  const toggleMenstruation = (ymd) => {
    patchDay(ymd, { menstruation: !daysMap[ymd]?.menstruation });
  };

  const adjustWater = (ymd, delta) => {
    const currentWater = daysMap[ymd]?.water || 0;
    const newWater = Math.max(0, currentWater + delta);
    patchDay(ymd, { water: newWater });
  };

  // Jadwalkan porsi meal prep ke sesi makan
  const useMealPrepForSession = (batch, sessionId) => {
    if (!batch || batch.remainingPortions <= 0) return;
    const entry = {
      id: `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: batch.recipeName || 'Meal Prep',
      grams: batch.gramsPerPortion || 200,
      baseGrams: batch.gramsPerPortion || 200,
      baseNutrition: batch.perPortion || {},
      nutrition: batch.perPortion || {},
      batchId: batch.id,
      source: 'recipe'
    };
    addEntry(selectedDate, sessionId, entry);
    // Kurangi remaining portions di mealPreps
    if (saveMealPrepsFn && mealPreps) {
      saveMealPrepsFn(mealPreps.map(b => b.id === batch.id ? { ...b, remainingPortions: Math.max(0, b.remainingPortions - 1) } : b));
    }
  };

  // Single Source of Truth untuk kalkulasi Target Harian (Dinamis dengan Logym jika terhubung)
  const getEffectiveDayTarget = useCallback((ymd, dayData) => {
    const isToday = ymd === todayStr;
    const isFuture = ymd > todayStr;
    const baseTargets = (isToday || isFuture ? profile?.targets : (dayData?.targetSnapshot || profile?.targets)) || {};
    const baseTdee = baseTargets?.tdee || baseTargets?.kcal || 0;
    const kcalDiff = (baseTargets?.kcal || 0) - baseTdee;

    const lyfitDay = extractLyfitDay(lyfitYearData, ymd) || (isToday ? lyfitToday : null);
    const totals = computeDayTotals(dayData || {});
    const bmrBase = lyfitDay?.bmr || baseTargets?.bmr || (profile?.physical ? calcBMR(profile.physical) : 1600);
    const tefDay = calcTEF({
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      kcal: totals.kcal,
      bmr: bmrBase
    }).total;

    const burnedTotal = logymUser ? (lyfitDay?.burnedKcal || (bmrBase + tefDay)) : (baseTdee || 0);
    const allowanceKcal = (logymUser && burnedTotal > 0)
      ? Math.max(0, burnedTotal + kcalDiff)
      : (baseTargets.kcal || 2000);

    return {
      ...baseTargets,
      kcal: allowanceKcal,
    };
  }, [todayStr, profile?.targets, profile?.physical, lyfitYearData, lyfitToday, logymUser]);

  // Helper Dots Status Kepatuhan Kalori
  const getDayDot = (ymd) => {
    const dayData = daysMap[ymd];
    if (!dayData) return null;
    const totals = computeDayTotals(dayData);
    if (!totals.kcal) return null;
    const dayTargets = getEffectiveDayTarget(ymd, dayData);
    const ratio = totals.kcal / (dayTargets.kcal || 2000);
    return ratio > 1.05 ? STATUS.danger : ratio >= 0.7 ? STATUS.ok : STATUS.warn;
  };

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const monthName = MONTH_NAMES_ID[month];

  // Helper sel kalender untuk panel bulan
  const getGridCellsForMonth = (baseDate) => {
    const cells = [];
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let firstDayOfMonth = new Date(y, m, 1).getDay();
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(y, m, i));
    return cells;
  };

  // Panel 1 Bulan
  const renderMonthPanel = (panelDate) => {
    const cells = getGridCellsForMonth(panelDate);
    const panelMonthName = MONTH_NAMES_ID[panelDate.getMonth()];
    const panelYear = panelDate.getFullYear();

    return (
      <div className="flex flex-col px-2">
        <h2 className={`text-xl font-black mb-2 px-1 shrink-0 ${t.textMain} tracking-tight`}>
          {panelMonthName} {panelYear}
        </h2>
        <div className="grid grid-cols-7 gap-1 mb-2 px-1 shrink-0">
          {DAY_NAMES_ID.map((day, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0 px-1" style={{ gridAutoRows: '46px' }}>
          {cells.map((dateObj, idx) => {
            if (!dateObj) return <div key={`blank-${idx}`} />;
            const dateKey = getLocalYMD(dateObj);
            const dayNum = dateObj.getDate();
            const isToday = dateKey === todayStr;
            const isSelected = dateKey === selectedDate;
            const dot = getDayDot(dateKey);
            const isPeriod = trackCycle && !!daysMap[dateKey]?.menstruation;
            const hasMeals = !!daysMap[dateKey]?.meals && Object.values(daysMap[dateKey]?.meals).some(arr => arr?.length > 0);

            let cellClass = `w-full h-full max-w-[42px] max-h-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer border border-transparent ${t.textMuted} hover:bg-black/5 dark:hover:bg-white/5`;
            if (isSelected) {
              cellClass = `w-full h-full max-w-[42px] max-h-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${t.bgAccent} text-white shadow-lg ${t.shadowAccent} scale-[1.08] z-10 font-bold`;
            } else if (isToday) {
              cellClass = `w-full h-full max-w-[42px] max-h-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer border-2 ${t.borderAccentSoft} ${t.textAccent} font-bold hover:bg-black/5 dark:hover:bg-white/5`;
            }

            return (
              <div key={dateKey} onClick={() => changeSelectedDate(dateKey)} className="flex items-center justify-center p-0.5 min-h-0">
                <div className={cellClass}>
                  <span className={`text-sm ${isSelected ? 'font-black' : 'font-semibold'}`}>{dayNum}</span>
                  <div className="absolute bottom-1 flex gap-0.5 items-center justify-center">
                    {dot && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : dot.bg}`} />
                    )}
                    {isPeriod && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-200' : 'bg-rose-500'}`} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Data hari yang dipilih
  const currentDayData = daysMap[selectedDate] || { meals: {}, water: 0 };
  const currentDayTotals = computeDayTotals(currentDayData);
  const currentDayTargets = getEffectiveDayTarget(selectedDate, currentDayData);
  const isFutureDate = selectedDate > todayStr;

  return (
    <div className="flex-1 min-h-0 flex flex-col relative w-full h-[calc(100vh-64px)] overflow-hidden">
      {/* Header Utama Kalender */}
      <div className={`flex flex-col flex-1 min-h-0 w-full overflow-hidden ${t.textMain} relative z-10`}>
        <div className={`z-10 pt-2 relative w-full flex flex-col transition-all duration-300 ease-out min-h-0 ${calendarMode === 'monthly' ? 'flex-1' : 'shrink-0 pb-3'}`}>
          {/* Top Bar: Toggles + Title + Today */}
          <div ref={fixedHeaderRef} className="shrink-0 relative z-[50] px-3">
            <div className="flex justify-between items-center mb-3">
              {/* Sisi Kiri: Mode Toggle + Health Toggle */}
              <div className="flex items-center gap-1.5 w-[100px]">
                <button
                  onClick={() => {
                    const next = calendarMode === 'monthly' ? 'weekly' : 'monthly';
                    setCalendarMode(next);
                  }}
                  className={`p-2 rounded-xl border ${t.border} ${t.btnBg} ${t.textMain} hover:${t.bgAccentSoft} transition-colors`}
                  title="Ganti Tampilan Bulanan / Mingguan"
                >
                  {calendarMode === 'monthly' ? <CalendarDays size={18} /> : <CalendarRange size={18} />}
                </button>

                <button
                  onClick={() => setShowHealthMode(!showHealthMode)}
                  className={`p-2 rounded-xl border transition-all ${showHealthMode ? `${t.bgAccent} text-white border-transparent shadow-sm` : `${t.border} ${t.btnBg} ${t.textMuted} hover:${t.textAccent}`}`}
                  title="Tampilan Kesehatan (Obat, Suplemen, Air, Menstruasi)"
                >
                  <HeartPulse size={18} />
                </button>
              </div>

              {/* Tengah: Judul Bulan & Tahun */}
              <button
                onClick={() => {
                  if (calendarMode === 'monthPicker') setCalendarMode('yearPicker');
                  else if (calendarMode === 'yearPicker') setCalendarMode('monthly');
                  else setCalendarMode('monthPicker');
                }}
                className={`text-xl font-black ${t.textMain} tracking-tight hover:${t.textAccent} transition-colors`}
              >
                {calendarMode === 'yearPicker' ? `${year - 5} – ${year + 6}` : (calendarMode === 'monthPicker' ? year : `${monthName} ${year}`)}
              </button>

              {/* Sisi Kanan: Tombol Hari Ini */}
              <div className="w-[100px] flex justify-end items-center">
                {(selectedDate !== todayStr || calendarDate.getMonth() !== new Date().getMonth() || calendarDate.getFullYear() !== new Date().getFullYear()) && (
                  <button
                    onClick={() => {
                      changeSelectedDate(todayStr);
                      setCalendarDate(new Date());
                      if (calendarMode === 'monthly') scrollToMonth(new Date());
                    }}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${t.bgAccent} text-white hover:opacity-90 transition-opacity shadow-sm`}
                  >
                    Hari Ini
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Area Kalender (Picker / Mingguan / Bulanan) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {calendarMode === 'yearPicker' ? (
              <div className="grid grid-cols-3 gap-2.5 px-4 py-2 animate-in fade-in zoom-in-95 duration-200">
                {Array.from({ length: 12 }, (_, i) => year - 5 + i).map(y => (
                  <button
                    key={y}
                    onClick={() => { setCalendarDate(new Date(y, month, 1)); setCalendarMode('monthPicker'); }}
                    className={`py-3.5 rounded-2xl text-sm font-bold transition-all ${y === new Date().getFullYear() ? `${t.bgAccent} text-white` : `${t.btnBg} ${t.textMain} border ${t.border}`}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            ) : calendarMode === 'monthPicker' ? (
              <div className="grid grid-cols-3 gap-2.5 px-4 py-2 animate-in fade-in zoom-in-95 duration-200">
                {MONTH_NAMES_ID.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => { setCalendarDate(new Date(year, i, 1)); setCalendarMode('monthly'); }}
                    className={`py-3.5 rounded-2xl text-sm font-bold transition-all ${i === new Date().getMonth() && year === new Date().getFullYear() ? `${t.bgAccent} text-white` : `${t.btnBg} ${t.textMain} border ${t.border}`}`}
                  >
                    {m.substring(0, 3)}
                  </button>
                ))}
              </div>
            ) : calendarMode === 'weekly' ? (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 px-2">
                <div className="grid grid-cols-7 gap-1 mb-1 px-1">
                  {DAY_NAMES_ID.map((day, i) => (
                    <div key={i} className="text-center text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                      {day}
                    </div>
                  ))}
                </div>
                <PanoramicSlider
                  onSwipeLeft={() => {
                    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() + 7);
                    setCalendarDate(newDate);
                    const sel = new Date(selectedDate);
                    sel.setDate(sel.getDate() + 7);
                    changeSelectedDate(getLocalYMD(sel));
                  }}
                  onSwipeRight={() => {
                    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() - 7);
                    setCalendarDate(newDate);
                    const sel = new Date(selectedDate);
                    sel.setDate(sel.getDate() - 7);
                    changeSelectedDate(getLocalYMD(sel));
                  }}
                  renderPanel={() => {
                    const panelCells = weekStripDates(calendarDate, 0, 1);
                    return (
                      <div className="grid grid-cols-7 gap-0 px-1 w-full">
                        {panelCells.map((dateObj) => {
                          const dateKey = getLocalYMD(dateObj);
                          const dayNum = dateObj.getDate();
                          const isToday = dateKey === todayStr;
                          const isSelected = dateKey === selectedDate;
                          const dot = getDayDot(dateKey);
                          const isPeriod = trackCycle && !!daysMap[dateKey]?.menstruation;

                          let cellClass = `w-full h-11 max-w-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer border border-transparent ${t.textMuted} hover:bg-black/5 dark:hover:bg-white/5`;
                          if (isSelected) {
                            cellClass = `w-full h-11 max-w-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${t.bgAccent} text-white shadow-lg ${t.shadowAccent} scale-[1.08] z-10 font-bold`;
                          } else if (isToday) {
                            cellClass = `w-full h-11 max-w-[42px] mx-auto relative flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer border-2 ${t.borderAccentSoft} ${t.textAccent} font-bold hover:bg-black/5 dark:hover:bg-white/5`;
                          }

                          return (
                            <div key={dateKey} onClick={() => changeSelectedDate(dateKey)} className="py-0.5 relative select-none">
                              <div className={cellClass}>
                                <span className={`text-sm ${isSelected ? 'font-black' : 'font-semibold'}`}>{dayNum}</span>
                                <div className="absolute bottom-1 flex gap-0.5 items-center justify-center">
                                  {dot && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : dot.bg}`} />}
                                  {isPeriod && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-200' : 'bg-rose-500'}`} />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
              </div>
            ) : (
              <div
                ref={monthListRef}
                className="flex-1 min-h-0 overflow-y-auto hide-scrollbar pb-36 px-2 pt-1 animate-in fade-in duration-200"
              >
                {monthRange.map(mDate => (
                  <div
                    key={`${mDate.getFullYear()}-${mDate.getMonth()}`}
                    data-month-key={`${mDate.getFullYear()}-${mDate.getMonth()}`}
                    className="mb-6"
                  >
                    {renderMonthPanel(mDate)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== BOTTOM SHEET DETAIL HARI ===== */}
      <div
        ref={sheetRef}
        className={`no-swipe absolute inset-x-0 bottom-0 flex flex-col z-20 ${sheetDragY === null ? 'transition-all duration-300 ease-out' : ''}`}
        style={{
          height: calendarMode === 'weekly' ? 'calc(100% - 130px)' : '75vh',
          transform: sheetDragY !== null
            ? `translateY(${sheetDragY}px)`
            : `translateY(${(calendarMode === 'monthPicker' || calendarMode === 'yearPicker') ? (sheetRef.current?.offsetHeight || 1000) : (calendarMode === 'monthly' ? ((sheetRef.current?.offsetHeight || 0) - peekHeight) : 0)}px)`
        }}
      >
        {/* Glassmorphism Background Panel */}
        <div className={`absolute inset-0 rounded-t-[2.5rem] border-t ${t.border} ${theme === 'dark' ? 'bg-[#060c09]/95' : 'bg-[#f7faf8]/95'} backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-none`} />

        {/* Drag Handle */}
        <div
          className="shrink-0 flex justify-center pt-3.5 pb-2 cursor-grab active:cursor-grabbing z-10 relative"
          style={{ touchAction: 'none' }}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
        >
          <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Isi Sheet */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col px-4 sm:px-6">
          <PanoramicSlider
            className="flex-1 flex flex-col min-h-0"
            fillHeight={true}
            onSwipeLeft={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              changeSelectedDate(getLocalYMD(d));
            }}
            onSwipeRight={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              changeSelectedDate(getLocalYMD(d));
            }}
            renderPanel={() => {
              return (
                <div 
                  ref={scrollContainerRef}
                  className="flex flex-col h-full overflow-y-auto hide-scrollbar pb-28 pt-1"
                >
                  {/* Header Detail Tanggal */}
                  <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5 shrink-0">
                    <div>
                      <p className={`text-base font-black ${t.textMain}`}>{formatPrettyDate(selectedDate)}</p>
                      <p className={`text-xs font-semibold ${t.textMuted} mt-0.5`}>
                        {showHealthMode ? (
                          <span>Ringkasan Kesehatan &amp; Kebugaran</span>
                        ) : (
                          <span>
                            {isFutureDate ? '📅 Rencana Meal Prep' : '📖 Riwayat Makan'} · {Math.round(currentDayTotals.kcal)} / {Math.round(currentDayTargets.kcal || 2000)} kkal
                          </span>
                        )}
                      </p>
                    </div>

                    {!showHealthMode && (
                      <div className={`flex gap-1 p-1 rounded-xl ${t.bgSunken}`}>
                        <button
                          onClick={() => setSheetSubTab('makan')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${sheetSubTab === 'makan' ? `${t.bgAccent} text-white` : t.textMuted}`}
                        >
                          Makan
                        </button>
                        <button
                          onClick={() => setSheetSubTab('nutrisi')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${sheetSubTab === 'nutrisi' ? `${t.bgAccent} text-white` : t.textMuted}`}
                        >
                          Nutrisi
                        </button>
                      </div>
                    )}
                  </div>

                  {/* KONTEN TAMPILAN: MODE MAKAN / NUTRISI */}
                  {!showHealthMode && (
                    <div className="pt-4 space-y-4">
                      {sheetSubTab === 'makan' && (
                        <>
                          {/* Sesi Makan */}
                          {MEAL_SESSIONS.filter(s => s.id !== 'drink').map((s) => {
                            const entries = currentDayData.meals?.[s.id] || [];
                            const sessionTime = currentDayData.sessionTimes?.[s.id] || DEFAULT_SESSION_TIMES[s.id] || '12:00';
                            const reminderOn = currentDayData.reminders?.[s.id] ?? (profile?.settings?.reminderEnabled ?? false);

                            return (
                              <div key={s.id} className={`p-3.5 rounded-2xl border ${t.border} ${t.bgCard}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">{s.emoji} {s.label}</span>
                                    <div className={`flex items-center border ${t.border} rounded-lg px-2 py-0.5 ${t.bgSunken}`}>
                                      <Clock size={10} className={`${t.textMuted} mr-1`} />
                                      <input
                                        type="time"
                                        value={sessionTime}
                                        onChange={(e) => setSessionTime(selectedDate, s.id, e.target.value)}
                                        className={`bg-transparent outline-none text-[11px] font-bold ${t.textMain} w-[42px] p-0 border-none no-spinners`}
                                      />
                                    </div>
                                    <button
                                      onClick={() => toggleReminder(selectedDate, s.id)}
                                      className={`p-1.5 rounded-lg transition-colors ${reminderOn ? 'bg-sky-500/15 text-sky-500' : t.textMuted}`}
                                    >
                                      {reminderOn ? <Bell size={13} /> : <BellOff size={13} />}
                                    </button>
                                  </div>

                                  <button
                                    onClick={() => setPicker({ ymd: selectedDate, session: s.id })}
                                    className={`p-1.5 rounded-xl ${t.bgAccent} text-white hover:opacity-90 transition-opacity`}
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>

                                {entries.length === 0 ? (
                                  <p className={`text-xs ${t.textMuted} italic py-1`}>Belum ada menu dicatat.</p>
                                ) : (
                                  <div className="space-y-1.5 mt-2">
                                    {entries.map((e) => {
                                      const rawUnit = e.unit || (s.id === 'drink' ? 'ml' : 'g');
                                      const unit = URT_DICTIONARY[normalizeUnit(rawUnit)] ? normalizeUnit(rawUnit) : (rawUnit === 'ml' ? 'ml' : 'g');
                                      const isGram = unit === 'g' || unit === 'ml';
                                      const unitWeight = isGram ? 1 : (URT_DICTIONARY[unit] || 1);
                                      const qty = Math.round(((e.grams || 0) / unitWeight) * 10) / 10;

                                      return (
                                        <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-xl ${t.bgSunken}`}>
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                                            <p className={`text-xs font-semibold truncate ${t.textMain}`}>
                                              {e.name}
                                            </p>
                                            {e.source === 'recipe' && <ChefHat size={12} className="text-emerald-500 shrink-0" />}
                                            {e.source === 'domus' && <Box size={12} className="text-sky-500 shrink-0" />}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex items-center gap-1">
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                value={qty || ''}
                                                onChange={(ev) => {
                                                  const newQty = Number(ev.target.value) || 0;
                                                  editEntryGrams(selectedDate, s.id, e.id, Math.round(newQty * unitWeight), unit);
                                                }}
                                                className={`w-9 text-right text-xs bg-transparent border-b ${t.border} outline-none no-spinners ${t.textMain} font-bold`}
                                              />
                                              <select
                                                value={unit}
                                                onChange={(ev) => {
                                                  const newUnit = ev.target.value;
                                                  const newUnitWeight = (newUnit === 'g' || newUnit === 'ml') ? 1 : (URT_DICTIONARY[newUnit] || 1);
                                                  const newGrams = Math.round(qty * newUnitWeight);
                                                  editEntryGrams(selectedDate, s.id, e.id, newGrams, newUnit);
                                                }}
                                                className={`bg-transparent text-[10px] font-bold outline-none cursor-pointer ${t.textMuted}`}
                                              >
                                                {UNIT_OPTIONS.map(u => <option key={u} value={u} className={theme === 'dark' ? 'bg-[#0a1510]' : 'bg-white'}>{u}</option>)}
                                              </select>
                                            </div>
                                            <span className={`text-xs font-bold ${t.textMuted} w-14 text-right`}>
                                              {Math.round(e.nutrition?.kcal || 0)} kkal
                                            </span>
                                            <button
                                              onClick={() => removeEntry(selectedDate, s.id, e.id)}
                                              className="p-1 text-red-400 hover:text-red-500 transition-colors"
                                            >
                                              <X size={13} />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Rekomendasi Stok Meal Prep untuk Hari Depan */}
                          {isFutureDate && mealPreps?.filter(b => b.remainingPortions > 0).length > 0 && (
                            <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-2`}>
                              <div className="flex items-center gap-1.5">
                                <ChefHat size={15} className="text-emerald-500" />
                                <span className={`text-xs font-bold uppercase tracking-wider ${t.textMain}`}>
                                  Gunakan Stok Meal Prep
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 pt-1">
                                {mealPreps.filter(b => b.remainingPortions > 0).map((batch) => (
                                  <div key={batch.id} className={`flex items-center justify-between p-2.5 rounded-xl ${t.bgSunken}`}>
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-xs font-bold truncate ${t.textMain}`}>{batch.recipeName}</p>
                                      <p className={`text-[11px] ${t.textMuted}`}>
                                        Sisa {batch.remainingPortions} porsi · {Math.round(batch.perPortion?.kcal || 0)} kkal
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {['breakfast', 'lunch', 'dinner'].map((sId) => (
                                        <button
                                          key={sId}
                                          onClick={() => useMealPrepForSession(batch, sId)}
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${t.border} hover:${t.bgAccentSoft} transition-colors`}
                                        >
                                          {sId === 'breakfast' ? 'Sarapan' : sId === 'lunch' ? 'Siang' : 'Malam'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {sheetSubTab === 'nutrisi' && (
                        <div className="space-y-4">
                          {/* Makronutrisi Cards */}
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'protein', label: 'Protein', color: 'bg-rose-500', unit: 'g' },
                              { key: 'carbs', label: 'Karbo', color: 'bg-amber-500', unit: 'g' },
                              { key: 'fat', label: 'Lemak', color: 'bg-sky-500', unit: 'g' }
                            ].map((m) => {
                              const val = currentDayTotals[m.key] || 0;
                              const tgt = currentDayTargets[m.key] || 0;
                              const pct = tgt ? Math.min(100, Math.round((val / tgt) * 100)) : 0;
                              return (
                                <div key={m.key} className={`p-3 rounded-2xl border ${t.border} ${t.bgCard} flex flex-col justify-between`}>
                                  <div>
                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${t.textMuted}`}>{m.label}</p>
                                    <p className={`text-base font-black ${t.textMain} mt-0.5`}>
                                      {Math.round(val)}<span className="text-[10px] font-medium text-zinc-400">/{tgt ? Math.round(tgt) : '—'}g</span>
                                    </p>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-2">
                                    <div className={`h-full rounded-full ${m.color}`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Mikronutrisi Detail */}
                          <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-3`}>
                            <p className={`text-xs font-black uppercase tracking-wider ${t.textMuted}`}>
                              Rincian Mikronutrisi
                            </p>
                            <div className="space-y-2.5">
                              {NUTRIENTS.filter(n => !['kcal', 'protein', 'carbs', 'fat'].includes(n.key)).map((n) => {
                                const val = currentDayTotals[n.key] || 0;
                                const tgt = currentDayTargets[n.key] || 0;
                                const pct = tgt ? Math.min(100, (val / tgt) * 100) : 0;
                                return (
                                  <div key={n.key}>
                                    <div className="flex justify-between items-baseline text-xs">
                                      <span className={t.textMuted}>{n.label}</span>
                                      <span className={`font-bold ${t.textMain}`}>
                                        {val < 10 ? Number(val.toFixed(1)) : Math.round(val)}
                                        <span className={`text-[10px] font-normal ${t.textMuted}`}>
                                          {tgt ? ` / ${Math.round(tgt)}` : ''} {n.unit}
                                        </span>
                                      </span>
                                    </div>
                                    {tgt > 0 && (
                                      <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-1">
                                        <div className={`h-full rounded-full ${t.bgAccent}`} style={{ width: `${pct}%` }} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KONTEN TAMPILAN: MODE HEALTH (TOGGLE AKTIF) */}
                  {showHealthMode && (
                    <div className="pt-4 space-y-4 animate-in fade-in duration-200">
                      {/* 1. Obat */}
                      <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-2.5`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Pill size={15} className="text-purple-500" />
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.textMain}`}>
                            Konsumsi Obat
                          </span>
                        </div>

                        {medicines.length === 0 ? (
                          <p className={`text-xs ${t.textMuted} italic py-1`}>
                            Belum ada obat di rak. Tambahkan obat di tab Pengaturan.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {medicines.map((m) => {
                              const isChecked = !!currentDayData.medChecks?.[m.id];
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => toggleMed(selectedDate, m.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${isChecked ? `${t.bgAccentSoft} border-transparent` : `${t.bgSunken} ${t.border}`}`}
                                >
                                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isChecked ? `${t.bgAccent} text-white` : `border ${t.border}`}`}>
                                    {isChecked && <Check size={13} strokeWidth={3} />}
                                  </span>
                                  <div className="flex-1 text-left min-w-0">
                                    <p className={`text-xs font-bold truncate ${isChecked ? t.textMain : t.textMain}`}>
                                      {m.name}
                                    </p>
                                    {m.signa && <p className={`text-[10px] ${t.textMuted}`}>{m.signa}</p>}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* 2. Minuman & Suplemen */}
                      <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-2.5`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Droplet size={15} className="text-sky-500" />
                            <span className={`text-xs font-bold uppercase tracking-wider ${t.textMain}`}>
                              Minuman &amp; Suplemen
                            </span>
                          </div>
                          <button
                            onClick={() => setPicker({ ymd: selectedDate, session: 'drink' })}
                            className={`p-1 rounded-lg ${t.textAccent} hover:${t.bgAccentSoft}`}
                          >
                            <Plus size={15} />
                          </button>
                        </div>

                        {(!currentDayData.meals?.drink || currentDayData.meals.drink.length === 0) ? (
                          <p className={`text-xs ${t.textMuted} italic py-1`}>
                            Belum ada suplemen atau minuman khusus yang dicatat.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {currentDayData.meals.drink.map((e) => (
                              <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-xl ${t.bgSunken}`}>
                                <span className={`text-xs font-semibold ${t.textMain}`}>{e.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs ${t.textMuted}`}>{Math.round(e.nutrition?.kcal || 0)} kkal</span>
                                  <button onClick={() => removeEntry(selectedDate, 'drink', e.id)} className="p-1 text-red-400">
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Air Minum */}
                      <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-3`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Droplets size={15} className="text-blue-500" />
                            <span className={`text-xs font-bold uppercase tracking-wider ${t.textMain}`}>
                              Asupan Air Minum
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${t.textMain}`}>
                            {currentDayData.water || 0} / {waterGoal} ml
                          </span>
                        </div>

                        <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.round(((currentDayData.water || 0) / waterGoal) * 100))}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => adjustWater(selectedDate, -WATER_STEP_ML)}
                            className={`px-3 py-1.5 rounded-xl border ${t.border} text-xs font-bold ${t.textMuted} hover:${t.bgAccentSoft}`}
                          >
                            -200 ml
                          </button>
                          <button
                            onClick={() => adjustWater(selectedDate, WATER_STEP_ML)}
                            className={`px-3 py-1.5 rounded-xl ${t.bgAccent} text-white text-xs font-bold hover:opacity-90`}
                          >
                            +200 ml
                          </button>
                        </div>
                      </div>

                      {/* 4. Siklus Menstruasi */}
                      <div className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-3`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold uppercase tracking-wider ${t.textMain}`}>
                            Pelacakan Siklus Menstruasi
                          </span>
                          <button
                            onClick={() => saveProfilePatch?.({ settings: { trackCycle: !trackCycle } })}
                            className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${trackCycle ? `${t.bgAccent} text-white border-transparent` : `${t.border} ${t.textMuted}`}`}
                          >
                            {trackCycle ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>

                        {trackCycle ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => toggleMenstruation(selectedDate)}
                              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-xs transition-all ${currentDayData.menstruation ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : `${t.bgSunken} ${t.border} ${t.textMain}`}`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${currentDayData.menstruation ? 'bg-white' : 'bg-rose-500'}`} />
                              {currentDayData.menstruation ? 'Hari Menstruasi (Tercatat)' : 'Tandai Hari Menstruasi'}
                            </button>
                            <p className={`text-[11px] ${t.textMuted} leading-relaxed text-center`}>
                              Penanda pribadi untuk konteks kebutuhan gizi (zat besi, hidrasi &amp; kalori).
                            </p>
                          </div>
                        ) : (
                          <p className={`text-xs ${t.textMuted} leading-relaxed`}>
                            Aktifkan fitur ini jika Anda ingin mencatat hari menstruasi dan mendapatkan konteks nutrisi harian.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>

      {/* Modal Picker Tambah Makanan */}
      <FoodPickerModal
        t={t}
        theme={theme}
        open={!!picker}
        onClose={() => setPicker(null)}
        customFoods={customFoods}
        recipes={recipes}
        domusItems={domusItems}
        favoriteFoods={profile?.favoriteFoods || []}
        onAdd={(entry) => picker && addEntry(picker.ymd, picker.session, entry)}
      />
    </div>
  );
};

export default HistoryTab;
