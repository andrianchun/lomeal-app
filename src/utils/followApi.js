// src/utils/followApi.js — Social Hub, baca/tulis ke collection `logym_*` di project hexa-life.
// Diporting apa adanya dari lyfit.app/src/utils/followApi.js.
import { db } from '../firebase';
import {
  collection, getDocs, query, doc, setDoc, updateDoc, deleteDoc,
  where, increment, getDoc, serverTimestamp
} from 'firebase/firestore';
import { sendNotification } from './communityApi';

// ─── Follow ───────────────────────────────────────────────────────────────────
export const followUser = async (followerId, followingId, followerName, followerPhoto) => {
  if (!followerId || !followingId || followerId === followingId) return;
  try {
    const ref = doc(db, 'logym_follows', `${followerId}_${followingId}`);
    await setDoc(ref, { followerId, followingId, createdAt: serverTimestamp() });
    await updateDoc(doc(db, 'logym_community_users', followerId), { followingCount: increment(1) }).catch(() => {});
    await updateDoc(doc(db, 'logym_community_users', followingId), { followerCount: increment(1) }).catch(() => {});
    await sendNotification(followingId, { type: 'follow', fromUserId: followerId, fromUserName: followerName, fromUserPhoto: followerPhoto });
  } catch (err) {
    console.error("Gagal follow:", err);
    throw err;
  }
};

export const unfollowUser = async (followerId, followingId) => {
  try {
    await deleteDoc(doc(db, 'logym_follows', `${followerId}_${followingId}`));
    await updateDoc(doc(db, 'logym_community_users', followerId), { followingCount: increment(-1) }).catch(() => {});
    await updateDoc(doc(db, 'logym_community_users', followingId), { followerCount: increment(-1) }).catch(() => {});
  } catch (err) {
    console.error("Gagal unfollow:", err);
    throw err;
  }
};

export const isFollowing = async (followerId, followingId) => {
  try {
    const snap = await getDoc(doc(db, 'logym_follows', `${followerId}_${followingId}`));
    return snap.exists();
  } catch {
    return false;
  }
};

export const getFollowingIds = async (userId) => {
  try {
    const q = query(collection(db, 'logym_follows'), where('followerId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data().followingId);
  } catch {
    return [];
  }
};

export const getFollowerCount = async (userId) => {
  try {
    const q = query(collection(db, 'logym_follows'), where('followingId', '==', userId));
    const snap = await getDocs(q);
    return snap.size;
  } catch { return 0; }
};

export const getFollowingCount = async (userId) => {
  try {
    const q = query(collection(db, 'logym_follows'), where('followerId', '==', userId));
    const snap = await getDocs(q);
    return snap.size;
  } catch { return 0; }
};

// ─── Follower/Following Lists ─────────────────────────────────────────────────
export const getFollowerList = async (userId) => {
  try {
    const q = query(collection(db, 'logym_follows'), where('followingId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.data().followerId, ...d.data() }));
  } catch { return []; }
};

export const getFollowingList = async (userId) => {
  try {
    const q = query(collection(db, 'logym_follows'), where('followerId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.data().followingId, ...d.data() }));
  } catch { return []; }
};

// ─── Block ────────────────────────────────────────────────────────────────────
export const blockUser = async (blockerId, blockedId) => {
  try {
    await setDoc(doc(db, 'logym_blocks', `${blockerId}_${blockedId}`), {
      blockerId, blockedId, createdAt: serverTimestamp()
    });
    await deleteDoc(doc(db, 'logym_follows', `${blockerId}_${blockedId}`)).catch(() => {});
    await deleteDoc(doc(db, 'logym_follows', `${blockedId}_${blockerId}`)).catch(() => {});
  } catch (err) { console.error('Gagal block:', err); throw err; }
};

export const unblockUser = async (blockerId, blockedId) => {
  try {
    await deleteDoc(doc(db, 'logym_blocks', `${blockerId}_${blockedId}`));
  } catch (err) { console.error('Gagal unblock:', err); throw err; }
};

export const isBlocked = async (blockerId, blockedId) => {
  try {
    const snap = await getDoc(doc(db, 'logym_blocks', `${blockerId}_${blockedId}`));
    return snap.exists();
  } catch { return false; }
};

export const getBlockedList = async (userId) => {
  try {
    const q = query(collection(db, 'logym_blocks'), where('blockerId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data().blockedId);
  } catch { return []; }
};
