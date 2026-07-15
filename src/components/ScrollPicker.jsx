import React, { useRef, useEffect, useState } from 'react';

const ScrollPicker = ({ value, onChange, min = 0, max = 200, step = 1, width = 'w-16', height = 120, theme = 'light', t }) => {
  const containerRef = useRef(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [activeOpt, setActiveOpt] = useState(value);
  const scrollTimeout = useRef(null);
  const lastScrollEndAt = useRef(0);
  const pointerDownPos = useRef(null);

  // Ketik manual — dipencet (tanpa geser) akan membuka input teks biasa,
  // sama seperti SwipeInput di tempat lain.
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const editInputRef = useRef(null);

  // Generate options based on min, max, step
  const options = [];
  for (let i = min; i <= max; i += step) {
    options.push(Number(i.toFixed(1))); // Handle float step
  }

  // Handle initial scroll position
  useEffect(() => {
    if (!containerRef.current || isScrolling || isEditing) return;
    let index = options.indexOf(value);
    
    if (index === -1) {
      // Find closest option if exact match not found (e.g. 78.1 with step 1)
      let minDiff = Infinity;
      options.forEach((opt, idx) => {
        const diff = Math.abs(opt - value);
        if (diff < minDiff) {
          minDiff = diff;
          index = idx;
        }
      });
    }

    if (index !== -1) {
      containerRef.current.scrollTop = index * 40; // 40px is the height of one item
      setActiveOpt(options[index]);
      if (options[index] !== value) {
        onChange(options[index]); // Sync parent state with snapped value
      }
    }
  }, [value, options, isScrolling, isEditing]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  const handleScroll = (e) => {
    setIsScrolling(true);
    
    const scrollTop = e.target.scrollTop;
    const index = Math.round(scrollTop / 40);
    
    if (index >= 0 && index < options.length) {
      setActiveOpt(options[index]);
    }

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      setIsScrolling(false);
      lastScrollEndAt.current = Date.now();

      if (index >= 0 && index < options.length) {
        const newValue = options[index];
        if (newValue !== value) {
          onChange(newValue);
        }
      }
    }, 150); // Debounce scroll end
  };

  const handlePointerDown = (e) => {
    const point = e.touches ? e.touches[0] : e;
    pointerDownPos.current = { x: point.clientX, y: point.clientY };
  };

  const handleTap = (e) => {
    // Bedakan tap murni dari geser: kalau baru saja scroll (atau masih scrolling), abaikan.
    if (isScrolling || Date.now() - lastScrollEndAt.current < 300) return;
    const point = e.changedTouches ? e.changedTouches[0] : e;
    if (pointerDownPos.current) {
      const dx = Math.abs(point.clientX - pointerDownPos.current.x);
      const dy = Math.abs(point.clientY - pointerDownPos.current.y);
      if (dx > 6 || dy > 6) return; // ini geser, bukan tap
    }
    setDraftValue(String(value ?? ''));
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(String(draftValue).replace(',', '.'));
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      const snapped = Math.round(clamped / step) * step;
      onChange(Number(snapped.toFixed(2)));
    }
  };

  const borderClass = t?.borderAccent || (theme === 'dark' ? 'border-[#3b82f6]' : 'border-[#3b82f6]');
  const bgSoftClass = t?.bgAccentSoft || (theme === 'dark' ? 'bg-[#3b82f6]/20' : 'bg-[#3b82f6]/20');
  const textAccentClass = t?.textAccent || (theme === 'dark' ? 'text-[#9db8d6]' : 'text-[#41759b]');
  const textMutedClass = t?.textMuted || (theme === 'dark' ? 'text-slate-400' : 'text-slate-600');

  const paddingHeight = Math.max(0, (height - 40) / 2);

  if (isEditing) {
    return (
      <div className={`relative ${width} ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'} rounded-xl flex items-center justify-center`} style={{ height: `${height}px` }}>
        <input
          ref={editInputRef}
          type="text"
          inputMode="decimal"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
          className={`w-full text-center font-black text-2xl bg-transparent outline-none ${textAccentClass}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative ${width} ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'} rounded-xl overflow-hidden shadow-inner`}
      style={{ height: `${height}px`, touchAction: 'pan-y', scrollSnapType: 'y mandatory' }}
    >
      {/* Active selection overlay */}
      <div className={`absolute top-1/2 left-0 w-full h-[40px] -translate-y-1/2 border-y-2 pointer-events-none z-10 ${bgSoftClass} ${borderClass}`} />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onMouseUp={handleTap}
        onTouchEnd={handleTap}
        className="h-full w-full overflow-y-auto snap-y snap-mandatory hide-scrollbar relative z-20"
        style={{ scrollBehavior: isScrolling ? 'auto' : 'smooth' }}
      >
        {/* Padding items to allow snapping to first and last */}
        <div style={{ height: `${paddingHeight}px` }} className="snap-center shrink-0"></div>

        {options.map((opt) => (
          <div
            key={opt}
            className={`h-[40px] flex items-center justify-center snap-center font-bold text-lg transition-opacity ${
              opt === activeOpt ? `opacity-100 ${textAccentClass}` : `opacity-20 ${textMutedClass}`
            }`}
          >
            {opt}
          </div>
        ))}

        <div style={{ height: `${paddingHeight}px` }} className="snap-center shrink-0"></div>
      </div>
    </div>
  );
};

export default ScrollPicker;
