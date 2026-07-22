import React, { useState, useEffect } from 'react';
import { Settings, User, WifiOff, Leaf, Bell } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { dbLogym } from '../firebaseLogym';

/**
 * Top App Bar Lomeal — dibuat presisi mengikuti Header Logym asli
 * (lyfit.app/src/components/Header.jsx): tombol kanan bulat w-10 h-10,
 * urutan Bell → Settings → Avatar Profil. Klik avatar = buka Social Hub
 * (sama seperti Logym: tombol profil = pintu masuk Sosial+Profil).
 */
const Header = ({ t, theme, isOffline, logymUser, onOpenSocial, onOpenSettings, onOpenNotifications, soundEnabled, playSoundEffect }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!logymUser) { setUnreadCount(0); return undefined; }
    const q = query(collection(dbLogym, 'notifications'), where('toUserId', '==', logymUser.uid), where('read', '==', false));
    return onSnapshot(q, (snap) => setUnreadCount(snap.docs.length));
  }, [logymUser]);

  return (
    <header
      className={`sticky top-0 z-40 ${t.navBg} border-b ${t.border} px-4 flex justify-between items-center transition-colors duration-300 relative`}
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-green-400/40 to-transparent" />

      {/* KIRI: LOGO */}
      <div className="flex items-center gap-2">
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
          <span className={`w-8 h-8 rounded-xl ${t.bgAccent} flex items-center justify-center shadow-glow`}>
            <Leaf size={18} strokeWidth={2.5} />
          </span>
          <span className={`font-heading font-extrabold text-lg tracking-tight ${t.textMain}`}>
            Lo<span className={t.textAccent}>meal</span>
          </span>
        </div>
      </div>

      {/* KANAN: OFFLINE → BELL → SETTINGS → AVATAR (PROFIL & SOSIAL) */}
      <div className="flex items-center gap-2">
        {isOffline && (
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-400/10 text-red-400 animate-pulse" title="Sedang Offline">
            <WifiOff size={20} strokeWidth={2} />
          </span>
        )}

        {logymUser && (
          <button
            onClick={() => { playSoundEffect?.('click', soundEnabled); onOpenNotifications?.(); }}
            className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-95 ${t.btnBg} ${t.textMuted}`}
            aria-label="Notifikasi"
          >
            <Bell size={20} strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white/20">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => { playSoundEffect?.('click', soundEnabled); onOpenSettings(); }}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-95 ${t.btnBg} ${t.textMuted}`}
          aria-label="Pengaturan"
        >
          <Settings size={20} strokeWidth={2} />
        </button>

        <button
          onClick={() => { playSoundEffect?.('click', soundEnabled); onOpenSocial(); }}
          className="relative rounded-full transition-transform active:scale-95 shadow-sm"
          aria-label="Profil & Social Hub"
        >
          {logymUser?.photoURL ? (
            <img
              src={logymUser.photoURL}
              alt="Profil"
              referrerPolicy="no-referrer"
              className={`w-10 h-10 rounded-full object-cover border-2 ${t.border}`}
            />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.btnBg} border-2 ${t.border}`}>
              <User size={20} className={t.textMain} />
            </div>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
