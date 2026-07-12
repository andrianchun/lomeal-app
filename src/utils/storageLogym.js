// src/utils/storageLogym.js — upload ke Firebase Storage project Logym (storageLogym),
// dipakai Social Hub (foto post, avatar) supaya 1 identitas foto dengan Logym.
import { storageLogym } from '../firebaseLogym';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const uploadImageToFirebase = async (file, path) => {
  try {
    const storageRef = ref(storageLogym, path);
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
    await deleteObject(ref(storageLogym, url));
  } catch (error) {
    console.warn("Gagal hapus gambar lama:", error);
  }
};
