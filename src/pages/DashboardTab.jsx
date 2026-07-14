import React, { useMemo, useState } from 'react';
import { Flame, Activity, AlertTriangle, Pencil, Check, X, Settings } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import RingChart from '../components/RingChart';
import TargetSettingsModal from '../components/TargetSettingsModal';
import { NUTRIENTS, DIET_PROFILES, computeDayTotals, getSmartWarnings, getEnergyBalance, MINIMUM_TARGETS } from '../data/nutrition';
import { STATUS, statusFor, MACRO_COLORS } from '../theme';
import { getLocalYMD } from '../data/constants';
import { pushActivityOverrideToLogym } from '../utils/biometricSync';

/**
 * TAB 1: DASHBOARD — Pusat Pantau Imersif (Fase 5 blueprint).
 * Murni panel pemantauan; tidak ada aksi input/edit di sini.
 */
const DashboardTab = ({ t, theme, user, logymUser, profile, daysMap, lyfitToday, saveProfilePatch, todayYmd = getLocalYMD() }) => {
  const targets = profile?.targets || {};
  const dietProfile = profile?.dietProfile;
  const [chartRange, setChartRange] = useState(30);

  // Chip profil makanan di header — Lomeal satu-satunya sumber (delta cutting/bulking/dst
  // gak lagi dibaca dari Logym, lihat App.jsx#pushTargetsToLogym).
  const dietMeta = DIET_PROFILES.find(d => d.id === dietProfile) || null;

  const today = daysMap[todayYmd];
  const totals = useMemo(() => computeDayTotals(today), [today]);
  const burnedBonus = lyfitToday?.burnedKcal || 0;

  // Koreksi manual "Dibakar" — buat user yang nyatet olahraga di app lain (bukan Logym).
  // Nulis langsung ke bioData.activityCalories Logym (ber-flag manual), bukan disimpan lokal.
  const [editingBurn, setEditingBurn] = useState(false);
  const [burnInput, setBurnInput] = useState('');
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const handleSaveBurnOverride = async () => {
    const val = Number(burnInput);
    setEditingBurn(false);
    if (!logymUser || !Number.isFinite(val) || val < 0) return;
    await pushActivityOverrideToLogym(logymUser.uid, todayYmd, val);
  };

  // Kalau user isi manual "Kalori Makanan" langsung di Logym (bukan lewat Lomeal), angka itu
  // menang buat tampilan ring/remaining — murni override angka teratas, log makanan asli
  // (macro, micro chips, warnings) tetap pakai totals.kcal hasil hitung dari log beneran.
  const displayKcal = lyfitToday?.nutritionOverride ?? totals.kcal;
  const allowance = (targets.kcal || 0) + burnedBonus;
  const remaining = Math.round(allowance - displayKcal);
  const ringProgress = allowance > 0 ? Math.min(1, displayKcal / allowance) : 0;
  const balance = getEnergyBalance(displayKcal, targets.tdee || targets.kcal || 0, burnedBonus);
  const ringColor = remaining < 0 ? STATUS.danger.hex : ringProgress >= 0.85 ? STATUS.warn.hex : STATUS.ok.hex;

  const warnings = useMemo(() => getSmartWarnings(totals, targets, dietProfile), [totals, targets, dietProfile]);

  // Data grafik batang historis (ala Samsung Health) + garis target putus-putus
  const chartData = useMemo(() => {
    const out = [];
    for (let i = chartRange - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ymd = getLocalYMD(d);
      const dayTotals = computeDayTotals(daysMap[ymd]);
      out.push({ ymd, label: `${d.getDate()}/${d.getMonth() + 1}`, kcal: Math.round(dayTotals.kcal) });
    }
    return out;
  }, [daysMap, chartRange]);

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
          <span className={`caption ${t.textMain}`}>{Math.round(value)}<span className={t.textMuted}>/{target}g</span></span>
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
          <div className="flex items-center gap-2 mt-3">
            <span className={`px-2.5 py-1 rounded-full caption font-bold border ${t.border} ${t.bgCardSoft} ${t.textMuted}`}>
              {dietMeta.emoji} {dietMeta.label}
            </span>
          </div>
        )}
      </div>

      {/* ===== AREA ATAS: HERO WIDGET ===== */}
      <div className="relative anim-rise">
        {/* Latar kartu (kaca blur) — mulai agak turun, sisain celah di atas buat kepala coach */}
        <div className={`absolute inset-x-0 top-9 bottom-0 rounded-3xl border ${t.border} ${t.bgCard} ${t.glow} z-0`} />

        {/* Coach: di ATAS latar kartu (gak keblur kaca) — ring di layer konten (z-20) yang nutupin
            sebagian kalau overlap, pola sama kayak ring SCORE Komposisi Tubuh Logym. */}
        <div
          className="absolute right-1 -top-2 w-48 h-80 z-10 pointer-events-none overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, black 70%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 95%)',
          }}
        >
          <img src="/bg-dashboard.png" alt="" className="w-full h-full object-cover object-top scale-125 origin-top" />
        </div>

        <div className="relative z-20 pt-14 p-5">
          {/* Ikon aksi kartu — pola sama kayak Logym (Info/Pencil/Settings di kanan-atas kartu) */}
          <div className="flex items-center justify-end gap-2 mb-3">
            <button onClick={() => setShowTargetSettings(true)} className={`p-2 rounded-full ${t.bgBox} backdrop-blur-md ${t.textMuted}`} aria-label="Target & preferensi">
              <Settings size={15} />
            </button>
            {logymUser && (
              <button onClick={() => { setBurnInput(String(burnedBonus || '')); setEditingBurn(true); }} className={`p-2 rounded-full ${t.bgBox} backdrop-blur-md ${t.textMuted}`} aria-label="Koreksi kalori dibakar">
                <Pencil size={15} />
              </button>
            )}
          </div>

          <div className="flex flex-col items-start gap-4">
            <RingChart size={124} stroke={11} progress={ringProgress} color={ringColor} glass>
              <span className={`text-2xl font-black tabular-nums ${t.textMain}`}>{Math.abs(remaining)}</span>
              <span className={`caption ${t.textMuted}`}>{remaining >= 0 ? 'kkal tersisa' : 'kkal lebih'}</span>
              <span className={`mt-1 px-2 py-0.5 rounded-full caption capitalize ${
                balance.state === 'deficit' ? STATUS.ok.soft + ' ' + STATUS.ok.text :
                balance.state === 'surplus' ? STATUS.danger.soft + ' ' + STATUS.danger.text :
                STATUS.warn.soft + ' ' + STATUS.warn.text}`}>
                {balance.state === 'deficit' ? 'Defisit' : balance.state === 'surplus' ? 'Surplus' : 'Maintenance'}
              </span>
            </RingChart>

            {/* Kalori Dimakan (hijau, dari Lomeal) | Kalori Dibakar (biru, dari Logym) — kiri-kanan seimbang */}
            <div className="w-full grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-2xl ${t.bgBox} backdrop-blur-md`}>
                <p className={`h3 ${t.textMuted}`}>Kalori Dimakan</p>
                <p className={`text-xl font-black tabular-nums ${t.textAccent} mt-0.5`}>{Math.round(displayKcal)}</p>
                <div className={`h-1.5 rounded-full overflow-hidden ${t.bgSunken} mt-2`}>
                  <div className={`h-full rounded-full ${t.bgAccent} transition-all duration-500`} style={{ width: `${Math.min(100, (displayKcal / (targets.kcal || 1)) * 100)}%` }} />
                </div>
              </div>
              <div className={`p-3 rounded-2xl ${t.bgBox} backdrop-blur-md`}>
                <p className={`h3 ${t.textMuted}`}>Kalori Dibakar</p>
                {editingBurn ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                      type="number" inputMode="numeric" autoFocus
                      value={burnInput} onChange={(e) => setBurnInput(e.target.value)}
                      className={`w-14 text-lg font-black tabular-nums bg-transparent border-b ${t.borderAccent} ${t.textMain} outline-none`}
                    />
                    <button onClick={handleSaveBurnOverride} className="text-green-500"><Check size={16} /></button>
                    <button onClick={() => setEditingBurn(false)} className={t.textMuted}><X size={16} /></button>
                  </div>
                ) : (
                  <p className="text-xl font-black tabular-nums text-sky-400 mt-0.5">{burnedBonus}</p>
                )}
                <div className={`h-1.5 rounded-full overflow-hidden ${t.bgSunken} mt-2`}>
                  <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${Math.min(100, (burnedBonus / (targets.kcal || 1)) * 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="w-full space-y-3">
              <MacroBar mkey="protein" />
              <MacroBar mkey="carbs" />
              <MacroBar mkey="fat" />
            </div>
          </div>

          {/* Chips Mikro Klinis */}
          <div className="flex gap-1.5 mt-4 overflow-x-auto hide-scrollbar -mx-1 px-1">
            {microChips.map(n => {
              const target = targets[n.key];
              if (!target) return null;
              const ratio = (totals[n.key] || 0) / target;
              const s = statusFor(ratio, { invert: MINIMUM_TARGETS.has(n.key) });
              return (
                <span key={n.key} className={`shrink-0 px-2.5 py-1.5 rounded-xl border caption ${s.soft} ${s.border} ${s.text}`}>
                  {n.label} {Math.round(ratio * 100)}%
                </span>
              );
            })}
          </div>

          {/* Smart Warning (logika lokal offline) */}
          {warnings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {warnings.slice(0, 3).map((w, i) => {
                const s = w.level === 'danger' ? STATUS.danger : STATUS.warn;
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${s.soft} ${s.border}`}>
                    <AlertTriangle size={13} className={s.text} />
                    <span className={`caption font-semibold ${t.textMain}`}>{w.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== AREA TENGAH: TREN VISUAL HISTORIS ===== */}
      <div className={`rounded-3xl border ${t.border} ${t.bgCard} p-4 anim-rise`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame size={15} className={t.textAccent} />
            <span className={`h2 ${t.textMain}`}>Tren Kalori</span>
          </div>
          <div className={`flex rounded-xl overflow-hidden border ${t.border}`}>
            {[[7, '7H'], [30, '30H'], [90, '3B']].map(([days, label]) => (
              <button key={days} onClick={() => setChartRange(days)}
                className={`px-2.5 py-1 caption transition-colors ${chartRange === days ? `${t.bgAccentSoft} ${t.textAccent}` : t.textMuted}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-44 -ml-3">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={chartData} barCategoryGap="25%">
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                axisLine={false} tickLine={false} interval={Math.floor(chartRange / 7)} />
              <YAxis tick={{ fontSize: 9, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} width={38} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                contentStyle={{
                  background: theme === 'dark' ? '#0b1f16' : '#fff', border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: 12, fontSize: 11, fontWeight: 700,
                }}
                formatter={(v) => [`${v} kkal`, 'Dimakan']} labelFormatter={(l) => `Tanggal ${l}`} />
              {/* Garis putus-putus target harian — wajib per blueprint */}
              <ReferenceLine y={targets.kcal || 0} stroke={STATUS.warn.hex} strokeDasharray="6 4" strokeWidth={1.5} />
              <Bar dataKey="kcal" radius={[5, 5, 0, 0]} maxBarSize={18}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={
                    d.kcal === 0 ? 'rgba(148,163,184,0.15)' :
                    d.kcal > (targets.kcal || Infinity) ? STATUS.danger.hex :
                    d.ymd === todayYmd ? STATUS.ok.hex : 'rgba(34,197,94,0.45)'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={`caption font-medium text-center ${t.textMuted}`}>
          Garis putus-putus = target {targets.kcal || '—'} kkal/hari
        </p>
      </div>

      {/* ===== AREA BAWAH: MINIMIZED LYFIT SYNC CARD ===== */}
      <div className={`rounded-2xl border ${t.border} ${t.bgCardSoft} px-4 py-3 flex items-center gap-3 anim-rise`}>
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shrink-0">
          <Activity size={15} className="text-white" />
        </span>
        <p className={`body-md ${t.textMain} flex-1 truncate`}>
          {lyfitToday
            ? <>Aktivitas Lyfit: Bakar <span className={t.textAccent}>{lyfitToday.burnedKcal} kkal</span>
                {lyfitToday.workoutCount > 0 && ` · ${lyfitToday.workoutCount} sesi latihan`}
                {lyfitToday.weight ? ` · BB: ${lyfitToday.weight}kg` : ''}</>
            : 'Belum ada aktivitas Lyfit hari ini'}
        </p>
      </div>

      {showTargetSettings && (
        <TargetSettingsModal t={t} theme={theme} profile={profile} saveProfilePatch={saveProfilePatch} onClose={() => setShowTargetSettings(false)} />
      )}
    </div>
  );
};

export default DashboardTab;
