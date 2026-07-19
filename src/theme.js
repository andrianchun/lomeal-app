// Sistem tema Lomeal — Fase 2 blueprint.
// Basis HIJAU (kebalikan Lyfit yang biru), medium elegan, tanpa neon.
// Bentuk komponen: box square rounded + solid semi-glassmorphism.
// Kunci-kunci objek `t` sengaja identik dengan Lyfit agar komponen struktural
// hasil daur ulang (AuthPage, ConfirmModal, ScrollPicker, dst.) langsung kompatibel.

export const ACCENT = '#22c55e';       // green-500
export const ACCENT_DARK = '#15803d';  // green-700

export const buildTheme = (theme) => ({
  bgApp: theme === 'dark' ? 'app-bg-dark' : 'app-bg-light',
  bgCard: theme === 'dark' ? 'bg-white/[0.045] glass-card' : 'bg-white/60 glass-card',
  bgCardSoft: theme === 'dark' ? 'bg-white/[0.02] glass-card' : 'bg-black/[0.02] glass-card',
  bgSunken: theme === 'dark' ? 'bg-black/25' : 'bg-black/5',
  textMain: theme === 'dark' ? 'text-slate-100' : 'text-slate-900',
  textMuted: theme === 'dark' ? 'text-slate-400' : 'text-slate-500',
  border: theme === 'dark' ? 'border-white/10' : 'border-black/10',
  textAccent: theme === 'dark' ? 'text-green-400' : 'text-green-600',
  bgAccent: 'bg-gradient-to-br from-green-500 to-green-700 text-white',
  bgAccentSoft: theme === 'dark' ? 'bg-green-500/15' : 'bg-green-500/10',
  borderAccent: theme === 'dark' ? 'border-green-400' : 'border-green-600',
  borderAccentSoft: theme === 'dark' ? 'border-green-400/30' : 'border-green-600/30',
  ringAccent: theme === 'dark' ? 'ring-green-400' : 'ring-green-600',
  shadowAccent: theme === 'dark' ? 'shadow-green-500/30' : 'shadow-green-600/30',
  gradientText: theme === 'dark' ? 'from-green-300 to-green-500' : 'from-green-600 to-green-800',
  gradientBg: 'from-green-500 to-green-700',
  inputBg: theme === 'dark' ? 'bg-white/5' : 'bg-black/[0.03]',
  btnBg: theme === 'dark' ? 'bg-white/[0.06] hover:bg-white/10' : 'bg-black/5 hover:bg-black/10',
  navBg: theme === 'dark' ? 'bg-white/[0.04] glass-nav' : 'bg-white/70 glass-nav',
  navIconActive: theme === 'dark' ? 'text-green-400' : 'text-green-600',
  navIconInactive: theme === 'dark' ? 'text-slate-500' : 'text-slate-400',
  placeholderAccent: theme === 'dark' ? 'placeholder-green-400/40' : 'placeholder-green-600/40',
  borderDashed: theme === 'dark' ? 'border-white/10' : 'border-black/10',
  bgBox: theme === 'dark' ? 'bg-black/20' : 'bg-green-600/10',
  glow: theme === 'dark' ? 'shadow-[0_8px_32px_-10px_rgba(34,197,94,0.35)]' : 'shadow-[0_8px_32px_-14px_rgba(34,197,94,0.25)]',
});

// Semantik lampu lalu lintas (merah-kuning-hijau) untuk status nutrisi:
// hijau = aman/on-target, kuning = mendekati batas (Smart Warning 85%),
// merah = melewati batas. Dipakai di chips mikro, ring kalori, dan grafik.
export const STATUS = {
  ok:     { text: 'text-green-500',  bg: 'bg-green-500',  soft: 'bg-green-500/12',  border: 'border-green-500/30',  hex: '#3daa5c' },
  warn:   { text: 'text-amber-500',  bg: 'bg-amber-500',  soft: 'bg-amber-500/12',  border: 'border-amber-500/30',  hex: '#c98920' },
  danger: { text: 'text-red-400',    bg: 'bg-red-500',    soft: 'bg-red-500/10',    border: 'border-red-400/25',    hex: '#cd4a4a' },
  info:   { text: 'text-slate-400',  bg: 'bg-slate-400',  soft: 'bg-slate-400/15',  border: 'border-slate-400/40',  hex: '#94a3b8' },
};

export const statusFor = (ratio, { warnAt = 0.85, invert = false } = {}) => {
  // invert=false: nilai makin tinggi makin buruk (natrium, gula, dst.)
  // invert=true : target minimal (protein, kalsium, zat besi) — merah kalau terlalu rendah itu
  //               tidak perlu, cukup hijau saat tercapai.
  if (invert) return ratio >= 1 ? STATUS.ok : ratio >= 0.6 ? STATUS.warn : STATUS.info;
  if (ratio >= 1) return STATUS.danger;
  if (ratio >= warnAt) return STATUS.warn;
  return STATUS.ok;
};

// Warna makro konsisten di seluruh app (bar dashboard, ring piring, studio share)
export const MACRO_COLORS = {
  protein: { hex: '#3daa5c', text: 'text-green-500',  label: 'Protein' },
  carbs:   { hex: '#c98920', text: 'text-amber-500',  label: 'Karbo' },
  fat:     { hex: '#cd4a4a', text: 'text-red-400',    label: 'Lemak' },
};
