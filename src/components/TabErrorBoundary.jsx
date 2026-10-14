import React from 'react';
import { AlertCircle, RotateCcw, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

export default class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(`TabErrorBoundary [${this.props.tabName || 'Tab'}] error:`, error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Jika props tabName atau children key berubah (misal user beralih tab lalu kembali), reset error
    if (prevProps.tabName !== this.props.tabName && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorInfo: null, copied: false, showDetails: false });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false, showDetails: false });
  };

  handleCopy = async () => {
    const report = [
      `=== KENDALA TAB ${this.props.tabName || 'LOMEAL'} ===`,
      `Waktu: ${new Date().toLocaleString('id-ID')}`,
      `Tab: ${this.props.tabName || 'Umum'}`,
      `Error: ${this.state.error?.name || 'Error'}: ${this.state.error?.message || String(this.state.error)}`,
      '\n--- Component Stack ---',
      this.state.errorInfo?.componentStack || '(tidak ada)',
      '\n--- Stack Trace ---',
      this.state.error?.stack || '(tidak ada)',
      '==================================='
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
    } catch (_) {}
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const name = this.props.tabName || 'Halaman';

    return (
      <div className="w-full max-w-lg mx-auto my-8 px-4 py-8">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-xl p-6 sm:p-7 shadow-2xl text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
            <AlertCircle size={24} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Tampilan {name} Mengalami Kendala
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Data Anda tetap tersimpan aman di cloud. Anda dapat memuat ulang tampilan ini, atau membuka menu lain melalui bilah navigasi di bawah.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full max-w-xs mt-1">
            <button
              onClick={this.handleRetry}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-950/40 active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw size={14} className="stroke-[2.5]" />
              <span>Muat Ulang</span>
            </button>

            <button
              onClick={this.handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-semibold text-xs active:scale-95 transition-all cursor-pointer"
            >
              {this.state.copied ? (
                <>
                  <Check size={14} className="text-emerald-400 stroke-[2.5]" />
                  <span className="text-emerald-400 font-bold">Disalin</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-zinc-500" />
                  <span>Salin Info</span>
                </>
              )}
            </button>
          </div>

          {/* Collapsible Tech Details */}
          <div className="w-full border-t border-zinc-800/80 pt-3 mt-1">
            <button
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              className="w-full flex items-center justify-between text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors py-0.5 cursor-pointer select-none"
            >
              <span>Rincian Teknis</span>
              {this.state.showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {this.state.showDetails && (
              <div className="mt-2 p-3 rounded-xl bg-black/60 border border-zinc-800 text-[10px] font-mono text-zinc-400 text-left whitespace-pre-wrap max-h-36 overflow-y-auto select-text leading-relaxed">
                <div className="text-rose-400 font-semibold mb-1">
                  {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
                </div>
                {this.state.error?.stack && (
                  <div className="text-zinc-500 text-[9px]">{this.state.error.stack}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
