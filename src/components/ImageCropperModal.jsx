import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RotateCw, Loader2 } from 'lucide-react';

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
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotate, setRotate] = useState(0);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);

  // Komponen ini gak pernah di-unmount (cuma return null), jadi state crop foto sebelumnya
  // bakal nempel di foto berikutnya kalau gak direset tiap ganti gambar.
  useEffect(() => { setCrop(undefined); setCompletedCrop(null); setRotate(0); }, [imageSrc]);

  if (!open || !imageSrc) return null;

  function onImageLoad(e) {
    const { width, height } = e.currentTarget;
    const initial = centerAspectCrop(width, height, 1);
    setCrop(initial);
    // Tanpa ini, user yang cuma buka editor lalu langsung tap Simpan (gak geser kotak crop)
    // bikin completedCrop tetap null → tombolnya kelihatan gak ngefek apa-apa.
    setCompletedCrop(convertToPixelCrop(initial, width, height));
  }

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
    onComplete(base64Url);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm anim-fade-in no-swipe">
      <div className="flex items-center justify-between p-4 bg-black/50">
        <button onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-full bg-white/10 active:scale-95">
          <X size={20} />
        </button>
        <h2 className="text-white font-bold text-sm tracking-wide">Edit Foto</h2>
        <button onClick={() => setRotate(r => (r + 90) % 360)} className="p-2 text-white/70 hover:text-white rounded-full bg-white/10 active:scale-95">
          <RotateCw size={20} />
        </button>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={undefined} // Free crop
          className="max-h-full"
        >
          <img
            ref={imgRef}
            alt="Crop me"
            src={imageSrc}
            // Foto sekarang diambil dari URL Firebase Storage (beda origin). Tanpa ini canvas-nya
            // ke-taint dan toDataURL() lempar SecurityError — persis gejala "tap Simpan gak ngapa-ngapain".
            crossOrigin="anonymous"
            style={{ transform: `rotate(${rotate}deg)`, maxHeight: '70vh', objectFit: 'contain' }}
            onLoad={onImageLoad}
          />
        </ReactCrop>
      </div>
      
      <div className="p-5 pb-8 bg-gradient-to-t from-black to-transparent">
        <div className="flex gap-2">
          {onReset && (
            <button onClick={onReset} disabled={busy}
              className="px-4 py-4 rounded-2xl bg-white/10 text-white font-bold active:scale-95 transition-transform disabled:opacity-50">
              Foto Asli
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />} Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}
