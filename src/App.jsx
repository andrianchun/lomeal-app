import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, deleteUser } from 'firebase/auth';
import { auth } from './firebase';
import { authLogym } from './firebaseLogym';
import { buildTheme } from './theme';
import { getLocalYMD, getMonthKey } from './data/constants';
import {
  subscribeLomealProfile, saveLomealProfile,
  subscribeMonth, saveDay as saveDayFs,
  subscribeRecipes, saveRecipes,
  subscribeCustomFoods, saveCustomFoods,
  deleteAllUserData,
} from './utils/foodLog';
import { fetchLyfitProfile, extractLyfitDay, subscribeLyfitYear } from './utils/lyfitSync';
import { hcAvailable, hcRequestPermissions, hcReadBurnedCalories, hcWriteNutrition, hcWriteHydration } from './utils/healthConnect';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import useDialog from './hooks/useDialog';

const MEAL_REMINDER_ID = 1001;

import Header from './components/Header';
import BottomNav from './components/BottomNav';
import AuthPage from './pages/AuthPage';
import OnboardingFlow from './pages/OnboardingFlow';
import DashboardTab from './pages/DashboardTab';
import LogTab from './pages/LogTab';
import HistoryTab from './pages/HistoryTab';
import RecipesTab from './pages/RecipesTab';
import FoodDbTab from './pages/FoodDbTab';
import SocialHub from './pages/SocialHub';
import SettingsPage from './pages/SettingsPage';
import NotificationPanel from './components/NotificationPanel';
import { createCommunityPost } from './utils/communityApi';

const AppContent = ({ user, profile, logymUser, onLogout }) => {
  const settings = profile?.settings || {};
  const theme = settings.theme || 'dark';
  const t = buildTheme(theme);
  const location = useLocation();
  const navigate = useNavigate();
  const { dialog, showAlert, showConfirm } = useDialog(theme === 'dark');

  const [socialOpen, setSocialOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const todayYmd = getLocalYMD();
  const path = location.pathname.substring(1) || 'dashboard';
  const setActiveTab = (tabId) => navigate(`/${tabId}`);

  useEffect(() => {
    document.body.className = `${t.bgApp} ${t.textMain}`;
  }, [theme, t]);

  const saveProfilePatch = useCallback((patch) => saveLomealProfile(user.uid, patch), [user]);
  const updateSetting = useCallback((key, value) => saveProfilePatch({ settings: { [key]: value } }), [saveProfilePatch]);

  // --- Log harian: subscribe per-bulan, digabung jadi satu daysMap ---
  const [monthsData, setMonthsData] = useState({});
  const unsubsRef = useRef({});
  const ensureMonth = useCallback((monthKey) => {
    if (!user || unsubsRef.current[monthKey]) return;
    unsubsRef.current[monthKey] = subscribeMonth(user.uid, monthKey, (days) => {
      setMonthsData((prev) => ({ ...prev, [monthKey]: days }));
    });
  }, [user]);

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
    await saveDayFs(user.uid, ymd, dayData);
    if (settings.healthConnectEnabled) {
      const totals = Object.values(dayData?.meals || {}).flat().reduce((acc, e) => {
        Object.keys(acc).forEach((k) => { acc[k] += Number(e.nutrition?.[k]) || 0; });
        return acc;
      }, { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 });
      hcWriteNutrition(ymd, totals).catch(() => {});
      if (dayData?.water) hcWriteHydration(ymd, dayData.water).catch(() => {});
    }
  }, [user, settings.healthConnectEnabled]);

  // --- Resep & custom foods ---
  const [recipes, setRecipes] = useState([]);
  const [customFoods, setCustomFoods] = useState([]);
  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeRecipes(user.uid, setRecipes);
    const unsub2 = subscribeCustomFoods(user.uid, setCustomFoods);
    return () => { unsub1(); unsub2(); };
  }, [user]);
  const saveRecipesFn = useCallback((items) => saveRecipes(user.uid, items), [user]);
  const saveCustomFoodsFn = useCallback((items) => saveCustomFoods(user.uid, items), [user]);

  // Share resep ke Social Feed (post type:'recipe') — butuh identitas Logym (lihat firebaseLogym.js).
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
  useEffect(() => {
    if (!logymUser) { setLogymApiKeys([]); setLyfitToday(null); return undefined; }
    fetchLyfitProfile(logymUser.uid).then((p) => setLogymApiKeys(p?.userApiKeys || []));
    const year = new Date().getFullYear();
    const unsub = subscribeLyfitYear(logymUser.uid, year, (yearData) => {
      setLyfitToday(extractLyfitDay(yearData, todayYmd));
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logymUser]);

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
    (async () => {
      try {
        if (settings.reminderEnabled) {
          await LocalNotifications.requestPermissions();
          const [hour, minute] = (settings.reminderTime || '19:00').split(':').map(Number);
          await LocalNotifications.schedule({
            notifications: [{
              id: MEAL_REMINDER_ID,
              title: 'Lomeal',
              body: 'Sudah catat makananmu hari ini belum? 🍽️',
              schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
            }],
          });
        } else {
          await LocalNotifications.cancel({ notifications: [{ id: MEAL_REMINDER_ID }] });
        }
      } catch (e) { console.warn('Gagal atur pengingat:', e); }
    })();
  }, [settings.reminderEnabled, settings.reminderTime]);

  // --- Backup & Restore ---
  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), profile, daysMap, recipes, customFoods };
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
      if (data.recipes) await saveRecipesFn(data.recipes);
      if (data.customFoods) await saveCustomFoodsFn(data.customFoods);
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
    t, theme, user, profile, daysMap, todayYmd,
    saveDay, ensureMonth, saveProfilePatch,
    recipes, customFoods, saveRecipesFn, saveCustomFoodsFn, shareRecipe,
    aiKey: effectiveAiKeys,
    waterGoal: profile?.targets?.waterGoal,
    lyfitToday: dashboardLyfitToday,
    showAlert, showConfirm,
  };

  return (
    <div className={`min-h-screen ${t.bgApp} ${t.textMain}`}>
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
        <Route path="/recipes" element={<RecipesTab {...commonProps} />} />
        <Route path="/fooddb" element={<FoodDbTab {...commonProps} />} />
      </Routes>

      <BottomNav t={t} activeTab={path} setActiveTab={setActiveTab} />

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
          showConfirm={showConfirm}
          exportData={exportData}
          handleImportFile={handleImportFile}
          onToggleHealthConnect={handleToggleHealthConnect}
          healthConnected={!!settings.healthConnectEnabled}
          healthAvailable={healthAvailable}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      {dialog}
    </div>
  );
};

function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null });
  const [profile, setProfile] = useState(undefined); // undefined = belum dicek, null = belum ada profil
  const [logymUser, setLogymUser] = useState(null); // identitas Social Hub (project Logym)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState({ loading: false, user });
      if (!user) setProfile(undefined);
    });
    return unsub;
  }, []);

  // Sesi kedua ke project Logym — diisi otomatis via kredensial Google yang sama
  // saat login (lihat AuthPage.jsx). Kalau user login lewat email/password, ini
  // tetap null (Social Hub akan minta login Google).
  useEffect(() => onAuthStateChanged(authLogym, setLogymUser), []);

  useEffect(() => {
    if (!authState.user) return undefined;
    return subscribeLomealProfile(authState.user.uid, setProfile);
  }, [authState.user]);

  const handleOnboardingComplete = async (profileData) => {
    await saveLomealProfile(authState.user.uid, profileData);
  };

  const isCheckingProfile = !!authState.user && profile === undefined;
  if (authState.loading || isCheckingProfile) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm"
        style={{ background: '#070a08', color: '#fff' }}
      >
        Memuat…
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
        prefill={null}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  const handleLogout = () => {
    signOut(auth);
    if (logymUser) signOut(authLogym);
  };

  return (
    <BrowserRouter>
      <AppContent user={authState.user} profile={profile} logymUser={logymUser} onLogout={handleLogout} />
    </BrowserRouter>
  );
}

export default App;
