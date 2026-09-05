import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Calendar,
  Activity, HeartPulse, Plus, X, Bell, BellOff, Clock, 
  ChefHat, Box, Droplets, Droplet, Pill, Check, Sparkles, AlertCircle, Pencil, Utensils
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import SwipeInput from '../components/SwipeInput';
import PanoramicSlider from '../components/PanoramicSlider';
import { 
  MEAL_SESSIONS, DAY_NAMES_ID, MONTH_NAMES_ID, getLocalYMD, 
  getMonthKey, DEFAULT_SESSION_TIMES, weekStripDates, WATER_STEP_ML 
} from '../data/constants';
import { computeDayTotals, NUTRIENTS, EMPTY_NUTRITION, addNutrition, calcTEF, calcBMR } from '../data/nutrition';
import { extractLyfitDay } from '../utils/lyfitSync';
import { STATUS } from '../theme';
import { URT_DICTIONARY, normalizeUnit, UNIT_OPTIONS, getItemUnitWeight } from '../utils/urtMapping';
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
  const navigate = useNavigate();
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

  // Drag State & Gesture Universal untuk Bottom Sheet (Swipe atas/bawah di sembarang lokasi)
  const sheetTouchRef = useRef({
    startY: 0,
    startX: 0,
    startTranslate: 0,
    isDragging: false,
    direction: null,
    startScrollTop: 0,
  });
  const sheetDragStartRef = useRef({ y: 0, translate: 0 });
  const sheetVelocityRef = useRef({ lastY: 0, lastT: 0, v: 0 });
  const [sheetDragY, setSheetDragY] = useState(null);
  const sheetDragYRef = useRef(null);
  const calendarModeRef = useRef(calendarMode);
  const [showMealPrepModalDate, setShowMealPrepModalDate] = useState(null);

  // Keep refs in sync
  useEffect(() => { sheetDragYRef.current = sheetDragY; }, [sheetDragY]);
  useEffect(() => { calendarModeRef.current = calendarMode; }, [calendarMode]);

  const handleTouchStartSheet = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const mode = calendarModeRef.current;
    const maxH = sheetRef.current?.offsetHeight || 500;
    const currentTranslate = mode === 'monthly' ? (maxH - peekHeight) : 0;
    const scrollTop = scrollContainerRef.current ? scrollContainerRef.current.scrollTop : 0;

    sheetTouchRef.current = {
      startY: touch.clientY,
      startX: touch.clientX,
      startTranslate: currentTranslate,
      isDragging: mode === 'monthly',
      direction: null,
      startScrollTop: scrollTop,
    };
    sheetVelocityRef.current = { lastY: touch.clientY, lastT: performance.now(), v: 0 };
    if (mode === 'monthly') {
      setSheetDragY(currentTranslate);
    }
  };

  const handleTouchMoveSheet = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const state = sheetTouchRef.current;
    if (!state.startY) return;

    const deltaY = touch.clientY - state.startY;
    const deltaX = touch.clientX - state.startX;

    if (!state.direction) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        state.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
    }

    if (state.direction === 'horizontal') {
      return;
    }

    if (state.direction === 'vertical') {
      const mode = calendarModeRef.current;
      const isMinimized = mode === 'monthly';
      const currentScrollTop = scrollContainerRef.current ? scrollContainerRef.current.scrollTop : 0;

      if (isMinimized) {
        if (!state.isDragging) {
          state.isDragging = true;
          setSheetDragY(state.startTranslate);
        }
      } else {
        // Weekly mode: mulai drag ke bawah kalau scroll sudah di puncak (toleransi 3px)
        const atTop = state.startScrollTop <= 3 && currentScrollTop <= 3;
        if (atTop && deltaY > 0) {
          if (!state.isDragging) {
            state.isDragging = true;
            state.startY = touch.clientY;
            state.startTranslate = 0;
            setSheetDragY(0);
            // Paksa scroll container ke 0 supaya tidak bouncing
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
          }
        }
      }

      if (state.isDragging) {
        if (e.cancelable) {
          try {
            e.preventDefault();
          } catch (_) {}
        }
        const maxH = sheetRef.current?.offsetHeight || 500;
        const currentDelta = touch.clientY - state.startY;
        const newY = Math.min(maxH - peekHeight, Math.max(0, state.startTranslate + currentDelta));
        setSheetDragY(newY);

        const now = performance.now();
        const { lastY, lastT } = sheetVelocityRef.current;
        const dt = now - lastT;
        if (dt > 0) {
          const instantV = (touch.clientY - lastY) / dt;
          sheetVelocityRef.current = { lastY: touch.clientY, lastT: now, v: sheetVelocityRef.current.v * 0.5 + instantV * 0.5 };
        }
      }
    }
  };

  const handleTouchEndSheet = () => {
    const state = sheetTouchRef.current;
    if (!state.startY) return;

    const mode = calendarModeRef.current;
    const dragY = sheetDragYRef.current;

    if (state.isDragging && dragY !== null) {
      const maxH = sheetRef.current?.offsetHeight || 500;
      const targetTravel = maxH - peekHeight;
      const moved = dragY - state.startTranslate; // positif = ke bawah, negatif = ke atas
      const velocity = sheetVelocityRef.current.v; // px/ms
      const FLICK_VELOCITY = 0.15;

      let nextMode = mode;
      if (mode === 'weekly') {
        if (velocity > FLICK_VELOCITY || moved > 30) {
          nextMode = 'monthly';
        } else {
          nextMode = 'weekly';
        }
      } else if (mode === 'monthly') {
        if (velocity < -FLICK_VELOCITY || moved < -30 || Math.abs(moved) < 8) {
          nextMode = 'weekly';
        } else {
          nextMode = 'monthly';
        }
      }

      if (nextMode !== mode) {
        setCalendarMode(nextMode);
      }
    } else if (mode === 'monthly' && state.direction !== 'horizontal') {
      setCalendarMode('weekly');
    }

    sheetTouchRef.current = { startY: 0, startX: 0, startTranslate: 0, isDragging: false, direction: null, startScrollTop: 0 };
    setSheetDragY(null);
  };

  // Pasang native touch listener dengan { passive: false } pada sheetRef agar preventDefault tidak memicu warning
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const onTouchStart = (e) => handleTouchStartSheet(e);
    const onTouchMove = (e) => handleTouchMoveSheet(e);
    const onTouchEnd = (e) => handleTouchEndSheet(e);

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [peekHeight]);

  // Pointer drag fallback untuk Desktop / Mouse pada drag handle
  const handleSheetPointerDown = (e) => {
    if (e.pointerType === 'touch') return;
    const maxH = sheetRef.current?.offsetHeight || 500;
    const startTranslate = calendarMode === 'monthly' ? (maxH - peekHeight) : 0;
    sheetDragStartRef.current = { y: e.clientY, translate: startTranslate };
    sheetVelocityRef.current = { lastY: e.clientY, lastT: performance.now(), v: 0 };
    setSheetDragY(startTranslate);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSheetPointerMove = (e) => {
    if (e.pointerType === 'touch') return;
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

  const handleSheetPointerUp = (e) => {
    if (e && e.pointerType === 'touch') return;
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
    const recipeName = batch.name || batch.recipeName || 'Resep';
    const grams = batch.gramsPerPortion || (batch.initialPortions ? Math.round((batch.totalGrams || 0) / batch.initialPortions) : 200) || 200;
    const entry = {
      id: `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${recipeName} (1 porsi)`,
      grams: grams,
      baseGrams: grams,
      baseNutrition: batch.perPortion || {},
      nutrition: batch.perPortion || {},
      recipeId: batch.recipeId,
      batchId: batch.id,
      isMealPrep: true,
      planned: true,
      source: 'recipe'
    };
    addEntry(selectedDate, sessionId, entry);
    // Kurangi remaining portions di mealPreps
    if (saveMealPrepsFn && mealPreps) {
      saveMealPrepsFn(mealPreps.map(b => b.id === batch.id ? { ...b, remainingPortions: Math.max(0, b.remainingPortions - 1) } : b));
    }
    if (showToast) showToast(`1 porsi ${recipeName} dijadwalkan.`);
  };

  // Batalkan jadwal makan / meal prep dan kembalikan stok
  const cancelMealEntry = (ymd, sessionId, entryId) => {
    const day = daysMap[ymd];
    if (!day || !day.meals || !day.meals[sessionId]) return;
    const entry = day.meals[sessionId].find(e => e.id === entryId);
    if (!entry) return;

    // Kembalikan 1 porsi ke wadah Meal Prep jika berasal dari batch
    if ((entry.batchId || entry.isMealPrep) && saveMealPrepsFn && mealPreps) {
      saveMealPrepsFn(mealPreps.map(b => {
        if (b.id === entry.batchId || (b.name && entry.name && (entry.name.includes(b.name) || b.name.includes(entry.name)))) {
          const maxP = b.initialPortions || b.totalPortions || 99;
          return { ...b, remainingPortions: Math.min(maxP, (b.remainingPortions || 0) + 1) };
        }
        return b;
      }));
    }

    const newSessionEntries = day.meals[sessionId].filter(e => e.id !== entryId);
    const newMeals = { ...day.meals, [sessionId]: newSessionEntries };
    patchDay(ymd, { meals: newMeals });
    if (showToast) showToast('Rencana makan dibatalkan & stok dikembalikan.');
  };

  // Single Source of Truth untuk kalkulasi Target Harian (Dinamis dengan Logym jika terhubung)
  const getEffectiveDayTarget = useCallback((ymd, dayData) => {
    const isToday = ymd === todayStr;
    const isFuture = ymd > todayStr;
    const baseTargets = (isToday || isFuture ? profile?.targets : (dayData?.targetSnapshot || profile?.targets)) || {};
    const baseTdee = baseTargets?.tdee || baseTargets?.kcal || 0;
    const kcalDiff = (baseTargets?.kcal || 0) - baseTdee;

    const lyfitDay = extractLyfitDay(lyfitYearData, ymd) || (isToday ? lyfitToday : null);
    const totals = computeDayTotals(dayData || {}, !isFuture);
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

  // Helper Dots Status Kepatuhan Kalori (Tercatat vs Direncanakan)
  const getDayDot = (ymd) => {
    const dayData = daysMap[ymd];
    if (!dayData) return null;
    const isFuture = ymd > todayStr;
    const eatenTotals = computeDayTotals(dayData, !isFuture);
    const dayTargets = getEffectiveDayTarget(ymd, dayData);

    if (isFuture) {
      const hasPlanned = Object.values(dayData.meals || {}).some(arr => (arr || []).length > 0);
      return hasPlanned ? { bg: 'bg-amber-500', hex: '#f59e0b' } : null;
    }

    if (!eatenTotals.kcal) return null;
    const ratio = eatenTotals.kcal / (dayTargets.kcal || 2000);
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
  const currentDayTotals = useMemo(() => {
    return computeDayTotals(currentDayData, selectedDate <= todayStr);
  }, [currentDayData, selectedDate, todayStr]);
  const currentDayTargets = getEffectiveDayTarget(selectedDate, currentDayData);
  const isFutureDate = selectedDate > todayStr;
  const activeSessions = useMemo(() => {
    return Object.keys(currentDayData.meals || {}).filter(s => s !== 'drink' && (currentDayData.meals?.[s] || []).length > 0);
  }, [currentDayData]);
  const hasMeals = activeSessions.length > 0;

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
                  onDownSwipe={() => setCalendarMode('monthly')}
                  renderPanel={(pos) => {
                    const offsetWeeks = pos === 'prev' ? -1 : pos === 'next' ? 1 : 0;
                    const baseD = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() + offsetWeeks * 7);
                    const panelCells = weekStripDates(baseD, 0, 1);
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
            renderPanel={(pos) => {
              const targetDate = pos === 'prev' ? shiftYmd(selectedDate, -1) : pos === 'next' ? shiftYmd(selectedDate, 1) : selectedDate;
              const isCurrent = pos === 'curr';
              const dayData = daysMap[targetDate] || { meals: {}, water: 0 };
              const dayTargets = getEffectiveDayTarget(targetDate, dayData);
              const isFuture = targetDate > todayStr;

              // Hitung total kalori & makro harian yang SUDAH DIMAKAN (kecuali tanggal masa depan: tampilkan rencana)
              let dayTotals = computeDayTotals(dayData, !isFuture);
              let dayPlannedKcal = 0;

              if (isFuture) {
                // Di masa depan, belum ada yang dimakan: tampilkan akumulasi menu yang direncanakan
                let plannedTotals = { ...EMPTY_NUTRITION };
                Object.values(dayData.meals || {}).forEach(entries => {
                  (entries || []).forEach(e => {
                    if (e.nutrition) {
                      plannedTotals = addNutrition(plannedTotals, e.nutrition);
                    }
                  });
                });
                dayTotals = plannedTotals;
              } else {
                // Untuk hari ini / masa lalu: hitung kalori rencana yang belum dimakan untuk info tambahan
                Object.values(dayData.meals || {}).forEach(entries => {
                  (entries || []).forEach(e => {
                    const isMealPrep = e.isMealPrep || e.source === 'recipe' || e.planned;
                    const eaten = e.isEaten !== undefined ? Boolean(e.isEaten) : !isMealPrep;
                    if (!eaten && e.nutrition?.kcal) {
                      dayPlannedKcal += Number(e.nutrition.kcal);
                    }
                  });
                });
              }

              const sessionOrder = ['breakfast', 'snack', 'lunch', 'snack2', 'dinner', 'snack3'];
              const dayMealKeys = Object.keys(dayData.meals || {}).filter(s => s !== 'drink' && (dayData.meals?.[s] || []).length > 0);
              dayMealKeys.sort((a, b) => {
                const idxA = sessionOrder.indexOf(a);
                const idxB = sessionOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
              });
              const dayActiveSessions = dayMealKeys.map(id => {
                const base = MEAL_SESSIONS.find(s => s.id === id);
                const label = dayData.sessionLabels?.[id] || profile?.settings?.sessionLabels?.[id] || base?.label || `Camilan ${id.replace('snack', '')}`;
                return base ? { ...base, label } : { id, label, emoji: '🍽️' };
              });
              const dayHasMeals = dayActiveSessions.length > 0;

              return (
                <div 
                  ref={isCurrent ? scrollContainerRef : null}
                  className="flex flex-col h-full overflow-y-auto hide-scrollbar pb-28 pt-1 overscroll-contain"
                >
                  {/* KONTEN TAMPILAN: MODE MAKAN / RIWAYAT */}
                  {!showHealthMode && (
                    <div className="pt-2 space-y-3">
                      {!dayHasMeals ? (
                        /* State Kosong Bersih */
                        <div className={`p-6 rounded-2xl border ${t.border} ${t.bgCard} text-center space-y-1`}>
                          <p className={`text-xs font-medium ${t.textMuted}`}>
                            {isFuture ? 'Belum ada menu yang direncanakan.' : 'Belum ada riwayat makan yang dicatat.'}
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Ringkasan Kalori & 3 Kartu PKL (Hanya tampil jika ada menu) */}
                          <div className={`p-3.5 rounded-2xl border ${t.border} ${t.bgCard} space-y-2.5`}>
                            <div className="flex items-baseline justify-between">
                              <div className="flex items-baseline gap-1.5">
                                <span className={`text-2xl font-black ${t.textMain} tabular-nums tracking-tight`}>
                                  {Math.round(dayTotals.kcal)}
                                </span>
                                <span className={`text-xs font-semibold ${t.textMuted}`}>
                                  / {Math.round(dayTargets.kcal || 2000)} kkal
                                </span>
                              </div>
                              {dayPlannedKcal > 0 && !isFuture && (
                                <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                                  +{Math.round(dayPlannedKcal)} kkal rencana
                                </span>
                              )}
                            </div>

                            {/* 3 Kotak Mini PKL */}
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { key: 'protein', label: 'PROTEIN', color: 'bg-emerald-500', val: dayTotals.protein, tgt: dayTargets.protein },
                                { key: 'carbs', label: 'KARBO', color: 'bg-amber-400', val: dayTotals.carbs, tgt: dayTargets.carbs },
                                { key: 'fat', label: 'LEMAK', color: 'bg-rose-500', val: dayTotals.fat, tgt: dayTargets.fat }
                              ].map((m) => {
                                const v = Math.round(m.val || 0);
                                const tg = m.tgt ? Math.round(m.tgt) : null;
                                const pct = tg ? Math.min(100, Math.round((v / tg) * 100)) : 0;

                                return (
                                  <div key={m.key} className={`p-2.5 rounded-xl border ${t.border} ${t.bgSunken} flex flex-col justify-between`}>
                                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{m.label}</p>
                                    <p className={`text-sm font-black ${t.textMain} mt-0.5 tabular-nums`}>
                                      {v}<span className="text-[10px] font-semibold text-neutral-400">{tg ? `/${tg}g` : 'g'}</span>
                                    </p>
                                    <div className="w-full h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mt-1.5">
                                      <div className={`h-full rounded-full ${m.color} transition-all duration-300`} style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Sesi Makan yang Aktif */}
                          {dayActiveSessions.map((s) => {
                            const entries = dayData.meals?.[s.id] || [];

                            const isEntryEaten = (e) => {
                              if (isFuture) return false;
                              if (e.isEaten !== undefined) return Boolean(e.isEaten);
                              const isMealPrep = e.isMealPrep || e.source === 'recipe' || e.planned;
                              return !isMealPrep;
                            };

                            const eatenEntries = entries.filter(e => isEntryEaten(e));
                            const plannedEntries = entries.filter(e => !isEntryEaten(e));
                            const eatenKcal = eatenEntries.reduce((sum, e) => sum + (Number(e.nutrition?.kcal) || 0), 0);
                            const plannedKcal = plannedEntries.reduce((sum, e) => sum + (Number(e.nutrition?.kcal) || 0), 0);

                            const displaySessionKcal = isFuture 
                              ? plannedKcal 
                              : (eatenEntries.length > 0 ? eatenKcal : plannedKcal);

                            const sessionStatus = isFuture
                              ? { label: 'Direncanakan', color: 'bg-amber-500/15 text-amber-500 dark:text-amber-400' }
                              : (eatenEntries.length === entries.length
                                ? { label: 'Dikonsumsi', color: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400' }
                                : eatenEntries.length > 0
                                  ? { label: 'Sebagian Dimakan', color: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400' }
                                  : { label: 'Direncanakan', color: 'bg-amber-500/15 text-amber-500 dark:text-amber-400' });

                            return (
                              <div key={s.id} className={`p-4 rounded-2xl border ${t.border} ${t.bgCard} space-y-1.5`}>
                                <div className="flex items-center justify-between pb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">{s.emoji} {s.label}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sessionStatus.color}`}>
                                      {sessionStatus.label}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className={`text-xs font-black ${displaySessionKcal > 0 ? t.textMain : t.textMuted}`}>
                                      {Math.round(displaySessionKcal)} kkal
                                    </span>
                                    {!isFuture && eatenEntries.length > 0 && plannedEntries.length > 0 && (
                                      <span className="text-[10px] text-amber-500 font-medium ml-1.5">
                                        (+{Math.round(plannedKcal)} renc)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="divide-y divide-black/5 dark:divide-white/5 pt-1">
                                  {entries.map((e, idx) => {
                                    const rawUnit = e.unit || (s.id === 'drink' ? 'ml' : 'g');
                                    const unit = normalizeUnit(rawUnit) || (rawUnit === 'ml' ? 'ml' : 'g');
                                    const isGram = unit === 'g' || unit === 'ml';
                                    const unitWeight = getItemUnitWeight(e, unit);
                                    const rawQty = (e.grams || 0) / unitWeight;
                                    const qty = Math.round(rawQty * 100) / 100;
                                    const isPlannedItem = !isEntryEaten(e);

                                    const displayName = (() => {
                                      if (e.name && e.name !== 'Meal Prep' && e.name !== 'Meal Prep (1 porsi)') return e.name;
                                      if (e.batchId) {
                                        const b = mealPreps.find(x => x.id === e.batchId);
                                        if (b?.name) return `${b.name} (1 porsi)`;
                                      }
                                      if (e.recipeId) {
                                        const r = recipes.find(x => x.id === e.recipeId);
                                        if (r?.name) return `${r.name} (1 porsi)`;
                                      }
                                      return e.name || 'Makanan';
                                    })();

                                    return (
                                      <div key={e.id || idx} className={`flex items-center justify-between py-2.5 first:pt-1 last:pb-0 gap-4 ${isPlannedItem && !isFuture ? 'opacity-75' : ''}`}>
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-4">
                                          <p className={`text-xs font-bold ${t.textMain} line-clamp-2 break-words leading-snug`}>
                                            {displayName}
                                          </p>
                                          {(e.isMealPrep || e.source === 'recipe') && (
                                            <ChefHat size={13} className="text-emerald-500 shrink-0" />
                                          )}
                                          {e.source === 'domus' && <Box size={13} className="text-sky-500 shrink-0" />}
                                          {isPlannedItem && !isFuture && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 shrink-0">
                                              Rencana
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 text-right whitespace-nowrap">
                                          <span className="text-xs font-medium text-neutral-400 tabular-nums">
                                            {qty} {unit}
                                          </span>
                                          <span className={`text-xs font-black ${isPlannedItem && !isFuture ? 'text-amber-500/90' : t.textMain} tabular-nums min-w-[54px] text-right`}>
                                            {Math.round(e.nutrition?.kcal || 0)} <span className="text-[10px] font-normal text-neutral-400">kkal</span>
                                          </span>
                                          {isPlannedItem && (
                                            <button
                                              onClick={(ev) => {
                                                ev.stopPropagation();
                                                cancelMealEntry(targetDate, s.id, e.id);
                                              }}
                                              className="p-1 rounded-lg text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-90 transition-all ml-0.5"
                                              title="Batalkan & kembalikan stok"
                                            >
                                              <X size={13} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}

                      {/* Tombol Aksi Utama: Program Diet (Masa Depan) / Catat (Hari ini/Lalu) */}
                      <div className="pt-2">
                        <button
                          onClick={() => {
                            if (isFuture) {
                              navigate('/program');
                            } else {
                              navigate('/log', { state: { selectedDate: targetDate } });
                            }
                          }}
                          className={`w-full py-3.5 rounded-2xl ${t.bgAccent} text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 active:scale-[0.98] transition-transform`}
                        >
                          {isFuture ? <Calendar size={15} /> : <Pencil size={15} />}
                          <span>{isFuture ? 'Atur Program Diet' : 'Edit Riwayat Makan di Tab Catat'}</span>
                        </button>
                      </div>

                      {/* Tombol Gunakan Stok Meal Prep — seperti "Tambah Sesi" di Logym */}
                      {isFuture && mealPreps?.filter(b => b.remainingPortions > 0).length > 0 && (
                        <button
                          onClick={() => setShowMealPrepModalDate(targetDate)}
                          className={`w-full py-3.5 rounded-2xl border-2 border-dashed border-emerald-500/40 text-emerald-500 font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-500/5 active:scale-[0.98] transition-all`}
                        >
                          <ChefHat size={16} />
                          <span>Gunakan Stok Meal Prep</span>
                        </button>
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
                              const isChecked = !!dayData.medChecks?.[m.id];
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => toggleMed(targetDate, m.id)}
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
                        </div>

                        {(!dayData.meals?.drink || dayData.meals.drink.length === 0) ? (
                          <p className={`text-xs ${t.textMuted} italic py-1`}>
                            Belum ada suplemen atau minuman khusus yang dicatat.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {dayData.meals.drink.map((e) => (
                              <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-xl ${t.bgSunken}`}>
                                <span className={`text-xs font-semibold ${t.textMain}`}>{e.name}</span>
                                <span className={`text-xs font-bold ${t.textMain}`}>{Math.round(e.nutrition?.kcal || 0)} kkal</span>
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
                            {dayData.water || 0} / {waterGoal} ml
                          </span>
                        </div>

                        <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.round(((dayData.water || 0) / waterGoal) * 100))}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => adjustWater(targetDate, -WATER_STEP_ML)}
                            className={`px-3 py-1.5 rounded-xl border ${t.border} text-xs font-bold ${t.textMuted} hover:${t.bgAccentSoft}`}
                          >
                            -200 ml
                          </button>
                          <button
                            onClick={() => adjustWater(targetDate, WATER_STEP_ML)}
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
                              onClick={() => toggleMenstruation(targetDate)}
                              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-xs transition-all ${dayData.menstruation ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : `${t.bgSunken} ${t.border} ${t.textMain}`}`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${dayData.menstruation ? 'bg-white' : 'bg-rose-500'}`} />
                              {dayData.menstruation ? 'Hari Menstruasi (Tercatat)' : 'Tandai Hari Menstruasi'}
                            </button>
                            <p className={`text-[11px] ${t.textMuted} leading-relaxed text-center`}>
                              Tandai hari saat periode menstruasi berlangsung untuk estimasi siklus di kalender.
                            </p>
                          </div>
                        ) : (
                          <p className={`text-xs ${t.textMuted} italic py-1`}>
                            Fitur pelacakan siklus menstruasi dinonaktifkan.
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

      {/* MODAL: Gunakan Stok Meal Prep */}
      {showMealPrepModalDate && (() => {
        const availableBatches = mealPreps?.filter(b => b.remainingPortions > 0) || [];
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in overscroll-contain touch-none" onClick={() => setShowMealPrepModalDate(null)}>
            <div
              className={`relative w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 backdrop-blur-xl ${theme === 'dark' ? 'bg-zinc-900/95 border border-emerald-500/20' : 'bg-white/95 border border-emerald-500/15'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-black text-lg ${t.textMain} flex items-center gap-2`}>
                  <ChefHat size={20} className="text-emerald-500" />
                  Stok Meal Prep
                </h3>
                <button onClick={() => setShowMealPrepModalDate(null)} className={`p-1.5 rounded-full bg-black/10 dark:bg-white/10 hover:opacity-80 transition-all`}>
                  <X size={18} className={t.textMain} />
                </button>
              </div>

              <div className="space-y-4 max-h-72 overflow-y-auto overscroll-contain touch-pan-y hide-scrollbar">
                {availableBatches.length === 0 ? (
                  <p className={`text-xs text-center py-4 ${t.textMuted}`}>Tidak ada stok meal prep tersisa.</p>
                ) : (
                  availableBatches.map((batch, bIdx) => (
                    <div key={batch.id}>
                      {bIdx > 0 && <div className={`h-px mb-4 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`} />}
                      <div className="mb-2">
                        <p className={`text-sm font-bold ${t.textMain} leading-snug`}>
                          {batch.name || batch.recipeName || 'Resep'}
                        </p>
                        <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
                          Sisa <span className="font-bold text-emerald-500">{batch.remainingPortions} porsi</span> · {Math.round(batch.perPortion?.kcal || 0)} kkal/porsi
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'breakfast', label: 'Sarapan', icon: '🌅' },
                          { id: 'lunch',     label: 'Siang',   icon: '☀️' },
                          { id: 'dinner',    label: 'Malam',   icon: '🌙' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              useMealPrepForSession(batch, s.id);
                              setShowMealPrepModalDate(null);
                            }}
                            className={`py-2.5 px-2 rounded-2xl text-[11px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-500/15'}`}
                          >
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default HistoryTab;
