import React, { useMemo, useState } from 'react';
import { Flame, Activity, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import RingChart from '../components/RingChart';
import { NUTRIENTS, computeDayTotals, getSmartWarnings, getEnergyBalance, MINIMUM_TARGETS } from '../data/nutrition';
import { STATUS, statusFor, MACRO_COLORS } from '../theme';
import { getLocalYMD } from '../data/constants';

const GOAL_LABELS = { muscle_gain: 'Muscle Gain', fat_loss: 'Fat Loss', strength: 'Strength', general: 'General Fitness' };

/**
 * TAB 1: DASHBOARD — Pusat Pantau Imersif (Fase 5 blueprint).
 * Murni panel pemantauan; tidak ada aksi input/edit di sini.
 */
const DashboardTab = ({ t, theme, profile, daysMap, lyfitToday, logymGoalInfo, goalMismatch, todayYmd = getLocalYMD() }) => {
  const targets = profile?.targets || {};
  const dietProfile = profile?.dietProfile;
  const [chartRange, setChartRange] = useState(30);

  const today = daysMap[todayYmd];
  const totals = useMemo(() => computeDayTotals(today), [today]);
  const burnedBonus = lyfitToday?.burnedKcal || 0;

  const allowance = (targets.kcal || 0) + burnedBonus;
  const remaining = Math.round(allowance - totals.kcal);
  const ringProgress = allowance > 0 ? Math.min(1, totals.kcal / allowance) : 0;
  const balance = getEnergyBalance(totals.kcal, targets.tdee || targets.kcal || 0, burnedBonus);
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
      {/* ===== AREA ATAS: HERO WIDGET ===== */}
      <div className={`rounded-3xl border ${t.border} ${t.bgCard} ${t.glow} p-5 anim-rise`}>
        <div className="flex items-center gap-5">
          <RingChart size={148} stroke={13} progress={ringProgress} color={ringColor}>
            <span className={`text-3xl font-black tabular-nums ${t.textMain}`}>{Math.abs(remaining)}</span>
            <span className={`caption ${t.textMuted}`}>{remaining >= 0 ? 'kkal tersisa' : 'kkal lebih'}</span>
            <span className={`mt-1 px-2 py-0.5 rounded-full caption capitalize ${
              balance.state === 'deficit' ? STATUS.ok.soft + ' ' + STATUS.ok.text :
              balance.state === 'surplus' ? STATUS.danger.soft + ' ' + STATUS.danger.text :
              STATUS.warn.soft + ' ' + STATUS.warn.text}`}>
              {balance.state === 'deficit' ? 'Defisit' : balance.state === 'surplus' ? 'Surplus' : 'Maintenance'}
            </span>
          </RingChart>
          <div className="flex-1 space-y-3">
            <div className="flex justify-between">
              <div>
                <p className={`h3 ${t.textMuted}`}>Masuk</p>
                <p className={`text-lg font-black tabular-nums ${t.textMain}`}>{Math.round(totals.kcal)}</p>
              </div>
              <div className="text-right">
                <p className={`h3 ${t.textMuted}`}>Bonus Olahraga</p>
                <p className={`text-lg font-black tabular-nums ${t.textAccent}`}>+{burnedBonus}</p>
              </div>
            </div>
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
                formatter={(v) => [`${v} kkal`, 'Masuk']} labelFormatter={(l) => `Tanggal ${l}`} />
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

      {logymGoalInfo?.goal && (
        <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 anim-rise ${goalMismatch ? 'border-amber-500/40 bg-amber-500/10' : `${t.border} ${t.bgCardSoft}`}`}>
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${goalMismatch ? 'bg-amber-500' : `${t.bgAccent}`}`}>
            <AlertTriangle size={15} className="text-white" />
          </span>
          <p className={`body-md flex-1 ${goalMismatch ? 'text-amber-500' : t.textMuted}`}>
            {goalMismatch || `Tujuan Logym: ${GOAL_LABELS[logymGoalInfo.goal] || logymGoalInfo.goal} — sejalan dengan profil dietmu di Lomeal.`}
          </p>
        </div>
      )}
    </div>
  );
};

export default DashboardTab;
