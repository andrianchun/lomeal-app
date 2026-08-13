import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { playSoundEffect } from '../utils/audio';

// id 3000 dipakai notifikasi "sedang masak" yang menempel di notification bar,
// 3001+ untuk tiap timer. App.jsx memakai ambang ini buat tahu notifikasi mana yang
// harus membuka layar masak, bukan tab Log.
export const COOK_NOTIF_ONGOING = 3000;
const TIMER_NOTIF_BASE = 3001;
const STORAGE_KEY = 'lomeal_cook_session';

export const loadCookSession = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
};
export const clearCookSession = () => localStorage.removeItem(STORAGE_KEY);

const isNative = () => Capacitor.isNativePlatform();

/**
 * Beberapa timer masak yang jalan BARENGAN (nanak nasi sambil marinasi ayam).
 *
 * Sisa waktu selalu dihitung dari `endsAt - Date.now()`, bukan mengurangi counter tiap
 * detik — kalau tidak, timer bakal melambat/berhenti begitu app di-background atau layar
 * mati, dan nasi gosong. Sesi (timer + langkah yang sudah dicentang) dititip ke
 * localStorage supaya app yang dibunuh Android tetap bisa lanjut dari tempat terakhir.
 */
export default function useCookTimers({ recipeId, recipeName, servings, soundEnabled = true }) {
  const restored = useRef(null);
  if (restored.current === null) {
    const s = loadCookSession();
    restored.current = s && s.recipeId === recipeId ? s : {};
  }

  const [timers, setTimers] = useState(() => restored.current.timers || []);
  const [done, setDone] = useState(() => new Set(restored.current.done || []));
  const [nowTs, setNowTs] = useState(Date.now());
  const firedRef = useRef(new Set(restored.current.fired || []));

  // ---------- persistensi ----------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      recipeId, recipeName, servings, timers,
      done: [...done], fired: [...firedRef.current],
      startedAt: restored.current.startedAt || Date.now(),
    }));
  }, [recipeId, recipeName, servings, timers, done]);

  // ---------- detak, cuma selagi ada timer hidup ----------
  useEffect(() => {
    if (timers.length === 0) return undefined;
    const iv = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(iv);
  }, [timers.length]);

  // ---------- bunyi saat timer habis (kalau app-nya lagi kebuka) ----------
  useEffect(() => {
    const due = timers.filter((tm) => tm.endsAt <= nowTs && !firedRef.current.has(tm.id));
    if (due.length === 0) return;
    due.forEach((tm) => firedRef.current.add(tm.id));
    playSoundEffect('timer', soundEnabled);
    try { navigator.vibrate?.([200, 100, 200, 100, 400]); } catch { /* browser tanpa vibrate */ }
  }, [timers, nowTs, soundEnabled]);

  // ---------- notifikasi native ----------
  const syncOngoing = useCallback(async (list) => {
    if (!isNative()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: COOK_NOTIF_ONGOING }] });
      const alive = list.filter((tm) => tm.endsAt > Date.now());
      if (alive.length === 0) return;
      await LocalNotifications.schedule({
        notifications: [{
          id: COOK_NOTIF_ONGOING,
          title: `Sedang masak ${recipeName}`,
          body: `${alive.length} timer jalan · ketuk untuk buka`,
          ongoing: true,
          autoCancel: false,
          schedule: { at: new Date(Date.now() + 1000) },
        }],
      });
    } catch (e) { console.warn('Notifikasi masak gagal:', e); }
  }, [recipeName]);

  const addTimer = useCallback((label, seconds) => {
    const sec = Math.max(1, Math.round(Number(seconds) || 0));
    const timer = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      notifId: TIMER_NOTIF_BASE + (Date.now() % 900),
      label: label || 'Timer',
      durationSec: sec,
      endsAt: Date.now() + sec * 1000,
    };
    setTimers((list) => {
      const next = [...list, timer];
      syncOngoing(next);
      return next;
    });
    if (isNative()) {
      LocalNotifications.schedule({
        notifications: [{
          id: timer.notifId,
          title: `⏰ ${timer.label} selesai!`,
          body: `${recipeName} — waktunya cek masakan.`,
          schedule: { at: new Date(timer.endsAt), allowWhileIdle: true },
        }],
      }).catch((e) => console.warn('Jadwal timer gagal:', e));
    }
    return timer;
  }, [recipeName, syncOngoing]);

  const removeTimer = useCallback((id) => {
    setTimers((list) => {
      const target = list.find((tm) => tm.id === id);
      if (target && isNative()) {
        LocalNotifications.cancel({ notifications: [{ id: target.notifId }] }).catch(() => {});
      }
      const next = list.filter((tm) => tm.id !== id);
      syncOngoing(next);
      return next;
    });
  }, [syncOngoing]);

  const clearAll = useCallback(() => {
    if (isNative()) {
      const ids = [{ id: COOK_NOTIF_ONGOING }, ...timers.map((tm) => ({ id: tm.notifId }))];
      LocalNotifications.cancel({ notifications: ids }).catch(() => {});
    }
    setTimers([]);
    clearCookSession();
  }, [timers]);

  const toggleDone = useCallback((stepId) => setDone((s) => {
    const next = new Set(s);
    next.has(stepId) ? next.delete(stepId) : next.add(stepId);
    return next;
  }), []);

  const remainingSec = useCallback((timer) => Math.max(0, Math.round((timer.endsAt - nowTs) / 1000)), [nowTs]);

  return { timers, addTimer, removeTimer, clearAll, done, toggleDone, remainingSec };
}
