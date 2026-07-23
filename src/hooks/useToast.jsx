import React, { useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

/**
 * useToast — notifikasi ringan yang hilang sendiri (bukan modal blocking kayak
 * useDialog). Dipakai buat konfirmasi rutin ("dicatat!", "tersimpan!") yang gak
 * perlu ditutup manual sama user.
 *
 * Usage:
 *   const { toastPortal, showToast } = useToast(isDark);
 *   showToast('Makanan dicatat!');
 *   render <>{toastPortal}</> sekali di root.
 */
let idCounter = 0;

export default function useToast(isDark = false) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const showToast = useCallback((message, { type = 'success', duration = 2200 } = {}) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, duration);
  }, []);

  const ICON = {
    success: <CheckCircle2 size={18} className="text-green-500 shrink-0" />,
    error: <AlertCircle size={18} className="text-rose-500 shrink-0" />,
    info: <Info size={18} className="text-emerald-400 shrink-0" />,
  };

  const toastPortal = toasts.length > 0 ? (
    <div
      className="fixed inset-x-0 z-[9997] flex flex-col items-center gap-2 pointer-events-none px-4"
      style={{ bottom: 'calc(90px + env(safe-area-inset-bottom, 20px))' }}
    >
      {toasts.map((tst) => (
        <div
          key={tst.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-xl max-w-[90vw] anim-rise ${
            isDark ? 'bg-[#0b1f16]/90 border-white/10 text-white' : 'bg-white/90 border-black/10 text-black'
          }`}
        >
          {ICON[tst.type]}
          <span className="text-sm font-bold">{tst.message}</span>
        </div>
      ))}
    </div>
  ) : null;

  return { toastPortal, showToast };
}
