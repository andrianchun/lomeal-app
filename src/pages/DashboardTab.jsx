import React, { useMemo, useState } from 'react';
import { Flame, Activity, AlertTriangle, Pencil, Check, X, Settings, ChevronUp, ChevronDown, Scale } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import RingChart from '../components/RingChart';
import NutritionChart from '../components/NutritionChart';
import TargetSettingsModal from '../components/TargetSettingsModal';
import BiometricSettingsModal from '../components/BiometricSettingsModal';
import { NUTRIENTS, DIET_PROFILES, computeDayTotals, getSmartWarnings, getEnergyBalance, MINIMUM_TARGETS } from '../data/nutrition';
import { STATUS, statusFor, MACRO_COLORS } from '../theme';
import { getLocalYMD } from '../data/constants';
import { pushActivityOverrideToLogym } from '../utils/biometricSync';
import SwipeInput from '../components/SwipeInput';

/**
 * TAB 1: DASHBOARD — Pusat Pantau Imersif (Fase 5 blueprint).
 * Murni panel pemantauan; tidak ada aksi input/edit di sini.
 */
const DashboardTab = ({ t, theme, user, logymUser, profile, daysMap, lyfitToday, lyfitYearData, saveProfilePatch, todayYmd = getLocalYMD() }) => {
  const targets = profile?.targets || {};
  const dietProfile = profile?.dietProfile;

  // State accordion untuk Tren Kalori
  const [isChartExpanded, setIsChartExpanded] = useState(() => {
      try {
          const saved = localStorage.getItem('lomeal_chart_expanded');
          if (saved !== null) return JSON.parse(saved);
      } catch(e) {}
      return false;
  });

  const [showWarnings, setShowWarnings] = useState(false);
  const [selectedNutrientForBreakdown, setSelectedNutrientForBreakdown] = useState(null);
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);

  // Chip profil makanan di header
  const dietMeta = DIET_PROFILES.find(d => d.id === dietProfile) || null;
  const physicalWeight = profile?.physical?.weight || 0;
  const proteinPerKg = physicalWeight > 0 ? ((targets.protein || 0) / physicalWeight).toFixed(1) : null;
  const tdee = targets.tdee || targets.kcal || 0;
  const kcalDiff = (targets.kcal || 0) - tdee;
  let programLabel = '⚖️ Maintenance';
  let programColor = 'border-gray-500/30 bg-gray-500/10 text-gray-500';
  if (kcalDiff <= -50) {
    programLabel = `✂️ Cutting ${Math.round(kcalDiff)} kkal`;
    programColor = 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500';
  } else if (kcalDiff >= 50) {
    programLabel = `🥩 Bulking +${Math.round(kcalDiff)} kkal`;
    programColor = 'border-blue-500/30 bg-blue-500/10 text-blue-500';
  }

  const today = daysMap[todayYmd];
  const totals = useMemo(() => computeDayTotals(today), [today]);
  const bmrFloor = targets?.bmr || 0;
  const manualBurn = profile?.settings?.manualBurnKcal || 0;
  // FIX SINKRONISASI: Jika ada Logym, percaya 100% pada data dari Logym (karena Logym 
  // sudah hitung BMR dan lantai minimumnya sendiri). Jika tidak, pakai manualBurn atau bmrFloor.
  const burnedTotal = logymUser ? (lyfitToday?.burnedKcal || bmrFloor) : Math.max(bmrFloor, manualBurn);

  // Kalori Dimakan selalu ditarik dari "Tab Catat" (totals.kcal dari rekam makanan lokal Lomeal).
  const displayKcal = totals.kcal;

  // FIX: Logym activityCalories = BMR + langkah + workout = total bakar NYATA hari ini.
  // Formula lama salah: allowance = targets.kcal + burnedBonus (double-counting!).
  // Formula baru: allowance = burn_aktual + program_delta
  //   Maintenance: allowance = burnedBonus + 0          → sisa = burnedBonus - dimakan
  //   Cutting:     allowance = burnedBonus - defisit    → sisa lebih kecil
  //   Bulking:     allowance = burnedBonus + surplus     → sisa lebih besar
  // Kalau tidak ada data Logym, fallback ke targets.kcal (behavior lama).
  const baseTdee = targets.tdee || targets.kcal || 0;
  const programDelta = (targets.kcal || 0) - baseTdee; // 0=maintenance, neg=cut, pos=bulk
  const allowance = burnedTotal > 0
    ? Math.max(0, burnedTotal + programDelta)
    : (targets.kcal || 0);

  const remaining = Math.round(allowance - displayKcal);
  const ringProgress = allowance > 0 ? Math.min(1, displayKcal / allowance) : 0;
  const balance = getEnergyBalance(displayKcal, targets.tdee || targets.kcal || 0, burnedTotal);
  const isBulking = programDelta > 0;
  let ringColor;
  let remainingText;
  
  if (isBulking) {
    if (remaining < 0) {
      ringColor = STATUS.ok.hex;
      remainingText = 'kkal lebih';
    } else if (remaining === 0) {
      ringColor = STATUS.ok.hex;
      remainingText = 'pas target';
    } else if (ringProgress >= 0.85) {
      ringColor = STATUS.warn.hex;
      remainingText = 'kkal lagi';
    } else {
      ringColor = STATUS.danger.hex;
      remainingText = 'kkal lagi';
    }
  } else {
    if (remaining < 0) {
      ringColor = STATUS.danger.hex;
      remainingText = 'kkal lebih';
    } else if (remaining === 0) {
      ringColor = STATUS.ok.hex;
      remainingText = 'pas target';
    } else if (ringProgress >= 0.85) {
      ringColor = STATUS.warn.hex;
      remainingText = 'kkal tersisa';
    } else {
      ringColor = STATUS.ok.hex;
      remainingText = 'kkal tersisa';
    }
  }
  const warnings = useMemo(() => getSmartWarnings(totals, targets, dietProfile), [totals, targets, dietProfile]);



  const microChips = NUTRIENTS.filter(n => !n.macro && (!n.conditional || dietProfile === 'low_purine'));

  const MacroBar = ({ mkey }) => {
    const target = targets[mkey] || 1;
    const value = totals[mkey] || 0;
    const pct = Math.min(100, (value / target) * 100);
    const mc = MACRO_COLORS[mkey];
    return (
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className={`caption ${t.textMuted}`}>{mc.label}</span>
            <div className="flex items-center gap-2">
              <span className="caption font-black bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded" style={{ color: mc.hex }}>{Math.round(pct)}% AKG</span>
              <span className={`caption ${t.textMain}`}>{Math.round(value)}<span className={t.textMuted}>/{target}g</span></span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${t.bgSunken}`}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: mc.hex }} />
          </div>
        </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-4">
      {/* ===== HEADER: SAPAAN ===== */}
      {/* Nama pakai identitas Logym (logymUser) dulu — itu identitas bersama kedua app;
          jatuh ke nama akun Lomeal sendiri cuma kalau belum connect ke Logym. */}
      <div className="anim-rise">
        <h1 className="h1">
          <span className={t.textMain}>Halo, </span>
          <span className={`bg-gradient-to-r ${t.gradientText} bg-clip-text text-transparent`}>{logymUser?.displayName || user?.displayName || 'Sobat'}</span>
        </h1>
        <p className={`body-md ${t.textMuted} mt-0.5`}>{new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        {dietMeta && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto hide-scrollbar">
            <span className={`shrink-0 px-2.5 py-1 rounded-full caption font-bold border ${t.border} ${t.bgCardSoft} ${t.textMuted}`}>
              {dietMeta.emoji} {dietMeta.label} {proteinPerKg ? `${proteinPerKg}g/kgBB` : ''}
            </span>
            <span className={`shrink-0 px-2.5 py-1 rounded-full caption font-bold border ${programColor}`}>
              {programLabel}
            </span>
          </div>
        )}
      </div>

      {/* ===== AREA ATAS: HERO WIDGET ===== */}
      <div id="lomeal-main-card" className="relative anim-rise -mt-1">
        {/* Latar kartu (kaca blur) — mulai agak turun, sisain celah di atas buat kepala coach */}
        <div className={`absolute inset-x-0 top-5 bottom-0 rounded-3xl border ${t.border} ${t.bgCard} ${t.glow} z-0`} />

        {/* Coach: di ATAS latar kartu (gak keblur kaca) — ring di layer konten (z-20) yang nutupin
            sebagian kalau overlap, pola sama kayak ring SCORE Komposisi Tubuh Logym. Digeser dikit ke kiri (right-2) agar tidak menutupi tombol biometrik */}
        <div
          className="absolute left-[-1rem] -top-6 w-72 h-[22rem] z-10 pointer-events-none overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, black 70%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 95%)',
          }}
        >
          <img src="/bg-dashboard.png" alt="" className={`w-full h-full object-cover object-top origin-top transition-transform duration-500 ease-out ${isChartExpanded ? 'scale-[1.45]' : 'scale-[1.25]'}`} />
        </div>

        <div className="relative z-20 p-5">
          <div className="absolute top-5 right-5 z-30 flex items-center gap-2">
            <button onClick={() => setShowTargetSettings(true)} className={`p-2 rounded-full bg-green-500/10 dark:bg-green-500/20 backdrop-blur-md shadow-sm ${t.textMuted} hover:${t.textMain} border ${t.border} transition-all`} aria-label="Target & preferensi">
              <Settings size={15} />
            </button>
            <button onClick={() => setShowBiometricModal(true)} className={`p-2 rounded-full bg-green-500/10 dark:bg-green-500/20 backdrop-blur-md shadow-sm ${t.textMuted} hover:${t.textMain} border ${t.border} transition-all`} aria-label="Profil Biometrik">
              <Pencil size={15} />
            </button>
          </div>

          <div className="flex flex-col items-end gap-4 mt-10">
            <RingChart size={148} stroke={12} progress={ringProgress} color={ringColor} glass>
              <span className={`text-3xl font-black tabular-nums ${t.textMain}`}>{Math.abs(remaining).toLocaleString('id-ID')}</span>
              <span className={`caption ${t.textMuted}`}>{remainingText}</span>
            </RingChart>

            {/* Kalori Dimakan & Dibakar Highlight */}
            <div className={`py-3.5 px-5 -mx-5 w-[calc(100%+2.5rem)] ${t.bgBox} backdrop-blur-md border-y border-x-0 ${t.border}`}>
              <div className="flex justify-between w-full">
                {/* Kiri: Kalori Dimakan */}
                <div className="flex flex-col items-start w-[48%]">
                  <p className={`h3 ${t.textMuted}`}>Kalori Dimakan</p>
                  <p className={`text-xl font-black tabular-nums ${t.textAccent} mt-0.5`}>{Math.round(displayKcal).toLocaleString('id-ID')}</p>
                  <div className={`caption ${t.textMuted} mt-0.5 flex items-center gap-1.5`}>
                    <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-500 text-[8px] uppercase font-bold tracking-wider">LOMEAL</span>
                    {today?.meals ? Object.values(today.meals).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) : 0} konsumsi
                  </div>
                </div>

                {/* Garis Pemisah Tengah */}
                <div className="w-[1px] bg-black/5 dark:bg-white/5 my-1"></div>

                {/* Kanan: Kalori Dibakar */}
                <div className="flex flex-col items-end w-[48%] text-right">
                  <p className={`h3 ${t.textMuted}`}>Kalori Dibakar</p>
                  <p className="text-xl font-black tabular-nums text-sky-400 mt-0.5">{Number(burnedTotal).toLocaleString('id-ID')}</p>
                  {logymUser ? (
                    <div className={`caption ${t.textMuted} mt-0.5 flex items-center justify-end gap-1.5`}>
                      <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>
                      {lyfitToday?.workoutCount || 0} latihan
                    </div>
                  ) : (
                    <p className={`caption ${t.textMuted} mt-0.5`}>Logym: {lyfitToday?.workoutCount || 0} latihan</p>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full space-y-3">
              <MacroBar mkey="protein" />
              <MacroBar mkey="carbs" />
              <MacroBar mkey="fat" />
            </div>
          </div>

          <div className="flex justify-between items-center mt-4 relative z-20 w-full px-2">
             <div className="w-8"></div> {/* Spacer untuk keseimbangan */}
             <button
                 onClick={() => {
                     const isExpanding = !isChartExpanded;
                     setIsChartExpanded(isExpanding);
                     try { localStorage.setItem('lomeal_chart_expanded', JSON.stringify(isExpanding)); } catch(e) {}
                     setTimeout(() => {
                         if (isExpanding) {
                             const el = document.getElementById('nutrisi-subcard');
                             if (el) {
                                 const bottom = el.getBoundingClientRect().bottom;
                                 if (bottom > window.innerHeight - 100) {
                                     window.scrollTo({ top: bottom + window.scrollY - window.innerHeight + 120, behavior: 'smooth' });
                                 }
                             }
                         } else {
                             const topEl = document.getElementById('lomeal-main-card');
                             if (topEl) {
                                 window.scrollTo({ top: topEl.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
                             }
                         }
                     }, 320);
                 }}
                 className={`no-swipe p-2 rounded-full bg-green-500/10 dark:bg-green-500/20 backdrop-blur-md shadow-sm ${t.textMuted} hover:${t.textMain} border ${t.border} transition-all`}
             >
                 {isChartExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
             </button>
             <div className="w-8 flex justify-end relative">
               {warnings.length > 0 && (
                 <button onClick={() => { setShowWarnings(true); setSelectedNutrientForBreakdown(null); }} className="relative p-2 text-amber-500 bg-amber-500/10 dark:bg-amber-500/20 rounded-full hover:bg-amber-500/20 transition-all">
                   <AlertTriangle size={16} />
                 </button>
               )}
             </div>
          </div>
        </div>

        {/* Subcard Accordion Nutrisi */}
        <div id="nutrisi-subcard" className={`grid relative z-10 transition-all duration-300 ease-in-out ${isChartExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className={`rounded-b-3xl border border-t-0 ${t.border} bg-white dark:bg-zinc-900 relative -mt-5 pt-10 pb-6 px-5`}>
                <div className="flex flex-col gap-3.5">
                  {(() => {
                    const activeMicros = microChips.filter(n => targets[n.key] && (totals[n.key] || 0) > 0);
                    
                    if (activeMicros.length === 0) {
                      return <p className={`caption ${t.textMuted} text-center py-2`}>Belum ada data nutrisi mikro yang tercatat hari ini.</p>;
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
                               <span className={`caption font-black ${s.text} bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded`}>{Math.round(pct)}% AKG</span>
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
        </div>
      </div>

      {/* ===== KARTU TREN KALORI ===== */}
      <div className="relative flex flex-col w-full min-w-0 anim-rise mt-6" style={{ animationDelay: '90ms' }}>
         <div className="relative z-20">
             {/* Latar Belakang Kartu Utama */}
             <div className={`absolute inset-x-0 top-0 bottom-0 rounded-2xl border ${t.border} ${theme === 'dark' ? 'bg-black/40 backdrop-blur-md' : 'bg-white/45 backdrop-blur-md'} shadow-sm z-0`} />

             {/* Coach Pop-out (seperti Logym Aktivitas Harian) */}
             <div 
               className="absolute right-[-1rem] -top-16 bottom-0 w-[65%] z-10 pointer-events-none overflow-hidden"
               style={{
                 maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
                 WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)'
               }}
             >
                 <img src="/bg-lomeal-coach.webp" alt="" className={`w-full h-full object-cover object-top origin-top scale-[1.3] opacity-90`} />
             </div>

             {/* Konten Kartu */}
             <div className="relative z-20">
             <div className="p-4 flex items-center justify-between">
                 <div className="flex flex-col">
                     <span className={`h2 ${t.textMain}`}>Tren Kalori</span>
                     <span className={`caption ${t.textMuted}`}>Pantau defisit & surplus kalori harian</span>
                 </div>
             </div>
             <div className="pt-0 pb-4 no-swipe">
                 <NutritionChart
                     t={t} theme={theme} daysMap={daysMap} targets={targets}
                     lyfitYearData={lyfitToday === null && lyfitToday === undefined ? null : lyfitYearData} 
                 />
             </div>
         </div>
      </div>
      </div>


      {showTargetSettings && (
        <TargetSettingsModal t={t} theme={theme} profile={profile} saveProfilePatch={saveProfilePatch} onClose={() => setShowTargetSettings(false)} />
      )}

      {showBiometricModal && (
        <BiometricSettingsModal t={t} theme={theme} profile={profile} saveProfilePatch={saveProfilePatch} logymUser={logymUser} onClose={() => setShowBiometricModal(false)} />
      )}

      {showWarnings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={() => setShowWarnings(false)}>
          <div
            className={`relative w-full sm:max-w-md rounded-[2rem] border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} shadow-[0_8px_32px_-10px_rgba(239,68,68,0.35)] ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-white/70'} backdrop-blur-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {!selectedNutrientForBreakdown ? (
              <>
                <div className={`flex items-center justify-center px-5 py-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} shrink-0`}>
                  <h2 className={`h3 text-amber-500 flex items-center gap-2`}>
                    <AlertTriangle size={20} />
                    Perhatian Nutrisi
                  </h2>
                </div>
                <div className="p-5 overflow-y-auto space-y-3 flex-1">
                  {warnings.map((w, i) => {
                    const isClickable = w.nutrient && w.nutrient !== 'diet' && w.nutrient !== 'allergy';
                    const s = w.level === 'danger' ? STATUS.danger : STATUS.warn;
                    return (
                      <div 
                        key={i} 
                        onClick={() => isClickable ? setSelectedNutrientForBreakdown(w.nutrient) : null} 
                        className={`flex flex-col gap-1 p-4 rounded-2xl border ${s.soft} ${s.border} ${isClickable ? 'cursor-pointer hover:opacity-80 active:scale-[0.98] transition-transform' : ''}`}
                      >
                        <div className="flex gap-3">
                          <AlertTriangle size={18} className={`shrink-0 ${s.text} mt-0.5`} />
                          <span className={`body-md font-semibold ${t.textMain}`}>{w.message}</span>
                        </div>
                        {isClickable && <span className="text-[11px] opacity-70 ml-8">Ketuk untuk melihat sumber makanan &rarr;</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              (() => {
                const nut = NUTRIENTS.find(n => n.key === selectedNutrientForBreakdown);
                const contributors = [];
                if (today?.meals) {
                  Object.values(today.meals).forEach(mealArr => {
                    mealArr.forEach(item => {
                      const amt = item.nutrition?.[selectedNutrientForBreakdown] || 0;
                      if (amt > 0) {
                        // Gabungkan porsi jika ada nama yang sama
                        const existing = contributors.find(c => c.name === item.name);
                        if (existing) {
                          existing.amount += amt;
                        } else {
                          contributors.push({ name: item.name, amount: amt });
                        }
                      }
                    });
                  });
                }
                contributors.sort((a, b) => b.amount - a.amount);

                return (
                  <>
                    <div className={`flex items-center px-5 py-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} shrink-0`}>
                      <button onClick={() => setSelectedNutrientForBreakdown(null)} className={`p-1.5 rounded-full bg-black/5 dark:bg-white/5 ${t.textMuted} mr-2 hover:${t.textMain} transition-colors`}>
                        <X size={16} />
                      </button>
                      <h2 className={`h3 ${t.textMain}`}>Sumber {nut?.label}</h2>
                    </div>
                    <div className="p-5 overflow-y-auto space-y-2 flex-1">
                      {contributors.length > 0 ? contributors.map((c, i) => (
                        <div key={i} className={`flex justify-between items-center p-3.5 rounded-xl border ${t.border} bg-black/5 dark:bg-white/5`}>
                          <p className={`body-md font-bold ${t.textMain} truncate pr-2`}>{c.name}</p>
                          <p className={`body-md font-black ${t.textAccent} shrink-0`}>
                            {c.amount < 10 ? Number(c.amount.toFixed(2)) : Math.round(c.amount)}<span className="text-xs font-normal opacity-70 ml-0.5">{nut?.unit}</span>
                          </p>
                        </div>
                      )) : (
                        <p className={`body-sm ${t.textMuted} text-center py-6`}>Belum ada data sumber makanan untuk nutrisi ini.</p>
                      )}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardTab;
