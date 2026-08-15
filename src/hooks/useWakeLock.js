import { useCallback, useEffect, useRef } from 'react';

/**
 * Menahan layar tetap menyala selama proses panjang (generate AI).
 *
 * Kalau layar mati di tengah generate, WebView dibekukan dan permintaannya putus — user harus
 * mengulang dari nol dan token terbuang percuma. Ini bukan "jalan di background" (WebView tidak
 * bisa), tapi mencegah penyebab putus yang paling sering.
 */
export default function useWakeLock() {
  const lockRef = useRef(null);
  const wantedRef = useRef(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const request = useCallback(async () => {
    wantedRef.current = true;
    if (!supported || lockRef.current) return;
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      lockRef.current.addEventListener('release', () => { lockRef.current = null; });
    } catch (err) {
      console.warn('Wake lock gagal:', err.name, err.message);
      lockRef.current = null;
    }
  }, [supported]);

  const release = useCallback(async () => {
    wantedRef.current = false;
    if (!lockRef.current) return;
    try { await lockRef.current.release(); } catch { /* sudah lepas sendiri */ }
    lockRef.current = null;
  }, []);

  // Sistem otomatis melepas wake lock tiap app masuk background. Kalau saat itu kita masih
  // butuh (generate belum selesai), minta lagi begitu kembali ke depan.
  useEffect(() => {
    if (!supported) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wantedRef.current && !lockRef.current) request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [supported, request]);

  useEffect(() => () => { lockRef.current?.release().catch(() => {}); }, []);

  return { request, release, supported };
}
