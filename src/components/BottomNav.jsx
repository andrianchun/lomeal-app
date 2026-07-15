import React from 'react';
import { LayoutDashboard, UtensilsCrossed, CalendarDays, ChefHat, Database } from 'lucide-react';

// Navigasi bawah Lomeal (Fase 5): Dashboard · Catat · Kalender · Rencana · Database
// Pola sama kayak BottomNav Logym: tab non-aktif cuma ikon (w-[52px]), tab aktif melebar
// (flex-1) dan labelnya muncul lewat animasi max-width/opacity, bukan selalu tampil.
const BottomNav = ({ t, activeTab, setActiveTab, soundEnabled, playSoundEffect }) => {
  const tabs = [
    { id: 'dashboard', icon: LayoutDashboard,  label: 'Dasbor' },
    { id: 'log',       icon: UtensilsCrossed,  label: 'Catat' },
    { id: 'history',   icon: CalendarDays,     label: 'Kalender' },
    { id: 'program',   icon: ChefHat,          label: 'Program' },
    { id: 'fooddb',    icon: Database,         label: 'Database' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe px-3 pointer-events-none">
      <div className={`pointer-events-auto flex items-center gap-1 max-w-2xl mx-auto mb-3 px-2 py-2 rounded-[28px] border ${t.border} ${t.navBg} ${t.glow} transition-colors duration-300`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { playSoundEffect?.('click', soundEnabled); setActiveTab(tab.id); }}
              className={`relative flex items-center justify-center h-[46px] rounded-[20px] border transition-all duration-300 ${
                isActive ? `flex-1 ${t.bgAccentSoft} ${t.borderAccentSoft} px-3` : 'w-[46px] shrink-0 bg-transparent border-transparent'
              }`}
            >
              <span className={`flex items-center transition-all duration-300 ${isActive ? t.navIconActive : t.navIconInactive}`}>
                <tab.icon size={19} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                <span className={`font-black text-[10px] uppercase tracking-wider whitespace-nowrap transition-all duration-300 ${
                  isActive ? 'max-w-[100px] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0'
                } overflow-hidden`}>
                  {tab.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
