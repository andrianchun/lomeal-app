// ============================================================
// AI WAKE LOCK MANAGER — Mencegah layar mati saat proses AI berjalan
// Bekerja otomatis untuk SEMUA panggilan AI (OCR, Parser, Chat, Resep, Lab).
// Menggunakan reference counter sehingga aman saat ada beberapa proses paralel.
// ============================================================

let activeAiRequests = 0;
let globalWakeLock = null;

export async function acquireAiWakeLock() {
  activeAiRequests++;
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !globalWakeLock) {
    try {
      globalWakeLock = await navigator.wakeLock.request('screen');
      globalWakeLock.addEventListener('release', () => {
        globalWakeLock = null;
      });
    } catch (err) {
      console.warn('[WakeLock] Gagal mengunci layar:', err.name, err.message);
      globalWakeLock = null;
    }
  }
}

export async function releaseAiWakeLock() {
  activeAiRequests = Math.max(0, activeAiRequests - 1);
  if (activeAiRequests === 0 && globalWakeLock) {
    try {
      await globalWakeLock.release();
    } catch {}
    globalWakeLock = null;
  }
}

// Re-acquire lock jika app kembali ke foreground sementara proses AI masih berjalan
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && activeAiRequests > 0 && !globalWakeLock && 'wakeLock' in navigator) {
      try {
        globalWakeLock = await navigator.wakeLock.request('screen');
        globalWakeLock.addEventListener('release', () => {
          globalWakeLock = null;
        });
      } catch (err) {
        console.warn('[WakeLock] Gagal re-acquire layar:', err);
      }
    }
  });
}
