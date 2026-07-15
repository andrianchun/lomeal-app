import React, { useState, useEffect } from 'react';
import { Target, Activity, Calendar, Dumbbell, Clock, ChevronRight, ChevronLeft, Sparkles, X, CheckCircle2, User, Ruler, Smartphone, Heart, Check, Apple, Refrigerator, Info } from 'lucide-react';
import { computeAge } from '../data/constants';
import { searchFoods } from '../data/foodDatabase';
import { DIET_PROFILES, PACES, DIET_GOALS, calcTargets } from '../data/nutrition';
import ScrollPicker from './ScrollPicker';
import SwipeInput from './SwipeInput';

const MEDICAL_CONDITIONS = ['Hipertensi', 'Diabetes/Prediabetes', 'Asam Urat', 'Stroke', 'CKD (Gagal Ginjal)', 'PCOS', 'Penyakit Jantung', 'Kolesterol Tinggi', 'Kanker'];

const KULKAS_ITEMS = [
  { id: 'ayam', label: 'Dada Ayam', icon: '🍗' },
  { id: 'telur', label: 'Telur', icon: '🥚' },
  { id: 'bayam', label: 'Bayam', icon: '🥬' },
  { id: 'tempe', label: 'Tempe/Tahu', icon: '🧊' },
  { id: 'beras', label: 'Beras Putih', icon: '🍚' },
  { id: 'brokoli', label: 'Brokoli', icon: '🥦' },
];

const DietQuestionnaireModal = ({ t, theme, profile, onClose, onSave, generateOfflineRecipes, generateTrueAIRecipes }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';
  const [useAI, setUseAI] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-read Logym shared cookie on mount — no button needed since it's the same account
  const [answers, setAnswers] = useState(() => {
    let synced = null;
    try {
      const match = document.cookie.match(/(^| )shared_profile=([^;]+)/);
      if (match) synced = JSON.parse(decodeURIComponent(match[2]));
    } catch(e) {}

    return {
      name: synced?.name || profile?.name || '',
      dob: synced?.dob || profile?.dob || '',
      height: synced?.height || profile?.height || 165,
      weight: synced?.weight || profile?.weight || 60,
      targetWeight: synced?.targetWeight || profile?.targetWeight || 55,
      activityLevel: synced?.activityLevel || profile?.activityLevel || null,
      gender: synced?.gender || profile?.gender || 'male',
      // Lomeal-specific fields: use Lomeal profile, not Logym
      dietProfile: profile?.dietProfile || 'balanced',
      dietGoal: profile?.dietGoal || null,
      customDeltaKcal: profile?.customDeltaKcal || '',
      customProteinPerKg: profile?.customProteinPerKg || '',
      pace: profile?.pace || 'normal',
      medicalHistory: profile?.medicalHistory || [],
      allergies: profile?.allergies || '',
      kulkas: profile?.kulkas || [],
      kulkasSearch: '',
    };
  });

  const isValidAge = (dob) => {
    if (!dob) return false;
    return computeAge(dob) > 9;
  };

  const steps = [
    {
      title: "Sinkronisasi Data Kesehatan",
      key: 'settings',
      icon: <Sparkles className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Identitas Diri",
      key: 'identity',
      icon: <User className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Data Fisik",
      key: 'biometrics',
      icon: <Ruler className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Bagaimana tingkat aktivitas harianmu di luar olahraga?",
      key: 'activityLevel',
      icon: <Activity className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Riwayat Medis & Alergi",
      key: 'medical',
      icon: <Heart className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Target Diet Medis",
      key: 'diet',
      icon: <Target className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Fase Diet",
      key: 'pace',
      icon: <Clock className={`${t.textAccent} mb-4`} size={40} />
    },
    {
      title: "Bahan Makanan yang Dimiliki",
      key: 'kulkas',
      icon: <Refrigerator className={`${t.textAccent} mb-4`} size={40} />
    }
  ];

  const canProceed = () => {
    if (step === 0) return true;
    if (step === 1) return isValidAge(answers.dob) && answers.gender && answers.name?.trim().length > 0;
    if (step === 2) return answers.height > 90 && answers.weight > 20;
    if (step === 3) return !!answers.activityLevel; // Tingkat Aktivitas
    if (step === 4) return true; // Medis & Alergi (Opsional)
    if (step === 5) return !!answers.dietProfile;
    if (step === 6) return !!answers.dietGoal;
    if (step === 7) return true; // Kulkas (Opsional)
    return true;
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      generateProgram();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

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
    
    await onSave(finalProfile, false); // false = don't show alert yet

    if (useAI) {
        await generateTrueAIRecipes(finalProfile);
    } else {
        await generateOfflineRecipes(finalProfile);
    }
    
    setIsGenerating(false);
    onClose();
  };

  const toggleMedical = (cond) => {
      setAnswers(prev => {
          const arr = prev.medicalHistory;
          if (arr.includes(cond)) return { ...prev, medicalHistory: arr.filter(c => c !== cond) };
          return { ...prev, medicalHistory: [...arr, cond] };
      });
  };
  
  const toggleKulkas = (id) => {
      setAnswers(prev => {
          const arr = prev.kulkas;
          if (arr.includes(id)) return { ...prev, kulkas: arr.filter(c => c !== id) };
          return { ...prev, kulkas: [...arr, id] };
      });
  };

  const handleHealthSync = (provider) => {
      // Mock Native Sync for PWA by reading Logym's cookie
      const match = document.cookie.match(new RegExp('(^| )shared_profile=([^;]+)'));
      let syncedData = null;
      if (match) {
        try {
            syncedData = JSON.parse(decodeURIComponent(match[2]));
        } catch(e) {}
      }

      alert(`Berhasil sinkronisasi dengan ${provider}! (Data simulasi)${syncedData ? ' Menarik profil terbarumu dari LOGYM.' : ''}`);
      
      setAnswers(prev => ({
          ...prev,
          name: syncedData?.name || 'Chunsky',
          height: syncedData?.height || 172,
          weight: syncedData?.weight || 71,
          targetWeight: syncedData?.targetWeight || 30,
          activityLevel: syncedData?.activityLevel || 'moderate',
          dob: syncedData?.dob || '1995-03-24',
          gender: syncedData?.gender || 'male',
          medicalHistory: ['Hipertensi'],
          allergies: 'Kacang'
      }));
      
      if (step < steps.length - 1) setStep(s => s + 1);
  };

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const [touchEndY, setTouchEndY] = useState(null);
  const handleTouchStart = (e) => { setTouchEnd(null); setTouchEndY(null); setTouchStart(e.targetTouches[0].clientX); setTouchStartY(e.targetTouches[0].clientY); };
  const handleTouchMove = (e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); setTouchEndY(e.targetTouches[0].clientY); };
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const deltaX = touchStart - touchEnd;
    const deltaY = touchStartY - touchEndY;
    // Only process as swipe if gesture is primarily horizontal
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX < -50 && step > 0) handleBack();
    else if (deltaX > 50 && step < steps.length && canProceed()) handleNext();
  };

  const OptionCard = ({ selected, onClick, children }) => (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-2xl border-2 backdrop-blur-md transition-all duration-200 active:scale-[0.98] flex items-center justify-between ${
        selected ? `${t.borderAccent} ${t.bgAccent} text-white shadow-lg` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`
      }`}
    >
      {children}
      <ChevronRight size={16} className={selected ? 'text-white' : t.textMuted} />
    </button>
  );

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
                            className={`absolute inset-x-0 top-0 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] p-6 sm:p-8 min-h-full rounded-[2.5rem] border ${isDark ? 'border-white/10 bg-[#12141c]/80' : 'border-black/5 bg-white/80'} backdrop-blur-2xl shadow-2xl overflow-hidden`}
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
                                    <p className={`caption text-white/70 mt-2 px-8 text-center`}>Mohon tunggu sebentar, {useAI ? 'AI sedang menyusun resep presisi' : 'mengambil resep dari database'} untuk Anda.</p>
                                </div>
                            )}

                            {/* STEPS CONTENT */}
                            {s.key === 'settings' && (
                                <div className="w-full flex flex-col gap-6">
                                    <label className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${useAI ? (isDark ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-emerald-500 bg-emerald-50') : (isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-white')}`}>
                                        <div>
                                            <div className={`font-black text-base ${!isDark ? 'text-black' : t.textMain} flex items-center gap-2`}>
                                                Gunakan AI <Sparkles size={16} className={useAI ? "text-emerald-500" : "text-neutral-500"} />
                                            </div>
                                            <p className={`text-xs mt-1 ${!isDark ? 'text-black/60' : 'text-white/60'} leading-tight`}>Rencanakan resep dengan AI yang disesuaikan kondisi medis</p>
                                        </div>
                                        <div className={`w-12 h-7 shrink-0 rounded-full flex items-center px-1 transition-colors ${useAI ? 'bg-emerald-500' : 'bg-neutral-500/30'}`}>
                                            <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${useAI ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <input type="checkbox" className="hidden" checked={useAI} onChange={() => setUseAI(!useAI)} />
                                    </label>

                                    <div className="pt-2 border-t border-neutral-500/20">
                                        <p className={`text-xs font-bold mb-3 ${t.textMuted} text-center`}>Sinkronisasi data kesehatan (Opsional):</p>
                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                            <button
                                              onClick={() => handleHealthSync('Health Connect')}
                                              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                                                  isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-white hover:bg-black/5 shadow-sm'
                                              }`}
                                            >
                                              <img src="/health-connect.webp" alt="Health Connect" className="w-8 h-8 shrink-0 rounded-[22%] object-cover" />
                                              <span className={`font-black text-xs ${!isDark ? 'text-black' : t.textMain}`}>Health Connect</span>
                                            </button>

                                            <button
                                              onClick={() => handleHealthSync('Apple Health')}
                                              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                                                  isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-white hover:bg-black/5 shadow-sm'
                                              }`}
                                            >
                                              <img src="/apple-health.webp" alt="Apple Health" className="w-8 h-8 shrink-0" />
                                              <span className={`font-black text-xs ${!isDark ? 'text-black' : t.textMain}`}>Apple Health</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {s.key === 'identity' && (
                                <div className="flex flex-col pb-2 space-y-4 w-full">
                                  <div>
                                      <label className={`text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block`}>Nama Panggilan</label>
                                      <input 
                                          type="text" 
                                          placeholder="Siapa namamu?"
                                          value={answers.name} 
                                          onChange={(e) => setAnswers(prev => ({...prev, name: e.target.value}))} 
                                          className={`w-full p-4 rounded-xl border-2 font-bold ${answers.name?.trim().length > 0 ? t.borderAccent : 'border-transparent'} ${t.inputBg} ${t.textMain} outline-none transition-all`}
                                      />
                                  </div>
                                  <div>
                                      <label className={`text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block`}>Jenis Kelamin</label>
                                      <div className="grid grid-cols-2 gap-3">
                                          <button onClick={() => setAnswers(prev => ({...prev, gender: 'male'}))} className={`p-4 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-3 ${answers.gender === 'male' ? `${t.borderAccent} ${t.bgAccent} text-white` : `border-transparent ${t.inputBg} ${t.textMuted}`}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="5"></circle><line x1="13.5" y1="10.5" x2="21" y2="3"></line><polyline points="16 3 21 3 21 8"></polyline></svg>
                                          </button>
                                          <button onClick={() => setAnswers(prev => ({...prev, gender: 'female'}))} className={`p-4 rounded-xl border-2 font-bold transition-all flex items-center justify-center gap-3 ${answers.gender === 'female' ? `${t.borderAccent} ${t.bgAccent} text-white` : `border-transparent ${t.inputBg} ${t.textMuted}`}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="5"></circle><line x1="12" y1="15" x2="12" y2="22"></line><line x1="9" y1="19" x2="15" y2="19"></line></svg>
                                          </button>
                                      </div>
                                  </div>
                                  <div className="mt-4">
                                      <label className={`text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block`}>Tanggal Lahir</label>
                                      <input 
                                          type="date" 
                                          max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split('T')[0]}
                                          value={answers.dob} 
                                          onChange={(e) => setAnswers(prev => ({...prev, dob: e.target.value}))} 
                                          style={{ colorScheme: isDark ? 'dark' : 'light' }}
                                          className={`w-full p-4 rounded-xl border-2 font-bold ${answers.dob ? (isValidAge(answers.dob) ? t.borderAccent : 'border-rose-500 text-rose-500') : 'border-transparent'} ${t.inputBg} ${answers.dob && !isValidAge(answers.dob) ? '' : t.textMain} outline-none transition-all`}
                                      />
                                      {answers.dob && !isValidAge(answers.dob) ? (
                                          <p className={`text-[11px] mt-2 text-center font-bold text-rose-500 animate-in fade-in slide-in-from-top-1`}>Usia kamu harus di atas 13 tahun untuk menggunakan LOMEAL.</p>
                                      ) : (
                                          <p className={`text-[11px] mt-2 text-center font-bold ${t.textMuted}`}>Minimal usia 13 tahun.</p>
                                      )}
                                  </div>
                                </div>
                            )}

                            {s.key === 'biometrics' && (
                                <div className="flex flex-col pb-2 space-y-2 w-full max-w-md mx-auto">
                                  <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
                                      <div>
                                          <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Tinggi (cm)</label>
                                          <div className="flex justify-center w-full">
                                              <ScrollPicker 
                                                  value={answers.height} 
                                                  onChange={(val) => setAnswers(prev => ({...prev, height: val}))} 
                                                  min={100} max={250} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
                                              />
                                          </div>
                                      </div>
                                      <div className="w-full">
                                          <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Berat (kg)</label>
                                          <div className="flex justify-center w-full">
                                              <ScrollPicker 
                                                  value={answers.weight} 
                                                  onChange={(val) => setAnswers(prev => ({...prev, weight: val}))} 
                                                  min={30} max={200} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
                                              />
                                          </div>
                                      </div>
                                      <div className="w-full">
                                          <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Target (kg)</label>
                                          <div className="flex justify-center w-full">
                                              <ScrollPicker 
                                                  value={answers.targetWeight} 
                                                  onChange={(val) => setAnswers(prev => ({...prev, targetWeight: val}))} 
                                                  min={30} max={200} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
                                              />
                                          </div>
                                      </div>
                                  </div>
                                  
                                  {/* Smart BMI Display */}
                                  {(() => {
                                      const hMeter = answers.height / 100;
                                      const currentBmi = hMeter > 0 ? (answers.weight / (hMeter * hMeter)).toFixed(1) : 0;
                                      const targetBmi = hMeter > 0 ? (answers.targetWeight / (hMeter * hMeter)).toFixed(1) : 0;
                                      
                                      const diffKg = answers.targetWeight - answers.weight;
                                      const absDiff = Math.abs(diffKg).toFixed(1);
                                      const weeks = Math.round(Math.abs(diffKg) / 0.5);
                                      let timeString = weeks < 4 ? `${weeks} minggu` : `${Math.round(weeks/4)} bulan`;
                                      
                                      let insightText = '';
                                      if (diffKg < -0.5) insightText = `Turun ${absDiff} kg dlm ~${timeString}`;
                                      else if (diffKg > 0.5) insightText = `Naik ${absDiff} kg dlm ~${timeString}`;
                                      else insightText = 'Mempertahankan berat';

                                      return (
                                          <div className={`mt-4 p-3 rounded-2xl ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} border flex justify-between items-center text-sm`}>
                                              <div className="flex flex-col">
                                                <span className={`text-[10px] ${!isDark ? 'text-black/60' : 'text-slate-400'}`}>BMI Kamu</span>
                                                <span className={`font-bold ${!isDark ? 'text-black' : t.textMain}`}>{currentBmi}</span>
                                              </div>
                                              <div className="flex flex-col items-center px-2">
                                                <span className={`font-bold ${t.textAccent} text-[11px] bg-black/5 dark:bg-white/10 px-2 py-1 rounded-full whitespace-nowrap`}>{insightText}</span>
                                              </div>
                                              <div className="flex flex-col text-right">
                                                <span className={`text-[10px] ${!isDark ? 'text-black/60' : 'text-slate-400'}`}>Target BMI</span>
                                                <span className={`font-bold ${!isDark ? 'text-black' : t.textMain}`}>{targetBmi}</span>
                                              </div>
                                          </div>
                                      );
                                  })()}
                                </div>
                            )}

                            {s.key === 'activityLevel' && (
                                <div className="w-full flex flex-col gap-3">
                                    {[
                                      { id: 'sedentary', label: 'Sangat Jarang Bergerak', desc: 'Pekerja kantoran, rebahan, banyak duduk.' },
                                      { id: 'light', label: 'Jarang Bergerak', desc: 'Kasir, guru, banyak jalan/berdiri ringan.' },
                                      { id: 'moderate', label: 'Cukup Aktif', desc: 'Sering angkat barang, kurir, olahraga ringan.' },
                                      { id: 'active', label: 'Sangat Aktif', desc: 'Pekerja lapangan fisik, kuli bangunan, atlet.' }
                                    ].map((opt) => (
                                        <OptionCard key={opt.id} selected={answers.activityLevel === opt.id} onClick={() => { setAnswers(prev => ({ ...prev, activityLevel: opt.id })); handleNext(); }}>
                                            <div>
                                                <p className="body-md font-bold">{opt.label}</p>
                                                <p className={`caption mt-0.5 ${answers.activityLevel === opt.id ? 'text-white/80' : t.textMuted}`}>{opt.desc}</p>
                                            </div>
                                        </OptionCard>
                                    ))}
                                </div>
                            )}

                            {s.key === 'medical' && (
                                <div className="w-full flex flex-col gap-4">
                                    <p className={`caption font-medium ${t.textMuted}`}>Pilih jika ada penyakit (opsional):</p>
                                    <div className="flex flex-wrap gap-2">
                                        {MEDICAL_CONDITIONS.map(cond => {
                                            const isSelected = answers.medicalHistory.includes(cond);
                                            return (
                                                <button key={cond}
                                                    onClick={() => toggleMedical(cond)}
                                                    className={`px-3 py-1.5 rounded-full border text-sm transition-all ${isSelected ? `${t.bgAccent} ${t.borderAccent} text-white` : `${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} ${t.textMuted}`}`}>
                                                    {cond}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2">
                                        <p className={`caption font-medium mb-1 ${t.textMuted}`}>Alergi Makanan (opsional)</p>
                                        <input type="text" placeholder="Misal: Kacang, udang..." value={answers.allergies}
                                            onChange={e => setAnswers(prev => ({ ...prev, allergies: e.target.value }))}
                                            className={`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm`} />
                                    </div>
                                </div>
                            )}

                            {s.key === 'diet' && (
                                <div className="w-full flex flex-col gap-3">
                                    {/* Render grid row by row so we can insert protein input right after Hi Protein row */}
                                    {Array.from({ length: Math.ceil(DIET_PROFILES.length / 2) }, (_, rowIdx) => {
                                        const row = DIET_PROFILES.slice(rowIdx * 2, rowIdx * 2 + 2);
                                        const rowHasHiProtein = row.some(dp => dp.id === 'muscle_gain');
                                        return (
                                            <React.Fragment key={rowIdx}>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {row.map(dp => (
                                                        <button key={dp.id} onClick={() => setAnswers(prev => ({ ...prev, dietProfile: dp.id }))}
                                                            className={`p-3 rounded-2xl border-2 text-left transition-all ${answers.dietProfile === dp.id ? `${t.borderAccent} ${t.bgAccentSoft} scale-[1.02]` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`}`}>
                                                            <span className="text-2xl">{dp.emoji}</span>
                                                            <p className={`caption font-bold mt-1 ${t.textMain}`}>{dp.label}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                                {/* Protein SwipeInput appears RIGHT after Hi Protein row */}
                                                {rowHasHiProtein && answers.dietProfile === 'muscle_gain' && (
                                                    <div className={`animate-in fade-in slide-in-from-top-2 duration-300 border-t ${isDark ? 'border-white/10' : 'border-black/10'} pt-3`}>
                                                        <p className={`text-xs font-bold ${t.textMuted} mb-2`}>Target Protein (g/kg BB)</p>
                                                        <div className="relative">
                                                            <SwipeInput
                                                                value={answers.customProteinPerKg === '' ? 2.0 : Number(answers.customProteinPerKg)}
                                                                onChange={v => setAnswers(prev => ({ ...prev, customProteinPerKg: v === '' ? '' : Number(v) }))}
                                                                min={1.0} max={3.0} step={0.1}
                                                                className={`w-full ${t.inputBg} ${t.textMain} p-3 rounded-xl outline-none font-black text-lg pr-16`}
                                                            />
                                                            <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold ${t.textMuted}`}>g/kg</span>
                                                        </div>
                                                        <p className={`text-[11px] ${t.textMuted} mt-1.5`}>
                                                            Normalnya: <span className={t.textMain}>1.6 – 2.2 g/kg</span> untuk hipertrofi otot.
                                                        </p>
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}

                            {s.key === 'pace' && (() => {
                                const diffKg = answers.targetWeight - answers.weight;
                                // Smart filter: show only relevant goals based on target weight
                                const smartGoals = DIET_GOALS.filter(g => {
                                    if (diffKg < -1) return g.id !== 'bulk'; // Losing weight → no bulk
                                    if (diffKg > 1) return g.id !== 'cutting'; // Gaining weight → no cutting
                                    return true; // Maintenance zone → show all
                                });
                                return (
                                    <div className="w-full flex flex-col gap-3">
                                        {smartGoals.map((g) => (
                                            <OptionCard key={g.id} selected={answers.dietGoal === g.id} onClick={() => setAnswers(prev => ({ ...prev, dietGoal: g.id, customDeltaKcal: '' }))}>
                                                <div>
                                                    <p className="body-md font-bold">{g.emoji} {g.label}</p>
                                                    <p className={`caption mt-0.5 ${answers.dietGoal === g.id ? 'text-white/80' : t.textMuted}`}>{g.desc}</p>
                                                </div>
                                            </OptionCard>
                                        ))}
                                        {/* Custom kcal delta */}
                                        {answers.dietGoal && answers.dietGoal !== 'maintenance' && (
                                            <div className={`mt-1 p-3 rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} animate-in fade-in slide-in-from-top-2 duration-300`}>
                                                <p className={`text-xs font-bold ${t.textMain} mb-2`}>⚡ Custom Delta Kalori (opsional)</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold ${t.textMuted} shrink-0`}>{answers.dietGoal === 'cutting' ? '-' : '+'}</span>
                                                    <input
                                                        type="number"
                                                        placeholder="misal: 500"
                                                        value={answers.customDeltaKcal}
                                                        onChange={e => setAnswers(prev => ({ ...prev, customDeltaKcal: e.target.value }))}
                                                        className={`flex-1 px-3 py-2 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm font-bold`}
                                                    />
                                                    <span className={`text-sm font-bold ${t.textMuted} shrink-0`}>kkal/hari</span>
                                                </div>
                                                <p className={`text-[10px] ${t.textMuted} mt-1`}>Kosongkan untuk pakai preset (±10-22%)</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {s.key === 'kulkas' && (() => {
                                const searchResults = answers.kulkasSearch?.trim()
                                    ? (searchFoods?.(answers.kulkasSearch) || []).slice(0, 8)
                                    : [];
                                return (
                                    <div className="w-full flex flex-col gap-3">
                                        {/* Sync button */}
                                        <button
                                            onClick={() => {
                                                setAnswers(prev => ({ ...prev, kulkas: ['ayam', 'telur', 'bayam', 'beras', 'brokoli'] }));
                                            }}
                                            className={`w-full p-3 rounded-2xl border-2 flex items-center gap-3 transition-all active:scale-95 ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/10 bg-black/5 hover:bg-black/10'}`}
                                        >
                                            <Refrigerator size={20} className={t.textAccent} />
                                            <div className="text-left">
                                                <p className={`text-sm font-black ${t.textMain}`}>Sinkron dari Kulkasku</p>
                                                <p className={`text-[10px] ${t.textMuted}`}>Tarik daftar bahan dari aplikasi Kulkasku</p>
                                            </div>
                                        </button>
                                        {/* Search input */}
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Cari bahan makanan..."
                                                value={answers.kulkasSearch || ''}
                                                onChange={e => setAnswers(prev => ({ ...prev, kulkasSearch: e.target.value }))}
                                                className={`w-full px-4 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm pr-10`}
                                            />
                                        </div>
                                        {/* Search results */}
                                        {searchResults.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {searchResults.map(f => {
                                                    const isSelected = answers.kulkas.includes(f.id);
                                                    return (
                                                        <button key={f.id}
                                                            onClick={() => setAnswers(prev => {
                                                                const arr = prev.kulkas;
                                                                if (arr.includes(f.id)) return { ...prev, kulkas: arr.filter(x => x !== f.id) };
                                                                return { ...prev, kulkas: [...arr, f.id] };
                                                            })}
                                                            className={`px-3 py-1.5 rounded-full border text-sm transition-all ${isSelected ? `${t.bgAccent} ${t.borderAccent} text-white` : `${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} ${t.textMuted}`}`}
                                                        >
                                                            {f.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* Selected items */}
                                        {answers.kulkas.length > 0 && (
                                            <div>
                                                <p className={`text-[10px] font-bold ${t.textMuted} mb-2`}>Bahan dipilih ({answers.kulkas.length}):</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {answers.kulkas.map(id => {
                                                        const item = KULKAS_ITEMS.find(k => k.id === id);
                                                        const label = item?.label || id;
                                                        return (
                                                            <button key={id}
                                                                onClick={() => setAnswers(prev => ({ ...prev, kulkas: prev.kulkas.filter(x => x !== id) }))}
                                                                className={`px-3 py-1.5 rounded-full border text-sm ${t.bgAccent} ${t.borderAccent} text-white flex items-center gap-1`}
                                                            >
                                                                {item?.icon && <span>{item.icon}</span>} {label} <X size={10} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

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
