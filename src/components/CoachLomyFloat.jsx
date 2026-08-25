import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'lomeal_lomy_float_pos';
const SIZE = 56;          // w-14 = 56px
const EDGE_PAD = 16;      // jarak dari tepi layar saat snapped
const TOP_SAFE = 72;      // bawah header (px)
const BOT_SAFE = 100;     // atas bottom nav (px)

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function snapX(x) {
  const mid = window.innerWidth / 2;
  return x + SIZE / 2 < mid
    ? EDGE_PAD
    : window.innerWidth - SIZE - EDGE_PAD;
}

function clampY(y) {
  return clamp(y, TOP_SAFE, window.innerHeight - SIZE - BOT_SAFE);
}

/**
 * CoachLomyFloat — Draggable Coach Lomy Floating Avatar
 *
 * - Draggable, snap ke kiri/kanan saat dilepas (spring cubic-bezier)
 * - Posisi Y tersimpan di localStorage
 * - Drag dari avatar = no-swipe (tidak pindah tab)
 * - onPositionChange(pos) → dikembalikan ke parent untuk animasi LomyAIChat
 * - Proactive nutrition speech bubble
 */
export default function CoachLomyFloat({
  onOpenChat,
  nutritionInsight = null, // { title, message }
  hasUnreadChat = false,
  onPositionChange,        // callback(pos: {x,y}) → parent untuk origin animasi chat
}) {
  // ── POSISI ──────────────────────────────────────────────────────────────
  const defaultPos = () => ({
    x: window.innerWidth - SIZE - EDGE_PAD,
    y: clampY(TOP_SAFE + 10),
  });

  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved.x === 'number') {
        return {
          x: clamp(saved.x, 0, window.innerWidth - SIZE),
          y: clampY(saved.y),
        };
      }
    } catch {}
    return defaultPos();
  });

  const [visualPos, setVisualPos] = useState(pos);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isVisible, setIsVisible] = useState(() => localStorage.getItem('lomeal_lomy_hidden') !== 'true');
  const [isHoveringDrop, setIsHoveringDrop] = useState(false);
  const [showDragDrop, setShowDragDrop] = useState(false);

  // Calculate fixed drop target position
  const dropTarget = {
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - SIZE / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - 160 : 0
  };

  useEffect(() => {
    const handleToggle = (e) => {
      if (e.detail?.action === 'show' || e.detail?.action === 'showAndOpen') {
        setIsVisible(true);
        const def = defaultPos();
        setPos(def);
        setVisualPos(def);
        localStorage.setItem('lomeal_lomy_hidden', 'false');
        if (e.detail?.action === 'showAndOpen') {
          setTimeout(() => onOpenChat?.(), 100);
        }
      } else if (e.detail?.action === 'hide') {
        setIsVisible(false);
        localStorage.setItem('lomeal_lomy_hidden', 'true');
      } else {
        setIsVisible(prev => {
          const next = !prev;
          localStorage.setItem('lomeal_lomy_hidden', next ? 'false' : 'true');
          return next;
        });
      }
    };
    window.addEventListener('toggle-lomy-float', handleToggle);
    return () => window.removeEventListener('toggle-lomy-float', handleToggle);
  }, [onOpenChat]);

  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartTime = useRef(0);

  const notify = useCallback((p) => {
    onPositionChange?.({ x: p.x + SIZE / 2, y: p.y + SIZE / 2 });
  }, [onPositionChange]);

  const snapTo = useCallback((rawX, rawY) => {
    const snapped = { x: snapX(rawX), y: clampY(rawY) };
    setIsSnapping(true);
    setPos(snapped);
    setVisualPos(snapped);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
    notify(snapped);
  }, [notify]);

  useEffect(() => {
    notify(pos);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        snapTo(pos.x, pos.y);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, snapTo]);

  // ── DRAG ────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    isDragging.current = true;
    hasMoved.current = false;
    dragStartTime.current = Date.now();
    dragOffset.current = {
      x: e.clientX - visualPos.x,
      y: e.clientY - visualPos.y,
    };
    setIsSnapping(false);
    setShowDragDrop(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation(); // tidak trigger global swipe handler
  }, [visualPos]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const newX = clamp(e.clientX - dragOffset.current.x, 0, window.innerWidth - SIZE);
    const newY = clampY(e.clientY - dragOffset.current.y);
    const moved = Math.abs(newX - visualPos.x) + Math.abs(newY - visualPos.y);
    if (moved > 4) hasMoved.current = true;

    const dist = Math.hypot((newX - dropTarget.x), (newY - dropTarget.y));
    
    if (dist < 60) {
      setIsHoveringDrop(true);
      setVisualPos({ x: dropTarget.x, y: dropTarget.y });
    } else {
      setIsHoveringDrop(false);
      setVisualPos({ x: newX, y: newY });
    }
  }, [visualPos, dropTarget.x, dropTarget.y]);

  const onPointerUp = useCallback((e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setShowDragDrop(false);
    const elapsed = Date.now() - dragStartTime.current;

    if (isHoveringDrop) {
      setIsVisible(false);
      localStorage.setItem('lomeal_lomy_hidden', 'true');
      window.dispatchEvent(new CustomEvent('toggle-lomy-float', { detail: { action: 'hide' } }));
      setIsHoveringDrop(false);
      // Snap back silently for when it reappears
      setPos(defaultPos());
      setVisualPos(defaultPos());
      return;
    }

    if (!hasMoved.current && elapsed < 300) {
      // Tap → buka chat, kembalikan ke snap pos
      setIsSnapping(true);
      setVisualPos(pos);
      handleOpenChat();
    } else {
      snapTo(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
    }
  }, [pos, snapTo, isHoveringDrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── INSIGHT ─────────────────────────────────────────────────────────────
  const [showInsight, setShowInsight] = useState(false);
  const [dismissedKey, setDismissedKey] = useState(null);
  const [isBouncingIn, setIsBouncingIn] = useState(false);
  const timerRef = useRef(null);

  const insightKey = nutritionInsight ? `${nutritionInsight.title}_${nutritionInsight.message?.slice(0, 20)}` : null;
  const isDismissed = dismissedKey === insightKey;

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!nutritionInsight || isDismissed) return;
    timerRef.current = setTimeout(() => {
      setIsBouncingIn(true);
      setShowInsight(true);
    }, 2500);
    return () => clearTimeout(timerRef.current);
  }, [insightKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = (e) => {
    e.stopPropagation();
    setShowInsight(false);
    setDismissedKey(insightKey);
  };

  const handleOpenChat = () => {
    setShowInsight(false);
    onOpenChat?.();
  };

  const snappedToRight = visualPos.x > window.innerWidth / 2;
  const bubbleAbove = visualPos.y > window.innerHeight / 2;

  if (!isVisible) return null;

  return (
    <>
      {/* Drop zone UI */}
      <div 
        className={`fixed w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 z-[60] pointer-events-none ${showDragDrop ? 'opacity-100' : 'opacity-0 scale-75'} ${isHoveringDrop ? 'bg-rose-500/80 border-rose-500 scale-125 shadow-lg shadow-rose-500/50' : 'bg-black/30 dark:bg-white/20 border-white/30'} border-2`}
        style={{ left: dropTarget.x, top: dropTarget.y }}
      >
        <X size={28} className={`${isHoveringDrop ? 'text-white' : 'text-zinc-400'} transition-colors duration-200`} />
      </div>

      {/* no-swipe → global swipe handler akan skip element ini */}
      <div
        className="fixed z-50 select-none no-swipe"
        style={{
          left: visualPos.x,
          top: visualPos.y,
          width: SIZE,
          height: SIZE,
          transition: isSnapping
            ? 'left 0.42s cubic-bezier(0.34,1.56,0.64,1), top 0.42s cubic-bezier(0.34,1.56,0.64,1)'
            : 'none',
          willChange: 'left, top',
        }}
      >
        {/* ── SPEECH BUBBLE ─────────────────────────────────────────── */}
        {showInsight && nutritionInsight && !isDismissed && (
          <div
            className="pointer-events-auto absolute w-[250px]
              bg-[#0a1510]/98 backdrop-blur-xl border border-emerald-500/40
              rounded-2xl p-3.5 shadow-2xl shadow-emerald-500/20"
            style={{
              ...(snappedToRight ? { right: SIZE + 10 } : { left: SIZE + 10 }),
              ...(bubbleAbove ? { bottom: 0 } : { top: 0 }),
              opacity: isBouncingIn ? 1 : 0,
              transform: isBouncingIn ? 'scale(1)' : 'scale(0.92)',
              transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              transformOrigin: `${snappedToRight ? 'right' : 'left'} ${bubbleAbove ? 'bottom' : 'top'}`,
            }}
          >
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X size={13} />
            </button>
            <div className="flex items-center gap-1.5 mb-2 pr-4">
              <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                🥗 {nutritionInsight.title || 'Lomy Insight'}
              </span>
            </div>
            <p className="text-white/90 text-xs leading-relaxed mb-3">
              {nutritionInsight.message}
            </p>
            <button
              onClick={handleOpenChat}
              className="w-full flex items-center justify-between bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-bold px-3 py-2 rounded-xl transition-colors group"
            >
              <span>Tanya Coach Lomy</span>
              <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* ── AVATAR ────────────────────────────────────────────────── */}
        <div
          className="w-14 h-14 rounded-full border-2 border-emerald-400 bg-zinc-900
            shadow-xl shadow-emerald-500/30 overflow-hidden relative
            cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: "url('/bg-lomeal-coach.webp')",
            backgroundSize: '450%',
            backgroundPosition: '50% 12%',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title="Tahan untuk geser · Ketuk untuk chat"
          aria-label="Coach Lomy — ketuk untuk chat"
        />

        {/* Titik unread */}
        {hasUnreadChat && (
          <span
            className="absolute top-0 right-0 w-3.5 h-3.5 bg-rose-500 rounded-full pointer-events-none animate-pulse"
            style={{ boxShadow: '0 0 6px 2px rgba(244,63,94,0.65)', animationDuration: '2.2s' }}
          />
        )}
      </div>
    </>
  );
}
