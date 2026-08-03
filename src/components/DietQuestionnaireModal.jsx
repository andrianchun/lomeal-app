import { useState } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, X, Check } from 'lucide-react';
import { computeAge } from '../data/constants';
import { calcTargets } from '../data/nutrition';
import useBackClose from '../hooks/useBackClose';
import useSwipeStep from '../hooks/useSwipeStep';
import { fetchDomusItems } from '../utils/domusSync';
import { auth } from '../firebase';
import { hcAvailable, hcRequestPermissions } from '../utils/healthConnect';
import { getSharedDietSteps, SharedDietStepRenderer, isValidAge } from './SharedDietSteps';

const DietQuestionnaireModal = ({ t, theme, profile, onClose, onSave, showAlert, generateTrueAIRecipes }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';
  const [isGenerating, setIsGenerating] = useState(false);

  const [answers, setAnswers] = useState(() => ({
    name: profile?.name || '',
    dob: profile?.dob || '',
    height: profile?.height || 165,
    weight: profile?.weight || 60,
    targetWeight: profile?.targetWeight || 55,
    activityLevel: profile?.activityLevel || null,
    gender: profile?.gender || 'male',
    dietProfile: profile?.dietProfile || 'balanced',
    dietGoal: profile?.dietGoal || null,
    customDeltaKcal: profile?.customDeltaKcal || '',
    customProteinPerKg: profile?.customProteinPerKg || '',
    pace: profile?.pace || 'normal',
    medicalHistory: profile?.medicalHistory || [],
    allergies: profile?.allergies || '',
    kulkas: profile?.kulkas || [],
    kulkasSearch: '',
    consents: profile?.consents || { tos: false, data: false, ai: false, research: false }
  }));

  // 'pace' (Santai/Normal/Agresif) cuma ngaruh ke kalori kalau dietGoal cutting/bulk —
  // calcTargets nggak pernah pakai paceFactor buat maintenance, jadi nanya "seberapa
  // agresif" pas user pilih maintenance itu pertanyaan basi, gak ada efeknya sama sekali.
  const steps = getSharedDietSteps(t).filter((s) => s.key !== 'pace' || answers.dietGoal !== 'maintenance');

  const canProceed = () => {
    const s = steps[step];
    if (!s) return false;

    if (s.key === 'consent') {
      const c = answers.consents || { tos: false, data: false, ai: false, research: false };
      return c.tos && c.data && c.ai;
    }
    if (s.key === 'connect') return true;

    // dob DIKETIK di step 'identity', tapi 'biometrics' gak punya input dob sama sekali —
    // wajib dicek di sini juga (lihat komentar sama di OnboardingFlow.jsx).
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

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      generateProgram();
    }
  };

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
      alert('Gagal menghubungkan ke Health Connect.');
      console.error(e);
    }
  };

  const handleAppleHealth = () => {
    alert('Apple Health segera hadir di versi iOS!');
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  // Wizard 8 langkah — back mundurin satu langkah dulu (kayak tombol panah balik di
  // pojok), modalnya baru ketutup beneran kalau ditekan lagi pas udah di langkah 0.
  useBackClose(true, () => (step > 0 ? handleBack() : onClose()));

  const generateProgram = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    
    // Simpan profil dulu
    const age = computeAge(answers.dob);
    const profileForTargets = { 
        ...profile,
        dob: answers.dob, gender: answers.gender, age, 
        height: Number(answers.height), weight: Number(answers.weight), 
        dietProfile: answers.dietProfile, 
        dietGoal: answers.dietGoal,
        pace: answers.pace,
        customDeltaKcal: answers.customDeltaKcal ? Number(answers.customDeltaKcal) : null,
        customProteinPerKg: answers.customProteinPerKg ? Number(answers.customProteinPerKg) : null,
    };
    const targets = calcTargets(profileForTargets);
    const finalProfile = {
      ...profileForTargets,
      targets,
      medicalHistory: answers.medicalHistory,
      allergies: answers.allergies.trim(),
      kulkas: answers.kulkas,
    };
    
    try {
      await onSave(finalProfile, false); // false = don't show alert yet
      await generateTrueAIRecipes(finalProfile);
      onClose();
    } catch (err) {
      showAlert?.(`Gagal membuat program: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeStep({
    step, maxStep: steps.length, canProceed, onNext: handleNext, onBack: handleBack,
  });

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in`} role="dialog" onClick={onClose}>
      <div 
        className={`w-full h-full ${t.bgCard} overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-300 relative`} 
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* --- Background Image Layer --- */}
        <div 
          className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-500 opacity-100`}
          style={{
            backgroundImage: "url('/bg-program.webp')",
            backgroundSize: 'cover',
            backgroundPosition: 'center 40px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 75%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 75%)'
          }}
        />
        {/* ------------------------------ */}

        {/* HEADER */}
        <div className="flex justify-between items-center p-5 pb-2 shrink-0 relative z-10 max-w-lg mx-auto w-full">
          <div className="w-10"></div>
          
          <div className="flex-1 text-center">
            <p className={`text-[14px] ${!isDark ? 'text-black font-medium' : `${t.textMain} font-medium`} mt-2 leading-snug max-w-[280px] mx-auto`}>
              Halo, <span className="font-black">Coach Lomy</span> di sini. Aku siap bantu meracik resep diet yang enak dan sehat!
            </p>
          </div>

          <button onClick={onClose} disabled={isGenerating} className={`p-2 rounded-full ${t.inputBg} hover:text-rose-500 transition-colors`}>
            <X size={20}/>
          </button>
        </div>

        {/* Main Content — overflow-hidden locks card position, card's own overflow-y-auto handles internal scroll */}
        <div className="flex-1 flex flex-col justify-end pb-8 sm:pb-12 overflow-hidden p-6 pt-0 relative z-10">
            <div className="relative w-full max-w-lg mx-auto h-[480px] sm:h-[500px]">
                {step > 0 && !isGenerating && (
                    <button onClick={handleBack} className={`absolute left-4 sm:left-6 bottom-4 sm:bottom-6 z-[150] p-3 rounded-full ${t.bgCard} shadow-lg border ${isDark ? 'border-white/10' : 'border-black/10'} hover:opacity-80 transition-all active:scale-95`}>
                        <ChevronLeft size={24} className={t.textMain} />
                    </button>
                )}
                
                {canProceed() && !isGenerating && (
                    <button onClick={handleNext} className={`absolute right-4 sm:right-6 bottom-4 sm:bottom-6 z-[150] p-3 rounded-full shadow-lg border transition-all active:scale-95 ${t.bgCard} ${isDark ? 'border-white/10' : 'border-black/10'} hover:opacity-80`}>
                        {step === steps.length - 1 ? <Check size={24} className={t.textMain} /> : <ChevronRight size={24} className={t.textMain} />}
                    </button>
                )}

                {steps.map((s, idx) => {
                    const offset = idx - step;
                    const isPast = idx < step;
                    if (offset > 2 || offset < -1) return null;

                    return (
                        <div
                            key={s.key}
                            className={`absolute inset-0 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] p-6 sm:p-8 rounded-[2.5rem] border ${isDark ? 'border-white/10 bg-[#12141c]/80' : 'border-black/5 bg-white/80'} backdrop-blur-2xl shadow-2xl overflow-hidden`}
                            style={{
                                zIndex: 50 - idx,
                                transform: isPast ? 'translateX(-100%) scale(0.9) rotate(-5deg)' : `translateX(${offset * 24}px) translateY(${offset * 4}px) scale(${1 - offset * 0.05})`,
                                opacity: isPast ? 0 : 1 - offset * 0.3,
                                pointerEvents: idx === step ? 'auto' : 'none',
                                visibility: isPast && offset < -1 ? 'hidden' : 'visible',
                            }}
                        >
                            {/* FIXED: Title */}
                            <h2 className={`text-xl sm:text-2xl text-center font-black leading-tight ${t.textMain} mb-4 shrink-0`}>{s.title}</h2>

                            {/* SCROLLABLE: Only content area scrolls, card stays put */}
                            <div
                                className="flex-1 overflow-y-auto hide-scrollbar w-full"
                                onTouchStart={e => e.stopPropagation()}
                                onTouchMove={e => e.stopPropagation()}
                                onTouchEnd={e => e.stopPropagation()}
                            >

                            {isGenerating && (
                                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md rounded-[2.5rem]">
                                    <div className="relative w-16 h-16 mb-4">
                                        <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                        <Sparkles className="absolute inset-0 m-auto text-emerald-500" size={24} />
                                    </div>
                                    <p className={`h3 text-white`}>Meracik Menu Diet...</p>
                                    <p className={`caption text-white/70 mt-2 px-8 text-center`}>Mohon tunggu sebentar, AI sedang menyusun resep presisi untuk Anda.</p>
                                </div>
                            )}
                            {/* STEPS CONTENT */}
                            <SharedDietStepRenderer 
                              stepKey={s.key} 
                              answers={answers} 
                              setAnswers={setAnswers} 
                              t={t} 
                              isDark={isDark}
                              handleNext={handleNext}
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
                              onHealthConnect={handleHealthConnect}
                              onAppleHealth={handleAppleHealth}
                              fromLogym={false}
                            />
                            </div>{/* end scrollable content */}

                            {/* FIXED: Step indicator at bottom */}
                            <p className={`text-xs pt-3 pb-10 text-center font-medium shrink-0 ${t.textMuted}`}>Langkah {step + 1} dari {steps.length}</p>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DietQuestionnaireModal;
