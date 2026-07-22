// src/pages/SocialHub.jsx — shell layar penuh dibuka dari icon Share2 di Header
// (Fase 9 blueprint): 3 sub-tab Feed / Studio / Profil, persis pola ProfileModal.jsx
// Lyfit (yang jadi wadah CommunityTab+ShareCardGenerator+SharedProfileView).
import React, { useState, useRef } from 'react';
import { X, Newspaper, Sparkles, UserCircle2 } from 'lucide-react';
import SocialFeed from '../components/SocialFeed';
import ProfilePage from '../components/ProfilePage';

const TABS = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'profil', label: 'Profil', icon: UserCircle2 },
];

const SocialHub = ({ t, theme, logymUser, profile, daysMap, saveProfilePatch, onClose, onLogout, showAlert, showConfirm }) => {
  const [tab, setTab] = useState(logymUser ? 'feed' : 'profil');

  // Swipe kiri/kanan pindah tab Feed/Studio/Profil — pola sama kayak swipe lokal
  // ProfileModal Logym (modal ini udah .no-swipe jadi gak bentrok sama swipe global App.jsx).
  const TAB_IDS = TABS.map((tb) => tb.id);
  const swipeRef = useRef({ x: 0, y: 0 });
  const handleSwipeStart = (e) => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const handleSwipeEnd = (e) => {
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const idx = TAB_IDS.indexOf(tab);
      if (dx < 0 && idx < TAB_IDS.length - 1) setTab(TAB_IDS[idx + 1]);
      else if (dx > 0 && idx > 0) setTab(TAB_IDS[idx - 1]);
    }
  };

  return (
    <div className={`fixed inset-0 z-[500] flex flex-col ${t.bgApp} no-swipe`}
      onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <div
        className={`sticky top-0 z-10 ${t.navBg} border-b ${t.border} px-4 flex items-center justify-between`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <div className="flex items-center gap-2">
          <img 
            src={theme === 'dark' ? '/banner-dark.png?v=3' : '/banner-light.png?v=3'} 
            alt="Lomeal" 
            className="h-10 w-auto object-contain drop-shadow-sm"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling.style.display = 'block';
            }}
          />
          <p className={`font-heading font-extrabold text-lg ${t.textMain} hidden`} style={{ display: 'none' }}>Social Hub</p>
        </div>
        <button onClick={onClose} className={`p-2 rounded-2xl ${t.btnBg} ${t.textMuted}`}>
          <X size={20} />
        </button>
      </div>

      <div className={`flex items-center gap-1 px-3 py-2 border-b ${t.border}`}>
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors ${active ? `${t.bgAccentSoft} ${t.textAccent}` : t.textMuted}`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-bold uppercase tracking-wide">{tb.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-10">
        {tab === 'feed' && (
          <SocialFeed t={t} theme={theme} logymUser={logymUser} showAlert={showAlert} showConfirm={showConfirm} />
        )}
        {tab === 'studio' && (
          <div className={`flex flex-col items-center gap-2 py-16 text-center ${t.textMuted}`}>
            <Sparkles size={32} className="opacity-40" />
            <p className="text-sm font-bold">Share Studio — Segera Hadir</p>
            <p className="text-xs px-8">Generator kartu rapor mingguan & piring makro yang siap dibagikan ke Instagram/Twitter.</p>
          </div>
        )}
        {tab === 'profil' && (
          <ProfilePage
            t={t}
            theme={theme}
            logymUser={logymUser}
            profile={profile}
            daysMap={daysMap}
            saveProfilePatch={saveProfilePatch}
            onLogout={onLogout}
            showAlert={showAlert}
            showConfirm={showConfirm}
          />
        )}
      </div>
    </div>
  );
};

export default SocialHub;
