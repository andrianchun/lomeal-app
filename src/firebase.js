// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Lomeal dimigrasi dari project sendiri (lomeal-id) ke hexa-life — project Firebase yang sama
// kayak Darka/Domus/Logym, biar semua ekosistem "seamless" dalam 1 database. Data lama Lomeal
// disalin ke collection prefix `lomeal_*`, Logym ke `logym_*` (lihat firestore.rules di darka-app).
const firebaseConfig = {
  apiKey: 'AIzaSyBeeFfLIqvDEZFyY8fknqnV_IoQj6Z9M1s',
  authDomain: 'hexa-life.firebaseapp.com',
  projectId: 'hexa-life',
  storageBucket: 'hexa-life.firebasestorage.app',
  messagingSenderId: '545194651453',
  appId: '1:545194651453:web:03ba7d49e200467ffb1f54',
};

// Menyalakan Mesin
const app = initializeApp(firebaseConfig);

// Menyalakan Fitur Login/Register
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Menyalakan Fitur Database Master dengan Offline Persistence Aktif (PWA)
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const storage = getStorage(app);

// Backend proxy Lomy (Cloud Functions region Jakarta) — aktif setelah aiChat/aiVision (dari
// lomeal-id/functions) ikut dipindah & di-deploy ke hexa-life.
export const functions = getFunctions(app, "asia-southeast2");