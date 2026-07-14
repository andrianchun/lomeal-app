// src/components/NotificationPanel.jsx — port dari lyfit.app/src/components/NotificationPanel.jsx,
// data dari Logym (communityApi.js sudah mengarah ke dbLogym).
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Heart, MessageCircle, UserPlus, RefreshCw } from 'lucide-react';
import { getNotifications, markNotificationsRead } from '../utils/communityApi';

export default function NotificationPanel({ user, isDark, t, onClose, onNotifClick }) {
  const accent = t?.textAccent || 'text-green-500';
  const accentBg = t?.bgAccentSoft || 'bg-green-500/10';

  const TYPE_CONFIG = {
    like:    { icon: Heart,         color: 'text-rose-400',  bg: 'bg-rose-400/10', solidBg: 'bg-rose-500', label: 'menyukai postinganmu' },
    comment: { icon: MessageCircle, color: accent,           bg: accentBg,          solidBg: 'bg-green-500', label: 'mengomentari postinganmu' },
    follow:  { icon: UserPlus,      color: accent,           bg: accentBg,          solidBg: 'bg-green-500', label: 'mulai mengikutimu' },
    repost:  { icon: RefreshCw,     color: accent,           bg: accentBg,          solidBg: 'bg-green-500', label: 'membagikan ulang postinganmu' },
  };

  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      setIsLoading(true);
      const notifs = await getNotifications(user.uid, 30);
      setNotifications(notifs);
      setIsLoading(false);
      markNotificationsRead(user.uid);
    };
    load();
  }, [user?.uid]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const secs = Math.floor((Date.now() - date) / 1000);
    if (secs < 60) return 'Baru saja';
    if (secs < 3600) return `${Math.floor(secs / 60)} mnt lalu`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} jam lalu`;
    return `${Math.floor(secs / 86400)} hari lalu`;
  };

  const modalContent = (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300 no-swipe" onClick={onClose}>
      <div
        className={`w-full max-w-sm glass-card ${t?.bgCard || (isDark ? 'bg-white/[0.045]' : 'bg-white/60')} rounded-3xl flex flex-col max-h-[85vh] shadow-2xl animate-in zoom-in-95 border ${t?.border || (isDark ? 'border-white/10' : 'border-black/8')}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-4 py-3 flex items-center justify-between border-b ${t?.border || (isDark ? 'border-white/10' : 'border-black/8')}`}>
          <div className="flex items-center gap-2">
            <Bell size={18} className={accent} />
            <h3 className={`font-black text-base ${t?.textMain || (isDark ? 'text-white' : 'text-slate-900')}`}>Notifikasi</h3>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-full ${isDark ? 'bg-white/5 text-white/70' : 'bg-black/5 text-black/60'}`}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className={`py-10 text-center text-sm font-bold ${t?.textMuted || 'text-white/30'}`}>Memuat notifikasi...</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${accentBg}`}>
                <Bell size={24} className={accent} style={{ opacity: 0.4 }} />
              </div>
              <p className={`text-sm font-bold ${t?.textMuted || 'text-slate-400'}`}>Belum ada notifikasi</p>
            </div>
          ) : (
            notifications.map((notif, i) => {
              const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.like;
              const Icon = cfg.icon;
              return (
                <div
                  key={notif.id || i}
                  onClick={() => { onNotifClick?.(notif); onClose(); }}
                  className={`flex items-center gap-3 px-4 py-3 border-b ${t?.border || 'border-white/10'} hover:bg-black/5 ${!notif.read ? accentBg : ''} transition-colors cursor-pointer`}
                >
                  <div className="relative">
                    {notif.fromUserPhoto ? (
                      <img src={notif.fromUserPhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-green-500/20" />
                    ) : (
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${cfg.bg} ${cfg.color}`}>
                        {(notif.fromUserName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 ${isDark ? 'border-black' : 'border-white'} ${cfg.solidBg}`}>
                      <Icon size={8} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-snug ${t?.textMain || 'text-slate-200'}`}>
                      <span className="font-black">{notif.fromUserName || 'Seseorang'}</span>{' '}{cfg.label}
                    </p>
                    <p className={`text-[10px] font-medium mt-0.5 ${accent}`}>{formatTime(notif.createdAt)}</p>
                  </div>
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
