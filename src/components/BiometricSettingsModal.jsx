import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import SwipeInput from './SwipeInput';

const BiometricSettingsModal = ({ t, theme, profile, saveProfilePatch, logymUser, onClose }) => {
  const [weight, setWeight] = useState(profile?.physical?.weight || 60);
  const [height, setHeight] = useState(profile?.physical?.height || 165);
  const [gender, setGender] = useState(profile?.physical?.gender || 'male');
  const [dob, setDob] = useState(profile?.physical?.dob || '1995-01-01');
  const [manualBurnKcal, setManualBurnKcal] = useState(profile?.settings?.manualBurnKcal || '');

  const handleSave = () => {
    saveProfilePatch({
      physical: { ...(profile?.physical || {}), weight, height, gender, dob },
      settings: { ...(profile?.settings || {}), manualBurnKcal: manualBurnKcal !== '' ? Number(manualBurnKcal) : null }
    });
    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-swipe" onClick={onClose}>
      <div className={`relative w-full sm:max-w-md rounded-[2rem] border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.glow} ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-white/70'} backdrop-blur-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border}`}>
          <h2 className={`h2 ${t.textMain}`}>Input Manual</h2>
          <button onClick={onClose} className={`p-1.5 rounded-full ${t.bgBox} ${t.textMuted}`}><X size={16} /></button>
        </div>
        
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <p className={`h3 ${t.textMuted} mb-2 flex items-center gap-1`}>Jenis Kelamin {logymUser && <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>}</p>
            <div className="flex gap-2">
              {[{id:'male', l:'Laki-laki'}, {id:'female', l:'Perempuan'}].map(g => (
                <button key={g.id} onClick={() => setGender(g.id)} disabled={!!logymUser} className={`flex-1 py-3 text-sm font-bold rounded-2xl border transition-all ${gender === g.id ? `${t.bgAccent} ${t.borderAccent} text-white` : `${theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white border-black/10'} ${t.textMuted}`} ${logymUser ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {g.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2 flex items-center gap-1`}>Tanggal Lahir {logymUser && <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>}</p>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)} disabled={!!logymUser} className={`w-full px-4 py-3 rounded-2xl font-bold text-sm outline-none ${t.inputBg} ${t.textMain} ${logymUser ? 'opacity-50 cursor-not-allowed' : ''}`} />
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2 flex items-center gap-1`}>Berat Badan {logymUser && <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>}</p>
            <div className="relative">
              <SwipeInput value={weight} onChange={v => setWeight(Number(v) || '')} min={20} max={200} step={0.1} disabled={!!logymUser} className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16 ${logymUser ? 'opacity-50 cursor-not-allowed' : ''}`} />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>kg</span>
            </div>
          </div>
          
          <div>
            <p className={`h3 ${t.textMuted} mb-2 flex items-center gap-1`}>Tinggi Badan {logymUser && <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>}</p>
            <div className="relative">
              <SwipeInput value={height} onChange={v => setHeight(Number(v) || '')} min={100} max={250} step={1} disabled={!!logymUser} className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16 ${logymUser ? 'opacity-50 cursor-not-allowed' : ''}`} />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>cm</span>
            </div>
          </div>

          <p className={`caption ${t.textMuted} mt-4 text-center bg-black/5 dark:bg-white/5 p-3 rounded-xl`}>
            {logymUser ? (
              <>Terkoneksi & dikelola oleh <strong>Logym</strong></>
            ) : (
              <>Install <strong>Logym</strong> untuk fitur kebugaran lengkap</>
            )}
          </p>

          <div className="w-full h-px bg-black/10 dark:bg-white/10 my-2"></div>
          <div>
            <p className={`h3 ${t.textMuted} mb-2 flex items-center gap-1`}>Kalori Dibakar (Harian) {logymUser && <span className="px-1 py-0.5 rounded bg-sky-500/20 text-sky-500 text-[8px] uppercase font-bold tracking-wider">LOGYM</span>}</p>
            <div className="relative">
              <SwipeInput value={manualBurnKcal} onChange={v => setManualBurnKcal(Number(v) || '')} min={1000} max={10000} step={10} disabled={!!logymUser} className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16 ${logymUser ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="Otomatis (BMR)" />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>kkal</span>
            </div>
            <p className={`caption ${t.textMuted} mt-2`}>Kosongkan untuk otomatis menggunakan nilai BMR.</p>
          </div>
        </div>

        <div className={`flex gap-3 px-5 py-4 border-t ${t.border}`}>
          {logymUser ? (
             <button onClick={onClose} className={`w-full py-3 rounded-2xl font-bold text-sm ${t.bgAccent} text-white`}>Tutup</button>
          ) : (
             <>
                <button onClick={onClose} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.btnBg} ${t.textMain}`}>Batal</button>
                <button onClick={handleSave} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.bgAccent} text-white`}>Simpan</button>
             </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BiometricSettingsModal;
