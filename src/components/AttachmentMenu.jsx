import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Camera, ImageIcon, Mic } from 'lucide-react';

const AttachmentMenu = ({ onSelectCamera, onSelectGallery, onSelectMic, mainColorClass, disabled, isListening }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  
  const containerRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const wasOpenOnDown = useRef(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  const handlePointerDown = (e) => {
    if (disabled) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    wasOpenOnDown.current = isOpen; // Capture state before opening
    setIsOpen(true);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isOpen || disabled) return;
    const dx = e.clientX - startPos.current.x;
    const dy = startPos.current.y - e.clientY; // y axis is inverted on screen
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const threshold = 20;
    
    if (distance > threshold) {
      hasMoved.current = true;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      // Camera (Right): 337.5 - 360 or 0 - 22.5
      // Gallery (Top Right): 22.5 - 67.5
      // Mic (Top): 67.5 - 112.5
      
      if (angle >= 337.5 || angle <= 22.5) {
        setActiveItem('camera');
      } else if (angle > 22.5 && angle <= 67.5) {
        setActiveItem('gallery');
      } else if (angle > 67.5 && angle <= 112.5) {
        setActiveItem('mic');
      } else {
        setActiveItem(null);
      }
    } else {
      setActiveItem(null);
    }
  };

  const handlePointerUp = (e) => {
    if (disabled) return;
    e.target.releasePointerCapture(e.pointerId);

    if (activeItem) {
      if (activeItem === 'camera') onSelectCamera();
      if (activeItem === 'gallery') onSelectGallery();
      if (activeItem === 'mic') onSelectMic();
      setIsOpen(false);
    } else if (!hasMoved.current) {
      // Just a tap
      if (wasOpenOnDown.current) {
        // It was already open before the tap, so close it
        setIsOpen(false);
      } else {
        // It was closed before the tap, so keep it open
        setIsOpen(true);
      }
    } else {
      // Moved but not active (e.g. dragged left/down)
      setIsOpen(false);
    }
    
    setActiveItem(null);
  };

  // Trigger directly from buttons when menu is open
  const triggerItem = (e, item) => {
    e.stopPropagation();
    if (item === 'camera') onSelectCamera();
    if (item === 'gallery') onSelectGallery();
    if (item === 'mic') onSelectMic();
    setIsOpen(false);
  };

  return (
    <div className="relative flex items-center justify-center w-[50px] h-[50px]" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`relative z-20 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 w-[50px] h-[50px] rounded-full ${isListening ? 'bg-red-500 text-white' : mainColorClass} shadow-lg`}
        aria-label="Lampiran"
        style={{ touchAction: 'none' }}
      >
        {isListening ? (
          <Mic size={22} className="transition-transform" />
        ) : (
          <Paperclip size={22} className={isOpen ? 'rotate-90 transition-transform' : 'transition-transform'} />
        )}
      </button>

      {/* Floating Radial Menu (MOBA Style Fan) */}
      <div 
        className={`absolute pointer-events-none inset-0 flex items-end justify-start z-0`}
      >
        <div className={`absolute bottom-0 left-0 w-[150px] h-[150px] origin-bottom-left transition-all duration-300 ease-out
            ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        >
          {/* Fan Background SVG */}
          <svg width="150" height="150" viewBox="0 0 150 150" className="absolute inset-0 drop-shadow-2xl">
            {/* Slice 1: Camera (0-30 deg) */}
            <path 
              d="M 32 150 L 150 150 A 150 150 0 0 0 129.9 75 L 27.71 134 A 32 32 0 0 1 32 150 Z" 
              className={`transition-colors duration-200 stroke-black/10 dark:stroke-white/10 stroke-[2px] ${isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${activeItem === 'camera' ? 'fill-green-500/90' : 'fill-white/95 dark:fill-[#1a2e22]/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('camera')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'camera')}
            />
            {/* Slice 2: Gallery (30-60 deg) */}
            <path 
              d="M 27.71 134 L 129.9 75 A 150 150 0 0 0 75 20.1 L 16 122.29 A 32 32 0 0 1 27.71 134 Z" 
              className={`transition-colors duration-200 stroke-black/10 dark:stroke-white/10 stroke-[2px] ${isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${activeItem === 'gallery' ? 'fill-blue-500/90' : 'fill-white/95 dark:fill-[#1a2e22]/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('gallery')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'gallery')}
            />
            {/* Slice 3: Mic (60-90 deg) */}
            <path 
              d="M 16 122.29 L 75 20.1 A 150 150 0 0 0 0 0 L 0 118 A 32 32 0 0 1 16 122.29 Z" 
              className={`transition-colors duration-200 stroke-black/10 dark:stroke-white/10 stroke-[2px] ${isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${activeItem === 'mic' ? 'fill-red-500/90' : 'fill-white/95 dark:fill-[#1a2e22]/95 backdrop-blur-md'}`}
              onPointerEnter={() => setActiveItem('mic')}
              onPointerLeave={() => setActiveItem(null)}
              onClick={(e) => triggerItem(e, 'mic')}
            />
          </svg>

          {/* Icons positioned radially from bottom-left (0,0) */}
          {/* CAMERA - 15 deg */}
          <div 
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-15deg) translateX(110px) rotate(15deg) scale(${activeItem === 'camera' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'camera' ? 'text-white' : 'text-green-500'}`}>
              <Camera size={20} />
            </div>
          </div>

          {/* GALLERY - 45 deg */}
          <div 
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-45deg) translateX(110px) rotate(45deg) scale(${activeItem === 'gallery' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'gallery' ? 'text-white' : 'text-blue-500'}`}>
              <ImageIcon size={20} />
            </div>
          </div>

          {/* MIC - 75 deg */}
          <div 
            className="absolute bottom-0 left-0 w-10 h-10 -ml-5 -mb-5 flex items-center justify-center transition-transform pointer-events-none"
            style={{ transform: `rotate(-75deg) translateX(110px) rotate(75deg) scale(${activeItem === 'mic' ? 1.2 : 1})` }}
          >
            <div className={`w-full h-full flex items-center justify-center rounded-full transition-colors ${activeItem === 'mic' ? 'text-white' : 'text-red-500'}`}>
              <Mic size={20} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AttachmentMenu;
