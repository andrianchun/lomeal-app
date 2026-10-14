import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import App from './App.jsx'
import './index.css'

// WAJIB dipanggil dalam appReadyTimeout Capgo (default 10 DETIK) sesudah bundle OTA
// baru boot, atau Capgo mengira update-nya gagal/nge-crash dan ROLLBACK OTOMATIS ke
// bundle sebelumnya di peluncuran berikutnya — diam-diam, tanpa error yang kelihatan.
//
// Dulu panggilan ini nunggu AppContent mount (login selesai + profil Firestore kebaca —
// db pakai memoryLocalCache, jadi WAJIB round-trip jaringan tiap cold start, gampang lewat
// 10 detik di koneksi lambat). Itu bikin update APK kerasa "gak nempel". Lalu dipindah ke
// paling awal, sebelum React render — dan itu MEMATIKAN rollback-nya: bundle yang crash pun
// tetap dilaporkan sehat, jadi user terjebak di app blank tanpa jalur OTA sama sekali.
//
// Sekarang jalan tengahnya: laporkan sehat lewat timer tetap 7 detik (selalu di bawah batas
// 10 detik, tidak nunggu auth maupun jaringan), TAPI ErrorBoundary membatalkannya kalau app
// keburu crash. Crash cepat → tidak pernah dilaporkan sehat → Capgo rollback sendiri.
const READY_DELAY_MS = 7000;
let readyTimer = null;
let readyBlocked = false;

const markAppReady = () => {
  if (readyBlocked || !Capacitor.isNativePlatform()) return;
  CapacitorUpdater.notifyAppReady();
};

const blockAppReady = () => {
  readyBlocked = true;
  clearTimeout(readyTimer);
};

if (Capacitor.isNativePlatform()) {
  readyTimer = setTimeout(markAppReady, READY_DELAY_MS);
}
import RootErrorBoundary from './components/RootErrorBoundary.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary onCatch={blockAppReady}>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)