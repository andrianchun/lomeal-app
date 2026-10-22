import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Zap, ZapOff, Image as ImageIcon, Camera, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';

export default function CameraViewfinderModal({
  isOpen,
  onClose,
  onPhotoCaptured,
  onOpenGallery,
  t,
}) {
  const [isStarted, setIsStarted] = useState(false);
  const [flashMode, setFlashMode] = useState('off'); // 'off' | 'on' | 'auto'
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraPosition, setCameraPosition] = useState('rear');
  const [freezeImage, setFreezeImage] = useState(null);
  const isClosingRef = useRef(false);

  const stopCamera = useCallback(async () => {
    try {
      document.body.classList.remove('camera-preview-active');
      const root = document.getElementById('root');
      if (root) root.classList.remove('camera-preview-transparent');
      await CameraPreview.stop();
    } catch (_) {}
    setIsStarted(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      isClosingRef.current = false;
      document.body.classList.add('camera-preview-active');
      const root = document.getElementById('root');
      if (root) root.classList.add('camera-preview-transparent');

      await CameraPreview.start({
        position: cameraPosition,
        toBack: true,
        enableZoom: true,
        enableOpacity: false,
      });

      setIsStarted(true);
      try {
        await CameraPreview.setFlashMode({ flashMode: 'off' });
      } catch (_) {}
    } catch (err) {
      console.warn('Gagal memulai CameraPreview:', err);
      document.body.classList.remove('camera-preview-active');
      const root = document.getElementById('root');
      if (root) root.classList.remove('camera-preview-transparent');
      setIsStarted(false);
    }
  }, [cameraPosition]);

  useEffect(() => {
    if (isOpen) {
      setFreezeImage(null);
      setIsCapturing(false);
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleClose = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    await stopCamera();
    onClose?.();
  };

  const handleToggleFlash = async () => {
    const nextMode = flashMode === 'off' ? 'on' : flashMode === 'on' ? 'auto' : 'off';
    try {
      await CameraPreview.setFlashMode({ flashMode: nextMode });
      setFlashMode(nextMode);
    } catch (e) {
      console.warn('Flash mode error:', e);
    }
  };

  const handleFlipCamera = async () => {
    try {
      await CameraPreview.flip();
      setCameraPosition(prev => prev === 'rear' ? 'front' : 'rear');
    } catch (e) {
      console.warn('Flip camera error:', e);
    }
  };

  const handleCapture = async () => {
    if (isCapturing || isClosingRef.current) return;
    setIsCapturing(true);

    try {
      // 1. Shutter langsung mengambil foto sensor CameraX
      const result = await CameraPreview.capture({ quality: 85 });
      const dataUrl = `data:image/jpeg;base64,${result.value}`;

      // 2. ZERO LATENCY: Freeze frame instan detik itu juga (efek persis screenshot!)
      setFreezeImage(dataUrl);

      // 3. Matikan kamera native di background & teruskan ke scanner Lomeal
      await stopCamera();
      onPhotoCaptured?.(dataUrl);
    } catch (err) {
      console.error('Gagal mengambil foto CameraX:', err);
      setIsCapturing(false);
      setFreezeImage(null);
    }
  };

  const handleGalleryClick = async () => {
    await stopCamera();
    onClose?.();
    onOpenGallery?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-between select-none pointer-events-auto bg-transparent">
      {/* FREEZE IMAGE OVERLAY (Zero Latency Screenshot Effect) */}
      {freezeImage && (
        <img
          src={freezeImage}
          alt="Hasil Jepretan"
          className="absolute inset-0 w-full h-full object-cover z-20"
        />
      )}

      {/* TOP BAR OVERLAY */}
      <div className="relative z-10 flex items-center justify-between p-5 pt-7 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
        <button
          onClick={handleClose}
          className="p-3 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 active:scale-95 transition-transform"
          aria-label="Tutup Kamera"
        >
          <X size={22} />
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleFlash}
            className={`p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 active:scale-95 transition-transform flex items-center gap-1.5 ${
              flashMode !== 'off' ? 'text-amber-400' : 'text-white/80'
            }`}
            aria-label="Flash mode"
          >
            {flashMode === 'off' ? <ZapOff size={20} /> : <Zap size={20} />}
            {flashMode === 'auto' && <span className="text-[10px] font-black uppercase">Auto</span>}
          </button>
        </div>
      </div>

      {/* CENTER FRAMING GUIDE (Reticle Makanan) */}
      <div className="relative z-10 flex-1 flex items-center justify-center pointer-events-none p-6">
        <div className="relative w-full max-w-xs aspect-square border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
          {/* Sudut-sudut framing aksen */}
          <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
          <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
          <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
          <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />

          {/* Garis bantu tengah */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-white/40 ring-4 ring-white/10" />
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROL BAR */}
      <div className="relative z-10 p-6 pb-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-around">
        {/* Tombol Galeri */}
        <button
          onClick={handleGalleryClick}
          className="p-4 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 active:scale-95 transition-transform"
          aria-label="Pilih dari Galeri"
        >
          <ImageIcon size={24} />
        </button>

        {/* Tombol Shutter Utama */}
        <button
          onClick={handleCapture}
          disabled={isCapturing}
          className="relative w-20 h-20 rounded-full flex items-center justify-center p-1.5 border-4 border-white active:scale-90 transition-all shadow-2xl focus:outline-none"
          aria-label="Jepret Foto"
        >
          <div className="w-full h-full rounded-full bg-white shadow-inner flex items-center justify-center">
            {isCapturing ? (
              <div className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-full border-2 border-black/10" />
            )}
          </div>
        </button>

        {/* Tombol Putar Kamera Depan/Belakang */}
        <button
          onClick={handleFlipCamera}
          className="p-4 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 active:scale-95 transition-transform"
          aria-label="Putar Kamera"
        >
          <RefreshCw size={22} />
        </button>
      </div>
    </div>
  );
}
