import React, { useState, useCallback, useRef } from 'react';
import useBackClose from './useBackClose';

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

  // Back = sama kayak tombol Batal (bukan Ya) — konvensi standar Android: tombol back
  // di dialog itu batalin, gak pernah nyetujuin aksi (apalagi yang danger:true).
  useBackClose(!!state, () => close(state?.mode === 'confirm' ? false : undefined));

  const dialog = state ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-6 animate-in fade-in duration-150 no-swipe"
      onClick={() => state.mode === 'alert' && close()}
    >
      <div
        className="w-full max-w-xs rounded-3xl p-6 bg-white/80 dark:bg-[#0b1f16]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 text-center"
        onClick={e => e.stopPropagation()}
      >
        {state.title && (
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white break-words">{state.title}</h3>
        )}
        <p className="text-sm font-medium mb-6 text-gray-600 dark:text-gray-400 break-words">{state.message}</p>

        {state.mode === 'alert' && (
          <button
            onClick={() => close()}
            className="w-full py-3 rounded-2xl font-bold text-sm bg-emerald-500 text-white active:scale-95 transition-all shadow-sm"
          >
            OK
          </button>
        )}

        {state.mode === 'confirm' && (
          <div className="flex gap-3">
            <button
              onClick={() => close(false)}
              className="flex-1 py-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white font-medium text-sm active:scale-95 transition-all"
            >
              {state.cancelText}
            </button>
            <button
              onClick={() => close(true)}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all shadow-lg ${
                state.danger ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-emerald-500 text-white shadow-emerald-500/20'
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
