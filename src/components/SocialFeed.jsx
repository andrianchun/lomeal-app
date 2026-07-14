// src/components/SocialFeed.jsx — versi ringkas dari lyfit.app/src/pages/CommunityTab.jsx
// (tanpa search user, edit post, image lightbox — lihat "sengaja belum digarap" di rencana).
// Filter Semua/Diikuti/Teman, halo leaderboard top-10, like, komentar, hapus post sendiri, lapor.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Heart, MessageCircle, Loader2, Plus, MoreHorizontal, Trash2, Flag, Send, Sparkles } from 'lucide-react';
import {
  getGlobalFeed, getFollowingFeed, toggleLike, deletePost,
  addComment, getComments, getWeeklyLeaderboard,
} from '../utils/communityApi';
import { getFollowingIds, getFollowerList } from '../utils/followApi';
import { containsBadWords, reportPost, getLocalHiddenPosts } from '../utils/moderationApi';
import CreatePostModal from './CreatePostModal';

const FILTERS = ['Semua', 'Diikuti', 'Teman'];

const timeAgo = (ts) => {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const secs = Math.floor((Date.now() - date) / 1000);
  if (secs < 60) return 'Baru saja';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}j`;
  return `${Math.floor(secs / 86400)}h`;
};

const SOURCE_FILTERS = [
  { id: 'all', label: 'Semua App' },
  { id: 'logym', label: 'Logym' },
  { id: 'lomeal', label: 'Lomeal' },
];

const SocialFeed = ({ t, theme, logymUser, showAlert, showConfirm, onPostCreated }) => {
  const [filter, setFilter] = useState('Semua');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [feed, setFeed] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState([]);
  const [followerIds, setFollowerIds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState({});

  const isDark = theme === 'dark';
  const hiddenIds = getLocalHiddenPosts();

  // Halo top-10 dibaca sekali per sesi (leaderboard mingguan, collection bersama sama Logym).
  useEffect(() => { getWeeklyLeaderboard().then(setLeaderboard); }, []);

  const loadFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      let posts;
      if (filter === 'Diikuti' || filter === 'Teman') {
        let following = followingIds;
        if (following.length === 0 && logymUser) {
          following = await getFollowingIds(logymUser.uid);
          setFollowingIds(following);
        }
        if (filter === 'Teman') {
          let followers = followerIds;
          if (followers.length === 0 && logymUser) {
            followers = (await getFollowerList(logymUser.uid)).map((f) => f.uid);
            setFollowerIds(followers);
          }
          const mutualIds = following.filter((id) => followers.includes(id));
          posts = mutualIds.length > 0 ? await getFollowingFeed(mutualIds) : [];
        } else {
          posts = await getFollowingFeed(following);
        }
      } else {
        posts = await getGlobalFeed();
      }
      setFeed(posts.filter((p) => !p.isHidden && !hiddenIds.includes(p.id)));
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, logymUser]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Post Lomeal ditandai sourceApp:'lomeal' eksplisit (lihat utils/communityApi.js);
  // post Logym asli TIDAK ditandai apa-apa (kode Logym gak pernah kita ubah) — jadi
  // "bukan lomeal" = dari Logym.
  const visibleFeed = useMemo(() => {
    if (sourceFilter === 'all') return feed;
    return feed.filter((p) => (sourceFilter === 'lomeal' ? p.sourceApp === 'lomeal' : p.sourceApp !== 'lomeal'));
  }, [feed, sourceFilter]);

  const handleLike = async (post) => {
    if (!logymUser) return;
    const liked = (post.likedBy || []).includes(logymUser.uid);
    setFeed((prev) => prev.map((p) => (p.id === post.id ? {
      ...p,
      likes: (p.likes || 0) + (liked ? -1 : 1),
      likedBy: liked ? p.likedBy.filter((u) => u !== logymUser.uid) : [...(p.likedBy || []), logymUser.uid],
    } : p)));
    try {
      await toggleLike(post.id, logymUser.uid, post.userId, logymUser.displayName, logymUser.photoURL);
    } catch (e) { console.error(e); }
  };

  const toggleComments = async (postId) => {
    setExpandedComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
    if (!comments[postId]) {
      const list = await getComments(postId);
      setComments((prev) => ({ ...prev, [postId]: list }));
    }
  };

  const submitComment = async (post) => {
    const text = (commentInput[post.id] || '').trim();
    if (!text || !logymUser) return;
    if (containsBadWords(text)) { await showAlert('Komentar mengandung kata tidak pantas.'); return; }
    setCommentInput((prev) => ({ ...prev, [post.id]: '' }));
    await addComment(post.id, { userId: logymUser.uid, userName: logymUser.displayName, userPhoto: logymUser.photoURL, text }, post.userId);
    setFeed((prev) => prev.map((p) => (p.id === post.id ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p)));
    const list = await getComments(post.id);
    setComments((prev) => ({ ...prev, [post.id]: list }));
  };

  const handleDelete = async (post) => {
    setMenuOpen(null);
    if (!(await showConfirm('Hapus postingan ini?', { danger: true }))) return;
    await deletePost(post.id);
    setFeed((prev) => prev.filter((p) => p.id !== post.id));
  };

  const handleReport = async (post) => {
    setMenuOpen(null);
    await reportPost(post.id, logymUser.uid, 'Dilaporkan pengguna');
    await showAlert('Terima kasih, laporanmu sudah kami terima.');
    setFeed((prev) => prev.filter((p) => p.id !== post.id));
  };

  // Avatar + halo gradient pulsing buat member top-10 leaderboard mingguan — pola sama
  // kayak renderAvatar CommunityTab Logym (animate-pulse bawaan Tailwind, bukan
  // animate-pulse-slow custom Logym yang ternyata gak pernah didefinisikan/no-op).
  const renderAvatar = (userName, userPhoto, userId) => {
    const isTopTen = leaderboard.some((u) => u.id === userId);
    return (
      <div className="shrink-0 relative">
        {isTopTen && (
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-300 via-blue-500 to-indigo-600 animate-pulse opacity-80 blur-[2px]" />
        )}
        <div className={`relative rounded-full ${isTopTen ? `ring-2 ring-blue-400 p-[2px] ${isDark ? 'bg-slate-800' : 'bg-white'}` : ''}`}>
          {userPhoto ? (
            <img src={userPhoto} alt="" className={`w-9 h-9 rounded-full object-cover ${!isTopTen ? `ring-2 ${t.ringAccent} ring-opacity-20` : ''}`} />
          ) : (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black ${!isTopTen ? `${t.bgAccentSoft} ${t.textAccent} ring-2 ${t.ringAccent} ring-opacity-20` : 'bg-blue-100 text-blue-600'}`}>
              {(userName || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${filter === f ? t.bgAccent : `${t.btnBg} ${t.textMuted}`}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setSourceFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${sourceFilter === f.id ? `${t.bgAccentSoft} ${t.textAccent} border ${t.borderAccentSoft}` : `${t.textMuted} border ${t.border}`}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className={`animate-spin ${t.textMuted}`} size={28} /></div>
      ) : visibleFeed.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 py-16 ${t.textMuted}`}>
          <Sparkles size={32} className="opacity-40" />
          <p className="text-sm font-bold">Belum ada postingan di sini.</p>
        </div>
      ) : (
        visibleFeed.map((post) => {
          const liked = logymUser && (post.likedBy || []).includes(logymUser.uid);
          const isMine = logymUser && post.userId === logymUser.uid;
          return (
            <div key={post.id} className={`pb-5 border-b ${t.border}`}>
              <div className="flex items-start gap-3">
                {renderAvatar(post.userName, post.userPhoto, post.userId)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`font-black text-sm ${t.textMain}`}>{post.userName || 'Anonim'}</p>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${post.sourceApp === 'lomeal' ? `${t.bgAccentSoft} ${t.textAccent}` : 'bg-blue-500/15 text-blue-400'}`}>
                      {post.sourceApp === 'lomeal' ? 'Lomeal' : 'Logym'}
                    </span>
                    <span className={`text-[10px] ${t.textMuted}`}>· {timeAgo(post.timestamp)}</span>
                  </div>
                  {post.type === 'recipe' && post.recipeName && (
                    <p className={`text-xs font-bold mt-0.5 ${t.textAccent}`}>🍽️ Resep: {post.recipeName}</p>
                  )}
                </div>
                <div className="relative shrink-0">
                  <button onClick={() => setMenuOpen(menuOpen === post.id ? null : post.id)} className={t.textMuted}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpen === post.id && (
                    <div className={`absolute right-0 top-6 z-10 w-40 rounded-2xl border ${t.border} ${t.bgCard} shadow-xl overflow-hidden`}>
                      {isMine ? (
                        <button onClick={() => handleDelete(post)} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/10">
                          <Trash2 size={14} /> Hapus
                        </button>
                      ) : (
                        <button onClick={() => handleReport(post)} className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold ${t.textMuted} hover:bg-black/5`}>
                          <Flag size={14} /> Laporkan
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {post.text && <p className={`text-sm mt-3 leading-relaxed whitespace-pre-wrap ${t.textMain}`}>{post.text}</p>}

              {post.imageUrls?.length > 0 && (
                <div
                  className="overflow-x-auto hide-scrollbar mt-3 gap-1.5"
                  style={{ display: 'flex', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
                  onTouchStart={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
                >
                  {post.imageUrls.map((url, i) => (
                    <div key={i} style={{ minWidth: post.imageUrls.length === 1 ? '100%' : '85%', height: '240px' }}
                      className={`shrink-0 overflow-hidden ${post.imageUrls.length === 1 ? 'rounded-2xl' : i === 0 ? 'rounded-l-2xl' : ''} ${i === post.imageUrls.length - 1 && post.imageUrls.length > 1 ? 'rounded-r-2xl' : ''}`}>
                      <img src={url} alt="" className="w-full h-full object-cover object-top block" loading="lazy" />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 mt-3">
                <button onClick={() => handleLike(post)} className={`flex items-center gap-1.5 text-xs font-bold ${liked ? 'text-rose-500' : t.textMuted}`}>
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} /> {post.likes || 0}
                </button>
                <button onClick={() => toggleComments(post.id)} className={`flex items-center gap-1.5 text-xs font-bold ${t.textMuted}`}>
                  <MessageCircle size={16} /> {post.commentCount || 0}
                </button>
              </div>

              {expandedComments[post.id] && (
                <div className={`mt-3 pt-3 border-t ${t.border} flex flex-col gap-2`}>
                  {(comments[post.id] || []).map((c) => (
                    <div key={c.id} className="flex items-start gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${t.bgAccentSoft} ${t.textAccent}`}>
                        {(c.userName || '?').charAt(0).toUpperCase()}
                      </div>
                      <p className={`text-xs ${t.textMain}`}><span className="font-bold">{c.userName}</span> {c.text}</p>
                    </div>
                  ))}
                  {logymUser && (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        value={commentInput[post.id] || ''}
                        onChange={(e) => setCommentInput((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitComment(post); }}
                        placeholder="Tulis komentar..."
                        className={`flex-1 text-xs px-3 py-2 rounded-full outline-none ${t.inputBg} ${t.textMain}`}
                      />
                      <button onClick={() => submitComment(post)} className={t.textAccent}><Send size={16} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* FAB compose — pola sama kayak CommunityTab Logym */}
      <button
        onClick={() => (logymUser ? setIsCreating(true) : showAlert('Sambungkan akun dulu lewat tab Profil (bisa langsung bikin identitas baru, gak perlu akun Logym yang sudah ada).'))}
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full ${t.bgAccent} shadow-xl ${t.shadowAccent} flex justify-center items-center active:scale-95 transition-all`}
      >
        <Plus size={28} />
      </button>

      {isCreating && (
        <CreatePostModal
          user={logymUser}
          theme={theme}
          t={t}
          onClose={(shouldRefresh) => { setIsCreating(false); if (shouldRefresh) { loadFeed(); onPostCreated?.(); } }}
        />
      )}
    </div>
  );
};

export default SocialFeed;
