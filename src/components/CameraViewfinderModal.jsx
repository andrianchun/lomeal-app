import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RotateCcw, Zap, ZapOff, FlipHorizontal, Image, Sparkles, AlertCircle } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

export default function CameraViewfinderModal({
  open,
  onClose,
  onCapture,
  onOpenGallery,
  onFallbackSystemCamera,
}) {
  const [stream, setStream] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [flashActive, setFlashActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [errorMessage, setErrorMessage] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Fitur Tap-to-Focus & Zoom
  const [focusTarget, setFocusTarget] = useState(null);
  const [zoomCaps, setZoomCaps] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const activeStreamRef = useRef(null);
  const capturedBlobRef = useRef(null);
  const focusTimeoutRef = useRef(null);

  // Bersihkan stream media saat ditutup
  const stopTracks = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      activeStreamRef.current = null;
    }
    setStream(null);
    setIsVideoReady(false);
    setIsTorchOn(false);
    setHasTorch(false);
    setZoomCaps(null);
    setZoomLevel(1);
    setFocusTarget(null);
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
  }, []);

  const handleClose = useCallback(() => {
    stopTracks();
    setIsVideoReady(false);
    setIsFrozen(false);
    setIsConfirming(false);
    if (capturedDataUrl && capturedDataUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(capturedDataUrl);
      } catch (_) {}
    }
    setCapturedDataUrl(null);
    capturedBlobRef.current = null;
    setErrorMessage(null);
    onClose?.();
  }, [stopTracks, onClose, capturedDataUrl]);

  useBackClose(open, handleClose);

  // Inisialisasi kamera real-time WebRTC — prioritaskan resolusi maksimal sensor tanpa batas max buatan
  const startCamera = useCallback(async (mode = 'environment') => {
    stopTracks();
    setIsStarting(true);
    setIsVideoReady(false);
    setErrorMessage(null);
    setIsFrozen(false);
    setCapturedDataUrl(null);
    capturedBlobRef.current = null;

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Kamera langsung tidak didukung di perangkat ini.');
      }

      // Deteksi device kamera belakang secara eksplisit
      let targetDeviceId = null;
      try {
        if (navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devices.filter((d) => d.kind === 'videoinput');
          if (mode === 'environment' && videoDevs.length > 0) {
            const rearDev = videoDevs.find((d) =>
              /back|rear|environment|belakang|main|camera\s*0/i.test(d.label)
            );
            if (rearDev?.deviceId) {
              targetDeviceId = rearDev.deviceId;
            }
          }
        }
      } catch (_) {}

      // Minta resolusi penuh sensor (4K / 1080p portrait tanpa clamp max yang bikin downgrade ke 720p)
      const baseVideoConstraints = {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      };

      let mediaStream = null;

      // Percobaan 1: Menggunakan deviceId kamera belakang spesifik jika terdeteksi
      if (targetDeviceId) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { ...baseVideoConstraints, deviceId: { exact: targetDeviceId } },
            audio: false,
          });
        } catch (_) {}
      }

      // Percobaan 2: Menggunakan facingMode exact environment
      if (!mediaStream && mode === 'environment') {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { ...baseVideoConstraints, facingMode: { exact: 'environment' } },
            audio: false,
          });
        } catch (_) {}
      }

      // Percobaan 3: Fallback ke ideal facingMode
      if (!mediaStream) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { ...baseVideoConstraints, facingMode: { ideal: mode } },
          audio: false,
        });
      }

      activeStreamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
        setIsVideoReady(true);
      }

      // Cek capabilities sensor (torch, zoom, autofocus)
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        setHasTorch(!!capabilities.torch);

        if (capabilities.zoom) {
          setZoomCaps(capabilities.zoom);
          setZoomLevel(capabilities.zoom.min || 1);
        }

        // Terapkan continuous autofocus secara agresif jika didukung
        try {
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          }
        } catch (_) {}
      }
    } catch (err) {
      console.warn('Gagal memulai in-app camera:', err);
      setErrorMessage(err.message || 'Tidak dapat mengakses kamera.');
    } finally {
      setIsStarting(false);
    }
  }, [stopTracks]);

  // Efek buka/tutup modal: Selalu kunci ke kamera belakang setiap kali modal dibuka!
  useEffect(() => {
    if (open) {
      setIsVideoReady(false);
      setFacingMode('environment');
      startCamera('environment');
    } else {
      stopTracks();
      setIsVideoReady(false);
      setIsFrozen(false);
      setCapturedDataUrl(null);
      setErrorMessage(null);
    }
    return () => {
      stopTracks();
    };
  }, [open, startCamera, stopTracks]);

  // Toggle Senter
  const toggleTorch = async () => {
    if (!activeStreamRef.current) return;
    const track = activeStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn('Gagal mengubah status senter:', e);
    }
  };

  // Switch kamera depan/belakang
  const switchCamera = () => {
    setIsVideoReady(false);
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // TAP TO FOCUS: Sentuh layar untuk memfokuskan kamera ke titik tertentu
  const handleTapToFocus = async (e) => {
    if (isFrozen) return;
    if (e.target.closest('button')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const focusId = Date.now();
    setFocusTarget({ x, y, id: focusId });
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      setFocusTarget((curr) => (curr?.id === focusId ? null : curr));
    }, 1800);

    try {
      if (navigator.vibrate) navigator.vibrate(25);
    } catch (_) {}

    const track = activeStreamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const adv = {};

      // Titik fokus berbasis koordinat jika peramban mendukung pointsOfInterest
      if (capabilities.pointsOfInterest) {
        adv.pointsOfInterest = [
          {
            x: Math.min(1, Math.max(0, x / rect.width)),
            y: Math.min(1, Math.max(0, y / rect.height)),
          },
        ];
      }

      // Picu siklus fokus ulang hardware
      if (capabilities.focusMode) {
        if (capabilities.focusMode.includes('single-shot')) {
          adv.focusMode = 'single-shot';
        } else if (capabilities.focusMode.includes('continuous')) {
          adv.focusMode = 'continuous';
        }
      }

      if (Object.keys(adv).length > 0) {
        await track.applyConstraints({ advanced: [adv] });
      }
    } catch (err) {
      console.warn('Gagal set tap-to-focus:', err);
    }
  };

  // PENGATURAN ZOOM: 1x / 2x toggle
  const handleSetZoom = async (val) => {
    if (!zoomCaps || !activeStreamRef.current) return;
    const track = activeStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const targetVal = Math.max(zoomCaps.min || 1, Math.min(val, zoomCaps.max || 1));
      await track.applyConstraints({ advanced: [{ zoom: targetVal }] });
      setZoomLevel(targetVal);
      try {
        if (navigator.vibrate) navigator.vibrate(20);
      } catch (_) {}
    } catch (e) {
      console.warn('Gagal set zoom:', e);
    }
  };

  // AKSI JEPRET: Ambil Still Photo resolusi penuh sensor (ImageCapture API) atau frame video tertinggi
  const handleShutterCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isVideoReady) return;

    // 1. Efek visual & haptic shutter
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 80);
    try {
      if (navigator.vibrate) navigator.vibrate(40);
    } catch (_) {}

    capturedBlobRef.current = null;

    // 2. Coba Still Photo resolusi penuh hardware via ImageCapture API
    let photoBlob = null;
    if (window.ImageCapture && activeStreamRef.current) {
      const track = activeStreamRef.current.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        try {
          const imageCapture = new window.ImageCapture(track);
          photoBlob = await imageCapture.takePhoto();
        } catch (e) {
          console.warn('ImageCapture.takePhoto fallback to video frame:', e);
        }
      }
    }

    if (photoBlob) {
      capturedBlobRef.current = photoBlob;
      const dataUrl = URL.createObjectURL(photoBlob);
      setCapturedDataUrl(dataUrl);
      setIsFrozen(true);
      try {
        video.pause();
      } catch (_) {}
      return;
    }

    // 3. Fallback: Frame video beresolusi penuh asli tanpa kompresi berlebih
    const w = video.videoWidth || 1920;
    const h = video.videoHeight || 1080;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (facingMode === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
    }

    try {
      video.pause();
    } catch (_) {}

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedDataUrl(dataUrl);
    setIsFrozen(true);
  };

  // Ulangi jepretan
  const handleRetake = () => {
    setIsFrozen(false);
    setIsConfirming(false);
    if (capturedDataUrl && capturedDataUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(capturedDataUrl);
      } catch (_) {}
    }
    setCapturedDataUrl(null);
    capturedBlobRef.current = null;
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Konfirmasi & gunakan foto untuk analisis (dengan guard double-tap)
  const handleConfirmPhoto = () => {
    if (isConfirming) return;
    setIsConfirming(true);

    if (capturedBlobRef.current) {
      const file = new File(
        [capturedBlobRef.current],
        `lomeal-${Date.now()}.jpg`,
        { type: capturedBlobRef.current.type || 'image/jpeg' }
      );
      onCapture?.(file);
      handleClose();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setIsConfirming(false);
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsConfirming(false);
          return;
        }
        const file = new File([blob], `lomeal-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture?.(file);
        handleClose();
      },
      'image/jpeg',
      0.95
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col justify-between overflow-hidden select-none no-swipe">
      {/* Hidden Canvas untuk fallback frame video */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Shutter Flash Overlay */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-100 ${
          flashActive ? 'opacity-85' : 'opacity-0'
        }`}
      />

      {/* Viewfinder Video / Frozen Preview — Mendukung Tap-to-Focus */}
      <div
        onClick={handleTapToFocus}
        className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden cursor-crosshair"
      >
        {/* Live Video — Hidden (opacity-0) saat belum stream, diberi poster transparan & pointer-events-none untuk basmi play button bawaan Android WebView */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          muted
          controls={false}
          disablePictureInPicture
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          onLoadedMetadata={() => setIsVideoReady(true)}
          onPlaying={() => setIsVideoReady(true)}
          className={`w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${
            isVideoReady && !isFrozen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Loading Spinner Kamera saat sensor sedang diinisialisasi */}
        {!isVideoReady && !errorMessage && !isFrozen && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            <span className="text-xs font-medium text-zinc-400 tracking-wide">
              Menyiapkan kamera...
            </span>
          </div>
        )}

        {/* Frozen Frame Snapshot */}
        {isFrozen && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-cover z-10"
          />
        )}

        {/* Tap-to-Focus Indicator Ring */}
        {focusTarget && !isFrozen && (
          <div
            key={focusTarget.id}
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-25 transition-transform duration-100"
            style={{ left: focusTarget.x, top: focusTarget.y }}
          >
            <div className="relative w-18 h-18 sm:w-20 sm:h-20 border-2 border-amber-400 rounded-2xl animate-ping opacity-60" />
            <div className="absolute inset-0 border-2 border-amber-400 rounded-2xl shadow-[0_0_14px_rgba(251,191,36,0.7)] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,1)]" />
            </div>
          </div>
        )}

        {/* Reticle / Targeting Frame (Hanya tampil saat live & kamera sudah siap) */}
        {!isFrozen && !errorMessage && isVideoReady && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-8">
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 border-2 border-dashed border-emerald-400/40 rounded-3xl flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

              <div className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 text-center shadow-lg">
                <span className="text-white font-bold text-xs">Arahkan & Ketuk Layar untuk Fokus</span>
                <span className="text-zinc-300 text-[10px]">Jarak ideal ~15–20 cm dari kemasan</span>
              </div>
            </div>
          </div>
        )}

        {/* Error / Fallback State */}
        {errorMessage && (
          <div className="absolute inset-0 z-20 bg-zinc-950/90 flex flex-col items-center justify-center p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertCircle size={28} />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-base font-bold text-white">Kamera Belum Dapat Diakses</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {errorMessage} Kamu tetap bisa menggunakan kamera sistem bawaan HP.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs pt-2">
              {onFallbackSystemCamera && (
                <button
                  onClick={() => {
                    handleClose();
                    onFallbackSystemCamera();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 text-zinc-950 font-bold text-xs shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <Camera size={16} /> Buka Kamera Sistem
                </button>
              )}
              <button
                onClick={handleClose}
                className="w-full px-4 py-2.5 rounded-2xl bg-zinc-800 text-zinc-300 text-xs font-medium active:scale-95 transition-all cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Top Header Overlay — Aman dari Notif Bar & Notch */}
      <div
        className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pb-6 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none"
        style={{
          paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 2.25rem) + 0.75rem)',
        }}
      >
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer pointer-events-auto"
          title="Tutup"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold tracking-tight text-white">Lomy Lens</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {hasTorch && !isFrozen && (
            <button
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center transition-all cursor-pointer ${
                isTorchOn ? 'bg-amber-400 text-zinc-950 shadow-md' : 'bg-black/40 text-white'
              }`}
              title="Senter"
            >
              {isTorchOn ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>
          )}

          {!isFrozen && (
            <button
              onClick={switchCamera}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
              title="Ganti Kamera"
            >
              <FlipHorizontal size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Controls Overlay */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 px-6 pt-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center gap-3.5"
        style={{
          paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 1.5rem) + 1rem)',
        }}
      >
        {/* Zoom Selector (Hanya tampil jika hardware kamera mendukung zoom digital/optik) */}
        {zoomCaps && zoomCaps.max >= 1.5 && !isFrozen && (
          <div className="flex items-center gap-1 p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-xl pointer-events-auto">
            <button
              onClick={() => handleSetZoom(1)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                zoomLevel <= 1.2
                  ? 'bg-white text-zinc-950 shadow-md'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              1×
            </button>
            <button
              onClick={() => handleSetZoom(Math.min(2, zoomCaps.max))}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                zoomLevel > 1.2
                  ? 'bg-white text-zinc-950 shadow-md'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              2×
            </button>
          </div>
        )}

        {!isFrozen ? (
          /* Live Controls: Shutter + Gallery + System Camera fallback */
          <div className="w-full flex items-center justify-around max-w-sm">
            {/* Gallery Picker Shortcut */}
            <button
              onClick={() => {
                handleClose();
                onOpenGallery?.();
              }}
              className="w-12 h-12 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
              title="Buka Galeri"
            >
              <Image size={20} />
            </button>

            {/* Big Shutter Button */}
            <button
              onClick={handleShutterCapture}
              disabled={isStarting || !isVideoReady || !!errorMessage}
              className="w-20 h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center active:scale-90 transition-transform shadow-2xl cursor-pointer disabled:opacity-40"
              title="Ambil Foto Resolusi Penuh"
            >
              <div className="w-full h-full rounded-full bg-white shadow-inner flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
              </div>
            </button>

            {/* System Camera Fallback */}
            {onFallbackSystemCamera ? (
              <button
                onClick={() => {
                  handleClose();
                  onFallbackSystemCamera();
                }}
                className="w-12 h-12 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-zinc-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
                title="Gunakan Kamera Bawaan HP"
              >
                <Camera size={19} />
              </button>
            ) : (
              <div className="w-12 h-12" />
            )}
          </div>
        ) : (
          /* Frozen Controls: Retake vs Confirm & Analyze */
          <div className="w-full flex items-center justify-center gap-3 max-w-sm">
            {/* Foto Ulang */}
            <button
              onClick={handleRetake}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 text-white font-bold text-xs border border-zinc-700/60 active:scale-95 transition-all shadow-lg cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>Foto Ulang</span>
            </button>

            {/* Gunakan & Analisis */}
            <button
              onClick={handleConfirmPhoto}
              disabled={isConfirming}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-950/50 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={16} className="text-zinc-950" />
              <span>{isConfirming ? 'Menyiapkan...' : 'Analisis Gizi'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
