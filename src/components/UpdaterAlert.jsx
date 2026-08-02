import React from 'react';
import { DownloadCloud, X } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

// Bar progres unduhan. Bundle OTA puluhan MB, jadi tanpa indikator user ngira
// tombolnya macet dan menekan berulang kali.
function DownloadProgress({ progress, t }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ${t.textMuted}`}>Mengunduh pembaruan…</span>
        <span className={`text-xs font-bold ${t.textMain} tabular-nums`}>{progress}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
        <div
          className={`${t.bgAccent} h-full rounded-full transition-all duration-200 ease-out`}
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
      </div>
      <p className={`text-[10px] ${t.textMuted} mt-2 leading-tight`}>
        Jangan tutup aplikasi. Lomeal akan otomatis dimuat ulang setelah selesai.
      </p>
    </div>
  );
}

export default function UpdaterAlert({
  open, force, onUpdate, onClose, releaseNotes, theme,
  currentVersion, newVersion, progress,
}) {
  const downloading = progress !== null && progress !== undefined;
  // Sama kayak tombol X-nya: kartu update wajib (force) gak bisa ditutup sama sekali,
  // dan pas lagi unduh jangan sampai back malah nutup kartunya (progress ilang dari layar).
  useBackClose(!!(open && !force && !downloading), onClose);

  if (!open) return null;

  const t = theme;
  const versionLine = currentVersion && newVersion
    ? `v${currentVersion} → v${newVersion}`
    : newVersion ? `v${newVersion}` : null;

  if (force) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
        <div className={`w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl ${t.bgCard} ${t.border} ${t.textMain} flex flex-col items-center text-center scale-in-center animate-in zoom-in-95 duration-500 backdrop-blur-xl`}>
          <div className="pt-8 pb-4">
            <img src="/maskable-icon-512x512.png" alt="Lomeal Logo" className="w-24 h-24 mx-auto rounded-2xl shadow-lg mb-4 bg-white/5 border border-white/10 p-2" />
            <h2 className={`text-2xl font-bold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-br ${t.gradientText}`}>Update Penting!</h2>
            <p className={`text-sm font-medium ${t.textMuted} px-6`}>
              Versi terbaru Lomeal telah tersedia. Kamu harus mengunduh pembaruan ini untuk melanjutkan.
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
              <DownloadProgress progress={progress} t={t} />
            ) : (
              <button
                onClick={onUpdate}
                className={`w-full py-4 ${t.bgAccent} rounded-2xl font-bold text-lg ${t.shadowAccent} flex items-center justify-center gap-2 active:scale-95 transition-transform`}
              >
                <DownloadCloud size={24} />
                Update Sekarang
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Update opsional — kartu di dasbor, bisa ditutup
  return (
    <div className="fixed bottom-24 inset-x-4 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-bottom-8 fade-in duration-500">
      <div className={`pointer-events-auto ${t.bgCard} ${t.textMain} rounded-2xl p-4 shadow-2xl ${t.shadowAccent} w-full max-w-sm border ${t.borderAccentSoft} flex flex-col gap-3 relative overflow-hidden backdrop-blur-xl`}>
        {/* Tombol tutup disembunyikan saat mengunduh supaya kartu (dan progresnya) tidak hilang di tengah jalan */}
        {!downloading && (
          <div className="absolute top-0 right-0 p-2">
            <button onClick={onClose} className={`p-1 rounded-full ${t.textMuted} hover:${t.textMain} transition-colors`}>
              <X size={18} />
            </button>
          </div>
        )}

        <div className="flex gap-4 items-center pr-6">
          <div className={`bg-black/20 border ${t.borderAccentSoft} p-1.5 rounded-xl shrink-0`}>
            <img src="/maskable-icon-512x512.png" alt="Lomeal" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">Update Tersedia</h3>
            <p className={`text-xs ${t.textMuted} mt-0.5 tabular-nums`}>
              {versionLine || 'Ada versi Lomeal yang lebih baru.'}
            </p>
          </div>
        </div>

        {releaseNotes && !downloading && (
          <p className={`text-xs ${t.textMuted} leading-snug whitespace-pre-wrap`}>{releaseNotes}</p>
        )}

        {downloading ? (
          <DownloadProgress progress={progress} t={t} />
        ) : (
          <button
            onClick={onUpdate}
            className={`w-full py-2.5 ${t.bgAccent} rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2`}
          >
            <DownloadCloud size={18} />
            Update Sekarang
          </button>
        )}
      </div>
    </div>
  );
}
