import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RotateCw } from 'lucide-react';

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

export default function ImageCropperModal({ 
  open, 
  onClose, 
  imageSrc, 
  onComplete,
  t 
}) {
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotate, setRotate] = useState(0);
  const imgRef = useRef(null);

  if (!open || !imageSrc) return null;

  function onImageLoad(e) {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }

  async function handleConfirm() {
    if (!completedCrop || !imgRef.current) {
      onClose();
      return;
    }
    
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    // Set canvas dimensions to match the crop size
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );
    
    const base64Url = canvas.toDataURL('image/jpeg', 0.85);
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
            style={{ transform: `rotate(${rotate}deg)`, maxHeight: '70vh', objectFit: 'contain' }}
            onLoad={onImageLoad}
          />
        </ReactCrop>
      </div>
      
      <div className="p-5 pb-8 bg-gradient-to-t from-black to-transparent">
        <button 
          onClick={handleConfirm}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
        >
          <Check size={20} /> Simpan Perubahan
        </button>
      </div>
    </div>
  );
}
