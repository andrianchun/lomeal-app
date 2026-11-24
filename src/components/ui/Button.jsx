import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl font-bold transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

  const variants = {
    primary: 'bg-gradient-to-br from-green-500 to-green-700 text-white shadow-sm',
    secondary: 'bg-[var(--brand-surface-solid)] text-[var(--brand-text)] border border-[var(--brand-border)]',
    ghost: 'bg-transparent text-[var(--brand-text)] hover:bg-black/5 dark:hover:bg-white/5',
    danger: 'bg-[#F43F5E] hover:bg-[#E11D48] text-white',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      style={{ fontSize: 'var(--text-body)' }}
      className={`${base} ${variants[variant] || variants.primary} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {isLoading && <Loader2 className="animate-spin shrink-0" size={18} />}
      {children}
    </button>
  );
}
