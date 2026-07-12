import React from 'react';
import { LayoutDashboard, UtensilsCrossed, CalendarDays, ChefHat, Database } from 'lucide-react';

// Navigasi bawah Lomeal (Fase 5): Dashboard · Catat · Histori · Resep · Database
const BottomNav = ({ t, activeTab, setActiveTab, soundEnabled, playSoundEffect }) => {
  const tabs = [
    { id: 'dashboard', icon: LayoutDashboard,  label: 'Dasbor' },
    { id: 'log',       icon: UtensilsCrossed,  label: 'Catat' },
    { id: 'history',   icon: CalendarDays,     label: 'Histori' },
    { id: 'recipes',   icon: ChefHat,          label: 'Resep' },
    { id: 'fooddb',    icon: Database,         label: 'Database' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe px-3 pointer-events-none">
      <div className={`pointer-events-auto flex justify-around items-center max-w-2xl mx-auto mb-3 px-1 py-2 rounded-[28px] border ${t.border} ${t.navBg} ${t.glow} transition-colors duration-300`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { playSoundEffect?.('click', soundEnabled); setActiveTab(tab.id); }}
              className="relative flex flex-col items-center justify-center w-full py-1.5 space-y-0.5 group"
            >
              {isActive && (
                <span className={`absolute inset-x-0 inset-y-0.5 rounded-2xl ${t.bgAccentSoft} border ${t.borderAccentSoft}`} />
              )}
              <span className={`relative flex flex-col items-center space-y-0.5 transition-all duration-300 ${isActive ? t.navIconActive + ' scale-105' : t.navIconInactive}`}>
                <tab.icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[8px] font-bold uppercase tracking-wider">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
