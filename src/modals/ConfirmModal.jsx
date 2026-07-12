import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmModal = ({ confirmModal, setConfirmModal, t, lang, soundEnabled, playSoundEffect }) => {
  if (!confirmModal.isOpen) return null;

  const isDelete = confirmModal.isDestructive || confirmModal.title?.toLowerCase().includes('hapus') || confirmModal.message?.toLowerCase().includes('hapus') || confirmModal.message?.toLowerCase().includes('remove') || confirmModal.title?.toLowerCase().includes('batal');

  return (
    <div className={`fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in ${t?.textMain} font-sans`} onClick={() => { if (confirmModal.onCancel) confirmModal.onCancel(); setConfirmModal({isOpen:false}); }}>
      <div className={`w-full max-w-sm mx-auto ${t?.bgCard} rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border ${t?.border} p-6 text-center`} onClick={(e) => e.stopPropagation()}>
         <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDelete ? 'bg-rose-500/10 text-rose-500' : t?.bgAccentSoft + ' ' + t?.textAccent}`}>
            <AlertTriangle size={32} strokeWidth={2.5} />
         </div>
         <h3 className="h2 mb-2">{confirmModal.title}</h3>
         <p className={`body-md ${t?.textMuted} mb-6 leading-relaxed`}>{confirmModal.message}</p>
         <div className="flex gap-3">
            <button 
              onClick={() => { if (confirmModal.onCancel) confirmModal.onCancel(); setConfirmModal({isOpen:false}); }} 
              className={`flex-1 py-3 rounded-xl font-bold body-lg ${t?.textMuted} ${t?.btnBg} active:scale-[0.98] transition-all`}
            >
              {lang?.cancel || 'Batal'}
            </button>
            {confirmModal.onConfirm && (
              <button 
                onClick={() => { playSoundEffect('click', soundEnabled); const cb = confirmModal.onConfirm; setConfirmModal({isOpen:false}); setTimeout(() => cb(), 0); }} 
                className={`flex-1 py-3 rounded-xl font-black body-lg text-white shadow-lg active:scale-[0.98] transition-all ${isDelete ? 'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600' : t?.bgAccent + ' shadow-black/20 hover:opacity-90'}`}
              >
                {confirmModal.confirmText || (isDelete ? 'Ya, Hapus' : 'Ya, Lanjutkan')}
              </button>
            )}
         </div>
      </div>
    </div>
  );
};

export default ConfirmModal;