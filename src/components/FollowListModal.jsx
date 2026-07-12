// src/components/FollowListModal.jsx — port disederhanakan dari lyfit.app/src/components/FollowListModal.jsx.
// Beda dari versi Lyfit: enrichment nama/foto HANYA dari community_users (publik),
// tanpa batch-read koleksi privat `users/{uid}` milik user lain (rules Logym tidak
// mengizinkannya untuk non-admin) — dan TANPA buka profil user lain (di luar scope pass ini).
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserMinus, UserPlus, ShieldOff, Shield, Loader2, Users } from 'lucide-react';
import {
  getFollowerList, getFollowingList,
  followUser, unfollowUser,
  blockUser, unblockUser, getFollowingIds
} from '../utils/followApi';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { dbLogym } from '../firebaseLogym';

export default function FollowListModal({ currentUser, type, isDark, t, onClose }) {
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [followingSet, setFollowingSet] = useState(new Set());
  const [blockedSet, setBlockedSet] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(null);

  const title = type === 'followers' ? 'Followers' : 'Following';

  useEffect(() => {
    if (!currentUser?.uid) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [myFollowing, myBlockedSnap] = await Promise.all([
          getFollowingIds(currentUser.uid),
          getDocs(query(collection(dbLogym, 'blocks'), where('blockerId', '==', currentUser.uid))),
        ]);
        const myBlocked = myBlockedSnap.docs.map((d) => d.data().blockedId);

        const rawList = type === 'followers'
          ? await getFollowerList(currentUser.uid)
          : await getFollowingList(currentUser.uid);

        const allUids = Array.from(new Set([...rawList.map((r) => r.uid), ...myBlocked]));

        let profiles = {};
        if (allUids.length > 0) {
          const chunks = [];
          for (let i = 0; i < allUids.length; i += 30) chunks.push(allUids.slice(i, i + 30));
          for (const chunk of chunks) {
            const cSnap = await getDocs(query(collection(dbLogym, 'community_users'), where(documentId(), 'in', chunk)));
            cSnap.docs.forEach((d) => { profiles[d.id] = d.data(); });
          }
        }

        const enriched = allUids.map((uid) => ({
          uid,
          name: profiles[uid]?.name || 'Pengguna',
          photo: profiles[uid]?.photoUrl || null,
        }));

        setList(enriched);
        setFollowingSet(new Set(myFollowing));
        setBlockedSet(new Set(myBlocked));
      } catch (e) { console.error(e); }
      setIsLoading(false);
    };
    load();
  }, [currentUser?.uid, type]);

  const handleFollow = async (uid) => {
    setActionLoading(uid + '_follow');
    try {
      await followUser(currentUser.uid, uid, currentUser.displayName, currentUser.photoURL);
      setFollowingSet((prev) => new Set([...prev, uid]));
    } catch (e) { /* noop */ }
    setActionLoading(null);
  };

  const handleUnfollow = async (uid) => {
    setActionLoading(uid + '_follow');
    try {
      await unfollowUser(currentUser.uid, uid);
      setFollowingSet((prev) => { const s = new Set(prev); s.delete(uid); return s; });
      if (type === 'following') setList((prev) => prev.filter((u) => u.uid !== uid));
    } catch (e) { /* noop */ }
    setActionLoading(null);
  };

  const handleBlock = async (uid) => {
    setActionLoading(uid + '_block');
    try {
      await blockUser(currentUser.uid, uid);
      setBlockedSet((prev) => new Set([...prev, uid]));
      setFollowingSet((prev) => { const s = new Set(prev); s.delete(uid); return s; });
    } catch (e) { /* noop */ }
    setActionLoading(null);
  };

  const handleUnblock = async (uid) => {
    setActionLoading(uid + '_block');
    try {
      await unblockUser(currentUser.uid, uid);
      setBlockedSet((prev) => { const s = new Set(prev); s.delete(uid); return s; });
    } catch (e) { /* noop */ }
    setActionLoading(null);
  };

  const renderRow = (u) => {
    const iAmFollowing = followingSet.has(u.uid);
    const iBlocked = blockedSet.has(u.uid);
    const isActingFollow = actionLoading === u.uid + '_follow';
    const isActingBlock = actionLoading === u.uid + '_block';
    const isMe = u.uid === currentUser.uid;

    return (
      <div key={u.uid} className={`flex items-center gap-3 px-4 py-3 border-b ${t?.border || 'border-white/5'} ${iBlocked ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {u.photo ? (
            <img src={u.photo} alt={u.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${t?.bgAccentSoft || 'bg-green-500/10'} ${t?.textAccent || 'text-green-500'}`}>
              {(u.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <p className={`font-bold text-sm truncate ${t?.textMain || (isDark ? 'text-white' : 'text-black')}`}>{u.name}</p>
        </div>

        {!isMe && (
          <div className="flex items-center gap-1.5 shrink-0">
            {!iBlocked && (
              <button
                onClick={() => (iAmFollowing ? handleUnfollow(u.uid) : handleFollow(u.uid))}
                disabled={!!isActingFollow}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50 ${
                  iAmFollowing ? (t?.btnBg || 'bg-white/10 text-white') : (t?.bgAccent || 'bg-green-500 text-white')
                }`}
              >
                {isActingFollow ? <Loader2 size={12} className="animate-spin" /> : (
                  iAmFollowing ? <><UserMinus size={12} /> Unfollow</> : <><UserPlus size={12} /> Follow</>
                )}
              </button>
            )}
            <button
              onClick={() => (iBlocked ? handleUnblock(u.uid) : handleBlock(u.uid))}
              disabled={!!isActingBlock}
              title={iBlocked ? 'Unblock' : 'Block'}
              className={`p-1.5 rounded-full transition-all disabled:opacity-50 ${
                iBlocked ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : `${t?.btnBg || 'bg-white/5'} ${t?.textMuted || 'text-white/40'} hover:bg-red-500/10 hover:text-red-500`
              }`}
            >
              {isActingBlock ? <Loader2 size={14} className="animate-spin" /> : (iBlocked ? <ShieldOff size={14} /> : <Shield size={14} />)}
            </button>
          </div>
        )}
      </div>
    );
  };

  const modal = (
    <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
      <div
        className={`w-full max-w-sm ${t?.bgCard || (isDark ? 'bg-slate-900' : 'bg-white')} rounded-3xl flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-4 py-3.5 flex items-center justify-between border-b ${t?.border || 'border-white/10'} shrink-0`}>
          <h3 className={`font-black text-base ${t?.textMain || (isDark ? 'text-white' : 'text-black')}`}>{title}</h3>
          <button onClick={onClose} className={`p-1.5 rounded-full ${t?.btnBg || 'bg-white/5 text-white/60'}`}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className={`animate-spin ${t?.textMuted || 'text-white/30'}`} />
            </div>
          ) : list.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 gap-3 ${t?.textMuted || 'text-white/30'}`}>
              <Users size={36} className="opacity-30" />
              <p className="text-sm font-bold">Belum ada {title.toLowerCase()}</p>
            </div>
          ) : (
            <>
              {list.filter((u) => !blockedSet.has(u.uid)).map((u) => renderRow(u))}
              {list.some((u) => blockedSet.has(u.uid)) && (
                <>
                  <div className={`px-4 py-2 flex items-center gap-2 border-t ${t?.border || 'border-white/10'} mt-1`}>
                    <Shield size={12} className="text-amber-500" />
                    <span className={`text-[10px] font-black uppercase tracking-wider ${t?.textMuted || 'text-white/30'}`}>Diblokir</span>
                  </div>
                  {list.filter((u) => blockedSet.has(u.uid)).map((u) => renderRow(u))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
