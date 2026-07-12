// src/data/achievements.js
// Pola badge di-port dari lyfit.app/src/data/achievements.jsx (array badge +
// checkAchievements diff-and-unlock), definisi badge dipangkas ke yang generik
// (sosial + veteran + profil) plus 1 keluarga baru log_streak_* berbasis hari
// makan tercatat (daysMap Lomeal), sesuai "7-Day Log Streak" di blueprint Fase 9.
// Tidak ada asset /badges/*.png di Lomeal — semua badge pakai fallbackIcon saja.
import { Flame, Users, UserCheck, Calendar } from 'lucide-react';

export const ACHIEVEMENTS = [
  // STREAK PENCATATAN MAKANAN
  {
    id: 'log_streak_3', title: 'Mulai Konsisten',
    description: 'Mencatat makanan 3 hari berturut-turut.',
    fallbackIcon: Flame,
    color: 'text-orange-500', bg: 'bg-orange-500/10', borderColor: 'border-orange-500/30',
    target: 3, metric: 'Hari',
    action: { label: 'Catat Hari Ini', tab: 'log' },
    calculateProgress: (ctx) => ctx.maxStreak || 0,
  },
  {
    id: 'log_streak_7', title: '7-Day Log Streak',
    description: 'Mencatat makanan 7 hari berturut-turut.',
    fallbackIcon: Flame,
    color: 'text-rose-500', bg: 'bg-rose-500/10', borderColor: 'border-rose-500/30',
    target: 7, metric: 'Hari',
    action: { label: 'Catat Hari Ini', tab: 'log' },
    calculateProgress: (ctx) => ctx.maxStreak || 0,
  },
  {
    id: 'log_streak_30', title: 'Kebiasaan Terbentuk',
    description: 'Mencatat makanan 30 hari berturut-turut.',
    fallbackIcon: Flame,
    color: 'text-amber-500', bg: 'bg-amber-500/10', borderColor: 'border-amber-500/30',
    target: 30, metric: 'Hari',
    action: { label: 'Catat Hari Ini', tab: 'log' },
    calculateProgress: (ctx) => ctx.maxStreak || 0,
  },

  // SOSIAL
  {
    id: 'social_post_1', title: 'Herald',
    description: 'Membagikan 1 post ke Social Feed.',
    fallbackIcon: Users,
    color: 'text-blue-400', bg: 'bg-blue-400/10', borderColor: 'border-blue-400/30',
    target: 1, metric: 'Post',
    action: { label: 'Share Sesuatu', tab: 'social' },
    calculateProgress: (ctx) => ctx.postCount || 0,
  },
  {
    id: 'social_post_10', title: 'Voice of the Realm',
    description: 'Membagikan 10 post ke Social Feed.',
    fallbackIcon: Users,
    color: 'text-sky-500', bg: 'bg-sky-500/10', borderColor: 'border-sky-500/30',
    target: 10, metric: 'Post',
    action: { label: 'Share Sesuatu', tab: 'social' },
    calculateProgress: (ctx) => ctx.postCount || 0,
  },
  {
    id: 'social_follow_1', title: 'Allied Forces',
    description: 'Mengikuti (follow) 1 pengguna lain.',
    fallbackIcon: Users,
    color: 'text-emerald-400', bg: 'bg-emerald-400/10', borderColor: 'border-emerald-400/30',
    target: 1, metric: 'Following',
    action: { label: 'Cari Teman', tab: 'social' },
    calculateProgress: (ctx) => ctx.followingCount || 0,
  },
  {
    id: 'social_follow_50', title: 'Legion Commander',
    description: 'Mengikuti 50 pengguna.',
    fallbackIcon: Users,
    color: 'text-emerald-600', bg: 'bg-emerald-600/10', borderColor: 'border-emerald-600/30',
    target: 50, metric: 'Following',
    action: { label: 'Cari Teman', tab: 'social' },
    calculateProgress: (ctx) => ctx.followingCount || 0,
  },
  {
    id: 'social_followers_10', title: 'Charismatic Leader',
    description: 'Di-follow oleh 10 pengguna.',
    fallbackIcon: Users,
    color: 'text-pink-500', bg: 'bg-pink-500/10', borderColor: 'border-pink-500/30',
    target: 10, metric: 'Followers',
    action: { label: 'Aktif di Social', tab: 'social' },
    calculateProgress: (ctx) => ctx.followersCount || 0,
  },
  {
    id: 'social_followers_100', title: 'Idol of the Realm',
    description: 'Di-follow oleh 100 pengguna.',
    fallbackIcon: Users,
    color: 'text-rose-600', bg: 'bg-rose-600/10', borderColor: 'border-rose-600/30',
    target: 100, metric: 'Followers',
    action: { label: 'Aktif di Social', tab: 'social' },
    calculateProgress: (ctx) => ctx.followersCount || 0,
  },

  // PROFIL & KEANGGOTAAN
  {
    id: 'profile_complete', title: 'Soul Forged',
    description: 'Melengkapi identitas data diri di profil.',
    fallbackIcon: UserCheck,
    color: 'text-teal-500', bg: 'bg-teal-500/10', borderColor: 'border-teal-500/30',
    target: 1, metric: 'Selesai',
    action: { label: 'Lengkapi Profil', tab: 'social' },
    calculateProgress: (ctx) => (ctx.isProfileComplete ? 1 : 0),
  },
  {
    id: 'veteran_30d', title: 'Enduring Soul',
    description: 'Telah bergabung dengan Lomeal selama 30 hari.',
    fallbackIcon: Calendar,
    color: 'text-indigo-500', bg: 'bg-indigo-500/10', borderColor: 'border-indigo-500/30',
    target: 30, metric: 'Hari',
    action: { label: 'Lanjutkan!', tab: 'dashboard' },
    calculateProgress: (ctx) => ctx.accountAgeDays || 0,
  },
  {
    id: 'veteran_365d', title: 'Ancient Guardian',
    description: 'Telah bergabung dengan Lomeal selama 1 tahun.',
    fallbackIcon: Calendar,
    color: 'text-yellow-600', bg: 'bg-yellow-600/10', borderColor: 'border-yellow-600/30',
    target: 365, metric: 'Hari',
    action: { label: 'Lanjutkan!', tab: 'dashboard' },
    calculateProgress: (ctx) => ctx.accountAgeDays || 0,
  },
];

const dayHasLog = (day) => {
  if (!day?.meals) return false;
  return Object.values(day.meals).some((arr) => Array.isArray(arr) && arr.length > 0);
};

export const getAchievementContext = (daysMap, profile, extraData = {}) => {
  let maxStreak = 0;
  let currentStreak = 0;
  let lastDateObj = null;

  if (daysMap) {
    const dates = Object.keys(daysMap).filter((ymd) => dayHasLog(daysMap[ymd])).sort();
    dates.forEach((ymd) => {
      const dateObj = new Date(`${ymd}T00:00:00`);
      if (lastDateObj) {
        const diffDays = Math.round((dateObj - lastDateObj) / 86400000);
        currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
      } else {
        currentStreak = 1;
      }
      maxStreak = Math.max(maxStreak, currentStreak);
      lastDateObj = dateObj;
    });
  }

  const isProfileComplete = !!(profile?.age && profile?.height && profile?.weight && profile?.gender && profile?.dietProfile);
  const accountAgeDays = profile?.createdAt
    ? Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / 86400000)
    : 0;

  return {
    maxStreak,
    isProfileComplete,
    accountAgeDays,
    postCount: extraData.postCount || 0,
    followingCount: extraData.followingCount || 0,
    followersCount: extraData.followersCount || 0,
  };
};

export const checkAchievements = (daysMap, currentAchievements = [], profile = null, extraData = {}) => {
  const newUnlocks = [];
  const ctx = getAchievementContext(daysMap, profile, extraData);

  ACHIEVEMENTS.forEach((ach) => {
    const isUnlocked = currentAchievements.includes(ach.id);
    if (!isUnlocked) {
      const progress = ach.calculateProgress(ctx);
      if (progress >= ach.target) newUnlocks.push(ach);
    }
  });

  return newUnlocks;
};
