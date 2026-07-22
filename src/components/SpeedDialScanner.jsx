import React, { useState, useRef } from 'react';
import { Camera, ImageIcon } from 'lucide-react';

const SpeedDialScanner = ({ onSelectCamera, onSelectGallery, mainIcon: MainIcon = Camera, mainColorClass, disabled, direction = 'up' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  
  const containerRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const handlePointerDown = (e) => {
    if (disabled) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    setIsOpen(true);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isOpen || disabled) return;
    const dy = e.clientY - startPos.current.y;
    const threshold = 30;
    
    if (direction === 'up') {
      if (dy < -threshold) {
        setActiveItem('gallery');
        hasMoved.current = true;
      } else {
        setActiveItem(null);
        hasMoved.current = false;
      }
    } else {
      if (dy > threshold) {
        setActiveItem('gallery');
        hasMoved.current = true;
      } else {
        setActiveItem(null);
        hasMoved.current = false;
      }
    }
  };

  const handlePointerUp = (e) => {
    if (disabled) return;
    setIsOpen(false);
    e.target.releasePointerCapture(e.pointerId);

    if (activeItem === 'gallery') {
      onSelectGallery();
    }
    setActiveItem(null);
  };

  const handleClick = (e) => {
    if (disabled) return;
    if (hasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      hasMoved.current = false;
      return;
    }
    onSelectCamera();
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  return (
    <div 
      className="relative flex items-center justify-center" 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        className={`relative z-20 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 ${mainColorClass}`}
        aria-label="Kamera"
        style={{ touchAction: 'none' }}
      >
        <MainIcon size={24} />
      </button>

      {/* Floating Menu */}
      <div 
        className={`absolute z-50 flex flex-col gap-3 transition-all duration-300 pointer-events-none
          ${direction === 'up' ? 'bottom-[110%] origin-bottom mb-2' : 'top-[110%] origin-top mt-2'}
          ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}
        `}
      >
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectGallery(); setIsOpen(false); }} 
          className={`flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-[#1a2e22] shadow-xl border border-black/10 dark:border-white/10 transition-transform pointer-events-auto
            ${activeItem === 'gallery' ? 'scale-110 bg-green-50 dark:bg-green-900/30 ring-2 ring-green-500' : 'hover:scale-110'}`}
        >
          <div className="p-2.5 rounded-full bg-green-500 text-white"><ImageIcon size={18} /></div>
        </button>
      </div>
    </div>
  );
};

export default SpeedDialScanner;
