import React, { useState, useRef, useEffect } from 'react';
import { GlassWater } from 'lucide-react';

const SLIDER_HEIGHT = 200; // expanded height in px

const WaterSlider = ({ currentWater, maxWater = 4000, onAdd, onSet, theme }) => {
  const [isSliderMode, setIsSliderMode] = useState(false);
  const [tempWater, setTempWater] = useState(currentWater);
  const containerRef = useRef(null);
  const sliderRef = useRef(null);
  const longPressTimer = useRef(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isSliderMode) {
      setTempWater(currentWater);
    }
  }, [currentWater, isSliderMode]);

  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = false;
    setTempWater(currentWater);

    longPressTimer.current = setTimeout(() => {
      setIsSliderMode(true);
      isDragging.current = true;
    }, 300);
  };

  const handlePointerMove = (e) => {
    if (isSliderMode && isDragging.current && sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      let percentage = (rect.bottom - e.clientY) / rect.height;
      percentage = Math.max(0, Math.min(1, percentage));
      
      const newWater = Math.round((percentage * maxWater) / 50) * 50; 
      setTempWater(newWater);
    }
  };

  const handlePointerUp = (e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isSliderMode) {
      setIsSliderMode(false);
      isDragging.current = false;
      onSet(tempWater);
    } else {
      onAdd(200);
    }
  };

  const fillPercentage = Math.max(0, Math.min(100, (tempWater / maxWater) * 100));

  return (
    <div 
      className="relative shrink-0 z-50 touch-none select-none"
      style={{ width: '56px', height: '56px' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Base Button (Always visible but invisible background when slider is active) */}
      <div className={`absolute bottom-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center border overflow-hidden transition-all duration-300 ${
        isSliderMode 
          ? 'border-transparent bg-transparent opacity-0 scale-90' 
          : `${theme === 'dark' ? 'border-sky-900 bg-sky-950/40' : 'border-sky-200 bg-sky-50'} shadow-lg backdrop-blur-md opacity-100 scale-100`
      }`}>
         <div 
           className={`absolute bottom-0 left-0 right-0 ${theme === 'dark' ? 'bg-sky-500/30' : 'bg-sky-500/20'} transition-all duration-300 ease-linear pointer-events-none`}
           style={{ height: `${fillPercentage}%` }}
         />
         <div className="relative z-10 flex flex-col items-center pointer-events-none">
           <GlassWater size={20} className="text-sky-500 mb-0.5" />
           <span className="text-[10px] font-bold text-sky-500">+200</span>
         </div>
      </div>

      {/* Expanded Slider Overlay (Pops up from the bottom) */}
      <div 
        ref={sliderRef}
        className={`absolute bottom-0 left-0 w-14 rounded-[24px] border overflow-hidden flex flex-col items-center justify-end origin-bottom transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${
          isSliderMode 
            ? `scale-y-100 opacity-100 ${theme === 'dark' ? 'border-sky-700 bg-sky-950/90' : 'border-sky-300 bg-sky-100'} shadow-2xl backdrop-blur-xl`
            : 'scale-y-[0.28] opacity-0 pointer-events-none'
        }`}
        style={{ height: `${SLIDER_HEIGHT}px` }}
      >
        {/* Fill Level */}
        <div 
          className="absolute bottom-0 left-0 right-0 bg-sky-500 transition-all duration-100 ease-linear pointer-events-none"
          style={{ height: `${fillPercentage}%` }}
        />
        
        {/* Value Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1 transition-opacity duration-300" style={{ opacity: isSliderMode ? 1 : 0 }}>
          <span className="text-sm font-black text-white drop-shadow-md">{tempWater}</span>
          <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest drop-shadow-md">mL</span>
        </div>
      </div>

      {/* Small Badge for total water when not in slider mode */}
      <div className={`absolute -top-1.5 -right-1.5 bg-sky-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm pointer-events-none z-50 whitespace-nowrap transition-opacity duration-300 ${isSliderMode || currentWater === 0 ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
        {currentWater}
      </div>
    </div>
  );
};

export default WaterSlider;
