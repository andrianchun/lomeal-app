import React, { useState, useCallback, useRef, useEffect } from 'react';
import useBackClose from './useBackClose';

function PromptForm({ state, onConfirm, onCancel }) {
  const [val, setVal] = useState(state.defaultValue || '');
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }, 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(val);
      }}
      className="w-full text-center"
    >
      {state.title && (
        <h3 className="text-lg font-bold mb-1.5 text-gray-900 dark:text-white break-words">
          {state.title}
        </h3>
      )}
      {state.subtitle && (
        <div className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-2">
          {state.subtitle}
        </div>
      )}
      <p className="text-xs font-medium mb-4 text-gray-600 dark:text-gray-400 break-words leading-relaxed whitespace-pre-line">
        {state.message}
      </p>

      <input
        ref={inputRef}
        type={state.inputType || 'text'}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={state.placeholder || ''}
        className="w-full px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-zinc-900/90 border border-black/10 dark:border-zinc-700/60 text-gray-900 dark:text-white text-center font-bold text-base focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 mb-5 transition-all shadow-inner"
      />

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => onCancel(null)}
          className="flex-1 py-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white font-medium text-xs sm:text-sm active:scale-95 transition-all cursor-pointer"
        >
          {state.cancelText || 'Batal'}
        </button>
        <button
          type="submit"
          className="flex-1 py-3 rounded-2xl font-bold text-xs sm:text-sm active:scale-95 transition-all shadow-lg bg-emerald-500 hover:bg-emerald-400 text-white dark:text-zinc-950 shadow-emerald-500/20 cursor-pointer"
        >
          {state.confirmText || 'OK'}
        </button>
      </div>
    </form>
  );
}

/**
 * useDialog — self-contained in-app alert, confirm & prompt dialogs.
 *
 * Tampilan seragam sama tema Lomeal: kotak rounded-3xl elegan di tengah layar,
 * backdrop blur, dan input angka/teks yang rapi tanpa popup browser lawas.
 *
 * Usage:
 *   const { dialog, showAlert, showConfirm, showPrompt } = useDialog(isDark);
 *
 *   await showAlert('Berhasil disimpan!');
 *   const yes = await showConfirm('Hapus postingan ini?');
 *   const name = await showPrompt('Nama makanan:', { defaultValue: 'Nasi' });
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

  /** Show a prompt dialog with an input. Returns a Promise<string | null>. */
  const showPrompt = useCallback((message, {
    title = 'Input',
    defaultValue = '',
    placeholder = '',
    subtitle = null,
    confirmText = 'OK',
    cancelText = 'Batal',
    inputType = 'text',
  } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        mode: 'prompt',
        message,
        title,
        defaultValue,
        placeholder,
        subtitle,
        confirmText,
        cancelText,
        inputType,
      });
    });
  }, []);

  // Back = sama kayak tombol Batal — konvensi standar Android: tombol back
  // di dialog itu batalin aksi (returns null untuk prompt, false untuk confirm).
  useBackClose(!!state, () => close(state?.mode === 'prompt' ? null : (state?.mode === 'confirm' ? false : undefined)));

  const dialog = state ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center px-6 animate-in fade-in duration-150 no-swipe"
      onClick={() => state.mode === 'alert' && close()}
    >
      <div
        className="w-full max-w-xs rounded-3xl p-6 bg-white/90 dark:bg-zinc-950/90 text-gray-900 dark:text-white backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {state.mode === 'prompt' ? (
          <PromptForm state={state} onConfirm={close} onCancel={close} />
        ) : (
          <>
            {state.title && (
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white break-words">{state.title}</h3>
            )}
            <p className="text-sm font-medium mb-6 text-gray-600 dark:text-gray-400 break-words">{state.message}</p>

            {state.mode === 'alert' && (
              <button
                onClick={() => close()}
                className="w-full py-3 rounded-2xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white dark:text-zinc-950 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                OK
              </button>
            )}

            {state.mode === 'confirm' && (
              <div className="flex gap-3">
                <button
                  onClick={() => close(false)}
                  className="flex-1 py-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white font-medium text-sm active:scale-95 transition-all cursor-pointer"
                >
                  {state.cancelText}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`flex-1 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all shadow-lg cursor-pointer ${
                    state.danger ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-400 text-white dark:text-zinc-950 shadow-emerald-500/20'
                  }`}
                >
                  {state.confirmText}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  ) : null;

  return { dialog, showAlert, showConfirm, showPrompt };
}
