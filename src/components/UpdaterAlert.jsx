import React from 'react';
import { DownloadCloud, X } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

// Bar progres unduhan. Mendukung OTA zip maupun streaming in-app APK installer (seperti doctoid).
function DownloadProgress({ progress, t, isApk }) {
  const isInstalling = progress >= 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ${t.textMuted}`}>
          {isInstalling
            ? (isApk ? 'Mempersiapkan pemasangan APK…' : 'Memasang berkas & memuat ulang…')
            : (isApk ? 'Mengunduh paket pembaruan APK…' : 'Mengunduh pembaruan…')}
        </span>
        <span className={`text-xs font-bold ${t.textMain} tabular-nums`}>{progress}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden relative">
        <div
          className={`${t.bgAccent} h-full rounded-full transition-all duration-200 ease-out`}
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
        {isInstalling && (
          <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
        )}
      </div>
      <p className={`text-[10px] ${t.textMuted} mt-2 leading-tight`}>
        {isInstalling && isApk
          ? 'Tunggu dialog pemasangan Android muncul di layar.'
          : 'Jangan tutup aplikasi saat proses berlangsung.'}
      </p>
    </div>
  );
}

export default function UpdaterAlert({
  open, force, onUpdate, onClose, releaseNotes, theme,
  currentVersion, newVersion, progress, isApk,
}) {
  const downloading = progress !== null && progress !== undefined;
  // Sama kayak tombol X-nya: kartu update wajib (force) gak bisa ditutup sama sekali,
  // dan pas lagi unduh jangan sampai back malah nutup kartunya (progress ilang dari layar).
  useBackClose(!!(open && !force && !downloading), onClose);

  if (!open) return null;

  const t = theme;
  const versionLine = currentVersion && newVersion
    ? `Versi ${currentVersion} → Versi ${newVersion}`
    : newVersion ? `Versi ${newVersion}` : null;

  if (force) {
    // Scrim sengaja TIDAK ikut di-fade: elemen ber-backdrop-filter yang animasi opacity-nya
    // sendiri bikin blur baru menyala setelah animasi selesai (kedipan layer).
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md">
        <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl ${t.bgCardSolid} border ${t.border} ${t.textMain} flex flex-col items-center text-center animate-in zoom-in-95 duration-500`}>
          <div className="pt-8 pb-4">
            <img src="/maskable-icon-512x512.webp" alt="Lomeal Logo" className="w-24 h-24 mx-auto rounded-2xl shadow-lg mb-4 bg-white/5 border border-white/10 p-2" />
            <h2 className={`text-2xl font-bold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-br ${t.gradientText}`}>
              {isApk ? 'Pembaruan Aplikasi APK' : 'Update Penting!'}
            </h2>
            <p className={`text-sm font-medium ${t.textMuted} px-6`}>
              {isApk
                ? 'Versi APK terbaru Lomeal telah tersedia. Unduh pembaruan ini langsung di dalam aplikasi.'
                : 'Versi terbaru Lomeal telah tersedia. Kamu harus mengunduh pembaruan ini untuk melanjutkan.'}
            </p>
            {versionLine && (
              <p className={`text-xs font-bold ${t.textAccent} mt-2 tabular-nums`}>{versionLine}</p>
            )}
          </div>

          {releaseNotes && (
            <div className={`w-full ${t.bgSunken} px-6 py-4 text-left border-y ${t.border}`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${t.textAccent}`}>Yang Baru:</span>
              <p className={`text-sm mt-1 ${t.textMain} whitespace-pre-wrap`}>{releaseNotes}</p>
            </div>
          )}

          <div className="w-full p-6 mt-2 text-center">
            {downloading ? (
              <DownloadProgress progress={progress} t={t} isApk={isApk} />
            ) : (
              <button
                onClick={onUpdate}
                className={`w-full py-4 ${t.bgAccent} rounded-2xl font-bold text-lg ${t.shadowAccent} flex items-center justify-center gap-2 active:scale-95 transition-transform`}
              >
                <DownloadCloud size={24} />
                {isApk ? 'Pasang Pembaruan APK' : 'Update Sekarang'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Update opsional — Bottom Sheet Dialog yang Menghabiskan Batas Bawah Layar (Anti-Melayang Kosong)
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 select-none sm:p-4">
      {/* Backdrop Klik Luar untuk Menutup (Bila tidak sedang mengunduh) */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={() => {
          if (!downloading) onClose();
        }}
      />
      <div className={`relative z-10 w-full sm:max-w-sm ${t.bgCardSolid} ${t.textMain} rounded-t-3xl rounded-b-none sm:rounded-2xl px-5 pt-5 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] sm:p-5 shadow-2xl ${t.shadowAccent} border-t sm:border ${t.borderAccentSoft} flex flex-col gap-3.5 overflow-hidden select-none animate-in slide-in-from-bottom-6 duration-300 ring-1 ring-black/5 dark:ring-white/10 sm:mb-6`}>
        {/* Tombol tutup disembunyikan saat mengunduh supaya kartu (dan progresnya) tidak hilang di tengah jalan */}
        {!downloading && (
          <div className="absolute top-3.5 right-3.5">
            <button onClick={onClose} className={`p-1 rounded-full ${t.textMuted} hover:${t.textMain} transition-colors`}>
              <X size={18} />
            </button>
          </div>
        )}

        <div className="flex gap-4 items-center pr-6">
          <div className={`bg-black/20 border ${t.borderAccentSoft} p-1.5 rounded-xl shrink-0`}>
            <img src="/maskable-icon-512x512.webp" alt="Lomeal" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">
              {isApk ? 'Update APK Tersedia' : 'Update Tersedia'}
            </h3>
            <p className={`text-xs ${t.textMuted} mt-0.5 tabular-nums`}>
              {versionLine || 'Ada versi Lomeal yang lebih baru.'}
            </p>
          </div>
        </div>

        {releaseNotes && !downloading && (
          <p className={`text-xs ${t.textMuted} leading-snug whitespace-pre-wrap`}>{releaseNotes}</p>
        )}

        {downloading ? (
          <DownloadProgress progress={progress} t={t} isApk={isApk} />
        ) : (
          <button
            onClick={onUpdate}
            className={`w-full py-2.5 ${t.bgAccent} rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2`}
          >
            <DownloadCloud size={18} />
            {isApk ? 'Pasang Pembaruan APK' : 'Update Sekarang'}
          </button>
        )}
      </div>
    </div>
  );
}
