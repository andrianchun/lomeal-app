// src/components/CreatePostModal.jsx — port dari lyfit.app/src/components/CreatePostModal.jsx,
// dipangkas: tanpa mode 'template' (Lyfit-only, ProgramCard) — Lomeal pakai postDataOverrides
// {type:'recipe', recipeName, recipeData} dari RecipesTab (lihat App.jsx#shareRecipe).
import React, { useState, useRef } from 'react';
import { X, ImagePlus, Loader2 } from 'lucide-react';
import { uploadImageToFirebase } from '../utils/storageLogym';
import { createCommunityPost } from '../utils/communityApi';
import { containsBadWords } from '../utils/moderationApi';
import useDialog from '../hooks/useDialog';

export default function CreatePostModal({ user, onClose, theme, t, initialFiles = [], postDataOverrides = {} }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState(initialFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const fileInputRef = useRef(null);

  const isDark = theme === 'dark';
  const { dialog, showAlert } = useDialog(isDark);
  const isRecipe = postDataOverrides.type === 'recipe';
  const isRepost = postDataOverrides.type === 'repost';

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter((f) => f.type.startsWith('image/')).slice(0, 10 - images.length);
    setImages((prev) => [...prev, ...validFiles]);
  };

  const removeImage = (index) => setImages((prev) => prev.filter((_, i) => i !== index));

  const handleDragStart = (e, index) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    setImages((prev) => {
      const newImages = [...prev];
      const draggedItem = newImages[draggedIndex];
      newImages.splice(draggedIndex, 1);
      newImages.splice(dropIndex, 0, draggedItem);
      return newImages;
    });
    setDraggedIndex(null);
  };

  const MAX_CHARS = 500;
  const canPost = (isRecipe || isRepost || text.trim() || images.length > 0) && text.length <= MAX_CHARS;
  const charsLeft = MAX_CHARS - text.length;
  const isNearLimit = charsLeft <= 50;
  const isOverLimit = charsLeft < 0;

  const handleSubmit = async () => {
    if (!canPost) return;
    if (containsBadWords(text)) {
      await showAlert('Pesan mengandung kata-kata yang tidak pantas atau melanggar standar komunitas.', { type: 'error', title: 'Peringatan' });
      return;
    }

    setIsUploading(true);
    try {
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const url = await uploadImageToFirebase(file, `community_posts/${user?.uid || 'guest'}/post_${Date.now()}_${i}`);
        if (url) imageUrls.push(url);
      }

      const newPostId = await createCommunityPost(
        user?.uid,
        user?.displayName || user?.email?.split('@')[0],
        user?.photoURL,
        { text, imageUrls, ...postDataOverrides }
      );

      onClose(true, newPostId);
    } catch (err) {
      console.error(err);
      await showAlert('Gagal memposting. Silakan coba lagi.', { type: 'error', title: 'Gagal' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300 no-swipe">
      <div className={`w-full sm:max-w-xl ${t?.bgCard || (isDark ? 'bg-slate-900/80 border border-white/10' : 'bg-white/90 border border-black/10')} backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] flex flex-col max-h-[85vh] shadow-2xl animate-in slide-in-from-bottom-10`}>
        <div className="p-5 flex items-center justify-between shrink-0">
          <button onClick={() => onClose()} className={`p-2.5 rounded-full ${t?.btnBg || 'bg-white/10 text-white'} transition-colors`}>
            <X size={24} />
          </button>
          <h3 className={`font-black text-xl ${t?.textMain || (isDark ? 'text-white' : 'text-black')}`}>
            {isRecipe ? 'Bagikan Resep' : (isRepost ? 'Bagikan Ulang' : 'Buat Postingan')}
          </h3>
          <button
            onClick={handleSubmit}
            disabled={isUploading || !canPost}
            className={`px-6 py-2.5 rounded-2xl font-black text-base ${t?.bgAccent || 'bg-green-500 text-white'} shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0`}
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : 'Post'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {isRecipe && (
            <div className={`p-4 rounded-2xl border ${t?.border || 'border-white/10'} ${t?.bgCardSoft || 'bg-white/5'}`}>
              <p className={`h3 mb-1 ${t?.textAccent || 'text-green-500'}`}>Resep</p>
              <p className={`font-black text-lg ${t?.textMain || 'text-white'}`}>{postDataOverrides.recipeName}</p>
            </div>
          )}

          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => { if (e.target.value.length <= MAX_CHARS + 10) setText(e.target.value); }}
              placeholder={isRecipe ? 'Tambahkan cerita atau tips soal resep ini...' : 'Bagikan progress atau tips makanmu hari ini...'}
              className={`w-full min-h-[140px] resize-none outline-none text-lg bg-transparent ${t?.textMain || (isDark ? 'text-white placeholder-white/40' : 'text-black placeholder-black/40')}`}
            />
            {(isNearLimit || text.length > 0) && (
              <div className={`text-right text-xs font-bold mt-1 ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-amber-500' : (t?.textMuted || 'text-white/30')}`}>
                {isOverLimit ? `-${Math.abs(charsLeft)}` : charsLeft}
              </div>
            )}
          </div>

          {isRepost && (
            <div className={`mt-3 p-3 rounded-2xl border ${t?.border || 'border-white/10'} ${t?.bgCardSoft || 'bg-white/5'} opacity-80 pointer-events-none mb-3`}>
              <div className="flex items-center gap-2 mb-2">
                {postDataOverrides.originalUserPhoto ? (
                  <img src={postDataOverrides.originalUserPhoto} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${t?.btnBg || 'bg-white/10 text-white'}`}>
                    {postDataOverrides.originalUserName?.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-black">{postDataOverrides.originalUserName}</span>
              </div>
              <p className="text-xs line-clamp-2 leading-relaxed">{postDataOverrides.originalText || 'Postingan'}</p>
            </div>
          )}

          {images.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar snap-x">
              {images.map((file, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, i)}
                  className={`relative w-32 h-44 shrink-0 snap-center rounded-2xl overflow-hidden bg-black/5 border border-white/10 cursor-grab active:cursor-grabbing shadow-md transition-transform ${draggedIndex === i ? 'opacity-50 scale-95' : ''}`}
                >
                  <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover pointer-events-none select-none" />
                  <button onClick={() => removeImage(i)} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-rose-500 backdrop-blur-md transition-colors">
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-bold shadow-sm pointer-events-none select-none">
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(!isRecipe && !isRepost) && (
          <div className="p-4 shrink-0">
            <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= 10}
              className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-black text-base shadow-sm transition-all disabled:opacity-50 ${t?.textAccent || 'text-green-500'} ${t?.bgAccentSoft || 'bg-green-500/10'} active:scale-[0.98]`}
            >
              <ImagePlus size={24} />
              <span>Tambah Foto ({images.length}/10)</span>
            </button>
          </div>
        )}

        {dialog}
      </div>
    </div>
  );
}
