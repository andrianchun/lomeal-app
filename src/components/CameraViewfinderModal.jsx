import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, Zap, ZapOff, Image as ImageIcon, RefreshCw, AlertCircle } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

/**
 * In-App Camera Viewfinder yang meniru tampilan dan pengalaman kamera Google Gemini.
 * Berjalan langsung di dalam DOM (HTML5 MediaStream) dengan zero latency, dukungan zoom (,6×, 1, 3),
 * senter/flash, putar kamera, dan jepret instan dengan efek freeze frame.
 */
export default function CameraViewfinderModal({
  isOpen,
  onClose,
  onPhotoCaptured,
  onOpenGallery,
  onFallbackSystemCamera,
  t,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('environment'); // 'environment' | 'user'
  const [flashOn, setFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [activeZoom, setActiveZoom] = useState(1);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [freezeImage, setFreezeImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Hook tombol back Android untuk menutup modal kamera
  useBackClose(isOpen, () => {
    handleClose();
  });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async (facing = cameraPosition) => {
    stopCamera();
    setErrorMsg(null);
    setFlashOn(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Perangkat ini tidak mendukung akses kamera langsung di peramban.');
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Periksa dukungan torch / flash bawaan sensor
      const [track] = stream.getVideoTracks();
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities() || {};
        setHasTorch(Boolean(capabilities.torch));
      } else {
        setHasTorch(false);
      }
    } catch (err) {
      console.warn('Gagal memulai kamera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Izin akses kamera belum diberikan. Izinkan kamera di setelan aplikasi untuk melanjutkan.');
      } else {
        setErrorMsg('Tidak dapat mengakses kamera. Coba buka kamera sistem bawaan.');
      }
    }
  }, [cameraPosition, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      setFreezeImage(null);
      setIsCapturing(false);
      setShutterFlash(false);
      setActiveZoom(1);
      startCamera(cameraPosition);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, cameraPosition, startCamera, stopCamera]);

  const handleClose = () => {
    stopCamera();
    onClose?.();
  };

  const handleToggleFlash = async () => {
    const next = !flashOn;
    setFlashOn(next);
    if (streamRef.current) {
      const [track] = streamRef.current.getVideoTracks();
      if (track) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: next }],
          });
        } catch (e) {
          console.warn('Gagal mengatur flash/torch:', e);
        }
      }
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraPosition === 'environment' ? 'user' : 'environment';
    setCameraPosition(nextFacing);
    startCamera(nextFacing);
  };

  const handleZoom = async (level) => {
    setActiveZoom(level);
    if (streamRef.current) {
      const [track] = streamRef.current.getVideoTracks();
      if (track && typeof track.getCapabilities === 'function') {
        try {
          const cap = track.getCapabilities() || {};
          if (cap.zoom) {
            const minZ = cap.zoom.min || 1;
            const maxZ = cap.zoom.max || 10;
            const targetZ = Math.min(Math.max(level, minZ), maxZ);
            await track.applyConstraints({
              advanced: [{ zoom: targetZ }],
            });
          }
        } catch (_) {}
      }
    }
  };

  const handleCapture = async () => {
    if (isCapturing || !videoRef.current) return;
    setIsCapturing(true);
    setShutterFlash(true);

    setTimeout(() => {
      setShutterFlash(false);
    }, 90);

    try {
      const video = videoRef.current;
      const vWidth = video.videoWidth || 1920;
      const vHeight = video.videoHeight || 1080;

      const canvas = document.createElement('canvas');
      canvas.width = vWidth;
      canvas.height = vHeight;
      const ctx = canvas.getContext('2d');

      // Terapkan framing crop sesuai zoom yang dipilih pengguna
      if (activeZoom > 1) {
        const sw = vWidth / activeZoom;
        const sh = vHeight / activeZoom;
        const sx = (vWidth - sw) / 2;
        const sy = (vHeight - sh) / 2;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vWidth, vHeight);
      } else {
        ctx.drawImage(video, 0, 0, vWidth, vHeight);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Freeze frame instan detik itu juga (0 latency)
      setFreezeImage(dataUrl);

      // Matikan kamera dan kirim dataURL ke Lomeal
      stopCamera();
      onPhotoCaptured?.(dataUrl);
    } catch (err) {
      console.error('Gagal mengambil foto:', err);
      setIsCapturing(false);
      setFreezeImage(null);
    }
  };

  const handleGalleryClick = () => {
    stopCamera();
    onClose?.();
    onOpenGallery?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white select-none flex flex-col justify-between overflow-hidden">
      {/* SHUTTER WHITE FLASH EFFECT */}
      {shutterFlash && (
        <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-in fade-in duration-75" />
      )}

      {/* FREEZE IMAGE OVERLAY (Efek Foto Tersimpan Instan) */}
      {freezeImage && (
        <img
          src={freezeImage}
          alt="Jepretan"
          className="absolute inset-0 w-full h-full object-cover z-30"
        />
      )}

      {/* TOP BAR: Back button (<) & Flash toggle (persis Google Gemini) */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-8 pb-3 bg-black">
        <div className="flex items-center gap-7">
          {/* Tombol Back (<) */}
          <button
            onClick={handleClose}
            className="p-1 -ml-1 text-white/90 hover:text-white active:scale-90 transition-transform focus:outline-none"
            aria-label="Kembali"
          >
            <ChevronLeft size={28} strokeWidth={2.4} />
          </button>

          {/* Tombol Flash (Ikon Petir Slash / Petir Nyala) */}
          <button
            onClick={handleToggleFlash}
            className="p-1 text-white/90 hover:text-white active:scale-90 transition-transform focus:outline-none"
            aria-label="Flash"
          >
            {flashOn ? (
              <Zap size={23} className="text-amber-400 fill-amber-400" />
            ) : (
              <ZapOff size={23} className="text-white/90" />
            )}
          </button>
        </div>
      </div>

      {/* VIEWFINDER AREA (Preview Video Kamera 3:4 Frame) */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden bg-black">
        {errorMsg ? (
          <div className="p-6 text-center max-w-sm flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle size={32} />
            </div>
            <p className="text-sm text-white/80 leading-relaxed">{errorMsg}</p>
            <div className="flex flex-col gap-2 w-full pt-2">
              {onFallbackSystemCamera && (
                <button
                  onClick={() => {
                    handleClose();
                    onFallbackSystemCamera();
                  }}
                  className="w-full py-3 bg-white text-black font-bold rounded-2xl active:scale-95 transition-transform text-sm"
                >
                  Buka Kamera Sistem HP
                </button>
              )}
              <button
                onClick={handleGalleryClick}
                className="w-full py-3 bg-white/10 text-white font-bold rounded-2xl active:scale-95 transition-transform text-sm"
              >
                Pilih dari Galeri
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full aspect-[3/4] max-h-[66vh] flex items-center justify-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transition-transform duration-200 ease-out"
              style={{
                transform: activeZoom > 1 ? `scale(${activeZoom})` : 'scale(1)',
              }}
            />
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS & ZOOM SECTION (Persis Google Gemini) */}
      <div className="relative z-20 flex flex-col items-center pb-10 pt-2 bg-black">
        {/* PILIHAN ZOOM (,6× | 1 | 3) PERSIS GEMINI */}
        {!errorMsg && (
          <div className="flex items-center justify-center gap-8 py-2">
            {/* Zoom 0.6x (,6×) */}
            <button
              onClick={() => handleZoom(0.6)}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                activeZoom === 0.6
                  ? 'border border-white text-white'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              ,6×
            </button>

            {/* Zoom 1x (1) */}
            <button
              onClick={() => handleZoom(1)}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                activeZoom === 1
                  ? 'border border-white text-white'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              1
            </button>

            {/* Zoom 3x (3) */}
            <button
              onClick={() => handleZoom(3)}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                activeZoom === 3
                  ? 'border border-white text-white'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              3
            </button>
          </div>
        )}

        {/* TEKS PETUNJUK: Persis Gemini */}
        <p className="text-[13px] text-white/80 font-normal tracking-wide text-center pt-1 pb-6 select-none">
          Arahkan kamera ke makanan Anda
        </p>

        {/* 3 TOMBOL KONTROL UTAMA: Galeri | Shutter | Putar Kamera */}
        <div className="w-full max-w-sm px-8 flex items-center justify-between">
          {/* Tombol Galeri (Kiri) */}
          <button
            onClick={handleGalleryClick}
            className="w-14 h-14 rounded-full border border-white/80 bg-transparent flex items-center justify-center text-white active:scale-95 transition-transform focus:outline-none"
            aria-label="Pilih Galeri"
          >
            <ImageIcon size={22} strokeWidth={1.8} />
          </button>

          {/* Tombol Shutter Utama (Tengah) */}
          <button
            onClick={handleCapture}
            disabled={isCapturing || Boolean(errorMsg)}
            className="w-20 h-20 rounded-full border-[3px] border-white p-1.5 flex items-center justify-center active:scale-90 transition-transform focus:outline-none shadow-2xl"
            aria-label="Jepret Foto"
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              {isCapturing && (
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </button>

          {/* Tombol Putar Kamera Depan/Belakang (Kanan) */}
          <button
            onClick={handleFlipCamera}
            disabled={Boolean(errorMsg)}
            className="w-14 h-14 rounded-full border border-white/80 bg-transparent flex items-center justify-center text-white active:scale-95 transition-transform focus:outline-none"
            aria-label="Putar Kamera"
          >
            <RefreshCw size={22} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
