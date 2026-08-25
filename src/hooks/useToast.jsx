import React, { useState, useCallback, useRef, useEffect } from 'react';

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
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showToast = useCallback((message, options = {}) => {
    if (!message) return;
    const duration = (typeof options === 'object' && options?.duration) ? options.duration : 2200;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const id = ++idCounter;
    setToast({ id, message });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const toastPortal = toast ? (
    <div className="fixed inset-0 z-[9997] flex flex-col items-center justify-center px-6 pointer-events-none">
      <div
        key={toast.id}
        className="w-full max-w-xs rounded-3xl px-5 py-4 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-2xl anim-rise"
      >
        <p className="text-sm font-bold text-center leading-relaxed break-words">{toast.message}</p>
      </div>
    </div>
  ) : null;

  return { toastPortal, showToast };
}

