import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { fetchLyfitProfile } from '../utils/lyfitSync';
import { computeAge } from '../data/constants';
import { DIET_PROFILES, PACES, calcTargets } from '../data/nutrition';
import { MEDICAL_CONDITIONS } from '../data/medicalConditions';
import ScrollPicker from '../components/ScrollPicker';
import OptionCard from '../components/OptionCard';
import useSwipeStep from '../hooks/useSwipeStep';
import ConsentScreen from '../components/ConsentScreen';

/**
 * ALUR ONBOARDING BERJENJANG — "Digital Anamnesis" (Fase 3 & 6 blueprint)
 * Bentuk carousel kartu bertumpuk di-port persis dari kuesioner Logym
 * (lyfit.app/src/modals/ProgramQuestionnaireModal.jsx): transform stack +
 * swipe gesture + tombol navigasi bulat mengambang.
 * Step "Sambungkan ke Logym" (opsional) menarik gender/dob/tinggi/berat
 * otomatis kalau user sudah punya akun Logym — lihat utils/lyfitSync.js.
 *
 * Step 'consent' SENGAJA tidak ikut carousel kartu-tumpuk (lihat render di bawah) —
 * itu satu-satunya step yang isinya teks hukum, jadi dirender sebagai halaman penuh
 * yang scroll natural, bukan kartu bertinggi tetap dengan scrollbar disembunyikan
 * (yang lama bikin poin ke-3 gampang gak kelihatan di layar kecil).
 */
const STEPS = [
  { key: 'consent', title: 'Persetujuan Pengguna' },
  { key: 'connect', title: 'Sambungkan ke Logym?' },
  { key: 'identity', title: 'Identitas & Gender' },
  { key: 'physical', title: 'Data Fisik' },
  { key: 'medical', title: 'Riwayat Medis & Alergi' },
  { key: 'diet', title: 'Target Diet Medis' },
  { key: 'pace', title: 'Komitmen Waktu' },
];

// Naikkan tanggal ini tiap teks consent (ConsentScreen.jsx) direvisi — dicatat bareng
// timestamp persetujuan user, jadi ada jejak versi teks mana yang disetujui siapa.
const CONSENT_VERSION = '2026-08-02';

const OnboardingFlow = ({ t, theme, logymUser, onComplete }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';

  // research: opsional, TIDAK menggerbang canProceed() — beda dari 3 lainnya yang wajib.
  const [consents, setConsents] = useState({ medical: false, allergy: false, privacy: false, research: false });
  const [physical, setPhysical] = useState({ dob: '', height: 165, weight: 60, gender: 'male' });
  const [dietProfile, setDietProfile] = useState(null);
  const [pace, setPace] = useState('normal');
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [allergies, setAllergies] = useState('');
  const [fromLogym, setFromLogym] = useState(false);

  // --- Sambungkan ke Logym (opsional, skippable) ---
  const applyLogymPrefill = async (uid) => {
    const p = await fetchLyfitProfile(uid);
    if (p) {
      setPhysical((prev) => ({
        dob: p.dob || prev.dob,
        height: p.height || prev.height,
        weight: p.weight || prev.weight,
        gender: p.gender || prev.gender,
      }));
      setFromLogym(true);
    }
  };

  // Kalau sudah connect sebelumnya (mis. balik dari step lain), tarik ulang tiap masuk step ini.
  if (logymUser && !fromLogym && step === 1) {
    applyLogymPrefill(logymUser.uid);
  }

  const allConsented = consents.medical && consents.allergy && consents.privacy;
  const physicalValid = physical.dob && computeAge(physical.dob) > 9 && Number(physical.height) > 90 && Number(physical.weight) > 20;

  const canProceed = () => {
    if (step === 0) return allConsented;
    if (step === 1) return true; // opsional, selalu bisa lanjut/skip
    if (step === 2) return !!physical.gender && !!physical.dob && computeAge(physical.dob) > 9;
    if (step === 3) return physicalValid;
    if (step === 4) return true; // riwayat medis opsional
    if (step === 5) return !!dietProfile;
    if (step === 6) return true;
    return false;
  };

  const finish = () => {
    const age = computeAge(physical.dob);
    const profileForTargets = { ...physical, age, height: Number(physical.height), weight: Number(physical.weight), dietProfile, pace };
    const targets = calcTargets(profileForTargets);
    onComplete({
      onboardingCompleted: true,
      consents: { ...consents, version: CONSENT_VERSION, agreedAt: new Date().toISOString() },
      physical: { dob: physical.dob, height: Number(physical.height), weight: Number(physical.weight), gender: physical.gender, fromLogym },
      dietProfile, pace, targets, medicalHistory, allergies: allergies.trim(),
      createdAt: new Date().toISOString(),
    });
  };

  const handleNext = () => {
    if (step === STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };
  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  // Dulu versi sendiri yang cuma cek delta horizontal (gampang kesalah-baca kalau user
  // sebenernya lagi scroll vertikal) — sekarang pakai hook yang sama kayak
  // DietQuestionnaireModal.jsx, yang membedakan gestur horizontal dari scroll vertikal.
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeStep({
    step, maxStep: STEPS.length, canProceed, onNext: handleNext, onBack: handleBack,
  });

  const bmi = physical.height && physical.weight ? (Number(physical.weight) / ((Number(physical.height) / 100) ** 2)).toFixed(1) : null;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${t.bgApp}`}>
      <div className="flex justify-center items-center p-5 pb-2 shrink-0">
        <p className={`text-sm font-medium text-center max-w-[280px] ${t.textMain}`}>
          Halo! <span className="font-black">Lomeal</span> siap bantu kamu mencatat & mengendalikan pola makan sehat.
        </p>
      </div>

      {step === 0 ? (
        <ConsentScreen t={t} isDark={isDark} consents={consents} setConsents={setConsents} onNext={handleNext} />
      ) : (
      <div
        className="flex-1 flex flex-col justify-end pb-8 sm:pb-12 overflow-y-auto p-6 pt-0 hide-scrollbar relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative w-full max-w-lg mx-auto h-[480px] sm:h-[500px]">
          {step > 0 && (
            <button onClick={handleBack} className={`absolute left-4 sm:left-6 bottom-4 sm:bottom-6 z-[150] p-3 rounded-full ${t.bgCard} shadow-lg border ${t.border} active:scale-95 transition-all`}>
              <ChevronLeft size={24} className={t.textMain} />
            </button>
          )}
          {canProceed() && (
            <button onClick={handleNext} className={`absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-[150] p-3 rounded-full shadow-lg border ${t.bgCard} ${t.border} active:scale-95 transition-all`}>
              {step === STEPS.length - 1 ? <Check size={24} className={t.textMain} /> : <ChevronRight size={24} className={t.textMain} />}
            </button>
          )}

          {STEPS.map((s, idx) => {
            const offset = idx - step;
            const isPast = idx < step;
            if (offset > 2 || offset < -1) return null;

            return (
              <div
                key={s.key}
                className={`absolute inset-x-0 top-0 flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] p-6 sm:p-8 min-h-full rounded-[2.5rem] border ${isDark ? 'border-white/10 bg-white/[0.045]' : 'border-black/5 bg-white/80'} backdrop-blur-2xl shadow-2xl overflow-y-auto hide-scrollbar`}
                style={{
                  zIndex: 50 - idx,
                  transform: isPast ? 'translateX(-100%) scale(0.9) rotate(-5deg)' : `translateX(${offset * 24}px) translateY(${offset * 4}px) scale(${1 - offset * 0.05})`,
                  opacity: isPast ? 0 : 1 - offset * 0.3,
                  pointerEvents: idx === step ? 'auto' : 'none',
                  visibility: isPast && offset < -1 ? 'hidden' : 'visible',
                }}
              >
                <div className="flex flex-col items-center text-center mb-5 shrink-0">
                  <h2 className={`text-xl sm:text-2xl font-black leading-tight ${t.textMain}`}>{s.title}</h2>
                </div>

                {s.key === 'connect' && (
                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto hide-scrollbar">
                    <div className={`p-4 rounded-2xl border-2 ${t.borderAccent} ${t.bgAccentSoft} text-center`}>
                      <Sparkles size={22} className={`mx-auto mb-2 ${t.textAccent}`} />
                      <p className={`body-md ${t.textMain}`}>Tersambung ke Logym!</p>
                      <p className={`caption font-medium mt-1 ${t.textMuted}`}>Gender/DOB/tinggi/berat sudah ditarik otomatis — cek di langkah berikutnya.</p>
                    </div>
                  </div>
                )}

                {s.key === 'identity' && (
                  <div className="flex-1 flex flex-col gap-4">
                    <div>
                      <p className={`caption font-medium mb-2 ${t.textMuted}`}>Gender</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[['male', 'Pria'], ['female', 'Wanita']].map(([id, label]) => (
                          <button key={id} onClick={() => setPhysical((p) => ({ ...p, gender: id }))}
                            className={`py-3 rounded-xl border-2 font-bold text-sm transition-all ${physical.gender === id ? `${t.bgAccent} border-transparent text-white` : `${isDark ? 'border-white/10 bg-white/5' : 'border-white/50 bg-white/60'} ${t.textMuted}`}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className={`caption font-medium mb-2 ${t.textMuted}`}>Tanggal Lahir</p>
                      <input type="date" value={physical.dob} max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setPhysical((p) => ({ ...p, dob: e.target.value }))}
                        className={`w-full px-3 py-3 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none`} />
                    </div>
                  </div>
                )}

                {s.key === 'physical' && (
                  <div className="flex-1 flex flex-col items-center gap-4">
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className={`caption font-medium mb-1 ${t.textMuted}`}>Tinggi (cm)</p>
                        <ScrollPicker value={physical.height} onChange={(v) => setPhysical((p) => ({ ...p, height: v }))} min={90} max={230} step={1} theme={theme} t={t} />
                      </div>
                      <div className="text-center">
                        <p className={`caption font-medium mb-1 ${t.textMuted}`}>Berat (kg)</p>
                        <ScrollPicker value={physical.weight} onChange={(v) => setPhysical((p) => ({ ...p, weight: v }))} min={20} max={200} step={1} theme={theme} t={t} />
                      </div>
                    </div>
                    {bmi && (
                      <div className={`px-4 py-2 rounded-xl ${t.bgSunken} text-center`}>
                        <span className={`caption font-medium ${t.textMuted}`}>BMI: </span>
                        <span className={`body-md font-bold ${t.textMain}`}>{bmi}</span>
                      </div>
                    )}
                  </div>
                )}

                {s.key === 'medical' && (
                  <div className="flex-1 flex flex-col gap-4 overflow-y-auto hide-scrollbar">
                    <p className={`caption font-medium ${t.textMuted}`}>Pilih jika ada (bisa lebih dari satu, opsional):</p>
                    <div className="flex flex-wrap gap-2">
                      {MEDICAL_CONDITIONS.map(cond => {
                        const isSelected = medicalHistory.includes(cond);
                        return (
                          <button key={cond}
                            onClick={() => {
                              if (isSelected) setMedicalHistory(prev => prev.filter(c => c !== cond));
                              else setMedicalHistory(prev => [...prev, cond]);
                            }}
                            className={`px-3 py-1.5 rounded-full border text-sm transition-all ${isSelected ? `${t.bgAccent} ${t.borderAccent} text-white` : `${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} ${t.textMuted}`}`}>
                            {cond}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2">
                      <p className={`caption font-medium mb-1 ${t.textMuted}`}>Alergi Makanan (opsional)</p>
                      <input type="text" placeholder="Misal: Kacang, udang, kerang..." value={allergies}
                        onChange={e => setAllergies(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm`} />
                    </div>
                  </div>
                )}

                {s.key === 'diet' && (
                  <div className="flex-1 grid grid-cols-2 gap-2 overflow-y-auto hide-scrollbar content-start">
                    {DIET_PROFILES.map((dp) => (
                      <button key={dp.id} onClick={() => setDietProfile(dp.id)}
                        className={`p-3 rounded-2xl border-2 text-left transition-all ${dietProfile === dp.id ? `${t.borderAccent} ${t.bgAccentSoft} scale-[1.02]` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`}`}>
                        <span className="text-xl">{dp.emoji}</span>
                        <p className={`caption font-bold mt-1 ${t.textMain}`}>{dp.label}</p>
                      </button>
                    ))}
                  </div>
                )}

                {s.key === 'pace' && (
                  <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto hide-scrollbar">
                    {PACES.map((p) => (
                      <OptionCard key={p.id} t={t} isDark={isDark} selected={pace === p.id} onClick={() => setPace(p.id)}>
                        <div>
                          <p className="font-black text-sm">{p.label}</p>
                          <p className={`caption font-medium mt-0.5 ${pace === p.id ? 'text-white/80' : t.textMuted}`}>{p.desc}</p>
                        </div>
                      </OptionCard>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-4 flex justify-center shrink-0">
                  <p className={`text-xs font-bold ${t.textMuted}`}>Langkah {idx + 1} dari {STEPS.length}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};

export default OnboardingFlow;
