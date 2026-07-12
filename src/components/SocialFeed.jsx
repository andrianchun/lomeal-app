// src/components/SocialFeed.jsx — versi ringkas dari lyfit.app/src/pages/CommunityTab.jsx
// (tanpa search user, leaderboard, edit post, image lightbox — lihat "sengaja belum
// digarap" di rencana). Filter Semua/Diikuti, like, komentar, hapus post sendiri, lapor.
import React, { useState, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Loader2, Plus, MoreHorizontal, Trash2, Flag, Send, Sparkles } from 'lucide-react';
import {
  getGlobalFeed, getFollowingFeed, toggleLike, deletePost,
  addComment, getComments,
} from '../utils/communityApi';
import { getFollowingIds } from '../utils/followApi';
import { containsBadWords, reportPost, getLocalHiddenPosts } from '../utils/moderationApi';
import CreatePostModal from './CreatePostModal';

const FILTERS = ['Semua', 'Diikuti'];

const timeAgo = (ts) => {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const secs = Math.floor((Date.now() - date) / 1000);
  if (secs < 60) return 'Baru saja';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}j`;
  return `${Math.floor(secs / 86400)}h`;
};

const SocialFeed = ({ t, theme, logymUser, showAlert, showConfirm, onPostCreated }) => {
  const [filter, setFilter] = useState('Semua');
  const [feed, setFeed] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState({});

  const isDark = theme === 'dark';
  const hiddenIds = getLocalHiddenPosts();

  const loadFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      let ids = followingIds;
      if (filter === 'Diikuti' && ids.length === 0 && logymUser) {
        ids = await getFollowingIds(logymUser.uid);
        setFollowingIds(ids);
      }
      const posts = filter === 'Diikuti' ? await getFollowingFeed(ids) : await getGlobalFeed();
      setFeed(posts.filter((p) => !p.isHidden && !hiddenIds.includes(p.id)));
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, logymUser]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

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
        <button
          onClick={() => (logymUser ? setIsCreating(true) : showAlert('Sambungkan akun ke Logym dulu lewat tab Profil.'))}
          className={`ml-auto flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold ${t.bgAccentSoft} ${t.textAccent}`}
        >
          <Plus size={14} /> Post
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className={`animate-spin ${t.textMuted}`} size={28} /></div>
      ) : feed.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 py-16 ${t.textMuted}`}>
          <Sparkles size={32} className="opacity-40" />
          <p className="text-sm font-bold">Belum ada postingan di sini.</p>
        </div>
      ) : (
        feed.map((post) => {
          const liked = logymUser && (post.likedBy || []).includes(logymUser.uid);
          const isMine = logymUser && post.userId === logymUser.uid;
          return (
            <div key={post.id} className={`rounded-3xl border ${t.border} ${t.bgCard} p-4`}>
              <div className="flex items-start gap-3">
                {post.userPhoto ? (
                  <img src={post.userPhoto} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0 ${t.bgAccentSoft} ${t.textAccent}`}>
                    {(post.userName || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`font-black text-sm ${t.textMain}`}>{post.userName || 'Anonim'}</p>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${post.sourceApp === 'logym' ? 'bg-blue-500/15 text-blue-400' : `${t.bgAccentSoft} ${t.textAccent}`}`}>
                      {post.sourceApp === 'logym' ? 'Logym' : 'Lomeal'}
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
                <div className="flex gap-2 overflow-x-auto mt-3 hide-scrollbar snap-x">
                  {post.imageUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="h-48 w-auto rounded-2xl object-cover snap-center shrink-0" />
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
