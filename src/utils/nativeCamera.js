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
export const captureToFile = async (onPhotoReady) => {
  if (!isNativeApp()) return null;
  const { Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    direction: CameraDirection.Rear, // Selalu prioritaskan kamera belakang (hindari kamera selfie)
    resultType: CameraResultType.Uri, // Uri, bukan Base64 — hemat memori buat foto belasan MP
    saveToGallery: localStorage.getItem('lomeal_autosave_camera') !== 'false',
    correctOrientation: false, // Hindari re-encode bitmap manual di Java; WebView sudah auto-orientasi EXIF secara native
    quality: 85, // Sangat tajam & kompresi native jauh lebih instan (0ms delay)
  });
  if (!photo?.webPath) return null;

  // PREVIEW 0 DETIK: Segera broadcast webPath saat jepretan selesai tanpa tunggu fetch blob
  if (typeof onPhotoReady === 'function') {
    try { onPhotoReady(photo.webPath); } catch (_) {}
  }

  const blob = await (await fetch(photo.webPath)).blob();
  const file = new File([blob], `lomeal-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
  file.webPath = photo.webPath;
  return file;
};

// Ambil foto dari GALERI HP secara native di APK.
// Keuntungan vs <input type="file">: file di-copy ke cache lokal Capacitor dan dibaca sebagai blob utuh,
// sehingga tidak pernah kehilangan izin akses content:// URI saat proses async berjalan.
export const pickFromGallery = async (onPhotoReady) => {
  if (!isNativeApp()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
    correctOrientation: false,
    quality: 85,
  });
  if (!photo?.webPath) return null;

  // PREVIEW 0 DETIK: Segera broadcast webPath saat galeri dipilih
  if (typeof onPhotoReady === 'function') {
    try { onPhotoReady(photo.webPath); } catch (_) {}
  }

  const blob = await (await fetch(photo.webPath)).blob();
  const file = new File([blob], `lomeal-gallery-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
  file.webPath = photo.webPath;
  return file;
};

