// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Project Firebase Lomeal sendiri (terpisah dari project Logym/Lyfit).
const firebaseConfig = {
  apiKey: "AIzaSyBLaRlhZVjhW1MVC6dMc99Klpb974ii7Pg",
  authDomain: "lomeal-id.firebaseapp.com",
  projectId: "lomeal-id",
  storageBucket: "lomeal-id.firebasestorage.app",
  messagingSenderId: "11383668276",
  appId: "1:11383668276:web:19e9ee9f6388e7e4ae1461"
};

// Menyalakan Mesin
const app = initializeApp(firebaseConfig);

// Menyalakan Fitur Login/Register
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Menyalakan Fitur Database Master dengan Offline Persistence Aktif (PWA)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const storage = getStorage(app);

// Backend proxy AI (Cloud Functions region Jakarta) — aktif setelah Functions di-deploy ke lomeal-id.
export const functions = getFunctions(app, "asia-southeast2");