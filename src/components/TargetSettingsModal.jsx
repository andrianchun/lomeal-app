import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { DIET_PROFILES, DIET_GOALS, PACES, calcTargets } from '../data/nutrition';
import { computeAge } from '../data/constants';
import SwipeInput from './SwipeInput';

/**
 * Quick-access target settings — dibuka dari ikon gear di hero dashboard.
 * Staged (Batal/Simpan) kayak modal target Logym: perubahan cuma di-commit sekali pas
 * Simpan, biar bisa preview target dulu. Dialog di tengah layar + glass, pola sama kayak
 * modal Logym (fixed inset-0 items-center + kartu backdrop-blur tinggi).
 * pace dulu cuma bisa diisi sekali pas onboarding, gak ada UI ubah lagi — ini nutupnya.
 */
const TargetSettingsModal = ({ t, theme, profile, saveProfilePatch, onClose }) => {
  const [dietGoal, setDietGoal] = useState(profile?.dietGoal || 'maintenance');
  const [pace, setPace] = useState(profile?.pace || 'normal');
  const [dietProfile, setDietProfile] = useState(profile?.dietProfile || 'weight_loss');
  const [waterGoal, setWaterGoal] = useState(profile?.targets?.waterGoal || 2000);
  const [allergies, setAllergies] = useState(profile?.allergies || '');

  // Preview live — pakai calcTargets yang sama kayak yang beneran jalan, biar user lihat
  // efeknya ke kkal/protein/karbo/lemak/natrium SEBELUM nekan Simpan.
  const preview = useMemo(() => {
    const physical = profile?.physical;
    if (!physical?.weight || !physical?.height || !physical?.dob || !physical?.gender) return null;
    const age = computeAge(physical.dob);
    return calcTargets({ ...physical, age, dietGoal, dietProfile, pace, waterGoal });
  }, [profile?.physical, dietGoal, dietProfile, pace, waterGoal]);

  const handleSave = () => {
    saveProfilePatch({
      dietGoal, pace, dietProfile, allergies: allergies.trim(),
      targets: { ...(profile?.targets || {}), waterGoal: Number(waterGoal) || 2000 },
    });
    onClose();
  };

  const Card = ({ selected, onClick, children }) => (
    <button onClick={onClick}
      className={`p-3 rounded-2xl border text-left transition-all backdrop-blur-xl ${
        selected ? `${t.borderAccent} ${t.bgAccentSoft}` : `${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'}`
      }`}>
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full sm:max-w-md rounded-[2rem] border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.glow} ${theme === 'dark' ? 'bg-white/[0.06]' : 'bg-white/70'} backdrop-blur-2xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
          <h2 className={`h2 ${t.textMain}`}>Target & Preferensi</h2>
          <button onClick={onClose} className={`p-1.5 rounded-full ${t.bgBox} backdrop-blur-md ${t.textMuted}`}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {preview && (
            <div className={`rounded-2xl border ${theme === 'dark' ? 'border-white/10' : 'border-black/10'} ${t.bgBox} backdrop-blur-xl p-3`}>
              <p className={`caption font-bold ${t.textMuted} mb-2 uppercase tracking-wider`}>Target Harian</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Kkal', preview.kcal], ['Protein', `${preview.protein}g`], ['Karbo', `${preview.carbs}g`], ['Lemak', `${preview.fat}g`]].map(([label, val]) => (
                  <div key={label}>
                    <p className={`font-black text-sm ${t.textMain}`}>{val}</p>
                    <p className={`text-[9px] font-bold ${t.textMuted} uppercase`}>{label}</p>
                  </div>
                ))}
              </div>
              <p className={`caption ${t.textMuted} mt-2`}>Natrium: <span className={t.textMain}>{preview.sodium}mg</span>{dietProfile === 'dash' && ' (diperketat mode DASH)'}</p>
            </div>
          )}

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Fase</p>
            <div className="grid grid-cols-3 gap-2">
              {DIET_GOALS.map((g) => (
                <Card key={g.id} selected={dietGoal === g.id} onClick={() => setDietGoal(g.id)}>
                  <div className="text-center">
                    <span className="text-xl">{g.emoji}</span>
                    <p className={`caption font-bold mt-1 ${t.textMain}`}>{g.label}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className={dietGoal === 'maintenance' ? 'opacity-40 pointer-events-none' : ''}>
            <p className={`h3 ${t.textMuted} mb-2`}>Kecepatan {dietGoal === 'maintenance' ? '(nonaktif saat Maintenance)' : ''}</p>
            <div className="flex flex-col gap-2">
              {PACES.map((p) => (
                <Card key={p.id} selected={pace === p.id} onClick={() => setPace(p.id)}>
                  <p className={`font-black text-sm ${t.textMain}`}>{p.label}</p>
                  <p className={`caption font-medium mt-0.5 ${t.textMuted}`}>{p.desc}</p>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Profil Makanan</p>
            <div className="grid grid-cols-2 gap-2">
              {DIET_PROFILES.map((dp) => (
                <Card key={dp.id} selected={dietProfile === dp.id} onClick={() => setDietProfile(dp.id)}>
                  <span className="text-xl">{dp.emoji}</span>
                  <p className={`caption font-bold mt-1 ${t.textMain}`}>{dp.label}</p>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Target Air Minum / Hari</p>
            <div className="relative">
              <SwipeInput
                value={waterGoal} onChange={setWaterGoal}
                min={500} max={5000} step={100}
                className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16`}
              />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 caption font-bold ${t.textMuted}`}>ml/hari</span>
            </div>
          </div>

          <div>
            <p className={`h3 ${t.textMuted} mb-2`}>Alergi / Intoleransi</p>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Misal: Kacang, Seafood, Laktosa..."
              className={`w-full px-3 py-2.5 rounded-xl font-bold text-sm outline-none ${t.inputBg} ${t.textMain}`}
            />
            <p className={`caption mt-1 ${t.textMuted}`}>Konteks ini dibagikan ke AI dan disinkron ke Logym.</p>
          </div>
        </div>

        <div className={`flex gap-3 px-5 py-4 border-t ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
          <button onClick={onClose} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.btnBg} ${t.textMain}`}>Batal</button>
          <button onClick={handleSave} className={`flex-1 py-3 rounded-2xl font-bold text-sm ${t.bgAccent}`}>Simpan</button>
        </div>
      </div>
    </div>
  );
};

export default TargetSettingsModal;
