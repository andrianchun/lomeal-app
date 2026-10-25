import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, Zap, ZapOff, Image as ImageIcon, RefreshCw, AlertCircle, Camera } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

/**
 * In-App Camera Viewfinder yang meniru tampilan dan pengalaman kamera Google Gemini.
 * Berjalan langsung di dalam DOM (HTML5 MediaStream) dengan zero latency, dukungan zoom,
 * senter/flash, tap-to-focus dengan visual focus box, dan jepret instan dengan efek freeze frame.
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
  const viewfinderRef = useRef(null);
  const [cameraPosition, setCameraPosition] = useState('environment'); // 'environment' | 'user'
  const [flashOn, setFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [activeZoom, setActiveZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 5, hasUltraWide: false });
  const [isCapturing, setIsCapturing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [freezeImage, setFreezeImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null); // { x, y, id }
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Hook tombol back Android untuk menutup modal kamera
  useBackClose(isOpen, () => {
    handleClose();
  });

  // Auto-hide focus box after 1.5s
  useEffect(() => {
    if (!focusPoint) return;
    const timer = setTimeout(() => {
      setFocusPoint(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [focusPoint]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.applyConstraints({ advanced: [{ torch: false }] });
          } catch (_) {}
          track.stop();
        });
      } catch (_) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVideoReady(false);
    setFlashOn(false);
    setFocusPoint(null);
  }, []);

  const checkCameraCapabilities = useCallback(async () => {
    if (!streamRef.current) return;
    const [track] = streamRef.current.getVideoTracks();
    if (!track) return;

    if (typeof track.getCapabilities === 'function') {
      try {
        const capabilities = track.getCapabilities() || {};
        setHasTorch(Boolean(capabilities.torch));

        // Cek kemampuan zoom sensor
        if (capabilities.zoom) {
          const minZ = capabilities.zoom.min || 1;
          const maxZ = capabilities.zoom.max || 5;
          setZoomRange({
            min: minZ,
            max: maxZ,
            hasUltraWide: minZ < 1,
          });
        }
      } catch (_) {
        setHasTorch(false);
      }
    } else {
      setHasTorch(false);
    }
  }, []);

  const startCamera = useCallback(async (facing = cameraPosition) => {
    stopCamera();
    setErrorMsg(null);
    setIsVideoReady(false);
    setFlashOn(false);
    setFocusPoint(null);

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
        // Atur atribut wajib sebelum pasang stream agar Chrome tidak memunculkan icon play default
        videoRef.current.muted = true;
        videoRef.current.defaultMuted = true;
        videoRef.current.playsInline = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.setAttribute('x5-playsinline', 'true');
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (_) {}
      }

      // Beri sedikit jeda agar driver kamera selesai menginisialisasi hardware capabilities
      setTimeout(() => {
        checkCameraCapabilities();
      }, 350);
    } catch (err) {
      console.warn('Gagal memulai kamera:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Izin akses kamera belum diberikan. Izinkan kamera di setelan aplikasi untuk melanjutkan.');
      } else {
        setErrorMsg('Tidak dapat mengakses kamera. Coba buka kamera sistem bawaan.');
      }
    }
  }, [cameraPosition, stopCamera, checkCameraCapabilities]);

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

  // ===================== FLASHLIGHT / TORCH =====================
  const handleToggleFlash = async () => {
    if (cameraPosition === 'user') {
      showToast('Lampu senter hanya tersedia di kamera belakang');
      return;
    }

    if (!streamRef.current) return;
    const [track] = streamRef.current.getVideoTracks();
    if (!track) return;

    const next = !flashOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      });
      setFlashOn(next);
      setHasTorch(true);
    } catch (e) {
      console.warn('Gagal mengatur flash/torch:', e);
      const cap = (typeof track.getCapabilities === 'function') ? track.getCapabilities() : {};
      if (!cap || !cap.torch) {
        showToast('Lampu senter tidak didukung oleh browser/sensor kamera ini');
      } else {
        showToast('Gagal menyalakan senter');
      }
      setFlashOn(false);
    }
  };

  // ===================== TAP-TO-FOCUS =====================
  const handleTapToFocus = async (e) => {
    if (!viewfinderRef.current || !streamRef.current || isCapturing) return;

    const rect = viewfinderRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Tampilkan kotak fokus animasi di titik ketukan user
    setFocusPoint({ x: clickX, y: clickY, id: Date.now() });

    // Efek getar haptic halus jika didukung HP
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate(15); } catch (_) {}
    }

    // Trigger hardware focus pada MediaStreamTrack
    const [track] = streamRef.current.getVideoTracks();
    if (track) {
      const cap = (typeof track.getCapabilities === 'function') ? track.getCapabilities() : {};

      // 1. Koordinat POI (Points of Interest) jika didukung driver
      if (cap && cap.pointsOfInterest) {
        try {
          const normX = Math.min(1, Math.max(0, clickX / rect.width));
          const normY = Math.min(1, Math.max(0, clickY / rect.height));
          await track.applyConstraints({
            advanced: [{ pointsOfInterest: [{ x: normX, y: normY }] }],
          });
        } catch (_) {}
      }

      // 2. Siklus fokus single-shot -> continuous agar kamera HP melakukan re-focus
      if (cap && cap.focusMode) {
        try {
          if (cap.focusMode.includes('single-shot')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'single-shot' }],
            });
          }
          setTimeout(async () => {
            try {
              if (cap.focusMode.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }],
                });
              }
            } catch (_) {}
          }, 900);
        } catch (_) {}
      }
    }
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraPosition === 'environment' ? 'user' : 'environment';
    setCameraPosition(nextFacing);
    startCamera(nextFacing);
  };

  // ===================== ZOOM HANDLER =====================
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

  // Tentukan opsi zoom yang relevan berdasarkan kemampuan hardware sensor kamera
  const zoomOptions = zoomRange.hasUltraWide
    ? [{ label: ',5×', val: 0.5 }, { label: '1×', val: 1 }, { label: '2×', val: 2 }]
    : [{ label: '1×', val: 1 }, { label: '2×', val: 2 }, { label: '3×', val: 3 }];

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white select-none flex flex-col justify-between overflow-hidden">
      {/* SHUTTER WHITE FLASH EFFECT */}
      {shutterFlash && (
        <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-in fade-in duration-75" />
      )}

      {/* TOAST PEMBERITAHUAN */}
      {toastMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[130] bg-neutral-900/95 border border-white/20 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md anim-rise pointer-events-none text-center max-w-[85vw]">
          {toastMsg}
        </div>
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
            className={`p-1 active:scale-90 transition-transform focus:outline-none ${cameraPosition === 'user' ? 'opacity-40' : 'text-white/90 hover:text-white'}`}
            aria-label="Flash"
          >
            {flashOn ? (
              <Zap size={23} className="text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            ) : (
              <ZapOff size={23} className={cameraPosition === 'user' ? 'text-white/40' : 'text-white/90'} />
            )}
          </button>
        </div>
      </div>

      {/* VIEWFINDER AREA (Preview Video Kamera 3:4 Frame) */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden bg-black select-none">
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
          <div
            ref={viewfinderRef}
            onClick={handleTapToFocus}
            className="relative w-full aspect-[3/4] max-h-[66vh] flex items-center justify-center overflow-hidden bg-black cursor-crosshair select-none"
          >
            {/* SKELETON / LOADING SAAT KAMERA BARU DIBUKA (Mencegah Ikon Play Bawaan Browser) */}
            {!isVideoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-white/20 border-t-emerald-400 animate-spin" />
                  <Camera size={26} className="text-white/50 animate-pulse" />
                </div>
                <p className="text-xs text-white/50 mt-3 font-medium tracking-wide">Menghubungkan kamera...</p>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              disablePictureInPicture
              onLoadedMetadata={() => {
                videoRef.current?.play().catch(() => {});
              }}
              onPlaying={() => {
                setIsVideoReady(true);
                checkCameraCapabilities();
              }}
              className={`w-full h-full object-cover transition-opacity duration-300 ease-out ${
                isVideoReady ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{
                transform: activeZoom > 1 ? `scale(${activeZoom})` : 'scale(1)',
              }}
            />

            {/* FOCUS RING ANIMATION (KLIK TO FOKUS) */}
            {focusPoint && (
              <div
                key={focusPoint.id}
                className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
              >
                <div className="relative w-16 h-16 border-2 border-amber-400 rounded-xl animate-focus-ring flex items-center justify-center shadow-lg">
                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" />
                  {/* 4 Corner accent marks */}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-0.5 bg-amber-400 rounded" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-0.5 bg-amber-400 rounded" />
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-0.5 bg-amber-400 rounded" />
                  <div className="absolute -right-1 top-1/2 -translate-y-1/2 h-2 w-0.5 bg-amber-400 rounded" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS & ZOOM SECTION (Persis Google Gemini) */}
      <div className="relative z-20 flex flex-col items-center pb-10 pt-2 bg-black">
        {/* PILIHAN ZOOM */}
        {!errorMsg && (
          <div className="flex items-center justify-center gap-7 py-2">
            {zoomOptions.map((opt) => (
              <button
                key={opt.val}
                onClick={() => handleZoom(opt.val)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  activeZoom === opt.val
                    ? 'border-2 border-white text-white bg-white/10 shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* TEKS PETUNJUK: Persis Gemini */}
        <p className="text-[13px] text-white/80 font-normal tracking-wide text-center pt-1 pb-6 select-none">
          Ketuk layar untuk fokus · Arahkan ke makanan
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
