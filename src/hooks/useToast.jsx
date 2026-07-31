import React, { useState, useCallback, useRef } from 'react';

/**
 * useToast — notifikasi ringan yang hilang sendiri (bukan modal blocking kayak
 * useDialog). Dipakai buat konfirmasi rutin ("dicatat!", "tersimpan!") yang gak
 * perlu ditutup manual sama user.
 *
 * Tampilan sengaja seragam sama useDialog: kotak ijo muda menyala, teks doang,
 * tanpa ikon, di tengah layar.
 *
 * Usage:
 *   const { toastPortal, showToast } = useToast(isDark);
 *   showToast('Makanan dicatat!');
 *   render <>{toastPortal}</> sekali di root.
 */
let idCounter = 0;

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const showToast = useCallback((message, { duration = 2200 } = {}) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, duration);
  }, []);

  const toastPortal = toasts.length > 0 ? (
    <div className="fixed inset-0 z-[9997] flex flex-col items-center justify-center gap-2 px-6 pointer-events-none">
      {toasts.map((tst) => (
        <div
          key={tst.id}
          className="w-full max-w-xs rounded-3xl px-5 py-4 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-2xl anim-rise"
        >
          <p className="text-sm font-bold text-center leading-relaxed break-words">{tst.message}</p>
        </div>
      ))}
    </div>
  ) : null;

  return { toastPortal, showToast };
}
