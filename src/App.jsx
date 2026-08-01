import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, deleteUser } from 'firebase/auth';
import { auth } from './firebase';
import { buildTheme } from './theme';
import { getLocalYMD, getMonthKey, computeAge, MEAL_SESSIONS, DEFAULT_SESSION_TIMES } from './data/constants';
import {
  subscribeLomealProfile, saveLomealProfile,
  subscribeMonth, saveDay as saveDayFs,
  subscribeRecipes, saveRecipes,
  subscribeMealPreps, saveMealPreps,
  subscribeCustomFoods, saveCustomFoods,
  deleteAllUserData,
} from './utils/foodLog';
import { subscribeDomusItems, subscribeDomusLocations } from './utils/domusSync';
import { fetchLyfitProfile, extractLyfitDay, subscribeLyfitYear, subscribeLyfitProfile } from './utils/lyfitSync';
import {
  pushBiometricsToLogym, pushDailyTotalsToLogym, pushPreferencesToLogym, pushTargetsToLogym, pushNutritionBioToLogym,
} from './utils/biometricSync';
import { hcAvailable, hcRequestPermissions, hcReadBurnedCalories, hcWriteNutrition, hcWriteHydration } from './utils/healthConnect';
import { computeDayTotals, calcTargets } from './data/nutrition';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import useDialog from './hooks/useDialog';
import useToast from './hooks/useToast';

const MEAL_REMINDER_ID = 1001;
const TAB_ORDER = ['dashboard', 'log', 'history', 'program', 'fooddb'];

import Header from './components/Header';
import BottomNav from './components/BottomNav';
import AuthPage from './pages/AuthPage';
import OnboardingFlow from './pages/OnboardingFlow';
import DashboardTab from './pages/DashboardTab';
import LogTab from './pages/LogTab';
import HistoryTab from './pages/HistoryTab';
import ProgramTab from './pages/ProgramTab';
import FoodDbTab from './pages/FoodDbTab';
import SocialHub from './pages/SocialHub';
import SettingsPage from './pages/SettingsPage';
import NotificationPanel from './components/NotificationPanel';
import UpdaterAlert from './components/UpdaterAlert';
import { createCommunityPost } from './utils/communityApi';

const AppContent = ({ user, profile, logymUser, onLogout }) => {
  const settings = profile?.settings || {};
  const theme = settings.theme || 'dark';
  const t = buildTheme(theme);
  const location = useLocation();
  const navigate = useNavigate();
  const { dialog, showAlert, showConfirm } = useDialog(theme === 'dark');
  const { toastPortal, showToast } = useToast(theme === 'dark');

  const [socialOpen, setSocialOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [otaState, setOtaState] = useState({ open: false, force: false, url: '', version: '', notes: '' });
  // __APP_VERSION__ di-inject dari package.json oleh vite (lihat vite.config.js).
  const [currentVer, setCurrentVer] = useState(__APP_VERSION__);

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) CapacitorUpdater.notifyAppReady();

    // SATU jalur cek untuk PWA dan APK: sama-sama baca /ota/version.json.
    // Di web dulu deteksinya nebeng service worker, jadi tidak pernah tahu nomor versi
    // dan tidak bisa dipaksa — sekarang dua-duanya pakai sumber yang sama.
    // Path relatif di web (dev tidak punya /ota -> 404, aman); native butuh URL absolut.
    const otaUrl = isNative ? 'https://lomeal.web.app/ota/version.json' : '/ota/version.json';

    const checkOta = async () => {
      try {
        // __APP_VERSION__ di-inject vite saat build, jadi nilainya ikut di dalam setiap bundle
        // dan SELALU menggambarkan kode yang benar-benar dieksekusi — termasuk kalau Capgo
        // rollback ke bundle bawaan. Sengaja TIDAK pakai CapacitorUpdater.current(): itu cuma
        // melaporkan label yang diberi saat download, yang bisa beda dari isi bundle-nya
        // (mis. jembatan update_0118.zip yang isinya build terbaru) dan bikin unduh ulang sia-sia.
        const installedVer = __APP_VERSION__;
        setCurrentVer(installedVer);

        const res = await fetch(`${otaUrl}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();

          // Sengaja !== bukan >: mem-publish versi lama = rollback, dan itu harus ikut terkirim.
          if (data.ota_version && data.ota_version !== installedVer) {
            const dismissed = localStorage.getItem('lomeal_dismissed_ota');
            if (!data.is_forced && dismissed === data.ota_version) {
              setOtaState(prev => ({
                ...prev,
                open: false,
                force: data.is_forced,
                url: data.ota_url,
                version: data.ota_version,
                notes: data.release_notes
              }));
            } else {
              setOtaState({
                open: true,
                force: data.is_forced,
                url: data.ota_url,
                version: data.ota_version,
                notes: data.release_notes
              });
            }
          } else {
            setOtaState(prev => ({ ...prev, open: false }));
          }
        }
      } catch (err) {
        console.error('Failed to check OTA', err);
      }
    };

    checkOta();

    // Tiga pemicu supaya update muncul sendiri tanpa user refresh/hapus cache:
    // saat dibuka, saat kembali ke foreground, dan tiap 15 menit selama app terbuka
    // (yang terakhir bikin update darurat nyusul user yang lagi pakai app berjam-jam).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkOta();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const poll = setInterval(checkOta, 15 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(poll);
    };
  }, []);

  const [downloadProgress, setDownloadProgress] = useState(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let dlListener;
    CapacitorUpdater.addListener('download', (info) => {
      setDownloadProgress(Math.round(info.percent));
    }).then(l => dlListener = l);
    return () => {
      if (dlListener) dlListener.remove();
    };
  }, []);

  const handleUpdate = async () => {
    localStorage.removeItem('lomeal_dismissed_ota');

    // Web: index.html di-serve NetworkFirst (lihat vite.config.js), jadi reload biasa
    // sudah pasti dapat HTML + chunk baru. Tidak ada yang perlu diunduh manual.
    if (!Capacitor.isNativePlatform()) {
      setDownloadProgress(0);
      const reg = await navigator.serviceWorker?.getRegistration();
      // Suruh SW lama minggir dulu kalau sudah ada penggantinya yang nunggu,
      // supaya reload tidak disajikan aset lama olehnya.
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
      return;
    }

    try {
      // Kartu/modal sengaja TIDAK ditutup: progress bar-nya tampil di situ, karena
      // bundle-nya puluhan MB dan tanpa indikator user ngira tombolnya macet.
      setDownloadProgress(0);
      const bundle = await CapacitorUpdater.download({
        url: otaState.url,
        version: otaState.version,
      });
      await CapacitorUpdater.set(bundle); // destroy JS context — baris setelah ini tidak jalan
    } catch (err) {
      console.error('OTA Update failed:', err);
      setDownloadProgress(null);
      if (otaState.force) {
        showAlert('Gagal mengunduh pembaruan. Periksa koneksi internetmu lalu coba lagi.', { title: 'Update gagal' });
      } else {
        showToast('Gagal mengunduh pembaruan.', 'error');
      }
    }
  };



  // Draft Smart Input AI Lomeal (LogTab) diangkat ke sini (bukan state lokal LogTab) supaya
  // tetap ada kalau user pindah tab lain lalu balik lagi — react-router unmount komponen tab
  // yang tidak aktif, jadi state lokal bakal hilang kalau disimpan di LogTab.
  const [chatText, setChatText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAbortController, setAiAbortController] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiTargetSession, setAiTargetSession] = useState('lunch');

  const todayYmd = getLocalYMD();
  const path = location.pathname.substring(1) || 'dashboard';
  const setActiveTab = (tabId, swipeDir = null) => navigate(`/${tabId}`, { state: { swipeDir } });

  // Swipe kiri/kanan buat pindah tab utama — pola sama kayak App.jsx Logym. Elemen yang gak
  // boleh kesenggol (grafik, modal, dst) ditandai `.no-swipe` atau stopPropagation lokal.
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const isSwipeGuarded = (e) => e.target.closest('input[type="range"]') || e.target.closest('[role="dialog"]') || e.target.closest('.no-swipe');
  const handleSwipeStart = (e) => {
    if (isSwipeGuarded(e)) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleSwipeEnd = (e) => {
    if (isSwipeGuarded(e)) return;
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const idx = TAB_ORDER.indexOf(path);
      if (dx < 0 && idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1], 'left');
      else if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1], 'right');
    }
  };

  useEffect(() => {
    document.body.className = `${t.bgApp} ${t.textMain}`;
  }, [theme, t]);

  const saveProfilePatch = useCallback((patch) => saveLomealProfile(user.uid, patch), [user]);
  const updateSetting = useCallback((key, value) => saveProfilePatch({ settings: { [key]: value } }), [saveProfilePatch]);

  // --- Log harian: subscribe per-bulan, digabung jadi satu daysMap ---
  const [monthsData, setMonthsData] = useState({});
  const unsubsRef = useRef({});
  // ponytail: cap listener bulan aktif ke 4 (LRU) — tanpa ini, user yg scroll histori
  // bertahun-tahun numpuk onSnapshot yang gak pernah dilepas, biaya read Firestore nambah terus.
  const MAX_MONTH_LISTENERS = 4;
  const monthOrderRef = useRef([]);
  const ensureMonth = useCallback((monthKey) => {
    if (!user) return;
    if (unsubsRef.current[monthKey]) {
      monthOrderRef.current = [...monthOrderRef.current.filter((k) => k !== monthKey), monthKey];
      return;
    }
    unsubsRef.current[monthKey] = subscribeMonth(user.uid, monthKey, (days) => {
      setMonthsData((prev) => ({ ...prev, [monthKey]: days }));
    });
    monthOrderRef.current = [...monthOrderRef.current, monthKey];

    const todayMonthKey = getMonthKey(todayYmd);
    while (monthOrderRef.current.length > MAX_MONTH_LISTENERS) {
      const evictIdx = monthOrderRef.current.findIndex((k) => k !== todayMonthKey);
      if (evictIdx === -1) break;
      const [evictKey] = monthOrderRef.current.splice(evictIdx, 1);
      unsubsRef.current[evictKey]?.();
      delete unsubsRef.current[evictKey];
      setMonthsData((prev) => { const next = { ...prev }; delete next[evictKey]; return next; });
    }
  }, [user, todayYmd]);

  useEffect(() => {
    ensureMonth(getMonthKey(todayYmd));
    return () => {
      Object.values(unsubsRef.current).forEach((unsub) => unsub());
      unsubsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const daysMap = useMemo(() => Object.assign({}, ...Object.values(monthsData)), [monthsData]);

  // Setelah tiap simpan hari, ikut tulis ke Health Connect (fire-and-forget) kalau tersambung.
  const saveDay = useCallback(async (ymd, dayData) => {
    // Snapshot target LIVE hari ini nempel ke record hari itu — begitu tanggalnya lewat,
    // gak disentuh lagi efek manapun, otomatis jadi arsip (target beda di masa depan gak
    // mengubah riwayat). Cuma di-refresh selama hari itu masih todayYmd.
    const dataToSave = (ymd === todayYmd && profile?.targets)
      ? { ...dayData, targetSnapshot: profile.targets }
      : dayData;
    // Update lokal SEGERA (optimistic) — daysMap datang dari onSnapshot yang butuh round-trip
    // network untuk kembali. Tanpa ini, dua saveDay() beruntun (mis. tap tambah 2x cepat)
    // sama-sama baca `day` lama dari closure dan yang kedua menimpa balik yang pertama.
    const monthKey = getMonthKey(ymd);
    setMonthsData((prev) => ({ ...prev, [monthKey]: { ...(prev[monthKey] || {}), [ymd]: dataToSave } }));
    try {
      await saveDayFs(user.uid, ymd, dataToSave);
    } catch (e) {
      await showAlert(`Gagal menyimpan perubahan: ${e.message}. Coba lagi.`);
      return;
    }
    if (settings.healthConnectEnabled) {
      const totals = Object.values(dayData?.meals || {}).flat().reduce((acc, e) => {
        Object.keys(acc).forEach((k) => { acc[k] += Number(e.nutrition?.[k]) || 0; });
        return acc;
      }, { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
      hcWriteNutrition(ymd, totals).catch(() => {});
      if (dayData?.water) hcWriteHydration(ymd, dayData.water).catch(() => {});
    }
    // Kalori-dimakan dikirim ke Logym untuk SEMUA hari yang berubah — bukan cuma hari ini.
    // pushDailyTotalsToLogym → lomealSync.today (dashboard Lomeal ringkas di Logym)
    // pushNutritionBioToLogym → bioData.nutritionCalories (grafik bio Logym sinkron sama Lomeal)
    if (logymUser) {
      const mealsCount = Object.values(dayData?.meals || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      const dayTotals = computeDayTotals(dayData);
      if (ymd === todayYmd) {
        pushDailyTotalsToLogym(logymUser.uid, ymd, dayTotals, mealsCount).catch(() => {});
      }
      pushNutritionBioToLogym(logymUser.uid, ymd, dayTotals.kcal).catch(() => {});
    }
  }, [user, settings.healthConnectEnabled, logymUser, todayYmd, profile?.targets, showAlert]);

  // Sinkron SEMUA riwayat Lomeal ke Logym sekaligus (bioData.nutritionCalories)
  // ponytail: 10 per batch paralel, bukan serial — histori 1 tahun bisa 300+ hari,
  // serial-await satu-satu bikin UI freeze menunggu network round-trip berkali-kali.
  const syncAllNutritionToLogym = useCallback(async () => {
    if (!logymUser) return;
    const entries = Object.entries(daysMap).filter(([, d]) => computeDayTotals(d).kcal > 0);
    let synced = 0;
    for (let i = 0; i < entries.length; i += 10) {
      const chunk = entries.slice(i, i + 10);
      await Promise.all(chunk.map(([ymd, dayData]) => pushNutritionBioToLogym(logymUser.uid, ymd, computeDayTotals(dayData).kcal)));
      synced += chunk.length;
    }
    return synced;
  }, [logymUser, daysMap]);

  // --- Resep & custom foods ---
  const [recipes, setRecipes] = useState([]);
  const [mealPreps, setMealPreps] = useState([]);
  const [customFoods, setCustomFoods] = useState([]);

  // --- Domus Inventory ---
  const [domusItems, setDomusItems] = useState([]);
  const [domusLocations, setDomusLocations] = useState([]);

  // Optimistic: update state lokal duluan (sama seperti saveDay) supaya dua aksi beruntun
  // (mis. tambah resep lalu langsung hapus meal-prep) gak saling menimpa lewat closure basi.
  const saveRecipesFn = useCallback(async (items) => {
    setRecipes(items);
    try { await saveRecipes(user.uid, items); } catch (e) { await showAlert(`Gagal menyimpan resep: ${e.message}`); }
  }, [user, showAlert]);
  const saveMealPrepsFn = useCallback(async (items) => {
    setMealPreps(items);
    try { await saveMealPreps(user.uid, items); } catch (e) { await showAlert(`Gagal menyimpan meal-prep: ${e.message}`); }
  }, [user, showAlert]);
  const saveCustomFoodsFn = useCallback(async (items) => {
    setCustomFoods(items);
    try { await saveCustomFoods(user.uid, items); } catch (e) { await showAlert(`Gagal menyimpan custom food: ${e.message}`); }
  }, [user, showAlert]);

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeRecipes(user.uid, setRecipes);
    const unsub2 = subscribeCustomFoods(user.uid, setCustomFoods);
    const unsub3 = subscribeMealPreps(user.uid, setMealPreps);
    const unsub4 = subscribeDomusItems(user.uid, setDomusItems);
    const unsub5 = subscribeDomusLocations(user.uid, setDomusLocations);
    unsubsRef.current.recipes = unsub1;
    unsubsRef.current.customFoods = unsub2;
    unsubsRef.current.mealPreps = unsub3;
    unsubsRef.current.domusItems = unsub4;
    unsubsRef.current.domusLocations = unsub5;
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, [user]);

  // Share resep ke Social Feed (post type:'recipe').
  const shareRecipe = useCallback(async (recipe) => {
    if (!logymUser) throw new Error('Login dengan Google untuk pakai Social Hub');
    await createCommunityPost(logymUser.uid, logymUser.displayName, logymUser.photoURL, {
      type: 'recipe',
      text: `Bagikan resep: ${recipe.name}`,
      recipeName: recipe.name,
      recipeData: recipe,
    });
  }, [logymUser]);

  // --- Sinkronisasi ekosistem Logym: API key cadangan + kartu aktivitas Dashboard ---
  const [logymApiKeys, setLogymApiKeys] = useState([]);
  const [lyfitToday, setLyfitToday] = useState(null);
  const [lyfitYearData, setLyfitYearData] = useState(null);
  useEffect(() => {
    if (!logymUser) { setLogymApiKeys([]); setLyfitToday(null); setLyfitYearData(null); return undefined; }
    fetchLyfitProfile(logymUser.uid).then((p) => setLogymApiKeys(p?.userApiKeys || []));
    const year = new Date().getFullYear();
    const unsub = subscribeLyfitYear(logymUser.uid, year, (yearData) => {
      setLyfitToday(extractLyfitDay(yearData, todayYmd));
      setLyfitYearData(yearData);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logymUser]);

  // Sinkronisasi berat/tinggi terbaru dari histori harian Logym (karena Logym 
  // menyimpan data timbangan/progress ke riwayat harian, bukan profil statisnya).
  useEffect(() => {
    if (!lyfitYearData || !profile?.physical) return;
    let latestWeight = null;
    let latestHeight = null;
    
    // Sort tanggal dari awal tahun ke hari ini
    Object.keys(lyfitYearData).sort().forEach(ymd => {
      const bio = lyfitYearData[ymd]?.bioData;
      if (bio?.weight) latestWeight = Number(bio.weight);
      if (bio?.height) latestHeight = Number(bio.height);
    });
    
    const patch = {};
    if (latestWeight && latestWeight !== profile.physical.weight) patch.weight = latestWeight;
    if (latestHeight && latestHeight !== profile.physical.height) patch.height = latestHeight;
    
    if (Object.keys(patch).length > 0) {
      saveProfilePatch({ physical: { ...profile.physical, ...patch } });
    }
  }, [lyfitYearData, profile?.physical, saveProfilePatch]);

  // --- Sinkron biometrik 2-arah dengan Logym (gender/dob/height/weight) ---
  // Lomeal TIDAK PERNAH sentuh kode Logym — 2 arah dicapai lewat listener
  // terus-menerus (Logym→Lomeal, baca logym_users) + tulis langsung ke
  // logym_users (Lomeal→Logym), lihat utils/biometricSync.js.
  // lastSyncedPhysicalRef mencegah ping-pong: kalau nilai baru == yang barusan
  // disinkron (dari arah mana pun), jangan tulis ulang.
  const lastSyncedPhysicalRef = useRef(null);
  const physicalRef = useRef(profile?.physical);
  physicalRef.current = profile?.physical;

  // Mirror biometrik dari Logym (gender/dob/height/weight) — ARAH DATA doang, delta
  // bulking/cutting (nutritionGoal) sekarang murni milik Lomeal (lihat efek pushTargetsToLogym
  // di bawah) jadi gak perlu lagi dibaca balik/dicek kontradiksinya di sini.
  useEffect(() => {
    if (!logymUser) return undefined;
    return subscribeLyfitProfile(logymUser.uid, (p) => {
      if (!p) return;
      const incoming = {};
      ['gender', 'dob', 'height', 'weight'].forEach((k) => { if (p[k]) incoming[k] = p[k]; });
      if (Object.keys(incoming).length === 0) return;
      const current = physicalRef.current || {};
      const changed = Object.keys(incoming).some((k) => incoming[k] !== current[k]);
      if (!changed) return;
      const merged = { ...current, ...incoming };
      const key = JSON.stringify(merged);
      if (key === lastSyncedPhysicalRef.current) return;
      lastSyncedPhysicalRef.current = key;
      saveProfilePatch({ physical: merged });
    });
  }, [logymUser, saveProfilePatch]);

  useEffect(() => {
    if (!logymUser || !profile?.physical) return;
    const key = JSON.stringify(profile.physical);
    if (key === lastSyncedPhysicalRef.current) return;
    lastSyncedPhysicalRef.current = key;
    pushBiometricsToLogym(logymUser.uid, profile.physical);
  }, [logymUser, profile?.physical]);

  // Sync Preferences ke Logym (Diet Profile, Allergies)
  const lastSyncedPreferencesRef = useRef(null);
  useEffect(() => {
    if (!logymUser) return;
    const prefs = { 
      dietProfile: profile?.dietProfile, 
      allergies: profile?.allergies 
    };
    const key = JSON.stringify(prefs);
    if (key === lastSyncedPreferencesRef.current) return;
    lastSyncedPreferencesRef.current = key;
    pushPreferencesToLogym(logymUser.uid, prefs.dietProfile, prefs.allergies);
  }, [logymUser, profile?.dietProfile, profile?.allergies]);

  // Target hidup — dihitung ulang tiap fisik/dietGoal/dietProfile/pace berubah (dulu cuma
  // dihitung sekali di onboarding lalu dibekukan selamanya). Nutup celah "ganti Diet Profile
  // di Settings gak ngefek ke target kalori", dan ikut update kalau berat ke-sync dari Logym.
  useEffect(() => {
    const physical = profile?.physical;
    if (!physical?.weight || !physical?.height || !physical?.dob || !physical?.gender) return;
    const age = computeAge(physical.dob);
    const newTargets = calcTargets({ 
      ...physical, age, 
      dietGoal: profile?.dietGoal, 
      dietProfile: profile?.dietProfile, 
      pace: profile?.pace, 
      waterGoal: profile?.targets?.waterGoal, 
      customDeltaKcal: profile?.customDeltaKcal,
      customProteinPerKg: profile?.customProteinPerKg,
      medicalHistory: profile?.medicalHistory 
    });
    if (JSON.stringify(newTargets) === JSON.stringify(profile?.targets)) return;
    saveProfilePatch({ targets: newTargets });
  }, [profile?.physical, profile?.dietGoal, profile?.dietProfile, profile?.pace, profile?.customDeltaKcal, profile?.customProteinPerKg, profile?.medicalHistory, profile?.targets?.waterGoal]);

  // Target kalori/makro → Logym, biar kartu "Kalori Dimakan" Logym baca target dari sini
  // langsung (Logym gak lagi punya preset delta cutting/bulking sendiri).
  const lastSyncedTargetsRef = useRef(null);
  useEffect(() => {
    if (!logymUser || !profile?.targets) return;
    const key = JSON.stringify(profile.targets);
    if (key === lastSyncedTargetsRef.current) return;
    lastSyncedTargetsRef.current = key;
    pushTargetsToLogym(logymUser.uid, profile.targets);
  }, [logymUser, profile?.targets]);

  // Kunci AI efektif: milik Lomeal sendiri (prioritas) + cadangan dari Logym.
  // Jangan pernah array kosong (truthy!) — pass null biar guard `!aiKey` di tab lain tetap benar.
  const effectiveAiKeys = useMemo(() => {
    const own = (settings.userApiKeys || []).filter((k) => k && k.trim());
    const combined = [...own, ...logymApiKeys];
    return combined.length > 0 ? combined : null;
  }, [settings.userApiKeys, logymApiKeys]);

  // --- Health Connect ---
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [hcBurnedKcal, setHcBurnedKcal] = useState(null);
  useEffect(() => { hcAvailable().then(setHealthAvailable); }, []);
  useEffect(() => {
    if (!settings.healthConnectEnabled) { setHcBurnedKcal(null); return; }
    hcReadBurnedCalories(todayYmd).then(setHcBurnedKcal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.healthConnectEnabled, todayYmd]);
  const handleToggleHealthConnect = async () => {
    if (settings.healthConnectEnabled) { updateSetting('healthConnectEnabled', false); return; }
    try {
      await hcRequestPermissions();
      updateSetting('healthConnectEnabled', true);
    } catch (e) {
      await showAlert('Gagal menyambungkan Health Connect: ' + e.message);
    }
  };
  // Dashboard: pakai data Logym kalau ada; kalau tidak, jatuh ke Health Connect sebagai cadangan.
  const dashboardLyfitToday = lyfitToday || (hcBurnedKcal ? { burnedKcal: hcBurnedKcal, workoutCount: 0 } : null);

  // --- Pengingat Catat Makan (LocalNotifications, cuma aktif di APK Android/iOS) ---
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    let listener = null;
    LocalNotifications.addListener('localNotificationActionPerformed', () => {
      navigate('/log');
    }).then(l => listener = l);

    (async () => {
      try {
        await LocalNotifications.requestPermissions();
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel({ notifications: pending.notifications });
        }
        
        const notifs = [];
        let notifId = 2000;
        
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const ymd = getLocalYMD(d);
          const dayData = daysMap[ymd] || {};
          
          MEAL_SESSIONS.forEach(s => {
            if (s.id === 'drink') return;
            const reminderEnabled = dayData.reminders?.[s.id] ?? (settings.reminderEnabled ?? false);
            if (!reminderEnabled) return;
            
            const timeStr = dayData.sessionTimes?.[s.id] || settings.defaultSessionTimes?.[s.id] || DEFAULT_SESSION_TIMES[s.id] || '12:00';
            const [hour, minute] = timeStr.split(':').map(Number);
            const targetTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
            
            if (targetTime.getTime() > Date.now()) {
              notifs.push({
                id: notifId++,
                title: 'Lomeal',
                body: `Waktunya ${s.label.toLowerCase()}! Jangan lupa dicatat ya 🍽️`,
                schedule: { at: targetTime, allowWhileIdle: true },
              });
            }
          });
        }
        
        if (notifs.length > 0) {
          await LocalNotifications.schedule({ notifications: notifs.slice(0, 60) });
        }
      } catch (e) { console.warn('Gagal atur pengingat:', e); }
    })();
    
    return () => {
      if (listener) listener.remove();
    }
  }, [settings.reminderEnabled, settings.defaultSessionTimes, daysMap, navigate]);

  // --- Backup & Restore ---
  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), profile, daysMap, recipes, customFoods, mealPreps };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lomeal-backup-${todayYmd}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!(await showConfirm('Ini akan menimpa profil, resep, dan bahan custom saat ini dengan isi file backup. Lanjutkan?', { danger: true }))) return;
      if (data.profile) await saveProfilePatch(data.profile);
      if (data.recipes) await saveRecipes(user.uid, data.recipes);
      if (data.mealPreps) await saveMealPreps(user.uid, data.mealPreps);
      if (data.customFoods) await saveCustomFoods(user.uid, data.customFoods);
      if (data.daysMap) {
        for (const [ymd, dayData] of Object.entries(data.daysMap)) {
          await saveDayFs(user.uid, ymd, dayData);
        }
      }
      await showAlert('Backup berhasil dipulihkan.');
    } catch (err) {
      await showAlert('Gagal membaca file backup: ' + err.message);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAllUserData(user.uid);
      await deleteUser(auth.currentUser);
    } catch (err) {
      await showAlert('Gagal menghapus akun: ' + err.message + ' — coba logout & login ulang lalu ulangi (Firebase butuh sesi login baru untuk aksi sensitif).');
    }
  };

  const commonProps = {
    t, theme, user, logymUser, profile, daysMap, todayYmd,
    saveDay, ensureMonth, saveProfilePatch,
    recipes, saveRecipesFn,
    mealPreps, saveMealPrepsFn,
    customFoods, saveCustomFoodsFn,
    domusItems, domusLocations,
    shareRecipe,
    aiKey: effectiveAiKeys,
    waterGoal: profile?.targets?.waterGoal,
    lyfitToday: dashboardLyfitToday,
    lyfitYearData,
    showAlert, showConfirm, showToast,
    chatText, setChatText, aiBusy, setAiBusy, aiAbortController, setAiAbortController, aiResult, setAiResult, aiTargetSession, setAiTargetSession,
  };

  return (
    <div className={`min-h-screen ${t.bgApp} ${t.textMain}`} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <Header
        t={t}
        theme={theme}
        isOffline={false}
        logymUser={logymUser}
        onOpenSocial={() => setSocialOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardTab {...commonProps} />} />
        <Route path="/log" element={<LogTab {...commonProps} />} />
        <Route path="/history" element={<HistoryTab {...commonProps} />} />
        <Route path="/program" element={<ProgramTab {...commonProps} />} />
        <Route path="/fooddb" element={<FoodDbTab {...commonProps} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      <BottomNav t={t} activeTab={path} setActiveTab={setActiveTab} />

      {/* Overlays / Modals */}
      <UpdaterAlert
        open={otaState.open}
        force={otaState.force}
        releaseNotes={otaState.notes}
        theme={t}
        currentVersion={currentVer}
        newVersion={otaState.version}
        progress={downloadProgress}
        onUpdate={handleUpdate}
        onClose={() => {
          localStorage.setItem('lomeal_dismissed_ota', otaState.version);
          setOtaState(prev => ({ ...prev, open: false }));
        }}
      />

      {socialOpen && (
        <SocialHub
          t={t}
          theme={theme}
          logymUser={logymUser}
          profile={profile}
          daysMap={daysMap}
          saveProfilePatch={saveProfilePatch}
          onClose={() => setSocialOpen(false)}
          onLogout={onLogout}
          showAlert={showAlert}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}

      {notificationsOpen && logymUser && (
        <NotificationPanel
          t={t}
          isDark={theme === 'dark'}
          user={logymUser}
          onClose={() => setNotificationsOpen(false)}
          onNotifClick={() => setNotificationsOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPage
          t={t}
          theme={theme}
          settings={settings}
          updateSetting={updateSetting}
          logymUser={logymUser}
          logymApiKeys={logymApiKeys}
          onClose={() => setSettingsOpen(false)}
          onLogout={onLogout}
          showAlert={showAlert}
          showToast={showToast}
          showConfirm={showConfirm}
          otaAvailable={!!otaState.version && otaState.version !== currentVer}
          otaState={otaState}
          currentVer={currentVer}
          onUpdateApp={handleUpdate}
          downloadProgress={downloadProgress}
          exportData={exportData}
          handleImportFile={handleImportFile}
          onToggleHealthConnect={handleToggleHealthConnect}
          healthConnected={!!settings.healthConnectEnabled}
          healthAvailable={healthAvailable}
          onDeleteAccount={handleDeleteAccount}
          syncAllNutritionToLogym={syncAllNutritionToLogym}
          lomealUser={user}
        />
      )}

      {dialog}
      {toastPortal}
    </div>
  );
};

function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null });
  const [profile, setProfile] = useState(undefined); // undefined = belum dicek, null = belum ada profil
  // Lomeal & Logym sekarang 1 project Firebase (hexa-life) = 1 identitas Auth yang sama —
  // gak ada lagi "logymUser" terpisah yang perlu dijembatani (dulu authLogym + bridgeToLogym,
  // 2 project beda). Kode yang butuh identitas Social Hub tinggal pakai authState.user langsung.

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState({ loading: false, user });
      if (!user) setProfile(undefined);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authState.user) return undefined;
    return subscribeLomealProfile(authState.user.uid, setProfile);
  }, [authState.user]);

  // Kalau snapshot server nggak kunjung datang (jaringan putus abis login), jangan
  // nyangkut di "Memuat…" selamanya — kasih tombol coba lagi setelah 10 detik.
  const [profileStuck, setProfileStuck] = useState(false);
  useEffect(() => {
    setProfileStuck(false);
    if (!authState.user || profile !== undefined) return undefined;
    const timer = setTimeout(() => setProfileStuck(true), 10000);
    return () => clearTimeout(timer);
  }, [authState.user, profile]);

  const handleOnboardingComplete = async (profileData) => {
    await saveLomealProfile(authState.user.uid, profileData);
  };

  const isCheckingProfile = !!authState.user && profile === undefined;
  if (authState.loading || isCheckingProfile) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm px-6 text-center"
        style={{ background: '#070a08', color: '#fff' }}
      >
        {profileStuck ? (
          <>
            <p>Gagal memuat data. Periksa koneksi internet kamu.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-emerald-500 font-bold active:scale-95 transition-all"
            >
              Coba Lagi
            </button>
          </>
        ) : (
          <img src="/logo-dark.png" alt="LOMEAL Logo" className="w-40 h-40 object-contain animate-pulse drop-shadow-2xl" />
        )}
      </div>
    );
  }

  const darkTheme = buildTheme('dark');

  if (!authState.user) {
    return <AuthPage t={darkTheme} theme="dark" soundEnabled={false} onLogin={() => {}} />;
  }

  if (!profile?.onboardingCompleted) {
    return (
      <OnboardingFlow
        t={darkTheme}
        theme="dark"
        logymUser={authState.user}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <BrowserRouter>
      <AppContent user={authState.user} profile={profile} logymUser={authState.user} onLogout={handleLogout} />
    </BrowserRouter>
  );
}

export default App;
