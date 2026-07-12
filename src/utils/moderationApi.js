// src/utils/moderationApi.js — Social Hub, semua baca/tulis ke project Logym (dbLogym).
// Diporting dari lyfit.app/src/utils/moderationApi.js, dipangkas: TANPA fungsi admin
// (banUserGlobal/unbanUserGlobal/getBannedUsers) — panel moderasi admin di luar scope
// pass ini, cuma fungsi lapor (report) yang dibawa.
import { dbLogym } from '../firebaseLogym';
import { collection, addDoc, getDoc, doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';

export const BAD_WORDS = [
    // INDONESIA
    'anjing', 'babi', 'monyet', 'bangsat', 'bajingan', 'kontol', 'memek', 'jembut',
    'ngentot', 'ngewe', 'perek', 'lonte', 'pelacur', 'jablay', 'tolol', 'goblok',
    'bego', 'dungu', 'idiot', 'peler', 'pepek', 'pantat', 'titit', 'tete', 'tetek',
    'payudara', 'silit', 'bokong', 'itil', 'toket', 'bgst', 'anjg', 'anj', 'ajg',
    'kntl', 'mmk', 'gblk', 'jancok', 'jancuk', 'cok', 'diancuk', 'ancur', 'asu',
    'kampret', 'keparat', 'ngehe', 'tai', 'taik', 'eek', 'berak', 'sialan', 'brengsek',
    'setan', 'iblis', 'peli', 'kentu', 'tempik', 'turuk', 'pukimak', 'kimak', 'pantek',
    // ENGLISH
    'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'motherfucker',
    'bastard', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'cock', 'boobs',
    'tits', 'porn', 'sex', 'nude', 'naked', 'blowjob', 'handjob', 'cum'
];

export const containsBadWords = (text) => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    const words = lowerText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").split(/\s+/);
    return words.some(word => BAD_WORDS.includes(word));
};

export const censorBadWords = (text) => {
    if (!text) return text;
    let result = text;
    BAD_WORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(regex, '*'.repeat(word.length));
    });
    return result;
};

export const reportPost = async (postId, reporterId, reason) => {
    try {
        await addDoc(collection(dbLogym, 'community_reports'), {
            type: 'post', targetId: postId, reporterId, reason, timestamp: serverTimestamp()
        });
        const postRef = doc(dbLogym, 'community_posts', postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            const currentReports = (postSnap.data().reportCount || 0) + 1;
            const updateData = { reportCount: increment(1) };
            if (currentReports >= 3) updateData.isHidden = true;
            await updateDoc(postRef, updateData);
        }
        const localHidden = JSON.parse(localStorage.getItem('lomeal_hidden_posts') || '[]');
        if (!localHidden.includes(postId)) {
            localHidden.push(postId);
            localStorage.setItem('lomeal_hidden_posts', JSON.stringify(localHidden));
        }
        return true;
    } catch (err) {
        console.error("Gagal melapor postingan:", err);
        return false;
    }
};

export const reportUser = async (targetUserId, reporterId, reason) => {
    try {
        await addDoc(collection(dbLogym, 'community_reports'), {
            type: 'user', targetId: targetUserId, reporterId, reason, timestamp: serverTimestamp()
        });
        const localBlocked = JSON.parse(localStorage.getItem('lomeal_blocked_users_local') || '[]');
        if (!localBlocked.includes(targetUserId)) {
            localBlocked.push(targetUserId);
            localStorage.setItem('lomeal_blocked_users_local', JSON.stringify(localBlocked));
        }
        return true;
    } catch (err) {
        console.error("Gagal melapor pengguna:", err);
        return false;
    }
};

export const getLocalHiddenPosts = () => {
    try {
        const res = JSON.parse(localStorage.getItem('lomeal_hidden_posts'));
        return Array.isArray(res) ? res : [];
    } catch { return []; }
};

export const getLocalBlockedUsers = () => {
    try {
        const res = JSON.parse(localStorage.getItem('lomeal_blocked_users_local'));
        return Array.isArray(res) ? res : [];
    } catch { return []; }
};
