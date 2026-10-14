import React from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { RefreshCw, RotateCcw, AlertTriangle, ShieldAlert, Copy, Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export default class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
      isRepeatedCrash: false,
      isRecovering: false,
      recoveryStatus: '',
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Jalankan callback penahan appReady (mis. batalkan timer notifyAppReady Capgo)
    try {
      this.props.onCatch?.(error, errorInfo);
    } catch (e) {
      console.error('onCatch callback error:', e);
    }

    this.setState({ errorInfo });
    console.error('RootErrorBoundary caught unhandled error:', error, errorInfo);

    // Deteksi crash loop (misal reload 2x berturut-turut dalam 45 detik)
    try {
      const now = Date.now();
      const raw = sessionStorage.getItem('lomeal_crash_history');
      let crashes = raw ? JSON.parse(raw) : [];
      crashes = crashes.filter(ts => (now - ts) < 45000);
      crashes.push(now);
      sessionStorage.setItem('lomeal_crash_history', JSON.stringify(crashes));
      if (crashes.length >= 2) {
        this.setState({ isRepeatedCrash: true });
      }
    } catch (_) {}
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCache = () => {
    try {
      sessionStorage.clear();
      // Bersihkan cache tampilan & pencarian di localStorage, TAPI jaga sesi auth Firebase
      const authEntries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('firebase:authUser') || k.startsWith('lomeal_dismissed_ota'))) {
          authEntries.push({ key: k, value: localStorage.getItem(k) });
        }
      }
      localStorage.clear();
      authEntries.forEach(item => {
        try { localStorage.setItem(item.key, item.value); } catch (_) {}
      });
    } catch (err) {
      console.warn('Gagal membersihkan cache lokal:', err);
    }
    window.location.reload();
  };

  handleRollback = async () => {
    if (this.state.isRecovering) return;
    this.setState({ isRecovering: true, recoveryStatus: 'Sedang memulihkan versi stabil...' });

    try {
      if (Capacitor.isNativePlatform()) {
        // Reset OTA Capgo ke bundle bawaan APK awal
        await CapacitorUpdater.reset();
        await CapacitorUpdater.reload();
        return;
      }

      // Browser / PWA: lepas service worker & hapus cache
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          await caches.delete(k);
        }
      }
      window.location.href = window.location.origin + '?reset=' + Date.now();
    } catch (err) {
      console.error('Rollback error:', err);
      this.setState({ recoveryStatus: 'Gagal otomatis, memuat ulang...' });
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  handleCopyReport = async () => {
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
    const report = [
      '=== LAPORAN DIAGNOSTIK LOMEAL ===',
      `Waktu: ${new Date().toLocaleString('id-ID')}`,
      `Versi Aplikasi: v${version}`,
      `Platform: ${Capacitor.getPlatform()}`,
      `URL: ${window.location.href}`,
      `User Agent: ${navigator.userAgent}`,
      `Pesan Error: ${this.state.error?.name || 'Error'}: ${this.state.error?.message || String(this.state.error)}`,
      '\n--- Component Stack ---',
      this.state.errorInfo?.componentStack || '(tidak ada)',
      '\n--- Stack Trace ---',
      this.state.error?.stack || '(tidak ada)',
      '================================='
    ].join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const ta = document.createElement('textarea');
        ta.value = report;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (err) {
      console.warn('Salin diagnostik gagal:', err);
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.3.37';

    return (
      <div className="min-h-screen bg-[#070a08] text-zinc-100 flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden select-none">
        {/* Ambient background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 80% 50% at 20% -10%, rgba(34,197,94,0.18), transparent 60%),
              radial-gradient(ellipse 60% 40% at 85% 100%, rgba(21,128,61,0.15), transparent 60%)
            `,
          }}
        />

        {/* Enterprise Card Container */}
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/85 backdrop-blur-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6">
          {/* Top Bar / Branding */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-dark.webp"
                alt="Lomeal"
                className="h-6 w-auto object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span className="font-bold text-sm tracking-tight text-white">Lomeal</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Pusat Pemulihan
              </span>
              <span className="text-[11px] font-mono text-zinc-500">v{version}</span>
            </div>
          </div>

          {/* Hero Status */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
              <ShieldAlert size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                Aplikasi Terhenti Sejenak
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mt-1">
                Sistem mendeteksi kendala pada tampilan antarmuka. Tenang, seluruh catatan makanan, riwayat nutrisi, dan data akun Anda tetap tersimpan aman di cloud.
              </p>
            </div>
          </div>

          {/* Repeated crash notice */}
          {this.state.isRepeatedCrash && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200 leading-relaxed">
                Terdeteksi pemuatan ulang berulang kali. Kami menyarankan menggunakan tombol <strong className="text-white">Pulihkan ke Versi Stabil</strong> agar aplikasi kembali normal.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            {/* Primary: Muat Ulang */}
            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-950/40 active:scale-[0.98] transition-all cursor-pointer"
            >
              <RefreshCw size={17} className="stroke-[2.5]" />
              <span>Muat Ulang Aplikasi</span>
            </button>

            {/* Secondary: Rollback Versi Stabil */}
            <button
              onClick={this.handleRollback}
              disabled={this.state.isRecovering}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 font-semibold text-xs sm:text-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw size={16} className="text-amber-400" />
              <span>
                {this.state.isRecovering
                  ? this.state.recoveryStatus || 'Sedang Memulihkan...'
                  : 'Pulihkan ke Versi Stabil (Rollback)'}
              </span>
            </button>

            {/* Micro Actions: Clear Cache & Copy Report */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={this.handleClearCache}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-zinc-800 active:scale-[0.97] transition-all cursor-pointer"
              >
                <Trash2 size={14} className="text-zinc-500" />
                <span>Bersihkan Cache</span>
              </button>

              <button
                onClick={this.handleCopyReport}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-zinc-800 active:scale-[0.97] transition-all cursor-pointer"
              >
                {this.state.copied ? (
                  <>
                    <Check size={14} className="text-emerald-400 stroke-[2.5]" />
                    <span className="text-emerald-400 font-bold">Laporan Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-zinc-500" />
                    <span>Salin Laporan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Technical Details Accordion */}
          <div className="border-t border-zinc-800/80 pt-3">
            <button
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              className="w-full flex items-center justify-between text-xs text-zinc-500 hover:text-zinc-400 transition-colors py-1 cursor-pointer select-none"
            >
              <span>Informasi Diagnostik Pengembang</span>
              {this.state.showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {this.state.showDetails && (
              <div className="mt-2.5 p-3.5 rounded-xl bg-black/60 border border-zinc-800 text-[11px] font-mono text-zinc-400 whitespace-pre-wrap max-h-48 overflow-y-auto select-text leading-relaxed">
                <div className="text-rose-400 font-semibold mb-1">
                  {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
                </div>
                {this.state.error?.stack && (
                  <div className="text-zinc-500 text-[10px] mb-2">{this.state.error.stack}</div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div className="text-zinc-600 text-[10px] border-t border-zinc-800/80 pt-1.5">
                    {this.state.errorInfo.componentStack}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
