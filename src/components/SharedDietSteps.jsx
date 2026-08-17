import React, { useState, useEffect } from 'react';
import { Target, Activity, Clock, Gauge, Ruler, Heart, User, Refrigerator, Sparkles, X, ShieldCheck, Link2 } from 'lucide-react';
import { searchFoods } from '../data/foodDatabase';
import { DIET_PROFILES, DIET_GOALS, PACES } from '../data/nutrition';
import { MEDICAL_CONDITIONS } from '../data/medicalConditions';
import ScrollPicker from './ScrollPicker';
import SwipeInput from './SwipeInput';
import OptionCard from './OptionCard';
import LegalModal from './LegalModal';
import { hcCheckStatus } from '../utils/healthConnect';
import { computeAge } from '../data/constants';

// Removed static KULKAS_ITEMS as we will rely on Domus sync and searchFoods.

// Naikkan tanggal ini SETIAP teks consent di bawah direvisi — user yang sudah setuju
// versi lama akan diminta menyetujui ulang, dan itu memang yang seharusnya terjadi
// secara hukum. Tinggal di sini (bukan di OnboardingFlow) karena teks yang diatur
// versinya ada di file ini, dan dua pemakainya sama-sama perlu membacanya.
export const CONSENT_VERSION = '2026-08-03';

// Sudah pernah setuju versi yang berlaku sekarang? Kalau ya, langkah persetujuan
// dilewati — itu urusan sekali di awal, bukan sesuatu yang muncul lagi tiap kali user
// membuka kuesioner ulang dari tab Program.
export const hasValidConsent = (profile) => profile?.consents?.version === CONSENT_VERSION;

// PENTING: step di sini key-nya 'dietGoal' (bukan 'pace') — sebelumnya key-nya salah
// ketik 'pace' padahal isinya milih DIET_GOALS (cutting/maintenance/bulk), sementara
// canProceed() di OnboardingFlow/DietQuestionnaireModal ngecek field `answers.dietPace`
// yang TIDAK PERNAH ke-set UI manapun — tombol Lanjut ilang permanen, onboarding macet
// total buat user baru. Step 'pace' yang ASLI (Santai/Normal/Agresif, PACES di
// data/nutrition.js) juga sempat hilang total dari alur pas onboarding+kuesioner
// digabung — calcTargets tetap butuh field itu buat paceFactor, jadi ditambah lagi di
// sini sebagai step terpisah dari dietGoal.
export const getSharedDietSteps = (t) => [
  { title: "Persetujuan Pengguna", key: 'consent', icon: <ShieldCheck className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Koneksi Aplikasi", key: 'connect', icon: <Link2 className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Identitas Diri", key: 'identity', icon: <User className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Data Fisik", key: 'biometrics', icon: <Ruler className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Tingkat Aktivitas Harian", key: 'activityLevel', icon: <Activity className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Riwayat Medis & Alergi", key: 'medical', icon: <Heart className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Target Diet Medis", key: 'diet', icon: <Target className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Fase Diet", key: 'dietGoal', icon: <Clock className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Kecepatan & Komitmen", key: 'pace', icon: <Gauge className={`${t.textAccent} mb-4`} size={40} /> },
  { title: "Bahan Makanan (opsional)", key: 'kulkas', icon: <Refrigerator className={`${t.textAccent} mb-4`} size={40} /> }
];

export const isValidAge = (dob) => {
  if (!dob) return false;
  // Cuma ngecek batas bawah dulu (computeAge > 9) — tanpa batas atas. Input date-nya cuma
  // punya `max` (blokir tanggal masa depan), gak ada `min`, dan ketikan tahun yang kepotong
  // di tengah jalan (glitch umum <input type="date"> — onChange nembak per keystroke) bisa
  // ninggalin dob absurd (misal tahun "0002") yang tetap lolos ">9 tahun". Umur ribuan tahun
  // itu bikin calcBMR (-5*age) jeblok ke minus jauh, TDEE ikut minus gila, dan kalori target
  // di dashboard jadi ngaco total (badge Bulking +13rb kkal, dsb).
  const age = computeAge(dob);
  return age !== null && age > 9 && age < 120;
};

export const SharedDietStepRenderer = ({
  stepKey,
  answers,
  setAnswers,
  t,
  isDark,
  handleNext,
  onSyncDomus,
  onHealthConnect,
  onAppleHealth,
  fromLogym,
}) => {
  // Dipanggil TANPA SYARAT (bukan di dalam if (stepKey === 'consent')) — hook gak boleh
  // bersyarat. Aman dipanggil buat semua step (cuma dipakai kalau stepKey === 'consent'),
  // tapi dulu dipanggil di dalam blok if — kebetulan gak crash karena tiap instance
  // SharedDietStepRenderer punya stepKey TETAP seumur hidupnya (satu per step di carousel),
  // jadi urutan hook per instance tetap konsisten. Tetap dipindah ke sini biar gak
  // melanggar Rules of Hooks yang dicek statis oleh eslint-plugin-react-hooks.
  const [showLegalModal, setShowLegalModal] = useState(null);

  // Sama alasannya kayak showLegalModal di atas: dipanggil tanpa syarat biar gak
  // melanggar Rules of Hooks, walau cuma dipakai kalau stepKey === 'kulkas'.
  // null = belum dicek ke Domus, [] = sudah dicek tapi kosong (belum ada akun/isi Domus).
  const [domusItems, setDomusItems] = useState(null);
  useEffect(() => {
    if (stepKey !== 'kulkas' || !onSyncDomus) return;
    let cancelled = false;
    onSyncDomus().then((items) => { if (!cancelled) setDomusItems(items || []); });
    return () => { cancelled = true; };
    // Sengaja cuma sekali per mount (stepKey tetap seumur hidup instance ini, lihat
    // komentar showLegalModal) — onSyncDomus dari parent bikin fungsi baru tiap render,
    // kalau dimasukkan ke deps bakal fetch ulang ke Firestore tiap kali parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stepKey === 'consent') {
    const consents = answers.consents || { tos: false, data: false, ai: false, research: false };
    const setConsents = (newConsents) => setAnswers(prev => ({ ...prev, consents: typeof newConsents === 'function' ? newConsents(prev.consents || { tos: false, data: false, ai: false, research: false }) : newConsents }));

    return (
      <div className="flex-1 flex flex-col justify-between overflow-y-auto hide-scrollbar">
        <div className="flex flex-col gap-4">
          <p className={`caption font-medium ${t.textMuted}`}>Baca dan centang 3 poin wajib di bawah untuk melanjutkan.</p>
          <label className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${consents.tos ? `border-[var(--color-accent)] ${t.bgAccentSoft}` : (isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5')}`}>
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--color-accent)] shrink-0" checked={consents.tos} onChange={(e) => setConsents({ ...consents, tos: e.target.checked })} />
            <div className="flex-1">
              <p className={`text-sm font-bold leading-tight mb-1 ${t.textMain}`}>Medical & Allergy Disclaimer</p>
              <p className={`text-xs leading-relaxed ${t.textMuted}`}>Lomeal adalah alat pencatat nutrisi mandiri, BUKAN alat diagnosis, rujukan, atau pengganti nasihat medis klinis. Estimasi kandungan makanan bisa meleset — saya membebaskan pengembang dari tuntutan hukum terkait komplikasi metabolik, reaksi alergi, maupun kontaminasi bahan makanan. <a href="#" onClick={(e) => { e.preventDefault(); setShowLegalModal('tos'); }} className="text-[var(--color-accent)] underline">Baca S&K lengkap</a></p>
            </div>
          </label>
          <label className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${consents.data ? `border-[var(--color-accent)] ${t.bgAccentSoft}` : (isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5')}`}>
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--color-accent)] shrink-0" checked={consents.data} onChange={(e) => setConsents({ ...consents, data: e.target.checked })} />
            <div className="flex-1">
              <p className={`text-sm font-bold leading-tight mb-1 ${t.textMain}`}>Privasi Data Sensitif</p>
              <p className={`text-xs leading-relaxed ${t.textMuted}`}>Data biometrik & log makanan saya tersimpan aman di server (dilindungi standar enkripsi Google Cloud saat tersimpan), digunakan hanya untuk fungsi aplikasi ini, dan tidak dibagikan ke pihak ketiga untuk kepentingan komersial. <a href="#" onClick={(e) => { e.preventDefault(); setShowLegalModal('privacy'); }} className="text-[var(--color-accent)] underline">Baca Kebijakan Privasi</a></p>
            </div>
          </label>
          <label className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${consents.ai ? `border-[var(--color-accent)] ${t.bgAccentSoft}` : (isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5')}`}>
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--color-accent)] shrink-0" checked={consents.ai} onChange={(e) => setConsents({ ...consents, ai: e.target.checked })} />
            <div className="flex-1">
              <p className={`text-sm font-bold leading-tight mb-1 ${t.textMain}`}>Persetujuan Fitur Lomy (Cloud)</p>
              <p className={`text-xs leading-relaxed ${t.textMuted}`}>Saya setuju foto & teks makanan yang saya kirim ke fitur pembuatan resep/scan otomatis diproses lewat layanan Lomy cloud (Google Gemini). Saya tidak akan memasukkan data identitas spesifik di luar profil.</p>
            </div>
          </label>

          <div className={`border-t pt-4 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
            <label className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${consents.research ? `border-[var(--color-accent)] ${t.bgAccentSoft}` : (isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5')}`}>
              <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--color-accent)] shrink-0" checked={!!consents.research} onChange={(e) => setConsents({ ...consents, research: e.target.checked })} />
              <div className="flex-1">
                <p className={`text-sm font-bold leading-tight mb-1 ${t.textMain} flex items-center gap-2 flex-wrap`}>
                  Riset Anonim
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? 'bg-white/10' : 'bg-black/10'} ${t.textMuted}`}>Opsional</span>
                </p>
                <p className={`text-xs leading-relaxed ${t.textMuted}`}>Data saya yang SUDAH DIANONIMKAN (tanpa nama, tanpa identitas) boleh dipakai pengembang untuk riset internal demi meningkatkan kualitas aplikasi.</p>
              </div>
            </label>
          </div>
        </div>
        <LegalModal type={showLegalModal} onClose={() => setShowLegalModal(null)} t={t} isDark={isDark} />
      </div>
    );
  }

  if (stepKey === 'connect') {
    const [hcConnected, setHcConnected] = useState(false);
    useEffect(() => {
      hcCheckStatus().then(res => {
        if (res?.readAuthorized?.length || res?.writeAuthorized?.length) {
          setHcConnected(true);
        }
      });
    }, []);

    return (
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto hide-scrollbar pb-6">
        {fromLogym ? (
          <div className={`p-4 rounded-2xl border-2 ${t.borderAccent} ${t.bgAccentSoft} text-center`}>
            <div className="w-12 h-12 mx-auto mb-3 bg-black rounded-xl flex items-center justify-center shadow-lg">
              <img src="/logym-icon.webp" alt="Logym" className="w-8 h-8 object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <p className={`body-md font-bold ${t.textMain}`}>Data Profil Terhubung!</p>
            <p className={`caption font-medium mt-1 ${t.textMuted}`}>Semua data yang tersedia di ekosistem Hexa-Life sudah ditarik otomatis — cek di langkah berikutnya.</p>
          </div>
        ) : (
          <div className={`p-4 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5'} text-center`}>
            <div className="w-12 h-12 mx-auto mb-3 bg-black rounded-xl flex items-center justify-center shadow-lg">
              <img src="/logym-icon.webp" alt="Logym" className="w-8 h-8 object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <p className={`body-md font-bold ${t.textMain}`}>Belum punya Logym?</p>
            <p className={`caption mt-1 ${t.textMuted}`}>Logym adalah aplikasi tracker gym yang terhubung langsung dengan Lomeal. Install sekarang untuk mempermudah tracking fitness kamu!</p>
            <a href="https://logym.web.app" target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block px-4 py-2 rounded-xl text-sm font-bold bg-black text-white active:scale-95 transition-transform`}>Install Logym</a>
          </div>
        )}
        
        <div className="w-full h-px bg-black/5 my-1" />
        
        <p className={`caption font-bold text-center ${t.textMuted}`}>Atau hubungkan dengan sumber lain:</p>
        
        <div className="flex flex-col gap-2">
          <button onClick={hcConnected ? null : onHealthConnect} className={`flex items-center gap-3 p-4 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-white hover:bg-black/5'} transition-colors text-left ${hcConnected ? 'opacity-80' : 'active:scale-[0.98]'}`}>
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-black/5 shadow-sm">
              <img src="/health-connect.webp" alt="Health Connect" className="w-6 h-6 object-contain" />
            </div>
            <div className="flex-1">
              <p className={`body-md font-bold ${t.textMain}`}>Health Connect</p>
              <p className={`caption ${t.textMuted}`}>Android (Google Fit, Samsung Health)</p>
            </div>
            {hcConnected && <span className={`text-xs font-bold px-2 py-1 rounded-md ${t.bgAccentSoft} ${t.textAccent}`}>Terhubung</span>}
          </button>
          
          <button onClick={onAppleHealth} className={`flex items-center gap-3 p-4 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/5 bg-white hover:bg-black/5'} transition-colors text-left active:scale-[0.98]`}>
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-black/5 shadow-sm">
              <img src="/apple-health.webp" alt="Apple Health" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <p className={`body-md font-bold ${t.textMain}`}>Apple Health</p>
              <p className={`caption ${t.textMuted}`}>iOS (iPhone, Apple Watch)</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  const toggleMedical = (cond) => {
    setAnswers(prev => {
      const arr = prev.medicalHistory || [];
      if (arr.includes(cond)) return { ...prev, medicalHistory: arr.filter(c => c !== cond) };
      return { ...prev, medicalHistory: [...arr, cond] };
    });
  };

  if (stepKey === 'identity') {
    return (
      <div className="flex flex-col pb-2 space-y-4 w-full">
        <div>
          <label className={`text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block`}>Nama Panggilan</label>
          <input 
            type="text" 
            placeholder="Siapa namamu?"
            value={answers.name || ''} 
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
          {/* Syarat umur ditaruh SEBARIS dengan labelnya. Sebelumnya menggantung di bawah
              input, dan di layar HP baris itu jatuh persis di balik indikator langkah —
              jadi tidak pernah terbaca justru saat user mengisi tanggalnya. */}
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <label className={`text-sm font-bold ${!isDark ? 'text-black' : t.textMain}`}>Tanggal Lahir</label>
            <span className={`caption font-medium shrink-0 ${t.textMuted}`}>min. 13 tahun</span>
          </div>
          <input 
            type="date"
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split('T')[0]}
            min={new Date(new Date().setFullYear(new Date().getFullYear() - 120)).toISOString().split('T')[0]}
            value={answers.dob || ''}
            onChange={(e) => setAnswers(prev => ({...prev, dob: e.target.value}))} 
            style={{ colorScheme: isDark ? 'dark' : 'light' }}
            className={`w-full p-4 rounded-xl border-2 font-bold ${answers.dob ? (isValidAge(answers.dob) ? t.borderAccent : 'border-rose-500 text-rose-500') : 'border-transparent'} ${t.inputBg} ${answers.dob && !isValidAge(answers.dob) ? '' : t.textMain} outline-none transition-all`}
          />
          {answers.dob && !isValidAge(answers.dob) && (
            <p className="caption mt-2 text-center text-rose-500 animate-in fade-in slide-in-from-top-1">Usia kamu harus di atas 13 tahun untuk menggunakan LOMEAL.</p>
          )}
        </div>
      </div>
    );
  }

  if (stepKey === 'biometrics') {
    return (
      <div className="flex flex-col pb-2 space-y-2 w-full max-w-md mx-auto">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
          <div>
            <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Tinggi (cm)</label>
            <div className="flex justify-center w-full">
              <ScrollPicker 
                value={answers.height || 165} 
                onChange={(val) => setAnswers(prev => ({...prev, height: val}))} 
                min={100} max={250} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
              />
            </div>
          </div>
          <div className="w-full">
            <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Berat (kg)</label>
            <div className="flex justify-center w-full">
              <ScrollPicker 
                value={answers.weight || 60} 
                onChange={(val) => setAnswers(prev => ({...prev, weight: val}))} 
                min={30} max={200} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
              />
            </div>
          </div>
          <div className="w-full">
            <label className={`text-xs sm:text-sm font-bold ${!isDark ? 'text-black' : t.textMain} mb-2 block text-center`}>Target (kg)</label>
            <div className="flex justify-center w-full">
              <ScrollPicker 
                value={answers.targetWeight || 55} 
                onChange={(val) => setAnswers(prev => ({...prev, targetWeight: val}))} 
                min={30} max={200} step={1} theme={isDark ? 'dark' : 'light'} width="w-full" height={200} t={t}
              />
            </div>
          </div>
        </div>
        
        {/* Smart BMI Display */}
        {(() => {
          const hMeter = (answers.height || 165) / 100;
          const currentBmi = hMeter > 0 ? ((answers.weight || 60) / (hMeter * hMeter)).toFixed(1) : 0;
          const targetBmi = hMeter > 0 ? ((answers.targetWeight || 55) / (hMeter * hMeter)).toFixed(1) : 0;
          
          const diffKg = (answers.targetWeight || 55) - (answers.weight || 60);
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
    );
  }

  if (stepKey === 'activityLevel') {
    return (
      <div className="w-full flex flex-col gap-3">
        {[
          { id: 'sedentary', label: 'Sangat Jarang', desc: 'Hampir tidak ada aktivitas fisik.' },
          { id: 'light', label: 'Jarang', desc: 'Aktivitas ringan 1-3 hari/minggu.' },
          { id: 'moderate', label: 'Sedang', desc: 'Aktivitas sedang 3-5 hari/minggu.' },
          { id: 'active', label: 'Sering', desc: 'Aktivitas berat 6-7 hari/minggu.' },
          { id: 'very_active', label: 'Sangat Sering', desc: 'Aktivitas/pekerjaan fisik sangat berat.' }
        ].map((opt) => (
          <OptionCard key={opt.id} t={t} isDark={isDark} selected={answers.activityLevel === opt.id} onClick={() => { setAnswers(prev => ({ ...prev, activityLevel: opt.id })); if(handleNext) handleNext(); }}>
            <div>
              <p className="body-md font-bold">{opt.label}</p>
              <p className={`caption mt-0.5 ${answers.activityLevel === opt.id ? 'text-white/80' : t.textMuted}`}>{opt.desc}</p>
            </div>
          </OptionCard>
        ))}
      </div>
    );
  }

  if (stepKey === 'medical') {
    return (
      <div className="w-full flex flex-col gap-4">
        <p className={`caption font-medium ${t.textMuted}`}>Pilih jika ada penyakit (opsional):</p>
        <div className="flex flex-wrap gap-2">
          {MEDICAL_CONDITIONS.map(cond => {
            const isSelected = (answers.medicalHistory || []).includes(cond);
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
          <input type="text" placeholder="Misal: Kacang, udang..." value={answers.allergies || ''}
            onChange={e => setAnswers(prev => ({ ...prev, allergies: e.target.value }))}
            className={`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm`} />
        </div>
      </div>
    );
  }

  if (stepKey === 'diet') {
    return (
      <div className="w-full flex flex-col gap-3">
        {Array.from({ length: Math.ceil(DIET_PROFILES.length / 2) }, (_, rowIdx) => {
          const row = DIET_PROFILES.slice(rowIdx * 2, rowIdx * 2 + 2);
          const rowHasHiProtein = row.some(dp => dp.id === 'muscle_gain');
          return (
            <React.Fragment key={rowIdx}>
              <div className="grid grid-cols-2 gap-3 p-2">
                {row.map(dp => (
                  <button key={dp.id} onClick={() => setAnswers(prev => ({ ...prev, dietProfile: dp.id }))}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${answers.dietProfile === dp.id ? `${t.borderAccent} ${t.bgAccentSoft} scale-[1.02]` : `${isDark ? 'border-transparent bg-white/5' : 'border-white/50 bg-white/60'}`}`}>
                    <span className="text-2xl">{dp.emoji}</span>
                    <p className={`caption font-bold mt-1 ${t.textMain}`}>{dp.label}</p>
                  </button>
                ))}
              </div>
              {rowHasHiProtein && answers.dietProfile === 'muscle_gain' && (
                <div className={`animate-in fade-in slide-in-from-top-2 duration-300 border-t ${isDark ? 'border-white/10' : 'border-black/10'} pt-3`}>
                  <p className={`text-xs font-bold ${t.textMuted} mb-2`}>Target Protein (g/kg BB)</p>
                  <div className="relative">
                    <SwipeInput
                      value={answers.customProteinPerKg === '' || answers.customProteinPerKg === undefined ? 2.0 : Number(answers.customProteinPerKg)}
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
    );
  }

  if (stepKey === 'dietGoal') {
    return (
      <div className="w-full flex flex-col gap-3">
        {DIET_GOALS.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <OptionCard t={t} isDark={isDark} selected={answers.dietGoal === g.id} onClick={() => setAnswers(prev => ({ ...prev, dietGoal: g.id, customDeltaKcal: '' }))}>
              <div>
                <p className="body-md font-bold">{g.emoji} {g.label}</p>
                <p className={`caption mt-0.5 ${answers.dietGoal === g.id ? 'text-white/80' : t.textMuted}`}>{g.desc}</p>
              </div>
            </OptionCard>

            {answers.dietGoal === g.id && g.id !== 'maintenance' && (
              <div className={`p-4 rounded-2xl border ${t.borderAccentSoft} ${t.bgAccentSoft} animate-in fade-in slide-in-from-top-2 duration-300`}>
                <p className={`text-sm font-bold ${t.textMain} mb-3`}>Custom Delta Kalori (opsional)</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="misal: 500"
                    value={answers.customDeltaKcal || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, customDeltaKcal: e.target.value }))}
                    className={`flex-1 px-4 py-3 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-base font-bold`}
                  />
                  <span className={`text-base font-bold ${t.textMuted} shrink-0`}>kkal/hari</span>
                </div>
                <p className={`text-xs ${t.textMuted} mt-2`}>Kosongkan untuk pakai preset (±10-22%)</p>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Kecepatan/intensitas penyesuaian kalori (Santai/Normal/Agresif) — dulu ilang total
  // pas onboarding & kuesioner digabung jadi satu alur; calcTargets tetap butuh field
  // `pace` ini buat paceFactor, jadi kalau gak ada UI yang nyetel, semua user diam-diam
  // kepatok ke default 'normal' selamanya tanpa bisa diubah.
  if (stepKey === 'pace') {
    return (
      <div className="w-full flex flex-col gap-2.5">
        {PACES.map((p) => (
          <OptionCard key={p.id} t={t} isDark={isDark} selected={answers.pace === p.id} onClick={() => setAnswers(prev => ({ ...prev, pace: p.id }))}>
            <div>
              <p className="body-md font-bold">{p.label}</p>
              <p className={`caption mt-0.5 ${answers.pace === p.id ? 'text-white/80' : t.textMuted}`}>{p.desc}</p>
            </div>
          </OptionCard>
        ))}
      </div>
    );
  }

  if (stepKey === 'kulkas') {

    const kulkasList = answers.kulkas || [];

    const toggleKulkas = (item) => setAnswers(prev => {
      const arr = prev.kulkas || [];
      if (arr.some(x => x.id === item.id)) return { ...prev, kulkas: arr.filter(x => x.id !== item.id) };
      return { ...prev, kulkas: [...arr, item] };
    });

    return (
      <div className="w-full flex flex-col gap-3">
        {/* Manual Input (persis kek pas ketik input bar) */}
        <div className="relative">
          <input
            type="text"
            placeholder="Ketik apa saja isi kulkasmu..."
            value={answers.kulkasSearch || ''}
            onChange={e => setAnswers(prev => ({ ...prev, kulkasSearch: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && answers.kulkasSearch?.trim()) {
                const text = answers.kulkasSearch.trim();
                setAnswers(prev => {
                  const arr = prev.kulkas || [];
                  if (arr.some(item => item.id === text)) return { ...prev, kulkasSearch: '' };
                  if (arr.length >= 10) return prev;
                  return { ...prev, kulkas: [...arr, { id: text, name: text }], kulkasSearch: '' };
                });
              }
            }}
            className={`w-full pl-4 pr-12 py-3 rounded-[1.25rem] border ${t.border} ${t.inputBg} ${t.textMain} outline-none text-sm font-medium`}
          />
          <button 
            disabled={!answers.kulkasSearch?.trim()}
            onClick={() => {
              if (answers.kulkasSearch?.trim()) {
                const text = answers.kulkasSearch.trim();
                setAnswers(prev => {
                  const arr = prev.kulkas || [];
                  if (arr.some(item => item.id === text)) return { ...prev, kulkasSearch: '' };
                  if (arr.length >= 10) return prev;
                  return { ...prev, kulkas: [...arr, { id: text, name: text }], kulkasSearch: '' };
                });
              }
            }}
            className={`absolute right-1.5 top-1.5 p-1.5 rounded-full ${answers.kulkasSearch?.trim() ? `${t.bgAccent} text-white shadow-md active:scale-95` : `bg-black/5 dark:bg-white/5 ${t.textMuted}`} transition-all`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
          <p className={`text-[10px] mt-1.5 px-1 font-bold ${t.textMuted}`}>Maksimal isi manual 10 bahan</p>
        </div>

        {/* Bahan dipilih */}
        {kulkasList.length > 0 && (
          <div className="mt-2">
            <p className={`text-[10px] font-bold ${t.textMuted} mb-2`}>Bahan dipilih ({kulkasList.length}):</p>
            <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto hide-scrollbar">
              {kulkasList.map((item, idx) => (
                <button key={`${item.id || item}-${idx}`}
                  onClick={() => setAnswers(prev => ({ ...prev, kulkas: prev.kulkas.filter((_, i) => i !== idx) }))}
                  className={`px-3 py-1.5 rounded-full border text-sm ${t.bgAccent} ${t.borderAccent} text-white flex items-center gap-1`}
                >
                  {typeof item === 'string' ? item : item.name} <X size={10} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Domus: kalau ada isinya langsung muncul buat dicentang, kalau kosong tawarin install */}
        {domusItems === null ? null : domusItems.length === 0 ? (
          <div className={`p-4 mt-2 rounded-2xl border ${isDark ? 'border-white/10 bg-white/5' : 'border-black/5 bg-black/5'} text-center`}>
            <Refrigerator size={28} className={`${t.textAccent} mx-auto mb-2`} />
            <p className={`body-md font-bold ${t.textMain}`}>Belum punya Domus?</p>
            <p className={`caption mt-1 ${t.textMuted}`}>Domus mencatat isi kulkas & bahan makananmu — kalau sudah dipakai, bahannya bakal langsung muncul di sini tiap kali isi kuesioner diet.</p>
            <a href="https://domus-id.web.app" target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block px-4 py-2 rounded-xl text-sm font-bold bg-black text-white active:scale-95 transition-transform`}>Install Domus</a>
          </div>
        ) : (
          <div className="mt-2">
            <p className={`text-[10px] font-bold ${t.textMuted} mb-2`}>Domus</p>
            <div className="flex flex-wrap gap-2">
              {domusItems.map(f => {
                const isSelected = kulkasList.some(item => item.id === f.id);
                return (
                  <button key={f.id}
                    onClick={() => toggleKulkas(f)}
                    className={`px-3 py-1.5 rounded-full border text-sm transition-all ${isSelected ? `${t.bgAccent} ${t.borderAccent} text-white` : `${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'} ${t.textMuted}`}`}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>
    );
  }

  return null;
};
