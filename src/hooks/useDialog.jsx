import React, { useState, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

/**
 * useDialog — self-contained in-app alert & confirm dialogs.
 * 
 * Usage:
 *   const { dialog, showAlert, showConfirm } = useDialog(isDark);
 * 
 *   await showAlert('Berhasil disimpan!');
 *   const yes = await showConfirm('Hapus postingan ini?');
 * 
 * Render <>{dialog}</> somewhere in your JSX.
 */
export default function useDialog(isDark = false, customBgClass = null) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((value) => {
    setState(null);
    if (resolveRef.current) resolveRef.current(value);
    resolveRef.current = null;
  }, []);

  /** Show a simple informational alert. Returns a Promise that resolves when dismissed. */
  const showAlert = useCallback((message, { title = null, type = 'info' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ mode: 'alert', message, title, type });
    });
  }, []);

  /** Show a confirm dialog. Returns a Promise<boolean>. */
  const showConfirm = useCallback((message, { title = 'Konfirmasi', confirmText = 'Ya', cancelText = 'Batal', danger = false } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ mode: 'confirm', message, title, confirmText, cancelText, danger });
    });
  }, []);

  const TYPE_ICON = {
    success: <CheckCircle2 size={22} className="text-green-500 shrink-0" />,
    error:   <AlertCircle  size={22} className="text-rose-500 shrink-0" />,
    info:    <Info         size={22} className="text-sky-500 shrink-0" />,
  };

  const dialog = state ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-6 animate-in fade-in duration-150"
      onClick={() => state.mode === 'alert' && close()}
    >
      <div
        className={`w-full max-w-xs rounded-3xl p-5 shadow-2xl border animate-in zoom-in-95 duration-200 ${
          isDark ? `${customBgClass || 'bg-slate-900'} border-white/10` : 'bg-white border-black/8'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Icon + title */}
        <div className="flex items-start gap-3 mb-3">
          {state.mode === 'alert' && TYPE_ICON[state.type || 'info']}
          <div className="flex-1">
            {state.title && (
              <h3 className={`font-black text-base mb-1 ${isDark ? 'text-white' : 'text-black'}`}>{state.title}</h3>
            )}
            <p className={`text-sm leading-relaxed ${isDark ? 'text-white/70' : 'text-black/65'}`}>{state.message}</p>
          </div>
        </div>

        {/* Buttons */}
        {state.mode === 'alert' && (
          <button
            onClick={() => close()}
            className="w-full mt-1 py-2.5 rounded-2xl font-black text-sm bg-sky-500 text-white hover:bg-sky-600 active:scale-95 transition-all"
          >
            OK
          </button>
        )}

        {state.mode === 'confirm' && (
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => close(false)}
              className={`flex-1 py-2.5 rounded-2xl font-black text-sm transition-all active:scale-95 ${
                isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-black/8 text-black hover:bg-black/12'
              }`}
            >
              {state.cancelText}
            </button>
            <button
              onClick={() => close(true)}
              className={`flex-1 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95 transition-all ${
                state.danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-sky-500 hover:bg-sky-600'
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
