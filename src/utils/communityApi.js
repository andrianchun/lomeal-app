// src/utils/communityApi.js
// Lapisan API Social Hub — SEMUA baca/tulis di sini mengarah ke project Logym
// (dbLogym), BUKAN Firestore Lomeal sendiri. Diporting dari lyfit.app/src/utils/communityApi.js,
// dipangkas: tanpa workout-specific (shareWorkoutToFeed, shareTemplate) — lihat "Yang
// sengaja belum digarap" di rencana. getWeeklyLeaderboard READ-ONLY (buat halo avatar
// top-10) — Lomeal gak nulis skor baru (posting/like di Lomeal gak nambah poin leaderboard,
// itu murni domain aktivitas Logym), cuma nampilin siapa aja yang lagi di collection bersama.
// uid selalu parameter eksplisit (bukan auth.currentUser) — portabel lintas-app.
import { dbLogym } from '../firebaseLogym';
import {
  collection, addDoc, getDocs, getDoc, query, orderBy, limit,
  serverTimestamp, doc, setDoc, updateDoc, deleteDoc,
  increment, where, writeBatch, arrayUnion, arrayRemove
} from 'firebase/firestore';

// ─── Leaderboard (read-only) ──────────────────────────────────────────────────
export const getCurrentWeekId = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}_W${weekNo}`;
};

export const getWeeklyLeaderboard = async () => {
  try {
    const snap = await getDoc(doc(dbLogym, 'leaderboards', getCurrentWeekId()));
    const scores = snap.exists() ? (snap.data().scores || {}) : {};
    return Object.entries(scores)
      .map(([id, val]) => ({ id, name: val.name, photoUrl: val.photoUrl, score: val.score || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (err) {
    console.error('Gagal fetch leaderboard:', err);
    return [];
  }
};

// ─── Community User Registration ────────────────────────────────────────────
export const registerToCommunity = async (userId, userProfile) => {
  if (!userId) return;
  try {
    const userRef = doc(dbLogym, 'community_users', userId);
    await setDoc(userRef, {
      name: userProfile.name || 'Pengguna',
      photoUrl: userProfile.photoUrl || '',
      lastActive: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error("Gagal update profil komunitas:", err);
  }
};

// ─── Create Community Post ────────────────────────────────────────────────────
// postData.type: 'user_post' | 'recipe' | 'achievement' | 'repost'
export const createCommunityPost = async (userId, userName, userPhoto, postData) => {
  try {
    const docRef = await addDoc(collection(dbLogym, 'community_posts'), {
      userId,
      userName: userName || 'Anonim',
      userPhoto: userPhoto || null,
      sourceApp: 'lomeal',
      type: postData.type || 'user_post',
      text: postData.text || '',
      imageUrls: postData.imageUrls || [],
      // Post resep (khusus Lomeal): nama resep + ringkasan gizi, bukan skema program Logym.
      recipeName: postData.recipeName || null,
      recipeData: postData.recipeData || null,
      originalPostId: postData.originalPostId || null,
      originalUserId: postData.originalUserId || null,
      originalUserName: postData.originalUserName || 'Anonim',
      originalUserPhoto: postData.originalUserPhoto || null,
      originalText: postData.originalText || '',
      originalImageUrls: postData.originalImageUrls || [],
      originalType: postData.originalType || null,
      originalSourceApp: postData.originalSourceApp || null,
      timestamp: serverTimestamp(),
      likes: 0,
      likedBy: [],
      commentCount: 0,
    });
    if (postData.type === 'repost' && postData.originalUserId && postData.originalUserId !== userId) {
      await sendNotification(postData.originalUserId, { type: 'repost', fromUserId: userId, fromUserName: userName, fromUserPhoto: userPhoto, postId: postData.originalPostId });
    }
    return docRef.id;
  } catch (err) {
    console.error("Gagal membuat postingan:", err);
    throw err;
  }
};

// ─── Update Post ──────────────────────────────────────────────────────────────
export const updatePost = async (postId, { text, imageUrls }) => {
  try {
    const ref = doc(dbLogym, 'community_posts', postId);
    await updateDoc(ref, { text, imageUrls });
  } catch (err) {
    console.error("Gagal update post:", err);
    throw err;
  }
};

// ─── Delete Post ──────────────────────────────────────────────────────────────
export const deletePost = async (postId) => {
  try {
    await deleteDoc(doc(dbLogym, 'community_posts', postId));
  } catch (err) {
    console.error("Gagal hapus post:", err);
    throw err;
  }
};

// ─── Toggle Like ──────────────────────────────────────────────────────────────
export const toggleLike = async (postId, userId, postOwnerId, fromUserName = null, fromUserPhoto = null) => {
  const postRef = doc(dbLogym, 'community_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return;
  const liked = (snap.data().likedBy || []).includes(userId);

  if (liked) {
    await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(userId) });
  } else {
    await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(userId) });
    if (postOwnerId && postOwnerId !== userId) {
      await sendNotification(postOwnerId, { type: 'like', fromUserId: userId, fromUserName, fromUserPhoto, postId });
    }
  }
  return !liked;
};

// --- Repost -------------------------------------------------------------------
export const repostPost = async (userId, userName, userPhoto, originalPost, caption = '') => {
  try {
    const docRef = await addDoc(collection(dbLogym, 'community_posts'), {
      userId,
      userName: userName || 'Anonim',
      userPhoto: userPhoto || null,
      sourceApp: 'lomeal',
      type: 'repost',
      originalPostId: originalPost.id,
      originalUserId: originalPost.userId || null,
      originalUserName: originalPost.userName || 'Anonim',
      originalUserPhoto: originalPost.userPhoto || null,
      originalText: originalPost.text || '',
      originalImageUrls: originalPost.imageUrls || [],
      originalType: originalPost.type || null,
      originalSourceApp: originalPost.sourceApp || null,
      text: caption,
      timestamp: serverTimestamp(),
      likes: 0,
      likedBy: [],
      commentCount: 0,
    });
    if (originalPost.userId !== userId) {
      await sendNotification(originalPost.userId, { type: 'repost', fromUserId: userId, fromUserName: userName, fromUserPhoto: userPhoto, postId: originalPost.id });
    }
    return docRef.id;
  } catch (err) {
    console.error("Gagal repost:", err);
    throw err;
  }
};

// --- Comments -----------------------------------------------------------------
export const addComment = async (postId, { userId, userName, userPhoto, text }, postOwnerId) => {
  try {
    const ref = collection(dbLogym, 'community_posts', postId, 'comments');
    await addDoc(ref, { userId, userName: userName || 'Anonim', userPhoto: userPhoto || null, text, timestamp: serverTimestamp() });
    await updateDoc(doc(dbLogym, 'community_posts', postId), { commentCount: increment(1) });
    if (postOwnerId && postOwnerId !== userId) {
      await sendNotification(postOwnerId, { type: 'comment', fromUserId: userId, fromUserName: userName, fromUserPhoto: userPhoto, postId });
    }
  } catch (err) {
    console.error("Gagal tambah komentar:", err);
    throw err;
  }
};

export const getComments = async (postId) => {
  try {
    const q = query(collection(dbLogym, 'community_posts', postId, 'comments'), orderBy('timestamp', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Gagal fetch komentar:", err);
    return [];
  }
};

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getGlobalFeed = async (limitCount = 30) => {
  try {
    const q = query(collection(dbLogym, 'community_posts'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Gagal fetch feed:", err);
    return [];
  }
};

export const getFollowingFeed = async (followingIds = [], limitCount = 30) => {
  if (!followingIds || followingIds.length === 0) return [];
  try {
    const chunks = [];
    for (let i = 0; i < followingIds.length; i += 30) {
      chunks.push(followingIds.slice(i, i + 30));
    }

    let allPosts = [];
    for (const chunk of chunks) {
      try {
        const q = query(collection(dbLogym, 'community_posts'), where('userId', 'in', chunk), orderBy('timestamp', 'desc'), limit(limitCount));
        const snap = await getDocs(q);
        allPosts = [...allPosts, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
      } catch (err) {
        console.warn("Fallback getFollowingFeed (unindexed):", err);
        const q = query(collection(dbLogym, 'community_posts'), where('userId', 'in', chunk), limit(100));
        const snap = await getDocs(q);
        allPosts = [...allPosts, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))];
      }
    }

    return allPosts
      .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))
      .slice(0, limitCount);
  } catch (err) {
    console.error("Gagal fetch following feed:", err);
    return [];
  }
};

export const getUserPosts = async (userId, limitCount = 30) => {
  try {
    const q = query(collection(dbLogym, 'community_posts'), where('userId', '==', userId), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    try {
      const q = query(collection(dbLogym, 'community_posts'), where('userId', '==', userId), limit(200));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))
        .slice(0, limitCount);
    } catch (err2) {
      console.error("Gagal fetch user posts:", err2);
      return [];
    }
  }
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const sendNotification = async (toUserId, { type, fromUserId, fromUserName = null, fromUserPhoto = null, postId = null }) => {
  if (!toUserId || !fromUserId) return;
  try {
    await addDoc(collection(dbLogym, 'notifications'), {
      toUserId, type, fromUserId, fromUserName, fromUserPhoto, postId, read: false, createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Gagal kirim notifikasi:", err);
  }
};

export const getNotifications = async (userId, limitCount = 30) => {
  try {
    const q = query(collection(dbLogym, 'notifications'), where('toUserId', '==', userId), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    try {
      const q = query(collection(dbLogym, 'notifications'), where('toUserId', '==', userId), limit(200));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        .slice(0, limitCount);
    } catch (err2) {
      console.error("Gagal fetch notifikasi:", err2);
      return [];
    }
  }
};

export const markNotificationsRead = async (userId) => {
  try {
    const q = query(collection(dbLogym, 'notifications'), where('toUserId', '==', userId), where('read', '==', false));
    const snap = await getDocs(q);
    const batch = writeBatch(dbLogym);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (err) {
    console.error("Gagal mark notifikasi:", err);
  }
};

export const shareAchievementToFeed = async (userId, userName, userPhoto, achievement) => {
  try {
    const docRef = await addDoc(collection(dbLogym, 'community_posts'), {
      type: 'achievement', userId, userName: userName || 'Anonim',
      userPhoto: userPhoto || null,
      sourceApp: 'lomeal',
      achievementId: achievement.id, achievementTitle: achievement.title,
      likes: 0, likedBy: [], commentCount: 0,
      timestamp: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.error("Gagal share achievement:", err);
    return null;
  }
};

// ─── Update User Profile in Feed ──────────────────────────────────────────────
export const updateUserProfileInFeed = async (userId, newName, newPhoto, newUsername, newGender, newAge) => {
  if (!userId) return;
  try {
    const userRef = doc(dbLogym, 'community_users', userId);
    const userUpdate = {};
    if (newName !== undefined) userUpdate.name = newName;
    if (newPhoto !== undefined) userUpdate.photoUrl = newPhoto;
    if (newUsername !== undefined) userUpdate.username = newUsername;
    if (newGender !== undefined) userUpdate.gender = newGender;
    if (newAge !== undefined) userUpdate.age = newAge;
    if (Object.keys(userUpdate).length > 0) {
      await setDoc(userRef, userUpdate, { merge: true });
    }

    const postsQuery = query(collection(dbLogym, 'community_posts'), where('userId', '==', userId));
    const snap = await getDocs(postsQuery);

    const postUpdate = {};
    if (newName !== undefined) postUpdate.userName = newName;
    if (newPhoto !== undefined) postUpdate.userPhoto = newPhoto;

    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(dbLogym);
      snap.docs.slice(i, i + 450).forEach((d) => batch.update(d.ref, postUpdate));
      await batch.commit();
    }
  } catch (err) {
    console.error('Gagal update user profile in feed:', err);
  }
};

export const searchUsers = async (searchQuery) => {
  if (!searchQuery) return [];
  const qStr = searchQuery.toLowerCase().replace(/^@/, '').trim();
  if (!qStr) return [];

  try {
    const usersRef = collection(dbLogym, 'community_users');
    const resultsMap = new Map();

    const usernameQ = query(usersRef, where('username', '>=', qStr), where('username', '<=', qStr + ''), limit(10));
    const snap1 = await getDocs(usernameQ);
    snap1.forEach(d => {
      const data = d.data();
      resultsMap.set(d.id, { id: d.id, name: data.name || 'Pengguna', photoUrl: data.photoUrl || data.photoURL || null, username: data.username || null });
    });

    const capitalizedQ = qStr.charAt(0).toUpperCase() + qStr.slice(1);
    const nameQ = query(usersRef, where('name', '>=', capitalizedQ), where('name', '<=', capitalizedQ + ''), limit(10));
    const snap2 = await getDocs(nameQ);
    snap2.forEach(d => {
      if (!resultsMap.has(d.id)) {
        const data = d.data();
        resultsMap.set(d.id, { id: d.id, name: data.name || 'Pengguna', photoUrl: data.photoUrl || data.photoURL || null, username: data.username || null });
      }
    });

    return Array.from(resultsMap.values());
  } catch (err) {
    console.error("Gagal search user:", err);
    return [];
  }
};
