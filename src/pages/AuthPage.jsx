import React, { useState, useEffect, useRef } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2, Leaf } from 'lucide-react';
import { playSoundEffect } from '../utils/audio';

// --- IMPORT MESIN FIREBASE & CAPACITOR NATIVE ---
import { auth, googleProvider } from '../firebase';
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signInWithCredential,
  GoogleAuthProvider
} from 'firebase/auth';
import { authLogym } from '../firebaseLogym';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';

const AuthPage = ({ t, theme, soundEnabled, onLogin }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(false);

  // --- DRAG STATE UNTUK BOTTOM SHEET ---
  const sheetRef = useRef(null);
  const headerRef = useRef(null);
  const dragStartRef = useRef({ y: 0, translate: 0, collapsedTranslate: 0 });
  const [dragY, setDragY] = useState(null); // null = tidak sedang di-drag
  const [peekPx, setPeekPx] = useState(260); // tinggi bagian "peek" (handle+judul+tombol), diukur otomatis

  useEffect(() => {
    if (headerRef.current) setPeekPx(headerRef.current.offsetHeight);
  }, []);

  const handleSheetPointerDown = (e) => {
    const H = sheetRef.current?.offsetHeight || 0;
    const collapsedTranslate = Math.max(0, H - peekPx);
    const startTranslate = isFormExpanded ? 0 : collapsedTranslate;
    dragStartRef.current = { y: e.clientY, translate: startTranslate, collapsedTranslate };
    setDragY(startTranslate);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSheetPointerMove = (e) => {
    if (dragY === null) return;
    const { y, translate, collapsedTranslate } = dragStartRef.current;
    const delta = e.clientY - y;
    setDragY(Math.min(collapsedTranslate, Math.max(0, translate + delta)));
  };

  const handleSheetPointerUp = () => {
    if (dragY === null) return;
    const { translate: startTranslate, collapsedTranslate } = dragStartRef.current;
    const moved = Math.abs(dragY - startTranslate);
    const nextExpanded = moved < 8 ? !isFormExpanded : dragY < collapsedTranslate / 2;
    setIsFormExpanded(nextExpanded);
    setDragY(null);
  };

  useEffect(() => {
    const bannedMsg = localStorage.getItem('lomeal_banned_msg');
    if (bannedMsg) {
      setErrorMsg(bannedMsg);
      localStorage.removeItem('lomeal_banned_msg');
    }
  }, []);

  // 1. FUNGSI LOGIN & REGISTER MANUAL
  const handleSubmit = async (e) => {
    e.preventDefault();
    playSoundEffect('click', soundEnabled);
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isLoginMode) {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        
        // --- BRIDGE SYNC: Silently login to Logym project ---
        try {
          await signInWithEmailAndPassword(authLogym, formData.email, formData.password);
        } catch (err) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            try { await createUserWithEmailAndPassword(authLogym, formData.email, formData.password); } catch(e) {}
          }
        }

        onLogin({ 
            uid: userCredential.user.uid, 
            email: userCredential.user.email, 
            name: userCredential.user.displayName || 'Sobat Lomeal',
            photoURL: userCredential.user.photoURL
        });
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        await updateProfile(userCredential.user, { displayName: formData.name });
        
        // --- BRIDGE SYNC: Silently register to Logym project ---
        try { await createUserWithEmailAndPassword(authLogym, formData.email, formData.password); } catch(e) {}

        onLogin({ 
            uid: userCredential.user.uid, 
            email: userCredential.user.email, 
            name: formData.name || 'Sobat Lomeal',
            photoURL: userCredential.user.photoURL
        });
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setErrorMsg('Email atau password salah.');
      } else if (error.code === 'auth/email-already-in-use') {
        setErrorMsg('Email sudah terdaftar. Silakan login.');
      } else if (error.code === 'auth/weak-password') {
        setErrorMsg('Password terlalu lemah (minimal 6 karakter).');
      } else {
        setErrorMsg('Terjadi kesalahan jaringan. Coba lagi.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 2. FUNGSI LOGIN GOOGLE (SUDAH MENDUKUNG DIALOG NATIVE HP)
  const handleGoogleLogin = async () => {
    playSoundEffect('click', soundEnabled);
    setErrorMsg('');
    setIsLoading(true);
    
    try {
      if (Capacitor.isNativePlatform()) {
        // JALUR APK ANDROID: Ini yang akan memicu pop-up daftar akun Google + foto profil asli bawaan HP
        const result = await FirebaseAuthentication.signInWithGoogle();
        const credential = GoogleAuthProvider.credential(result.credential.idToken);
        const userCredential = await signInWithCredential(auth, credential);

        // --- BRIDGE SYNC: Silently login to Logym project ---
        try { await signInWithCredential(authLogym, credential); } catch(e) {}

        onLogin({
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          name: userCredential.user.displayName || 'Sobat Lomeal',
          photoURL: userCredential.user.photoURL
        });
      } else {
        // JALUR WEB BROWSER
        const result = await signInWithPopup(auth, googleProvider);

        // --- BRIDGE SYNC: Silently login to Logym project ---
        try {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential) {
             await signInWithCredential(authLogym, credential);
          }
        } catch(e) {}

        onLogin({
          uid: result.user.uid,
          email: result.user.email,
          name: result.user.displayName || 'Sobat Lomeal',
          photoURL: result.user.photoURL
        });
      }
    } catch (error) {
      console.error(error);
      // Tampilkan pesan error aslinya langsung ke layar
      setErrorMsg('Gagal: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. FUNGSI LUPA PASSWORD
  const handleForgotPassword = async () => {
    playSoundEffect('click', soundEnabled);
    if (!formData.email) {
        setErrorMsg('Silakan isi kolom email terlebih dahulu, lalu klik tombol ini lagi.');
        return;
    }
    setIsLoading(true);
    try {
        await sendPasswordResetEmail(auth, formData.email);
        alert('Tautan reset password telah dikirim ke email Anda. Cek folder Inbox/Spam.');
        setErrorMsg('');
    } catch (error) {
        console.error(error);
        setErrorMsg('Gagal mengirim email reset. Pastikan email terdaftar.');
    } finally {
        setIsLoading(false);
    }
  };

  const sheetTransform = dragY !== null
    ? `translateY(${dragY}px)`
    : `translateY(${isFormExpanded ? '0px' : `calc(100% - ${peekPx}px)`})`;

  return (
    <div className={`fixed inset-0 overflow-hidden ${t.bgApp} transition-colors duration-300`}>

      {/* --- HERO PHOTO: layer fixed penuh layar, jangkar tetap, tidak ikut scroll --- */}
      <div className="absolute inset-0 flex justify-center">
        <div className={`relative w-full max-w-md h-full overflow-hidden bg-gradient-to-br ${t.gradientBg}`}>
          <img
            src="/bg-auth.webp"
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
            onError={(e) => { e.currentTarget.style.opacity = '0'; }}
          />
          {/* Aksen cahaya hijau */}
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-green-400/10 mix-blend-screen pointer-events-none" />
          {/* Transisi halus ke background app di bagian bawah */}
          <div className={`absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent ${theme === 'dark' ? 'to-[#070a08]' : 'to-[#eef3fb]'} pointer-events-none`} />

          {/* Logo */}
          <div className="absolute top-0 left-0 right-0 p-6 flex items-center gap-2" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
            <img 
              src={theme === 'dark' ? '/banner-dark.png?v=3' : '/banner-light.png?v=3'} 
              alt="Lomeal" 
              className="h-10 w-auto object-contain drop-shadow-sm"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'flex';
              }}
            />
            <div className="hidden items-center gap-2" style={{ display: 'none' }}>
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-glow">
                <Leaf size={18} strokeWidth={2.5} className="text-white" />
              </span>
              <span className="font-heading font-extrabold text-lg tracking-tight text-white drop-shadow-lg">
                Lo<span className="text-green-400">meal</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM SHEET: drawer yang bisa ditarik naik/turun --- */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          ref={sheetRef}
          className={`w-full max-w-md rounded-t-[2.5rem] ${theme === 'dark' ? 'bg-black/40 backdrop-blur-3xl' : 'bg-white/70 backdrop-blur-3xl'} border-x border-t ${t.border} shadow-glow-lg flex flex-col overflow-hidden ${dragY === null ? 'transition-transform duration-300 ease-out' : ''}`}
          style={{ height: 'min(88vh, 700px)', transform: sheetTransform }}
        >
          {/* Header: area drag — tarik atau ketuk handle untuk buka/tutup */}
          <div
            ref={headerRef}
            className="shrink-0 px-6 sm:px-8 pt-4 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerUp}
          >
            <div className="mx-auto w-10 h-1.5 rounded-full bg-white/20 mb-4" />

            <h1 className="h1 leading-tight mb-4">
              <span className={t.textMain}>{isLoginMode ? 'Masuk untuk' : 'Daftar untuk'}</span><br />
              <span className={`bg-gradient-to-r ${t.gradientText} bg-clip-text text-transparent`}>Kendalikan Pola Makanmu</span>
            </h1>

            {/* Tombol ringkas: pencet untuk buka form */}
            {!isFormExpanded && (
              <div className="flex items-center gap-4 pb-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                 <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => { playSoundEffect('click', soundEnabled); setIsFormExpanded(true); }}
                    className={`flex-1 pl-6 pr-2 py-2 rounded-full bg-gradient-to-r ${t.gradientBg} text-white font-black body-lg flex items-center justify-between shadow-lg ${t.shadowAccent} active:scale-[0.98] transition-all`}
                 >
                    <span className="uppercase tracking-wide">{isLoginMode ? 'Masuk' : 'Daftar'}</span>
                    <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                       <ArrowRight size={18} />
                    </span>
                 </button>
                 <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => { playSoundEffect('click', soundEnabled); setIsLoginMode(!isLoginMode); setIsFormExpanded(true); setErrorMsg(''); }}
                    className={`body-lg font-bold ${t.textMuted} hover:${t.textMain} transition-colors whitespace-nowrap`}
                 >
                    atau {isLoginMode ? 'Daftar' : 'Masuk'}
                 </button>
              </div>
            )}
          </div>

          {/* Konten form: scrollable di dalam sheet, muncul penuh saat sheet ditarik naik */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-10" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
            {/* Kotak Pesan Error */}
            {errorMsg && (
               <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 body-md rounded-xl text-center animate-in fade-in">
                  {errorMsg}
               </div>
            )}

            <button onClick={handleGoogleLogin} disabled={isLoading} className={`w-full py-3.5 px-4 mb-6 rounded-2xl font-bold flex items-center justify-center transition-all border ${t.border} hover:${t.borderAccentSoft} ${t.btnBg} shadow-sm group disabled:opacity-50`}>
               <svg className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
               </svg>
               {isLoginMode ? 'Masuk dengan Google' : 'Daftar dengan Google'}
            </button>

            <div className="flex items-center mb-6">
                <div className={`flex-grow border-t border-dashed ${t.border}`}></div>
                <span className={`px-4 text-[10px] font-black uppercase ${t.textMuted}`}>ATAU EMAIL</span>
                <div className={`flex-grow border-t border-dashed ${t.border}`}></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
               {!isLoginMode && (
                 <div className={`flex items-center ${t.inputBg} rounded-2xl px-4 py-3 border border-transparent focus-within:${t.borderAccentSoft} transition-colors`}>
                    <User size={20} className={t.textMuted} />
                    <input type="text" placeholder="Nama Panggilan" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className={`ml-3 bg-transparent w-full outline-none ${t.textMain} font-medium`} disabled={isLoading}/>
                 </div>
               )}

               <div className={`flex items-center ${t.inputBg} rounded-2xl px-4 py-3 border border-transparent focus-within:${t.borderAccentSoft} transition-colors`}>
                  <Mail size={20} className={t.textMuted} />
                  <input type="email" placeholder="Email Address" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required className={`ml-3 bg-transparent w-full outline-none ${t.textMain} font-medium`} disabled={isLoading}/>
               </div>

               <div className={`flex items-center ${t.inputBg} rounded-2xl px-4 py-3 border border-transparent focus-within:${t.borderAccentSoft} transition-colors`}>
                  <Lock size={20} className={t.textMuted} />
                  <input type="password" placeholder="Password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required className={`ml-3 bg-transparent w-full outline-none ${t.textMain} font-medium`} disabled={isLoading}/>
               </div>

               {isLoginMode && (
                   <div className="flex justify-end">
                       <button type="button" onClick={handleForgotPassword} disabled={isLoading} className={`body-md ${t.textMuted} hover:${t.textAccent} transition-colors`}>
                           Lupa Password?
                       </button>
                   </div>
               )}

               <button type="submit" disabled={isLoading} className={`w-full py-4 mt-2 rounded-2xl bg-gradient-to-r ${t.gradientBg} text-white font-black body-lg flex items-center justify-center shadow-lg ${t.shadowAccent} active:scale-[0.98] transition-all disabled:opacity-70`}>
                  {isLoading ? <Loader2 size={24} className="animate-spin" /> : (isLoginMode ? 'Masuk Sekarang' : 'Buat Akun')}
                  {!isLoading && <ArrowRight size={20} className="ml-2"/>}
               </button>
            </form>

            <div className="mt-8 text-center">
                <button type="button" onClick={() => { playSoundEffect('click', soundEnabled); setIsLoginMode(!isLoginMode); setErrorMsg(''); }} disabled={isLoading} className={`body-lg font-bold ${t.textMuted} hover:${t.textMain} transition-colors`}>
                    {isLoginMode ? "Belum punya akun? " : "Sudah punya akun? "}
                    <span className={t.textAccent}>{isLoginMode ? "Daftar Gratis" : "Masuk"}</span>
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;