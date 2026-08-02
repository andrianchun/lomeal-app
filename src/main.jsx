import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import App from './App.jsx'
import './index.css'

// WAJIB dipanggil dalam appReadyTimeout Capgo (default 10 DETIK) sesudah bundle OTA
// baru boot, atau Capgo mengira update-nya gagal/nge-crash dan ROLLBACK OTOMATIS ke
// bundle sebelumnya di peluncuran berikutnya — diam-diam, tanpa error yang kelihatan.
// Dulu panggilan ini nunggu AppContent mount (login selesai + profil Firestore
// kebaca — db pakai memoryLocalCache, jadi WAJIB round-trip jaringan tiap cold start,
// gampang lewat 10 detik di koneksi lambat). Sekarang dipanggil di sini, paling awal
// mungkin, SEBELUM nunggu apa pun — ini yang bikin update APK kerasa "gak nempel"
// dan user ngira harus hapus cache/data biar update kepasang.
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady();
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
    this.setState({ errorInfo });
    console.error("React Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: 'black', color: 'red', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
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