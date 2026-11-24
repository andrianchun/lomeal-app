import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Dialog({ open, onClose, title, children, footer, disableClose = false }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && !disableClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, disableClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4">
      <div className="absolute inset-0" onClick={() => !disableClose && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full sm:max-w-md bg-[var(--brand-surface-solid)] text-[var(--brand-text)] border-t sm:border border-[var(--brand-border)] rounded-t-3xl sm:rounded-3xl px-5 pt-5 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] sm:p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[var(--brand-border)]">
          <h2 className="ds-h2">{title}</h2>
          {!disableClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="min-w-[42px] min-h-[42px] inline-flex items-center justify-center rounded-full text-[var(--brand-muted)] hover:text-[var(--brand-text)] cursor-pointer"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="py-4 ds-body max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="pt-3 border-t border-[var(--brand-border)] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
