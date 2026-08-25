import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function PwaInstallPrompt({ 
  appName = 'Lomeal', 
  appLogo = '/maskable-icon-512x512.webp',
  fallbackLogo = '/logo-dark.webp',
  description = 'Install aplikasi Lomeal di perangkatmu untuk akses lebih cepat, fitur asisten harian, dan pengalaman yang lebih mulus.',
  storageKey = '__LOMEAL_PWA_PROMPT_DISMISSED',
  accentColor = 'bg-emerald-500 hover:bg-emerald-400'
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [imgSrc, setImgSrc] = useState(appLogo);

  useEffect(() => {
    // Jangan muncul jika sudah mode standalone (sudah terinstal) atau di dalam navigator standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const hasDismissed = localStorage.getItem(storageKey);
      if (!hasDismissed) {
        setShow(true);
      }
    };

    const handleAppInstalled = () => {
      setShow(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [storageKey]);

  if (!show || !deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShow(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-in slide-in-from-bottom-8 duration-300 bg-[#0d1410] border border-white/10 text-white">
        <div className="w-20 h-20 rounded-2xl mb-4 shadow-xl border border-white/10 bg-black/40 p-2 flex items-center justify-center overflow-hidden">
          <img 
            src={imgSrc} 
            onError={() => {
              if (imgSrc !== fallbackLogo) setImgSrc(fallbackLogo);
            }}
            className="w-full h-full object-contain rounded-xl" 
            alt={`${appName} Logo`} 
          />
        </div>
        <h3 className="text-xl font-black mb-2 text-white">Install {appName} App</h3>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{description}</p>
        <div className="flex flex-col w-full gap-2.5">
          <button 
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-md active:scale-98 transition-transform ${accentColor}`}
            onClick={handleInstall}
          >
            <Download size={18} /> Instal Sekarang
          </button>
          <button 
            className="w-full py-3 rounded-xl font-bold text-gray-400 hover:text-white bg-transparent border border-transparent transition-colors text-sm"
            onClick={handleDismiss}
          >
            Nanti Saja
          </button>
        </div>
      </div>
    </div>
  );
}
