import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RotateCw, Loader2, ImagePlus, Camera, Image } from 'lucide-react';
import useBackClose from '../hooks/useBackClose';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

// onReset (opsional): balikin ke foto asli sebelum di-crop. Editor SELALU membuka file asli,
// jadi crop berulang gak numpuk (crop dari hasil crop = makin kecil & makin burik).
export default function ImageCropperModal({
  open,
  onClose,
  imageSrc,
  onComplete,
  onReset,
}) {
  const [activeSrc, setActiveSrc] = useState(imageSrc);
  const [isNewFile, setIsNewFile] = useState(false);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotate, setRotate] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [proxyImageSrc, setProxyImageSrc] = useState(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const imgRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Komponen ini gak pernah di-unmount (cuma return null), jadi state crop foto sebelumnya
  // bakal nempel di foto berikutnya kalau gak direset tiap ganti gambar.
  useEffect(() => {
    setActiveSrc(imageSrc);
    setIsNewFile(false);
    setCrop(undefined);
    setCompletedCrop(null);
    setRotate(0);
    setLoadError(false);
    setProxyImageSrc(null);
    setShowSourcePicker(false);
  }, [imageSrc, open]);

  useBackClose(!!(open && (activeSrc || imageSrc)), onClose);

  if (!open || (!activeSrc && !imageSrc)) return null;

  function onImageLoad(e) {
    const { width, height } = e.currentTarget;
    const initial = centerAspectCrop(width, height, 1);
    setCrop(initial);
    // Tanpa ini, user yang cuma buka editor lalu langsung tap Simpan (gak geser kotak crop)
    // bikin completedCrop tetap null → tombolnya kelihatan gak ngefek apa-apa.
    setCompletedCrop(convertToPixelCrop(initial, width, height));
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setActiveSrc(reader.result);
      setIsNewFile(true);
      setRotate(0);
      setLoadError(false);
      setProxyImageSrc(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowSourcePicker(false);
  };

  async function handleConfirm() {
    if (!completedCrop || !imgRef.current) {
      onClose();
      return;
    }
    setBusy(true);
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const cropWidthPx = completedCrop.width * scaleX;
    const cropHeightPx = completedCrop.height * scaleY;

    // ponytail: clamp sisi terpanjang ke 1080px — foto HP modern beberapa MP,
    // tanpa cap ini upload & RAM decode-nya boros padahal cuma dipakai sebagai foto profil/log kecil.
    const MAX_DIM = 1080;
    const scale = Math.min(1, MAX_DIM / Math.max(cropWidthPx, cropHeightPx));
    canvas.width = cropWidthPx * scale;
    canvas.height = cropHeightPx * scale;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      cropWidthPx,
      cropHeightPx,
      0,
      0,
      canvas.width,
      canvas.height
    );
    
    // Hasilnya naik ke Storage (bukan lagi base64 di Firestore), jadi gak perlu dijepit
    // sampai ~100KB — kualitasnya dijaga biar foto kenang-kenangan gak burik.
    const base64Url = canvas.toDataURL('image/webp', 0.85);
    setBusy(false);
    onComplete(base64Url, isNewFile);
  }

  const currentDisplaySrc = activeSrc || imageSrc;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm anim-fade-in no-swipe">
      {/* Hidden file inputs */}
      <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
      <input type="file" ref={galleryInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />

      <div className="flex items-center justify-between p-4 pt-safe bg-black/50">
        <button onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-full bg-white/10 active:scale-95">
          <X size={20} />
        </button>
        <h2 className="text-white font-bold text-sm tracking-wide">Edit Foto</h2>
        <button onClick={() => setRotate(r => (r + 90) % 360)} className="p-2 text-white/70 hover:text-white rounded-full bg-white/10 active:scale-95" title="Putar 90°">
          <RotateCw size={20} />
        </button>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {loadError && (
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 rounded-3xl bg-emerald-500 text-white p-5 text-center shadow-lg">
            <p className="text-sm font-bold leading-relaxed break-words">
              Foto tidak bisa dimuat untuk diedit. Coba lagi saat koneksi stabil — kalau tetap gagal, foto ini perlu diunggah ulang.
            </p>
          </div>
        )}
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={undefined} // Free crop
          className="max-h-full"
        >
          <img
            ref={imgRef}
            alt=""
            src={proxyImageSrc || currentDisplaySrc}
            // Foto diambil dari URL Firebase Storage (beda origin). Tanpa ini canvas-nya ke-taint
            // dan toDataURL() lempar SecurityError. KONSEKUENSINYA: bucket WAJIB punya konfigurasi
            // CORS, kalau tidak gambarnya gagal dimuat sama sekali (lihat onError di bawah).
            crossOrigin="anonymous"
            style={{ transform: `rotate(${rotate}deg)`, maxHeight: '70vh', objectFit: 'contain' }}
            onLoad={onImageLoad}
            onError={() => {
              if (!proxyImageSrc && typeof currentDisplaySrc === 'string' && currentDisplaySrc.startsWith('http')) {
                console.warn('[Cropper] Gagal memuat foto lintas-origin. Mencoba menggunakan proxy CORS...');
                setProxyImageSrc(`https://corsproxy.io/?${encodeURIComponent(currentDisplaySrc)}`);
              } else {
                console.error('[Cropper] Proxy CORS juga gagal atau gambar invalid.');
                setLoadError(true);
              }
            }}
          />
        </ReactCrop>
      </div>
      
      <div className="p-5 pb-8 bg-gradient-to-t from-black to-transparent">
        <div className="flex gap-2">
          <button
            onClick={() => setShowSourcePicker(true)}
            disabled={busy}
            className="px-4 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            <ImagePlus size={18} className="text-emerald-400" />
            <span>Ganti Foto</span>
          </button>
          {onReset && !isNewFile && (
            <button onClick={onReset} disabled={busy}
              className="px-4 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold active:scale-95 transition-transform disabled:opacity-50">
              Foto Asli
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />} Simpan Perubahan
          </button>
        </div>
      </div>

      {/* Action sheet pilih sumber foto pengganti */}
      {showSourcePicker && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setShowSourcePicker(false)}>
          <div className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-3xl p-5 space-y-3 shadow-2xl text-white animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="font-bold text-sm">Ganti dengan Foto Baru</h3>
              <button onClick={() => setShowSourcePicker(false)} className="p-1.5 text-neutral-400 hover:text-white rounded-full bg-white/5">
                <X size={16} />
              </button>
            </div>
            <button
              onClick={() => { setShowSourcePicker(false); cameraInputRef.current?.click(); }}
              className="w-full py-3.5 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-98 transition-all flex items-center gap-3 font-semibold text-sm text-neutral-200"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Camera size={20} />
              </div>
              <span>Ambil Foto Baru (Kamera)</span>
            </button>
            <button
              onClick={() => { setShowSourcePicker(false); galleryInputRef.current?.click(); }}
              className="w-full py-3.5 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-98 transition-all flex items-center gap-3 font-semibold text-sm text-neutral-200"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <Image size={20} />
              </div>
              <span>Pilih dari Galeri</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
