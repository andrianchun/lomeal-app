import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Lock, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { fetchLyfitProfile } from '../utils/lyfitSync';
import { computeAge } from '../data/constants';
import { DIET_PROFILES, PACES, calcTargets } from '../data/nutrition';
import ScrollPicker from '../components/ScrollPicker';
import LogymConnectPrompt from '../components/LogymConnectPrompt';

/**
 * ALUR ONBOARDING BERJENJANG — "Digital Anamnesis" (Fase 3 & 6 blueprint)
 * Bentuk carousel kartu bertumpuk di-port persis dari kuesioner Logym
 * (lyfit.app/src/modals/ProgramQuestionnaireModal.jsx): transform stack +
 * swipe gesture + tombol navigasi bulat mengambang.
 * Step "Sambungkan ke Logym" (opsional) menarik gender/dob/tinggi/berat
 * otomatis kalau user sudah punya akun Logym — lihat utils/lyfitSync.js.
 */
const STEPS = [
  { key: 'consent', title: 'Persetujuan Pengguna' },
  { key: 'connect', title: 'Sambungkan ke Logym?' },
  { key: 'identity', title: 'Identitas & Gender' },
  { key: 'physical', title: 'Data Fisik' },
  { key: 'diet', title: 'Target Diet Medis' },
  { key: 'pace', title: 'Komitmen Waktu' },
];

const OnboardingFlow = ({ t, theme, logymUser, onComplete }) => {
  const [step, setStep] = useState(0);
  const isDark = theme === 'dark';

  const [consents, setConsents] = useState({ medical: false, allergy: false, privacy: false });
  const [physical, setPhysical] = useState({ dob: '', height: 165, weight: 60, gender: 'male' });
  const [dietProfile, setDietProfile] = useState(null);
  const [pace, setPace] = useState('normal');
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
    if (step === 4) return !!dietProfile;
    if (step === 5) return true;
    return false;
  };

  const finish = () => {
    const age = computeAge(physical.dob);
    const profileForTargets = { ...physical, age, height: Number(physical.height), weight: Number(physical.weight), dietProfile, pace };
    const targets = calcTargets(profileForTargets);
    onComplete({
      onboardingCompleted: true,
      consents: { ...consents, agreedAt: new Date().toISOString() },
      physical: { dob: physical.dob, height: Number(physical.height), weight: Number(physical.weight), gender: physical.gender, fromLogym },
      dietProfile, pace, targets,
      createdAt: new Date().toISOString(),
    });
  };

  const handleNext = () => {
    if (step === STEPS.length - 1) finish();
    else setStep((s) => s + 1);
  };
  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  // --- Swipe ---
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const handleTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const handleTouchMove = (e) => { e.stopPropagation(); setTouchEnd(e.targetTouches[0].clientX); };
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance < -50 && step > 0) handleBack();
    else if (distance > 50 && step < STEPS.length && canProceed()) handleNext();
  };

  const Consent = ({ id, icon: Icon, title, body }) => (
    <button
      onClick={() => setConsents((c) => ({ ...c, [id]: !c[id] }))}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${consents[id] ? `${t.borderAccent} ${t.bgAccentSoft}` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 p-2 rounded-xl ${consents[id] ? t.bgAccent : t.bgSunken}`}>
          <Icon size={16} className={consents[id] ? 'text-white' : t.textMuted} />
        </span>
        <div className="flex-1">
          <p className={`body-md ${t.textMain}`}>{title}</p>
          <p className={`caption mt-1 font-medium leading-relaxed ${t.textMuted}`}>{body}</p>
        </div>
        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${consents[id] ? `${t.bgAccent} border-transparent` : t.border}`}>
          {consents[id] && <Check size={13} className="text-white" strokeWidth={3} />}
        </span>
      </div>
    </button>
  );

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

  const bmi = physical.height && physical.weight ? (Number(physical.weight) / ((Number(physical.height) / 100) ** 2)).toFixed(1) : null;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${t.bgApp}`}>
      <div className="flex justify-center items-center p-5 pb-2 shrink-0">
        <p className={`text-sm font-medium text-center max-w-[280px] ${t.textMain}`}>
          Halo! <span className="font-black">Lomeal</span> siap bantu kamu mencatat & mengendalikan pola makan sehat.
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

                {s.key === 'consent' && (
                  <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto hide-scrollbar">
                    <Consent id="medical" icon={ShieldAlert} title="Medical Disclaimer"
                      body="Lomeal adalah alat pencatat nutrisi mandiri, BUKAN alat diagnosis, rujukan, atau pengganti nasihat medis klinis." />
                    <Consent id="allergy" icon={ShieldCheck} title="Allergy Liability"
                      body="Estimasi kandungan makanan bisa meleset. Saya membebaskan pengembang dari tuntutan hukum terkait komplikasi metabolik, reaksi alergi, maupun kontaminasi bahan makanan." />
                    <Consent id="privacy" icon={Lock} title="Privasi Data Sensitif"
                      body="Data biometrik & log makanan saya dienkripsi dan disimpan untuk fungsi aplikasi ini saja, tanpa dibagikan ke pihak ketiga." />
                  </div>
                )}

                {s.key === 'connect' && (
                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto hide-scrollbar">
                    {logymUser || fromLogym ? (
                      <div className={`p-4 rounded-2xl border-2 ${t.borderAccent} ${t.bgAccentSoft} text-center`}>
                        <Sparkles size={22} className={`mx-auto mb-2 ${t.textAccent}`} />
                        <p className={`body-md ${t.textMain}`}>Tersambung ke Logym!</p>
                        <p className={`caption font-medium mt-1 ${t.textMuted}`}>Gender/DOB/tinggi/berat sudah ditarik otomatis — cek di langkah berikutnya.</p>
                      </div>
                    ) : (
                      <>
                        <p className={`caption font-medium ${t.textMuted}`}>Sudah punya akun Logym? Data fisikmu gak usah diisi ulang. Belum punya? Tetap bisa sambung sekarang buat langsung akses Social Hub nanti (identitas baru dibuatkan otomatis) — atau lewati dulu, isi manual di langkah berikutnya.</p>
                        <LogymConnectPrompt t={t} onConnected={(user) => applyLogymPrefill(user.uid)} />
                      </>
                    )}
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
                      <OptionCard key={p.id} selected={pace === p.id} onClick={() => setPace(p.id)}>
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
    </div>
  );
};

export default OnboardingFlow;
