import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { fetchLyfitProfile } from '../utils/lyfitSync';
import { computeAge } from '../data/constants';
import { calcTargets } from '../data/nutrition';
import useSwipeStep from '../hooks/useSwipeStep';
import { getSharedDietSteps, SharedDietStepRenderer, isValidAge } from '../components/SharedDietSteps';
import { hcAvailable, hcRequestPermissions } from '../utils/healthConnect';
import { fetchDomusItems } from '../utils/domusSync';
import { auth } from '../firebase';

// Naikkan tanggal ini tiap teks consent (step 'consent' di SharedDietSteps.jsx) direvisi.
const CONSENT_VERSION = '2026-08-03';

const OnboardingFlow = ({ t, theme, logymUser, onComplete }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';

  const [fromLogym, setFromLogym] = useState(false);

  // We use `answers` to match `SharedDietSteps` state exactly
  const [answers, setAnswers] = useState({
    name: '',
    dob: '',
    height: 165,
    weight: 60,
    targetWeight: 55,
    activityLevel: null,
    gender: 'male',
    dietProfile: null,
    dietGoal: null,
    pace: 'normal',
    customDeltaKcal: '',
    customProteinPerKg: '',
    medicalHistory: [],
    allergies: '',
    kulkas: [],
    kulkasSearch: '',
    consents: { tos: false, data: false, ai: false, research: false }
  });

  // 'pace' (Santai/Normal/Agresif) cuma ngaruh ke kalori kalau dietGoal cutting/bulk —
  // calcTargets nggak pernah pakai paceFactor buat maintenance, jadi nanya "seberapa
  // agresif" pas user pilih maintenance itu pertanyaan basi, gak ada efeknya sama sekali.
  const STEPS = getSharedDietSteps(t).filter((s) => s.key !== 'pace' || answers.dietGoal !== 'maintenance');

  // --- Sambungkan ke Logym (opsional, skippable) ---
  const applyLogymPrefill = async (uid) => {
    const p = await fetchLyfitProfile(uid);
    if (p && (p.weight || p.height || p.gender || p.dob)) {
      setAnswers((prev) => ({
        ...prev,
        name: p.name || prev.name,
        dob: p.dob || prev.dob,
        height: p.height || prev.height,
        weight: p.weight || prev.weight,
        gender: p.gender || prev.gender,
        targetWeight: p.targetWeight || prev.targetWeight,
        activityLevel: p.activityLevel || prev.activityLevel,
        dietProfile: p.dietProfile || prev.dietProfile,
        dietGoal: p.dietGoal || prev.dietGoal,
        customDeltaKcal: p.customDeltaKcal || prev.customDeltaKcal,
        customProteinPerKg: p.customProteinPerKg || prev.customProteinPerKg,
        medicalHistory: p.medicalHistory || prev.medicalHistory,
        allergies: p.allergies || prev.allergies,
      }));
      setFromLogym(true);
    }
  };

  useEffect(() => {
    if (logymUser && !fromLogym && step === 1) {
      applyLogymPrefill(logymUser.uid);
    }
  }, [logymUser, fromLogym, step]);

  const canProceed = () => {
    const s = STEPS[step];
    if (!s) return false;

    if (s.key === 'consent') {
      // research OPSIONAL — sengaja gak dicek di sini, gak boleh nge-gate tombol Lanjut.
      const c = answers.consents || { tos: false, data: false, ai: false, research: false };
      return c.tos && c.data && c.ai;
    }
    if (s.key === 'connect') return true;

    // dob DIKETIK di step 'identity' (lihat SharedDietSteps.jsx), tapi step 'biometrics'
    // gak punya input dob sama sekali — kalau validasi dob cuma dicek di 'biometrics'
    // (kayak sebelumnya), user yang ngelewatin tanpa isi dob macet permanen di situ,
    // gak ada UI buat balikin ngisi lagi. Makanya wajib dicek di sini juga.
    if (s.key === 'identity') return answers.name?.trim().length > 0 && answers.gender && isValidAge(answers.dob);
    if (s.key === 'biometrics') return isValidAge(answers.dob) && answers.height > 0 && answers.weight > 0;
    if (s.key === 'activityLevel') return !!answers.activityLevel;
    if (s.key === 'diet') return !!answers.dietProfile;
    if (s.key === 'dietGoal') return !!answers.dietGoal;
    if (s.key === 'pace') return true; // preset default 'normal' udah kepilih, gak wajib diubah
    if (s.key === 'medical') return true;
    if (s.key === 'kulkas') return true;

    return true;
  };

  const finish = () => {
    const age = computeAge(answers.dob);
    // Profile map for calcTargets matches logic in SharedDietSteps
    const profileForTargets = {
      ...answers,
      age,
      height: Number(answers.height),
      weight: Number(answers.weight),
      // pace ikut dari answers.pace (step 'pace' beneran, bukan dipaksa 'normal') —
      // calcTargets pakai ini buat paceFactor.
    };
    const targets = calcTargets(profileForTargets);
    
    // Convert answers to the profile shape onComplete expects
    onComplete({
      onboardingCompleted: true,
      consents: { ...(answers.consents || {}), version: CONSENT_VERSION, agreedAt: new Date().toISOString() },
      physical: { 
        dob: answers.dob, 
        height: Number(answers.height), 
        weight: Number(answers.weight), 
        gender: answers.gender, 
        fromLogym 
      },
      ...answers,
      targets,
      createdAt: new Date().toISOString(),
    });
  };

  const handleNext = () => {
    if (step === STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };
  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeStep({
    step, maxStep: STEPS.length, canProceed, onNext: handleNext, onBack: handleBack,
  });

  const handleHealthConnect = async () => {
    try {
      const isAvail = await hcAvailable();
      if (!isAvail) {
        alert('Health Connect belum tersedia atau belum di-install di perangkat ini.');
        return;
      }
      await hcRequestPermissions();
      alert('Berhasil terhubung ke Health Connect!');
    } catch (e) {
      alert('Gagal menghubungkan ke Health Connect: ' + e.message);
      console.error(e);
    }
  };

  const handleAppleHealth = () => {
    alert('Apple Health segera hadir di versi iOS!');
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col bg-[url('/bg-program.webp')] bg-cover bg-center`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-t from-black via-black/40 to-transparent' : 'bg-gradient-to-t from-black/80 via-black/20 to-transparent'}`}></div>
      <div className="relative z-10 flex flex-col h-full">
      <div className="flex justify-center items-center p-5 pb-2 shrink-0 pt-[max(env(safe-area-inset-top),2rem)]">
        <p className={`text-sm font-medium text-center max-w-[280px] text-white drop-shadow-md`}>
          Halo! <span className="font-black">Coach Lomy</span> siap bantu mencatat dan mengatur pola makan sehatmu.
        </p>
      </div>

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
                className={`absolute inset-0 flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] p-6 sm:p-8 rounded-[2.5rem] border ${isDark ? 'border-white/10 bg-white/[0.045]' : 'border-black/5 bg-white/80'} backdrop-blur-2xl shadow-2xl overflow-hidden`}
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

                <div className="flex-1 flex flex-col overflow-y-auto hide-scrollbar content-start">
                  <SharedDietStepRenderer
                    stepKey={s.key}
                    answers={answers}
                    setAnswers={setAnswers}
                    t={t}
                    isDark={isDark}
                    handleNext={handleNext}
                    onHealthConnect={handleHealthConnect}
                    onAppleHealth={handleAppleHealth}
                    fromLogym={fromLogym}
                      onSyncDomus={async () => {
                        if (!auth.currentUser) return [];
                        try {
                          const items = await fetchDomusItems(auth.currentUser.uid);
                          return items.map(item => ({ id: item.id, name: item.name }));
                        } catch (e) {
                          console.error("Gagal sinkronisasi domus:", e);
                          return [];
                        }
                      }}
                    />
                  </div>
                <div className="mt-auto pt-4 flex justify-center shrink-0">
                  <p className={`text-xs font-bold ${t.textMuted}`}>Langkah {idx + 1} dari {STEPS.length}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
