import React, { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { createPortal } from 'react-dom';
import { X, Check, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { playSoundEffect } from '../utils/audio';

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

function getRadianAngle(degreeValue) {
  return (degreeValue * Math.PI) / 180;
}

export async function getCroppedImg(imageSrc, pixelCrop, rotation = 0) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  // set each dimensions to double largest dimension to allow for a safe area for the
  // image to rotate in without being clipped by canvas context
  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.translate(-safeArea / 2, -safeArea / 2);

  ctx.drawImage(
    image,
    safeArea / 2 - image.width * 0.5,
    safeArea / 2 - image.height * 0.5
  );

  const data = ctx.getImageData(0, 0, safeArea, safeArea);
  
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  
  ctx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
  );

  return canvas.toDataURL('image/webp', 0.8);
}

const ImageEditorModal = ({ 
  isOpen, 
  onClose, 
  imageSrc, 
  onSave, 
  t, 
  theme, 
  soundEnabled 
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    playSoundEffect('click', soundEnabled);
    setIsProcessing(true);
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onSave(croppedImage);
    } catch (e) {
      console.error(e);
      alert('Gagal memproses gambar');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col bg-black">
      <div className="flex-1 relative w-full h-full">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          showGrid={false}
          style={{
            containerStyle: { backgroundColor: 'black' }
          }}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md pb-safe border-t border-white/10">
        <div className="px-6 pt-4 pb-2 space-y-4">
          <div className="flex items-center gap-4">
            <ZoomOut size={20} className="text-white/50" />
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(e.target.value)}
              className="flex-1 accent-emerald-500 h-1 bg-white/20 rounded-full appearance-none"
            />
            <ZoomIn size={20} className="text-white/50" />
          </div>

          <div className="flex items-center justify-between pt-2 pb-4">
            <button
              onClick={() => { playSoundEffect('click', soundEnabled); onClose(); }}
              className="p-3 rounded-full bg-white/10 text-white active:scale-95 transition-transform"
            >
              <X size={24} />
            </button>

            <button
              onClick={() => { playSoundEffect('click', soundEnabled); setRotation(r => r + 90); }}
              className="p-3 rounded-full bg-white/10 text-white active:scale-95 transition-transform"
            >
              <RotateCw size={24} />
            </button>

            <button
              onClick={handleSave}
              disabled={isProcessing}
              className={`p-3 rounded-full active:scale-95 transition-transform flex items-center justify-center
                ${isProcessing ? 'bg-emerald-500/50' : 'bg-emerald-500'} text-white`}
            >
              {isProcessing ? <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={24} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImageEditorModal;
