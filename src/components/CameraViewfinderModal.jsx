import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RotateCcw, Check, Zap, ZapOff, FlipHorizontal, Image, Sparkles, AlertCircle } from 'lucide-react';
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
  const [isFrozen, setIsFrozen] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [flashActive, setFlashActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [errorMessage, setErrorMessage] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const activeStreamRef = useRef(null);

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
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  const handleClose = useCallback(() => {
    stopTracks();
    setIsFrozen(false);
    setCapturedDataUrl(null);
    setErrorMessage(null);
    onClose?.();
  }, [stopTracks, onClose]);

  useBackClose(open, handleClose);

  // Inisialisasi kamera real-time WebRTC
  const startCamera = useCallback(async (mode = 'environment') => {
    stopTracks();
    setIsStarting(true);
    setErrorMessage(null);
    setIsFrozen(false);
    setCapturedDataUrl(null);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Kamera langsung tidak didukung di perangkat ini.');
      }

      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, max: 2560 },
          height: { ideal: 1080, max: 1440 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }

      // Cek ketersediaan senter/torch
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        setHasTorch(!!capabilities.torch);
      }
    } catch (err) {
      console.warn('Gagal memulai in-app camera:', err);
      setErrorMessage(err.message || 'Tidak dapat mengakses kamera.');
    } finally {
      setIsStarting(false);
    }
  }, [stopTracks]);

  // Efek buka/tutup modal
  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopTracks();
      setIsFrozen(false);
      setCapturedDataUrl(null);
      setErrorMessage(null);
    }
    return () => {
      stopTracks();
    };
  }, [open, startCamera, stopTracks, facingMode]);

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
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // AKSI JEPRET: 0ms INSTANT FREEZE!
  const handleShutterCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // 1. Efek visual & haptic shutter
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 80);
    try {
      if (navigator.vibrate) navigator.vibrate(35);
    } catch (_) {}

    // 2. Gambar frame video ke canvas dengan resolusi asli video
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') {
      // Mirroring jika kamera depan
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    // 3. Pause video & freeze preview langsung
    try {
      video.pause();
    } catch (_) {}

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedDataUrl(dataUrl);
    setIsFrozen(true);
  };

  // Ulangi jepretan
  const handleRetake = () => {
    setIsFrozen(false);
    setCapturedDataUrl(null);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Konfirmasi & gunakan foto untuk analisis
  const handleConfirmPhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `lomeal-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture?.(file);
        handleClose();
      },
      'image/jpeg',
      0.88
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col justify-between overflow-hidden select-none no-swipe">
      {/* Hidden Canvas untuk konversi frame video */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Shutter Flash Overlay */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-30 transition-opacity duration-100 ${
          flashActive ? 'opacity-85' : 'opacity-0'
        }`}
      />

      {/* Viewfinder Video / Frozen Preview */}
      <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
        {/* Live Video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-150 ${
            isFrozen ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Frozen Frame Snapshot */}
        {isFrozen && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured"
            className="absolute inset-0 w-full h-full object-cover z-10"
          />
        )}

        {/* Reticle / Targeting Frame (Hanya tampil saat live) */}
        {!isFrozen && !errorMessage && !isStarting && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10 p-8">
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 border-2 border-dashed border-emerald-400/40 rounded-3xl flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

              <span className="text-white/70 text-xs font-semibold px-3 py-1 rounded-full bg-black/40 backdrop-blur-md">
                Arahkan ke Makanan
              </span>
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 text-zinc-950 font-bold text-xs shadow-lg active:scale-95 transition-all"
                >
                  <Camera size={16} /> Buka Kamera Sistem
                </button>
              )}
              <button
                onClick={handleClose}
                className="w-full px-4 py-2.5 rounded-2xl bg-zinc-800 text-zinc-300 text-xs font-medium active:scale-95 transition-all"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Top Header Overlay */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold tracking-tight text-white">Lomy Lens</span>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && !isFrozen && (
            <button
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center transition-all cursor-pointer ${
                isTorchOn ? 'bg-amber-400 text-zinc-950 shadow-md' : 'bg-black/40 text-white'
              }`}
            >
              {isTorchOn ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>
          )}

          {!isFrozen && (
            <button
              onClick={switchCamera}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform cursor-pointer"
            >
              <FlipHorizontal size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Controls Overlay */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-6 pb-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col items-center gap-4">
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
              disabled={isStarting || !!errorMessage}
              className="w-20 h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center active:scale-90 transition-transform shadow-2xl cursor-pointer disabled:opacity-40"
              title="Ambil Foto (Sekali Jepret Langsung Freeze)"
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
              className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-950/50 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles size={16} className="text-zinc-950" />
              <span>Analisis Gizi</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
