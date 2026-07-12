// src/pages/SocialHub.jsx — shell layar penuh dibuka dari icon Share2 di Header
// (Fase 9 blueprint): 3 sub-tab Feed / Studio / Profil, persis pola ProfileModal.jsx
// Lyfit (yang jadi wadah CommunityTab+ShareCardGenerator+SharedProfileView).
import React, { useState } from 'react';
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

  return (
    <div className={`fixed inset-0 z-[500] flex flex-col ${t.bgApp}`}>
      <div
        className={`sticky top-0 z-10 ${t.navBg} border-b ${t.border} px-4 flex items-center justify-between`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <p className={`font-heading font-extrabold text-lg ${t.textMain}`}>Social Hub</p>
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
