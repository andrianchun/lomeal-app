import React, { useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * PanoramicSlider — horizontal swipe carousel with smooth vertical scroll coexistence.
 * Diadaptasi dari Logym:
 * - Direct transform manipulation via rAF (zero re-render during drag).
 * - Direction lock after 6px threshold.
 * - Native touchAction 'pan-y' for smooth vertical scroll.
 */
const PanoramicSlider = forwardRef(({
  onSwipeLeft,
  onSwipeRight,
  renderPanel,
  swipeThreshold = 0.25,
  onUpSwipe,
  onDownSwipe,
  className = '',
  fillHeight = false,
}, ref) => {
  const containerRef = useRef(null);
  const trackRef    = useRef(null);
  const animating   = useRef(false);
  const justDragged = useRef(false);

  const drag = useRef({
    active:    false,
    startX:    0,
    startY:    0,
    startTime: 0,
    dir:       null,
    offsetX:   0,
  });

  const setTransform = (x, withTransition) => {
    if (!trackRef.current) return;
    trackRef.current.style.transition = withTransition
      ? 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)'
      : 'none';
    trackRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    drag.current.offsetX = x;
  };

  const commitSwipe = (direction) => {
    animating.current = true;
    const cw = containerRef.current?.clientWidth || window.innerWidth;
    const target = direction === 'left' ? -cw : cw;

    setTransform(target, true);

    setTimeout(() => {
      import('react-dom').then(({ flushSync }) => {
        flushSync(() => {
          if (direction === 'left') onSwipeLeft?.();
          else                      onSwipeRight?.();
        });
        setTransform(0, false);
        setTimeout(() => { animating.current = false; }, 50);
      }).catch(() => {
        setTransform(0, false);
        if (direction === 'left') onSwipeLeft?.();
        else                      onSwipeRight?.();
        setTimeout(() => { animating.current = false; }, 50);
      });
    }, 280);
  };

  const snapBack = () => {
    setTransform(0, true);
    setTimeout(() => { animating.current = false; }, 290);
  };

  const handleTouchStart = (e) => {
    if (animating.current) return;
    const t = e.touches[0];
    drag.current = {
      active:    true,
      startX:    t.clientX,
      startY:    t.clientY,
      startTime: Date.now(),
      dir:       null,
      offsetX:   0,
    };
    setTransform(0, false);
  };

  const handleTouchMove = (e) => {
    const d = drag.current;
    if (!d.active || animating.current) return;

    const t  = e.touches[0];
    const dx = t.clientX - d.startX;
    const dy = t.clientY - d.startY;

    if (d.dir === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        d.dir = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      }
      return;
    }

    if (d.dir === 'v') return;

    if (e.cancelable) e.preventDefault();
    setTransform(dx, false);
  };

  const handleTouchEnd = (e) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;

    if (!e.changedTouches || e.changedTouches.length === 0) {
      snapBack();
      return;
    }

    const t  = e.changedTouches[0];
    const dx = t.clientX - d.startX;
    const dy = t.clientY - d.startY;
    const dt = Date.now() - d.startTime;

    if (d.dir === null) return;

    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 100);

    if (d.dir === 'v') {
      if (Math.abs(dy) > 40) {
        if (dy < 0 && onUpSwipe)   onUpSwipe();
        if (dy > 0 && onDownSwipe) onDownSwipe();
      }
      return;
    }

    const cw       = containerRef.current?.clientWidth || window.innerWidth;
    const absDx    = Math.abs(dx);
    const isFast   = dt < 280 && absDx > 25;
    const isPast   = absDx > cw * swipeThreshold;

    if (isPast || isFast) {
      commitSwipe(dx < 0 ? 'left' : 'right');
    } else {
      snapBack();
    }
  };

  useImperativeHandle(ref, () => ({
    slideLeft:  () => commitSwipe('left'),
    slideRight: () => commitSwipe('right'),
  }));

  const hClass = fillHeight ? 'h-full' : '';

  return (
    <div
      ref={containerRef}
      className={`w-full relative ${hClass} ${className}`}
      style={{
        overflow:    fillHeight ? 'hidden' : 'visible',
        touchAction: 'pan-y',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      {/* Track — ini yang bergerak horizontal */}
      <div
        ref={trackRef}
        className={`w-full relative flex-1 ${hClass}`}
        style={{ willChange: 'transform' }}
      >
        {/* Panel kiri (prev) */}
        <div className={`w-full absolute top-0 -left-full flex flex-col ${fillHeight ? 'h-full' : 'min-h-full'}`}>
          {renderPanel ? renderPanel('prev') : null}
        </div>
        {/* Panel tengah (curr) — ini yang terlihat */}
        <div className={`w-full relative flex flex-col ${fillHeight ? 'h-full' : 'min-h-full'}`}>
          {renderPanel ? renderPanel('curr') : null}
        </div>
        {/* Panel kanan (next) */}
        <div className={`w-full absolute top-0 left-full flex flex-col ${fillHeight ? 'h-full' : 'min-h-full'}`}>
          {renderPanel ? renderPanel('next') : null}
        </div>
      </div>
    </div>
  );
});

PanoramicSlider.displayName = 'PanoramicSlider';

export default PanoramicSlider;
