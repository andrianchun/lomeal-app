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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Jangan laporkan bundle ini sehat ke Capgo — biar rollback otomatis bisa menyelamatkan
    // user dari bundle yang crash, daripada mereka harus hapus data aplikasi manual.
    blockAppReady();
    this.setState({ errorInfo });
    console.error("React Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: 'black', color: 'red', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
          <p style={{ color: '#fca5a5', lineHeight: 1.5 }}>
            Coba muat ulang dulu. Kalau tetap gagal, tutup paksa aplikasinya lalu buka lagi —
            versi yang bermasalah akan dikembalikan otomatis ke versi sebelumnya.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '10px 18px', margin: '8px 0 16px', borderRadius: 12, border: '1px solid #ef4444', background: '#ef4444', color: 'white', fontWeight: 700 }}
          >
            Muat Ulang
          </button>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)