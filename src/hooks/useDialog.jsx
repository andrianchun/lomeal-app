import React, { useState, useCallback, useRef } from 'react';

/**
 * useDialog — self-contained in-app alert & confirm dialogs.
 *
 * Tampilan seragam sama useToast: kotak ijo muda menyala di tengah layar,
 * teks doang tanpa ikon, dan teks panjang (mis. pesan error Firestore yang
 * isinya path tanpa spasi) dipaksa wrap biar gak meluber keluar kotak.
 *
 * Usage:
 *   const { dialog, showAlert, showConfirm } = useDialog(isDark);
 *
 *   await showAlert('Berhasil disimpan!');
 *   const yes = await showConfirm('Hapus postingan ini?');
 *
 * Render <>{dialog}</> somewhere in your JSX.
 */
export default function useDialog() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((value) => {
    setState(null);
    if (resolveRef.current) resolveRef.current(value);
    resolveRef.current = null;
  }, []);

  /** Show a simple informational alert. Returns a Promise that resolves when dismissed. */
  const showAlert = useCallback((message, { title = null } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ mode: 'alert', message, title });
    });
  }, []);

  /** Show a confirm dialog. Returns a Promise<boolean>. */
  const showConfirm = useCallback((message, { title = 'Konfirmasi', confirmText = 'Ya', cancelText = 'Batal', danger = false } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ mode: 'confirm', message, title, confirmText, cancelText, danger });
    });
  }, []);

  const dialog = state ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-6 animate-in fade-in duration-150 no-swipe"
      onClick={() => state.mode === 'alert' && close()}
    >
      <div
        className="w-full max-w-xs rounded-3xl p-5 bg-lime-300 text-black shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {state.title && (
          <h3 className="font-black text-base mb-1 text-center break-words">{state.title}</h3>
        )}
        <p className="text-sm leading-relaxed mb-4 text-center break-words">{state.message}</p>

        {state.mode === 'alert' && (
          <button
            onClick={() => close()}
            className="w-full py-2.5 rounded-2xl font-black text-sm bg-black text-lime-300 active:scale-95 transition-all"
          >
            OK
          </button>
        )}

        {state.mode === 'confirm' && (
          <div className="flex gap-2">
            <button
              onClick={() => close(false)}
              className="flex-1 py-2.5 rounded-2xl font-black text-sm bg-black/10 text-black active:scale-95 transition-all"
            >
              {state.cancelText}
            </button>
            <button
              onClick={() => close(true)}
              className={`flex-1 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95 transition-all ${
                state.danger ? 'bg-rose-600' : 'bg-black'
              }`}
            >
              {state.confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return { dialog, showAlert, showConfirm };
}
