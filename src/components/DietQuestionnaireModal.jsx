import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, ChefHat, X, Check } from 'lucide-react';
import { computeAge } from '../data/constants';
import { calcTargets } from '../data/nutrition';
import useBackClose from '../hooks/useBackClose';
import useSwipeStep from '../hooks/useSwipeStep';
import { fetchDomusItems } from '../utils/domusSync';
import { fetchLyfitProfile } from '../utils/lyfitSync';
import { auth } from '../firebase';
import { hcAvailable, hcRequestPermissions } from '../utils/healthConnect';
import { getSharedDietSteps, SharedDietStepRenderer, isValidAge, hasValidConsent, CONSENT_VERSION } from './SharedDietSteps';

const DietQuestionnaireModal = ({ t, theme, profile, user, logymUser, onClose, onSave, showAlert, generateTrueAIRecipes }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';
  const [isGenerating, setIsGenerating] = useState(false);

  // Biometrik disimpan di DUA tempat: `profile.physical` (ditulis Pengaturan Biometrik,
  // sinkronisasi Logym, dan Health Connect) dan field datar di akar profil (ditulis
  // onboarding & kuesioner ini). Yang hidup dan paling sering diperbarui adalah
  // `physical`, jadi itu yang dibaca duluan — kalau tidak, membuka kuesioner ulang
  // menampilkan berat/tinggi basi dari terakhir kali kuesioner diisi.
  const bio = (key, fallback) => profile?.physical?.[key] ?? profile?.[key] ?? fallback;

  const [answers, setAnswers] = useState(() => ({
    // Nama tidak pernah punya cadangan, jadi profil lama (atau yang dibuat lewat jalur
    // Logym/Domus/Darka tanpa mengisi nama di Lomeal) selalu tampil kosong. Akun Google
    // sudah membawa nama — pakai kata pertamanya sebagai nama panggilan, user bebas ganti.
    name: profile?.name || (logymUser?.displayName || user?.displayName || '').trim().split(/\s+/)[0] || '',
    dob: bio('dob', ''),
    height: bio('height', 165),
    weight: bio('weight', 60),
    targetWeight: profile?.targetWeight || bio('weight', 60),
    activityLevel: profile?.activityLevel || null,
    gender: bio('gender', 'male'),
    dietProfile: profile?.dietProfile || 'balanced',
    dietGoal: profile?.dietGoal || null,
    customDeltaKcal: profile?.customDeltaKcal || '',
    customProteinPerKg: profile?.customProteinPerKg || '',
    pace: profile?.pace || 'normal',
    medicalHistory: profile?.medicalHistory || [],
    allergies: profile?.allergies || '',
    recipePrompt: profile?.recipePrompt || '',
    kulkas: (profile?.kulkas || []).filter(k => {
      if (typeof k === 'string') return false;
      const dummy = ['ayam', 'telur', 'bayam', 'beras', 'brokoli'];
      if (k.name && dummy.includes(k.name.toLowerCase()) && k.id === k.name) return false;
      return true;
    }),
    kulkasSearch: '',
    consents: profile?.consents || { tos: false, data: false, ai: false, research: false }
  }));

  // Auto-fetch biometrik dari Logym jika profil Lomeal belum terisi lengkap
  useEffect(() => {
    if (!logymUser?.uid) return;
    fetchLyfitProfile(logymUser.uid).then((p) => {
      if (!p) return;
      setAnswers((prev) => ({
        ...prev,
        height: (!profile?.physical?.height && p.height) ? p.height : prev.height,
        weight: (!profile?.physical?.weight && p.weight) ? p.weight : prev.weight,
        gender: p.gender || prev.gender,
        dob: p.dob || prev.dob,
        activityLevel: prev.activityLevel || p.activityLevel || prev.activityLevel,
        name: prev.name || (p.displayName || '').trim().split(/\s+/)[0] || prev.name,
      }));
    });
  }, [logymUser?.uid, profile?.physical]);

  // 'pace' (Santai/Normal/Agresif) cuma ngaruh ke kalori kalau dietGoal cutting/bulk —
  // calcTargets nggak pernah pakai paceFactor buat maintenance, jadi nanya "seberapa
  // agresif" pas user pilih maintenance itu pertanyaan basi, gak ada efeknya sama sekali.
  // Persetujuan pengguna itu urusan sekali di awal (onboarding). Kalau user sudah setuju
  // versi teks yang berlaku, langkahnya dibuang di sini — bukan disodorkan lagi tiap kali
  // dia buka "Ubah Program" dari tab Program. S&K & Kebijakan Privasi lengkapnya tetap
  // bisa dibaca kapan saja lewat Pengaturan → FAQ.
  const consentDone = hasValidConsent(profile);
  const steps = getSharedDietSteps(t)
    .filter((s) => s.key !== 'consent' || !consentDone)
    .filter((s) => s.key !== 'pace' || answers.dietGoal !== 'maintenance');

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
      alert('Gagal menghubungkan ke Health Connect: ' + e.message);
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
        activityLevel: answers.activityLevel,
        dietProfile: answers.dietProfile, 
        dietGoal: answers.dietGoal,
        pace: answers.pace,
        customDeltaKcal: answers.customDeltaKcal ? Number(answers.customDeltaKcal) : null,
        customProteinPerKg: answers.customProteinPerKg ? Number(answers.customProteinPerKg) : null,
    };
    const targets = calcTargets(profileForTargets);
    const finalProfile = {
      ...profileForTargets,
      // Ditulis ke DUA-DUANYA (datar + physical) supaya tidak makin melenceng dari
      // Pengaturan Biometrik / sinkronisasi Logym yang cuma menyentuh `physical`.
      physical: {
        ...(profile?.physical || {}),
        dob: answers.dob, gender: answers.gender,
        height: Number(answers.height), weight: Number(answers.weight),
      },
      targets,
      medicalHistory: answers.medicalHistory,
      allergies: answers.allergies.trim(),
      kulkas: answers.kulkas,
      recipePrompt: (answers.recipePrompt || '').trim(),
      // Kalau langkah persetujuan sampai tampil di sini (teks S&K direvisi, atau profil
      // lama belum punya consent sama sekali), hasil centangnya HARUS ikut tersimpan —
      // kalau tidak, langkah itu bakal muncul lagi terus tiap buka kuesioner.
      ...(consentDone ? {} : {
        consents: { ...(answers.consents || {}), version: CONSENT_VERSION, agreedAt: new Date().toISOString() },
      }),
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
      {/* t.bgApp, BUKAN t.bgCard: ini layar penuh, bukan kartu. bgCard cuma putih
          transparan tipis, jadi warnanya ikut apa pun yang ada di belakangnya — hasilnya
          abu kebiruan. bgApp punya gradien hijau ambient khas Lomeal. */}
      <div
        className={`w-full h-full ${t.bgApp} overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-300 relative`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* --- Background Image Layer --- */}
        {/* Framing Coach Lomy diatur dua angka di bawah.
            backgroundSize 'auto N%' → N dihitung terhadap TINGGI layar, jadi hasilnya sama
              di HP mana pun. 100% = pas setinggi layar (setara 'cover' untuk gambar persegi);
              di atas 100% berarti zoom in. Naikkan N kalau mau lebih dekat.
            backgroundPosition X → 50% = subjek rata tengah; makin KECIL makin ke KANAN.
            Catatan: persentase pada `backgroundSize: '150%'` dihitung terhadap LEBAR, dan di
            layar HP yang jauh lebih tinggi daripada lebar itu justru lebih kecil daripada
            'cover' — makanya dipakai bentuk 'auto N%' yang berpatokan tinggi. */}
        <div
          className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-500 opacity-100`}
          style={{
            backgroundImage: "url('/bg-program.webp')",
            backgroundSize: 'auto 120%',
            backgroundPosition: '46% 0px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 75%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 75%)'
          }}
        />
        {/* ------------------------------ */}

        {/* HEADER */}
        <div className="flex justify-between items-center p-5 pb-2 pt-safe shrink-0 relative z-10 max-w-lg mx-auto w-full">
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
                                        <ChefHat className="absolute inset-0 m-auto text-emerald-500" size={24} />
                                    </div>
                                    <p className={`h3 text-white`}>Meracik Menu Diet...</p>
                                    <p className={`caption text-white/70 mt-2 px-8 text-center`}>Mohon tunggu sebentar, Lomy sedang menyusun resep presisi untuk Anda.</p>
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
