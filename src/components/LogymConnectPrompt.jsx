// src/components/LogymConnectPrompt.jsx — form "Hubungkan ke Logym" (Google popup
// ATAU email/password) dipakai bersama di 3 tempat: gate sesudah login (App.jsx),
// step onboarding (OnboardingFlow.jsx), dan ProfilePage.jsx.
// PENTING: ini bukan cuma buat user yang SUDAH punya akun Logym — Google popup
// otomatis BIKIN identitas baru kalau belum ada (perilaku standar Firebase Auth),
// jadi user yang datang dari Lomeal duluan (belum pernah pakai Logym sama sekali)
// tetap bisa akses Social Hub. Jalur email/password punya toggle Masuk/Daftar
// buat kasus yang sama tanpa akun Google.
import React, { useState } from 'react';
import { Link2 } from 'lucide-react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { authLogym, googleProviderLogym } from '../firebaseLogym';

const LogymConnectPrompt = ({ t, onConnected }) => {
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const connectGoogle = async () => {
    setConnecting(true); setConnectErr('');
    try {
      const result = await signInWithPopup(authLogym, googleProviderLogym);
      onConnected?.(result.user);
    } catch (e) { setConnectErr(e.message); }
    setConnecting(false);
  };

  const connectEmail = async () => {
    if (!email || !password) return;
    setConnecting(true); setConnectErr('');
    try {
      const result = emailMode === 'signup'
        ? await createUserWithEmailAndPassword(authLogym, email, password)
        : await signInWithEmailAndPassword(authLogym, email, password);
      onConnected?.(result.user);
    } catch (e) {
      setConnectErr(emailMode === 'signup'
        ? (e.code === 'auth/email-already-in-use' ? 'Email ini sudah terdaftar — coba tab "Masuk".' : e.message)
        : 'Email/password salah atau belum terdaftar — coba tab "Buat Baru".');
    }
    setConnecting(false);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={connectGoogle}
        disabled={connecting}
        className={`w-full py-3 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-sm ${t.border} ${t.bgCard} ${t.textMain} disabled:opacity-50`}
      >
        <Link2 size={16} /> Hubungkan dengan Google
      </button>
      <p className={`text-[10px] text-center -mt-1.5 ${t.textMuted}`}>Belum pernah pakai Logym? Gapapa, ini otomatis buatkan identitasmu.</p>
      {!showEmailForm ? (
        <button onClick={() => setShowEmailForm(true)} className={`text-xs font-bold ${t.textAccent}`}>
          atau pakai Email/Password
        </button>
      ) : (
        <div className="space-y-2">
          <div className={`flex rounded-xl p-1 ${t.bgSunken}`}>
            {[['login', 'Masuk'], ['signup', 'Buat Baru']].map(([id, label]) => (
              <button key={id} onClick={() => setEmailMode(id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${emailMode === id ? `${t.bgAccent} text-white` : t.textMuted}`}>
                {label}
              </button>
            ))}
          </div>
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} text-sm outline-none`}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-xl border ${t.border} ${t.inputBg} ${t.textMain} text-sm outline-none`}
          />
          <button
            onClick={connectEmail}
            disabled={connecting || !email || !password}
            className={`w-full py-2.5 rounded-xl ${t.bgAccent} font-bold text-sm disabled:opacity-40`}
          >
            {emailMode === 'signup' ? 'Buat & Sambungkan' : 'Sambungkan'}
          </button>
        </div>
      )}
      {connectErr && <p className="text-xs text-rose-500">{connectErr}</p>}
    </div>
  );
};

export default LogymConnectPrompt;
