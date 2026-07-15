import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import SwipeInput from './SwipeInput';

const BiometricSettingsModal = ({ t, theme, profile, saveProfilePatch, logymUser, onClose }) => {
  const [weight, setWeight] = useState(profile?.physical?.weight || 60);
  const [height, setHeight] = useState(profile?.physical?.height || 165);
  const [gender, setGender] = useState(profile?.physical?.gender || 'male');
  const [dob, setDob] = useState(profile?.physical?.dob || '1995-01-01');

  const handleSave = () => {
    saveProfilePatch({
      physical: { ...(profile?.physical || {}), weight, height, gender, dob }
    });
    onClose();
  };

  // State "terkunci" kalau ada Logym 
  if (logymUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={onClose}>
        <div className={`relative w-full sm:max-w-md rounded-[2rem] border ${t.border} ${theme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-white'} p-6 shadow-2xl text-center`} onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className={`absolute top-4 right-4 p-1.5 rounded-full ${t.bgBox} ${t.textMuted}`}><X size={16} /></button>
          <div className={`mx-auto w-16 h-16 rounded-full ${t.bgAccentSoft} flex items-center justify-center mb-4 text-emerald-500`}>
            <ExternalLink size={24} />
          </div>
          <h2 className={`h2 ${t.textMain} mb-2`}>Sinkronisasi Aktif</h2>
          <p className={`body-md ${t.textMuted} mb-6`}>
            Data biometrik kamu (berat, tinggi, dsb) sepenuhnya disinkronisasi dan dikelola oleh Logym. 
            Silakan buka Logym untuk melacak riwayat dan progres komposisi tubuh.
          </p>
          <button onClick={onClose} className={`w-full py-3 rounded-2xl font-bold text-sm ${t.bgAccent} text-white`}>Tutup</button>
        </div>
      </div>
    );
  }

  // Standalone: Izinkan edit
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={onClose}>
      <div className={`relative w-full sm:max-w-md rounded-[2rem] border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.glow} ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-white/70'} backdrop-blur-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
          <h2 className={`h2 ${t.textMain}`}>Biometrik Dasar</h2>
          <button onClick={onClose} className={`p-1.5 rounded-full ${t.bgBox} ${t.textMuted}`}><X size={16} /></button>
        </div>
        
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <p className={`caption ${t.textMuted}`}>Lomeal membutuhkan data dasar ini untuk menghitung kebutuhan kalori dan target nutrisi harian kamu.</p>
          
          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Jenis Kelamin</p>
            <div className="flex gap-2">
              {[{id:'male', l:'Laki-laki'}, {id:'female', l:'Perempuan'}].map(g => (
                <button key={g.id} onClick={() => setGender(g.id)} className={`flex-1 py-3 text-sm font-bold rounded-2xl border transition-all ${gender === g.id ? `${t.bgAccent} ${t.borderAccent} text-white` : `${theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white border-black/10'} ${t.textMuted}`}`}>
                  {g.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Tanggal Lahir</p>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none ${t.inputBg} ${t.textMain}`} />
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Berat Badan</p>
            <div className="relative">
              <SwipeInput value={weight} onChange={v => setWeight(Number(v) || '')} min={20} max={200} step={0.1} className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16`} />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>kg</span>
            </div>
          </div>
          
          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Tinggi Badan</p>
            <div className="relative">
              <SwipeInput value={height} onChange={v => setHeight(Number(v) || '')} min={100} max={250} step={1} className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16`} />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>cm</span>
            </div>
          </div>

          <p className={`caption ${t.textMuted} mt-4 text-center bg-black/5 dark:bg-white/5 p-3 rounded-xl`}>
            Untuk fitur analisis dan *track* komposisi tubuh yang sangat lengkap, kamu bisa *install* aplikasi **Logym**.
          </p>
        </div>

        <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
          <button onClick={onClose} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.btnBg} ${t.textMain}`}>Batal</button>
          <button onClick={handleSave} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.bgAccent} text-white`}>Simpan</button>
        </div>
      </div>
    </div>
  );
};

export default BiometricSettingsModal;
