import React, { useState, useEffect, useRef } from 'react';

/**
 * Input angka yang bisa diubah dengan swipe (geser jari naik/turun), atau ketik manual.
 * Diadaptasi dari SwipeInput Logym (lyfit.app/src/components/SwipeInput.jsx) — versi ringan,
 * cuma buat angka bulat (gak butuh parser desimal/locale kayak versi Logym).
 */
const SwipeInput = ({ value, onChange, step = 1, min = 0, max, className, placeholder, ...props }) => {
  const inputRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startY: 0, startVal: 0, lastVal: undefined });
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!dragRef.current.isDragging) setLocalValue(value);
  }, [value]);

  const clamp = (v) => {
    let n = v;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  };

  const onTouchStart = (e) => {
    e.stopPropagation();
    const sVal = Number(localValue) || 0;
    dragRef.current = { isDragging: true, startY: e.touches[0].clientY, startVal: sVal, lastVal: undefined };
  };

  const onTouchMove = (e) => {
    if (!dragRef.current.isDragging) return;
    e.stopPropagation();
    const diffY = dragRef.current.startY - e.touches[0].clientY;
    const steps = Math.round(diffY / 15);
    const newValue = clamp(dragRef.current.startVal + steps * step);
    if (newValue !== Number(localValue)) {
      dragRef.current.lastVal = newValue;
      setLocalValue(newValue);
    }
  };

  const onTouchEnd = () => {
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
      if (dragRef.current.lastVal !== undefined && dragRef.current.lastVal !== Number(value)) {
        onChange(dragRef.current.lastVal);
      }
    }
  };

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleMove = (e) => { if (dragRef.current.isDragging) e.preventDefault(); };
    el.addEventListener('touchmove', handleMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleMove);
  }, []);

  return (
    <input
      ref={inputRef}
      type="number" inputMode="numeric"
      style={{ touchAction: 'none' }}
      {...props}
      value={localValue ?? ''}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => { const n = clamp(Number(localValue) || 0); setLocalValue(n); onChange(n); }}
      onFocus={(e) => e.target.select()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      placeholder={placeholder}
      className={`text-center ${className}`}
    />
  );
};

export default SwipeInput;
