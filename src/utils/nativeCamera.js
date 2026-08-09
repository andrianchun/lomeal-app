// Jalur kamera NATIVE (APK Capacitor). Bedanya cuma satu tapi penting: `saveToGallery`
// bikin hasil jepretan otomatis masuk galeri HP — hal yang gak bisa dilakukan PWA sama sekali
// (web gak punya izin nulis ke galeri). Di browser, fungsi ini balikin null dan pemanggilnya
// jatuh balik ke <input type="file" capture> yang lama.
//
// Plugin-nya di-import dinamis biar bundle web gak ikut kebawa.
import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

// Balikannya File — bentuknya sama persis kayak hasil <input type="file">, jadi semua
// pipeline foto yang sudah ada (compressImage → upload → Storage) gak perlu diubah.
export const captureToFile = async () => {
  if (!isNativeApp()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri, // Uri, bukan Base64 — hemat memori buat foto belasan MP
    saveToGallery: localStorage.getItem('lomeal_autosave_camera') !== 'false',
    correctOrientation: true,
    quality: 90,
  });
  const blob = await (await fetch(photo.webPath)).blob();
  return new File([blob], `lomeal-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
};
