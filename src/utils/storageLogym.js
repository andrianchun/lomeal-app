// src/utils/storageLogym.js — upload ke Firebase Storage, dipakai Social Hub (foto post, avatar).
// Lomeal & Logym satu project Storage bareng sekarang (hexa-life) — tinggal pakai `storage` utama.
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const uploadImageToFirebase = async (file, path) => {
  try {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error("Firebase Storage upload error:", error);
    throw new Error(error.message || "Gagal mengunggah gambar ke Firebase Storage");
  }
};

export const deleteImageFromFirebase = async (url) => {
  try {
    if (!url || !url.includes('firebasestorage')) return;
    await deleteObject(ref(storage, url));
  } catch (error) {
    console.warn("Gagal hapus gambar lama:", error);
  }
};
