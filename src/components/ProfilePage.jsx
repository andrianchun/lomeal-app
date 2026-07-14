// src/components/ProfilePage.jsx — gabungan disederhanakan dari ProfileModal.jsx +
// SharedProfileView.jsx milik Lyfit: avatar crop+upload, nama/username (unik, dikunci
// sekali), follower/following count, badge grid (achievements.js), post sendiri, logout.
// Identitas & data publik SELALU ke project Logym (dbLogym/storageLogym/authLogym);
// field privat (target, dietProfile, dst) tetap di profil Lomeal sendiri.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { X, Loader2, Check, Camera, LogOut, Users, Lock } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { authLogym, dbLogym } from '../firebaseLogym';
import { uploadImageToFirebase, deleteImageFromFirebase } from '../utils/storageLogym';
import { registerToCommunity, updateUserProfileInFeed, getUserPosts } from '../utils/communityApi';
import { getFollowerCount, getFollowingCount } from '../utils/followApi';
import { ACHIEVEMENTS, checkAchievements } from '../data/achievements';
import { DIET_PROFILES } from '../data/nutrition';
import FollowListModal from './FollowListModal';
import LogymConnectPrompt from './LogymConnectPrompt';

const AVATAR_OUTPUT_SIZE = 512;
const getCroppedBlob = (imageSrc, pixelCrop) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const outSize = Math.min(AVATAR_OUTPUT_SIZE, pixelCrop.width, pixelCrop.height);
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outSize, outSize);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar'))), 'image/webp', 0.85);
  };
  image.onerror = reject;
  image.src = imageSrc;
});

const ProfilePage = ({ t, theme, logymUser, profile, daysMap, saveProfilePatch, onLogout, showAlert, showConfirm }) => {
  const [communityProfile, setCommunityProfile] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [followListType, setFollowListType] = useState(null); // 'followers' | 'following'
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  
  const [allergiesInput, setAllergiesInput] = useState(profile?.allergies || '');
  const [dietProfileInput, setDietProfileInput] = useState(profile?.dietProfile || 'weight_loss');

  // --- Cropper state ---
  const [cropSourceUrl, setCropSourceUrl] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const isLocked = !!communityProfile?.username;

  const refreshCounts = useCallback(async () => {
    if (!logymUser) return;
    const [fc, fgc, posts] = await Promise.all([
      getFollowerCount(logymUser.uid),
      getFollowingCount(logymUser.uid),
      getUserPosts(logymUser.uid, 100),
    ]);
    setFollowerCount(fc);
    setFollowingCount(fgc);
    setPostCount(posts.length);
    return { fc, fgc, postCount: posts.length };
  }, [logymUser]);

  useEffect(() => {
    if (!logymUser) return;
    (async () => {
      await registerToCommunity(logymUser.uid, { name: logymUser.displayName, photoUrl: logymUser.photoURL });
      const snap = await getDoc(doc(dbLogym, 'community_users', logymUser.uid));
      setCommunityProfile(snap.exists() ? snap.data() : null);
      const counts = await refreshCounts();

      // Cek & kunci achievement baru (disimpan di profil Lomeal sendiri, bukan community_users)
      if (counts) {
        const unlocked = checkAchievements(daysMap, profile?.achievements || [], profile, {
          postCount: counts.postCount, followingCount: counts.fgc, followersCount: counts.fc,
        });
        if (unlocked.length > 0) {
          saveProfilePatch({ achievements: [...(profile?.achievements || []), ...unlocked.map((a) => a.id)] });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logymUser?.uid]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { showAlert('Ukuran foto maksimal 20MB.'); return; }
    setCropSourceUrl(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const closeCropper = () => {
    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    setCropSourceUrl(null);
  };

  const confirmPhotoUpload = async () => {
    if (!cropSourceUrl || !croppedAreaPixels || !logymUser) return;
    setIsUploading(true);
    try {
      const blob = await getCroppedBlob(cropSourceUrl, croppedAreaPixels);
      if (logymUser.photoURL) await deleteImageFromFirebase(logymUser.photoURL);

      let photoURL = await uploadImageToFirebase(blob, `lyfit_users/${logymUser.uid}/profile/profile_pic_${Date.now()}.webp`);
      photoURL = photoURL.includes('?') ? `${photoURL}&v=${Date.now()}` : `${photoURL}?v=${Date.now()}`;

      await updateProfile(authLogym.currentUser, { photoURL });
      await updateUserProfileInFeed(logymUser.uid, undefined, photoURL);
      setCommunityProfile((prev) => ({ ...prev, photoUrl: photoURL }));
      await showAlert('Foto profil berhasil diperbarui!');
    } catch (err) {
      console.error(err);
      await showAlert(err.message || 'Gagal mengunggah foto profil.');
    }
    setIsUploading(false);
    closeCropper();
  };

  const saveUsername = async () => {
    const username = usernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (username.length < 3) { await showAlert('Username minimal 3 karakter (huruf/angka/underscore).'); return; }
    setIsSavingUsername(true);
    try {
      await runTransaction(dbLogym, async (tx) => {
        const uRef = doc(dbLogym, 'usernames', username);
        const uSnap = await tx.get(uRef);
        if (uSnap.exists()) throw new Error('Username sudah dipakai orang lain.');
        tx.set(uRef, { uid: logymUser.uid });
      });
      await updateUserProfileInFeed(logymUser.uid, undefined, undefined, username);
      setCommunityProfile((prev) => ({ ...prev, username }));
      setIsEditingUsername(false);
    } catch (err) {
      await showAlert(err.message || 'Gagal menyimpan username.');
    }
    setIsSavingUsername(false);
  };

  if (!logymUser) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
        <Lock size={32} className={t.textMuted} />
        <p className={`font-bold ${t.textMain}`}>Sambungkan akunmu ke Logym buat akses Social Hub & Profil.</p>
        <div className="w-full max-w-xs mt-2">
          <LogymConnectPrompt t={t} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Avatar + nama */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="relative">
          {communityProfile?.photoUrl || logymUser.photoURL ? (
            <img src={communityProfile?.photoUrl || logymUser.photoURL} alt="" className="w-24 h-24 rounded-full object-cover" />
          ) : (
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black ${t.bgAccentSoft} ${t.textAccent}`}>
              {(logymUser.displayName || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`absolute bottom-0 right-0 p-2 rounded-full ${t.bgAccent} shadow-lg`}
          >
            <Camera size={14} className="text-white" />
          </button>
        </div>
        <p className={`font-black text-lg ${t.textMain}`}>{logymUser.displayName || 'Sobat Lomeal'}</p>
        {isEditingUsername ? (
          <div className="flex items-center gap-2">
            <input
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="username"
              className={`text-xs px-3 py-1.5 rounded-full outline-none ${t.inputBg} ${t.textMain}`}
            />
            <button onClick={saveUsername} disabled={isSavingUsername} className={t.textAccent}>
              {isSavingUsername ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
          </div>
        ) : communityProfile?.username ? (
          <p className={`text-xs font-bold ${t.textMuted}`}>@{communityProfile.username}</p>
        ) : (
          <button onClick={() => setIsEditingUsername(true)} className={`text-xs font-bold ${t.textAccent}`}>+ Atur username</button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-around">
        <div className="text-center">
          <p className={`font-black text-lg ${t.textMain}`}>{postCount}</p>
          <p className={`text-[10px] uppercase font-bold ${t.textMuted}`}>Post</p>
        </div>
        <button onClick={() => setFollowListType('followers')} className="text-center">
          <p className={`font-black text-lg ${t.textMain}`}>{followerCount}</p>
          <p className={`text-[10px] uppercase font-bold ${t.textMuted}`}>Followers</p>
        </button>
        <button onClick={() => setFollowListType('following')} className="text-center">
          <p className={`font-black text-lg ${t.textMain}`}>{followingCount}</p>
          <p className={`text-[10px] uppercase font-bold ${t.textMuted}`}>Following</p>
        </button>
      </div>

      {/* Badge grid */}
      <div>
        <p className={`h3 mb-2 ${t.textMuted}`}>Koleksi Badge</p>
        <div className="grid grid-cols-4 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = (profile?.achievements || []).includes(a.id);
            const Icon = a.fallbackIcon;
            return (
              <div key={a.id} title={a.description} className={`flex flex-col items-center gap-1 p-2 rounded-2xl border ${unlocked ? a.borderColor : t.border} ${unlocked ? a.bg : t.bgSunken} ${!unlocked && 'opacity-35'}`}>
                <Icon size={18} className={unlocked ? a.color : t.textMuted} />
                <p className={`text-[8px] font-bold text-center leading-tight ${t.textMuted}`}>{a.title}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preferensi Diet & Alergi */}
      <div className="flex flex-col gap-3">
        <p className={`h3 mb-1 ${t.textMuted}`}>Preferensi Makanan</p>
        
        <div>
          <label className={`text-xs font-bold ${t.textMuted} mb-1.5 block`}>Profil Diet</label>
          <select 
            value={dietProfileInput}
            onChange={(e) => {
              setDietProfileInput(e.target.value);
              saveProfilePatch({ dietProfile: e.target.value });
            }}
            className={`w-full px-3 py-2.5 rounded-xl border-2 font-bold text-sm border-transparent outline-none ${t.inputBg} ${t.textMain}`}
          >
            {DIET_PROFILES.map((dp) => (
              <option key={dp.id} value={dp.id}>{dp.emoji} {dp.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`text-xs font-bold ${t.textMuted} mb-1.5 block`}>Alergi / Intoleransi Makanan</label>
          <input
            type="text"
            value={allergiesInput}
            onChange={(e) => setAllergiesInput(e.target.value)}
            onBlur={() => saveProfilePatch({ allergies: allergiesInput.trim() })}
            placeholder="Misal: Kacang, Seafood, Laktosa..."
            className={`w-full px-3 py-2.5 rounded-xl border-2 font-bold text-sm border-transparent outline-none ${t.inputBg} ${t.textMain}`}
          />
          <p className={`text-[9px] mt-1 font-medium ${t.textMuted}`}>Konteks ini akan dibagikan ke AI Logym.</p>
        </div>
      </div>

      <button
        onClick={async () => { if (await showConfirm('Keluar dari akun?')) onLogout(); }}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-rose-500/10 text-rose-500 font-bold text-sm"
      >
        <LogOut size={16} /> Logout
      </button>

      {followListType && (
        <FollowListModal
          currentUser={logymUser}
          type={followListType}
          isDark={theme === 'dark'}
          t={t}
          onClose={() => { setFollowListType(null); refreshCounts(); }}
        />
      )}

      {cropSourceUrl && (
        <div className="fixed inset-0 z-[2000] bg-black flex flex-col no-swipe">
          <div className="flex items-center justify-between p-4 text-white">
            <button onClick={closeCropper} disabled={isUploading} className="p-2 disabled:opacity-40"><X size={22} /></button>
            <h3 className="font-black text-sm">Atur Foto Profil</h3>
            <button onClick={confirmPhotoUpload} disabled={isUploading || !croppedAreaPixels} className="p-2 disabled:opacity-40">
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Check size={22} className="text-green-400" />}
            </button>
          </div>
          <div className="relative flex-1">
            <Cropper
              image={cropSourceUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
            />
          </div>
          <div className="p-4">
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
