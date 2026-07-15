import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const PwaUpdater = ({ t, isDark }) => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Cek update tiap jam sebagai jaring pengaman...
        setInterval(() => { r.update(); }, 60 * 60 * 1000);
        // ...tapi di HP tab jarang idle 1 jam penuh, jadi cek juga tiap app di-resume ke foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') r.update();
        });
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-sm p-4 rounded-2xl border shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 ${isDark ? 'bg-[#12141c] border-white/10' : 'bg-white border-black/10'}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full shrink-0 mt-0.5 ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
          <RefreshCw size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Pembaruan Tersedia</p>
            <button
              onClick={() => setNeedRefresh(false)}
              className={`p-1 rounded-full shrink-0 ${isDark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`}
            >
              <X size={14} />
            </button>
          </div>
          <p className={`text-xs ${isDark ? 'text-white/70' : 'text-black/60'} leading-snug mb-3`}>
            Versi baru Lomeal sudah siap. Muat ulang sekarang untuk menggunakan fitur terbaru!
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all ${t.bgAccent || 'bg-emerald-500'}`}
            >
              Muat Ulang
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className={`px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/5 text-black hover:bg-black/10'}`}
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </div>
  );

};

export default PwaUpdater;
