// src/firebaseLogym.js
// Instance Firebase KEDUA di client yang sama, khusus buat Social Hub — connect
// langsung ke project Logym (dulu Lyfit) supaya identitas sosial (post, follow,
// notifikasi, profil) benar-benar 1 ekosistem dengan Logym, bukan feed terpisah.
// Config publik, sama seperti yang dipakai lyfit.app/src/firebase.js sendiri.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const logymConfig = {
  apiKey: "AIzaSyAYCQIrZXFB_J7zp4CkiUQ4OYljw5qaGWo",
  authDomain: "logym-id.firebaseapp.com",
  projectId: "logym-id",
  storageBucket: "logym-id.firebasestorage.app",
  messagingSenderId: "883134437221",
  appId: "1:883134437221:web:8a6579be8747a78b62b38c"
};

const logymApp = initializeApp(logymConfig, "logym");

export const authLogym = getAuth(logymApp);
export const googleProviderLogym = new GoogleAuthProvider();
export const dbLogym = getFirestore(logymApp);
export const storageLogym = getStorage(logymApp);
