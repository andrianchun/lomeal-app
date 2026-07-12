import React, { useState } from 'react';
import { Leaf, ShieldAlert, ShieldCheck, Lock, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { DIET_PROFILES, PACES, calcTargets } from '../data/nutrition';

/**
 * ALUR ONBOARDING BERJENJANG — "Digital Anamnesis" (Fase 3 & 6 blueprint)
 * Linear: Agreement 2 lapis → Kuesioner Klinis 3 tahap → selesai.
 * (Splash & SSO-skip ditangani App.jsx; komponen ini muncul hanya jika
 *  profil Lomeal belum onboardingCompleted.)
 * prefill = biometrik hasil tarikan Firebase Lyfit (bisa di-override user).
 */
const OnboardingFlow = ({ t, theme, prefill, onComplete }) => {
  const [step, setStep] = useState(0); // 0 agreement, 1 fisik, 2 profil diet, 3 pace
  const [consents, setConsents] = useState({ medical: false, allergy: false, privacy: false });
  const [physical, setPhysical] = useState({
    age: prefill?.age || '',
    height: prefill?.height || '',
    weight: prefill?.weight || '',
    gender: prefill?.gender || 'male',
  });
  const [dietProfile, setDietProfile] = useState(null);
  const [pace, setPace] = useState('normal');

  const allConsented = consents.medical && consents.allergy && consents.privacy;
  const physicalValid = Number(physical.age) > 9 && Number(physical.height) > 90 && Number(physical.weight) > 20;

  const finish = () => {
    const profile = {
      ...physical,
      age: Number(physical.age), height: Number(physical.height), weight: Number(physical.weight),
      dietProfile, pace,
    };
    const targets = calcTargets(profile);
    onComplete({
      onboardingCompleted: true,
      consents: { ...consents, agreedAt: new Date().toISOString() },
      physical: { age: profile.age, height: profile.height, weight: profile.weight, gender: profile.gender, fromLyfit: !!prefill?.weight },
      dietProfile, pace, targets,
      createdAt: new Date().toISOString(),
    });
  };

  const Consent = ({ id, icon: Icon, title, body }) => (
    <button
      onClick={() => setConsents(c => ({ ...c, [id]: !c[id] }))}
      className={`w-full text-left p-4 rounded-2xl border transition-all ${consents[id] ? `${t.borderAccent} ${t.bgAccentSoft}` : `${t.border} ${t.bgCard}`}`}
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

  const NumInput = ({ label, unit, value, onChange }) => (
    <div className={`p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
      <p className={`h3 ${t.textMuted}`}>{label}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <input
          type="number" inputMode="numeric" value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-transparent text-2xl font-black outline-none no-spinners ${t.textMain}`}
          placeholder="—"
        />
        <span className={`caption ${t.textMuted}`}>{unit}</span>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${t.bgApp} flex flex-col`}>
      <div className="flex-1 w-full max-w-md mx-auto px-5 pt-12 pb-8 flex flex-col">
        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-8">
          <span className={`w-9 h-9 rounded-xl ${t.bgAccent} flex items-center justify-center shadow-glow`}><Leaf size={18} /></span>
          <div className="flex gap-1.5 ml-auto">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? `w-6 ${t.bgAccent.split(' ')[0]} bg-green-500` : `w-3 ${t.bgSunken}`}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="anim-rise space-y-3 flex-1">
            <h1 className={`h1 ${t.textMain}`}>Persetujuan Pengguna</h1>
            <p className={`body-md font-medium ${t.textMuted} pb-2`}>Dua lapis perlindungan sebelum mulai — mohon baca & setujui semuanya.</p>
            <Consent id="medical" icon={ShieldAlert} title="Medical Disclaimer"
              body="Lomeal adalah alat pencatat nutrisi mandiri, BUKAN alat diagnosis, rujukan, atau pengganti nasihat medis klinis. Konsultasikan kondisi kesehatanmu ke tenaga medis profesional." />
            <Consent id="allergy" icon={ShieldCheck} title="Allergy Liability"
              body="Estimasi kandungan makanan bisa meleset. Saya membebaskan pengembang dari tuntutan hukum terkait komplikasi metabolik, reaksi alergi/syok anafilaktik, maupun kontaminasi bahan makanan." />
            <Consent id="privacy" icon={Lock} title="Privasi Data Sensitif"
              body="Data biometrik & log makanan saya dienkripsi dan disimpan untuk fungsi aplikasi ini saja, tanpa dibagikan ke pihak ketiga." />
          </div>
        )}

        {step === 1 && (
          <div className="anim-rise flex-1">
            <h1 className={`h1 ${t.textMain}`}>Fisik Dasar</h1>
            <p className={`body-md font-medium ${t.textMuted} mt-1 mb-4`}>
              {prefill?.weight ? '✨ Ditarik otomatis dari akun Lyfit-mu — silakan koreksi bila perlu.' : 'Dipakai menghitung target kalori & makro harianmu.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Usia" unit="th" value={physical.age} onChange={(v) => setPhysical(p => ({ ...p, age: v }))} />
              <NumInput label="Tinggi" unit="cm" value={physical.height} onChange={(v) => setPhysical(p => ({ ...p, height: v }))} />
              <NumInput label="Berat" unit="kg" value={physical.weight} onChange={(v) => setPhysical(p => ({ ...p, weight: v }))} />
              <div className={`p-3 rounded-2xl border ${t.border} ${t.bgCard}`}>
                <p className={`h3 ${t.textMuted}`}>Gender</p>
                <div className="flex gap-1.5 mt-2">
                  {[['male', 'Pria'], ['female', 'Wanita']].map(([id, label]) => (
                    <button key={id} onClick={() => setPhysical(p => ({ ...p, gender: id }))}
                      className={`flex-1 py-1.5 rounded-xl caption border transition-all ${physical.gender === id ? `${t.bgAccent} border-transparent text-white` : `${t.border} ${t.textMuted}`}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="anim-rise flex-1">
            <h1 className={`h1 ${t.textMain}`}>Target Diet Medis</h1>
            <p className={`body-md font-medium ${t.textMuted} mt-1 mb-4`}>Pilih satu profil — batas mikro klinis akan menyesuaikan.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {DIET_PROFILES.map(dp => (
                <button key={dp.id} onClick={() => setDietProfile(dp.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${dietProfile === dp.id ? `${t.borderAccent} ${t.bgAccentSoft} scale-[1.02]` : `${t.border} ${t.bgCard}`}`}>
                  <span className="text-2xl">{dp.emoji}</span>
                  <p className={`body-md mt-1.5 ${t.textMain}`}>{dp.label}</p>
                  <p className={`caption mt-0.5 font-medium ${t.textMuted}`}>{dp.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="anim-rise flex-1">
            <h1 className={`h1 ${t.textMain}`}>Komitmen Waktu</h1>
            <p className={`body-md font-medium ${t.textMuted} mt-1 mb-4`}>Seberapa cepat kamu ingin mencapai target?</p>
            <div className="space-y-2.5">
              {PACES.map(p => (
                <button key={p.id} onClick={() => setPace(p.id)}
                  className={`w-full p-4 rounded-2xl border text-left flex items-center gap-3 transition-all ${pace === p.id ? `${t.borderAccent} ${t.bgAccentSoft}` : `${t.border} ${t.bgCard}`}`}>
                  <span className={`w-3 h-3 rounded-full ${pace === p.id ? 'bg-green-500' : t.bgSunken}`} />
                  <div>
                    <p className={`body-lg ${t.textMain}`}>{p.label}</p>
                    <p className={`caption font-medium ${t.textMuted}`}>{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigasi bawah */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className={`px-4 py-3.5 rounded-2xl border ${t.border} ${t.btnBg} ${t.textMuted}`}>
              <ChevronLeft size={18} />
            </button>
          )}
          <button
            disabled={(step === 0 && !allConsented) || (step === 1 && !physicalValid) || (step === 2 && !dietProfile)}
            onClick={() => (step === 3 ? finish() : setStep(s => s + 1))}
            className={`flex-1 py-3.5 rounded-2xl body-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 ${t.bgAccent} shadow-glow`}
          >
            {step === 3 ? 'Mulai Lomeal' : 'Lanjut'} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
