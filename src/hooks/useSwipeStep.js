import { useState } from 'react';

/**
 * Gestur swipe kiri/kanan buat navigasi antar-langkah wizard. Membedakan swipe
 * horizontal dari scroll vertikal (bandingkan deltaX vs deltaY) — tanpa ini, scroll
 * vertikal di dalam konten langkah gampang kesalah-baca jadi swipe ganti langkah.
 *
 * Dulu OnboardingFlow.jsx punya versi yang TIDAK membedakan ini (bug), sementara
 * DietQuestionnaireModal.jsx sudah benar — sekarang satu implementasi buat dua-duanya.
 */
export default function useSwipeStep({ step, maxStep, canProceed, onNext, onBack }) {
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const [touchEndY, setTouchEndY] = useState(null);

  const handleTouchStart = (e) => {
    setTouchEnd(null); setTouchEndY(null);
    setTouchStart(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };
  const handleTouchMove = (e) => {
    e.stopPropagation();
    setTouchEnd(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const deltaX = touchStart - touchEnd;
    const deltaY = touchStartY - touchEndY;
    if (Math.abs(deltaX) < Math.abs(deltaY)) return; // gestur vertikal (scroll) — abaikan
    if (deltaX < -50 && step > 0) onBack();
    else if (deltaX > 50 && step < maxStep && canProceed()) onNext();
  };

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}
