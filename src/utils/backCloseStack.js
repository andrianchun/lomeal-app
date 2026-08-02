// ============================================================
// Tumpukan back-close untuk modal/sheet/dialog. Setiap yang lagi kebuka
// "numpuk" satu entri history (lewat pushState, TANPA ganti URL). Tombol
// back — hardware Android, gesture, atau tombol back browser — nutup yang
// paling atas dulu (LIFO), bukan lompat balik ke tab/rute sebelumnya. Kalau
// gak ada modal yang kebuka, back jatuh balik ke behavior normal (navigasi
// react-router / keluar app) — gak disentuh sama sekali karena stack kosong.
//
// Dipakai lewat hooks/useBackClose.js, bukan langsung.
// ============================================================

const stack = [];
// Berapa popstate berikutnya yang KITA sendiri picu (lewat popModal, pas modal
// ditutup lewat tombol X/backdrop) dan harus diabaikan — bukan tombol back beneran.
let suppressCount = 0;
let listenerAttached = false;

const ensureListener = () => {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('popstate', () => {
    if (suppressCount > 0) { suppressCount--; return; }
    const top = stack.pop();
    if (top) top.onClose();
  });
};

// Dipanggil pas modal kebuka. Balikin id (Symbol) buat di-pass ke popModal pas nutup.
export const pushModal = (onClose) => {
  ensureListener();
  const id = Symbol('modal');
  stack.push({ id, onClose });
  window.history.pushState({ lomealModal: true }, '');
  return id;
};

// Dipanggil pas modal DITUTUP LEWAT UI (tombol X, backdrop, dst) — bukan lewat
// tombol back. Entri history dummy tadi masih nyangkut satu di browser, dibuang
// di sini (history.back()) biar tombol back BERIKUTNYA beneran mundur, bukan
// cuma makan entri basi ini. suppressCount mencegah pop balik ini kehitung
// sebagai tombol back beneran dan salah nutup modal LAIN yang masih kebuka.
export const popModal = (id) => {
  const idx = stack.findIndex((entry) => entry.id === id);
  if (idx === -1) return; // udah kepop duluan (misal oleh tombol back), gak usah ngapa-ngapain
  stack.splice(idx, 1);
  // Cuma beresin history kalau posisi SAAT INI masih persis entri dummy yang kita push
  // sendiri. Kalau di antaranya ada navigasi LAIN (mis. pindah tab lewat bottom-nav
  // sebelum modal sempat ditutup manual), entri ini udah ketimbun di belakang navigasi
  // itu — history.back() di sini malah bakal narik user balik ke tab sebelumnya.
  // Diamkan aja; entri basi yang ketinggalan paling banter bikin satu tombol back
  // ke depan "gak ngapa-ngapain" (dikonsumsi diam-diam oleh listener di bawah).
  if (window.history.state?.lomealModal === true) {
    suppressCount++;
    window.history.back();
  }
};

// Dipanggil App.jsx tiap kali RUTE (tab bawah) ganti. Kalau ada modal yang masih
// "kebuka" secara state pas user pindah tab lewat bottom-nav (bukan lewat back/tombol
// tutup modalnya sendiri), state itu direset di sini — biar gak nyisain entri history
// basi yang bisa bikin satu tombol back nanti nyasar balik ke tab ini secara gak sengaja.
export const clearAll = () => {
  const toClose = stack.splice(0, stack.length);
  toClose.forEach((entry) => entry.onClose());
};
