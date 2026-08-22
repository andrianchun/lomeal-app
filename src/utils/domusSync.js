import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, setDoc, addDoc, getDocs, runTransaction, arrayUnion } from 'firebase/firestore';
import { deductStock } from './stockConverter.js';

// Pencocokan nama bahan pindah ke modul murni (bisa dites tanpa Firestore) — di-re-export dari
// sini supaya pemanggil lama gak perlu diubah.
export { matchDomusItem } from './recipeStock.js';

export async function fetchDomusItems(uid) {
  const q = query(collection(db, 'domus_items'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => i.isFood && !i.discardedAt && !i.consumedAt);
}

export function subscribeDomusItems(uid, cb) {
  const q = query(collection(db, 'domus_items'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    // `isFood` = flag "kebaca Lomeal", dicentang di Domus (defaultnya ikut jenis lokasi).
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((i) => i.isFood && !i.discardedAt && !i.consumedAt);
    cb(items);
  }, (err) => console.error('[domus_items] error:', err));
}

export function subscribeDomusLocations(uid, cb) {
  const q = query(collection(db, 'domus_locations'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[domus_locations] error:', err));
}

/**
 * Stoknya habis — barangnya TETAP ADA.
 *
 * Dulu ini nulis `consumedAt` (namanya `markDomusItemConsumed`), dan itu mensiunin entitasnya di
 * Domus: barang pensiun gak keitung calon tujuan waktu belanjaan dari Darka masuk, jadi belanjaan
 * berikutnya bikin barang KEMBAR dan riwayat harganya kepecah dua. Nol itu keadaan barang, bukan
 * akhir hidupnya — lihat domus-app/model-barang.md. Yang beneran nyingkirin barang cuma
 * `discardDomusItem` di bawah.
 */
export async function zeroDomusItemStock(id) {
  await updateDoc(doc(db, 'domus_items', id), {
    qtyValue: 0,
    quantity: '0',
    status: 'Habis',
  });
}

/**
 * Barang disingkirkan beneran → masuk KOTAK SAMPAH Domus, bukan lenyap. Masih bisa dikembalikan
 * dari sana, dan alasannya kehitung di ringkasan sampah bulanan Domus.
 * Kosakata alasannya milik Domus (`DISCARD_REASONS` di domus-app/src/lib/items.js):
 * `dibuang` (satu-satunya yang dihitung sampah) | `diberikan` | `terpakai` | `salah`.
 */
export async function discardDomusItem(id, reason = 'dibuang') {
  await updateDoc(doc(db, 'domus_items', id), {
    discardedAt: serverTimestamp(),
    discardReason: reason,
    qtyValue: 0,
    quantity: '0',
    status: 'Habis',
  });
}

const formatQty = (qtyValue, qtyUnit) =>
  qtyValue == null || qtyValue === '' ? '' : `${qtyValue} ${qtyUnit || ''}`.trim();

/**
 * 'YYYY-MM-DD' waktu LOKAL — bentuk tanggal yang dipakai Domus di `plannedDate`, `priceLog.at`,
 * dan `cookLog.at`. `toISOString()` bikin UTC dan bisa geser sehari buat yang di GMT+7.
 */
const hariIni = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// `domus_items.status` itu nilai TURUNAN dari sisa stok, dan Domus memakainya buat kartu
// "Menipis"/"Habis" di Dasbor serta filter di tab Database. Ambangnya harus sama persis dengan
// `statusFromRatio` di domus-app/src/lib/stock.js — kalau beda, dua app nampilin status beda buat
// barang yang sama. Patokan "penuh" ada di `qtyFull` (barang lama belum punya: pakai sisa sekarang).
const domusStatus = (qtyValue, qtyFull) => {
  const full = Number(qtyFull) > 0 ? Number(qtyFull) : null;
  if (!full) return null;
  const ratio = Math.min(1, Math.max(0, (Number(qtyValue) || 0) / full));
  return ratio <= 0 ? 'Habis' : ratio <= 0.5 ? 'Setengah' : 'Penuh';
};

export async function updateDomusItemQuantity(id, qtyValue, qtyUnit = '') {
  // `quantity` string ikut ditulis: bundle APK Lomeal lama dan Domus lama masih membacanya.
  await updateDoc(doc(db, 'domus_items', id), { qtyValue, qtyUnit, quantity: formatQty(qtyValue, qtyUnit) });
}

/**
 * Potong stok Domus sesudah makanan dicatat.
 *
 * Dulu ini cuma `increment(-n)` di `qtyValue`. Atomik memang, tapi `quantity` (string turunan)
 * dan `status` ikut basi — jadi Domus masih bilang "Penuh" padahal isinya udah habis dipotong
 * dari sini. Sekarang pakai transaction: tetap aman dari race (dokumennya dibaca & ditulis dalam
 * satu transaksi, Firestore ngulang otomatis kalau ada yang nyalip), sekaligus bisa ngitung
 * field turunannya.
 */
export async function deductDomusItemQuantity(id, gramsToDeduct) {
  if (!id || gramsToDeduct <= 0) return;
  const ref = doc(db, 'domus_items', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    // `gramsToDeduct` itu GRAM, sedangkan `qtyValue` pakai satuan barangnya — dikurangi mentah,
    // "Telur 10 butir" dipotong 100 g langsung jadi 0. `deductStock` yang ngurus konversinya
    // (termasuk `unitGrams` khusus produk), sama kayak dua jalur potong stok yang lain.
    // Stok gak pernah minus: `deductStock` mentokin di nol.
    const res = deductStock({ id, ...data }, gramsToDeduct);
    if (!res.ok) return;              // satuannya gak bisa dihitung -> jangan tebak-tebakan
    const next = res.value;
    const full = data.qtyFull ?? data.qtyValue;
    tx.update(ref, {
      qtyValue: next,
      quantity: formatQty(next, data.qtyUnit),
      status: domusStatus(next, full),
    });
  });
}

/**
 * Masak lagi resep yang sama → porsinya DITAMBAHIN ke barang meal prep yang udah ada, bukan bikin
 * barang baru. Ini inti dari "entitas gak pernah ilang": satu "Ayam Kecap (Meal Prep)" seumur
 * hidup, id-nya tetap, jadi riwayat masaknya numpuk di satu tempat dan batch Lomeal gak perlu
 * pindah tuan tiap kali dimasak ulang.
 *
 * `cookLog` bentuknya niru `priceLog` punya Domus: array di dokumen barangnya, tanggalnya string
 * hari — `serverTimestamp()` gak boleh dipakai di dalam array Firestore.
 */
export function cookEntry(portions, recipeId = null, when = new Date()) {
  return { at: hariIni(when), portions: Number(portions || 0), ...(recipeId ? { recipeId } : {}) };
}

export async function addPortionsToDomusItem(id, portions, { recipeId = null, when = new Date(), locationId = null } = {}) {
  const ref = doc(db, 'domus_items', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const next = (Number(data.qtyValue) || 0) + Number(portions || 0);
    // Patokan "penuh" ikut naik, kalau nggak bar di kartu Domus nyangkut di atas 100%.
    const full = Math.max(Number(data.qtyFull) || 0, next);
    tx.update(ref, {
      qtyValue: next,
      qtyUnit: 'porsi',
      qtyFull: full,
      quantity: formatQty(next, 'porsi'),
      status: domusStatus(next, full),
      // Barang lama yang terlanjur "pensiun" ikut dibangunkan — isinya kan beneran nambah.
      consumedAt: null,
      cookedAt: when.toISOString(),
      // Satu entitas = satu lokasi. Masakan baru ditaruh di mana, ke situ juga barangnya pindah —
      // pilihan lain cuma bikin barang kembar cuma gara-gara beda rak.
      ...(locationId ? { locationId } : {}),
      cookLog: arrayUnion(cookEntry(portions, recipeId, when)),
    });
  });
}

export async function createDomusItem(uid, { name, locationId, qtyValue = null, qtyUnit = '', isFood = true, sourceApp = 'lomeal', ...rest }) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, 'domus_items', id), {
    uid,
    name: name.trim(),
    locationId,
    qtyValue,
    qtyUnit,
    quantity: formatQty(qtyValue, qtyUnit),
    // Field yang dipakai indikator & kotak sampah Domus (lihat domus-app/model-barang.md).
    // Diisi di sini juga supaya barang buatan Lomeal gak nongol beda sendiri di sana:
    // `qtyFull` jadi patokan bar, `kind: 'stok'` tipe barangnya, `discardedAt` biar gak
    // dikira ada di kotak sampah.
    qtyFull: qtyValue,
    status: domusStatus(qtyValue, qtyValue),
    kind: 'stok',
    discardedAt: null,
    isFood,
    sourceApp,
    consumedAt: null,
    addedAt: serverTimestamp(),
    ...rest,
  });
  return id;
}

/**
 * Titip bahan ke daftar belanja Domus.
 *
 * Jumlah dikirim TERPISAH angka + satuan (`qtyValue`/`qtyUnit`), bukan diselipin ke dalam nama
 * ("Bawang (200 g lagi)"). Domus nyimpen dua field itu apa adanya dan nampilinnya sebagai jumlah
 * beneran — kalau ditempel ke nama, namanya jadi gak cocok lagi waktu belanjaannya balik lewat
 * nota Darka, dan jumlahnya gak bisa diapa-apain.
 * `qty` string ikut ditulis: itu turunan yang masih dibaca bundle Domus lama.
 */
export async function requestShoppingListDomus(uid, itemName, { qtyValue = null, qtyUnit = null, itemId = null } = {}) {
  return addDoc(collection(db, 'domus_shopping_list'), {
    uid,
    itemName,
    // Barang inventaris yang mau dibeli. INI sambungannya, bukan namanya: begitu belanjaannya
    // balik lewat nota Darka, Domus ngarahin isinya ke barang ini — bukan nebak dari nama yang
    // gampang beda ("telur" vs "Telur Ayam"). Diisi kalau bahannya ketemu di inventaris.
    itemId,
    // Kosakata kategori milik Domus (domus-app/src/lib/items.js#CATEGORIES). Mentah & matang
    // sudah disatukan jadi satu 'Makanan' di sana — 'Bahan Makanan Mentah' cuma ejaan lama yang
    // tiap kali dinormalin ulang waktu dibaca.
    category: 'Makanan',
    source: 'lomeal',
    isPurchased: false,
    qtyValue,
    qtyUnit,
    qty: formatQty(qtyValue, qtyUnit) || null,
    // Belum pernah diurut manual -> ikut aturan Domus: yang baru masuk ke bawah.
    sortOrder: Date.now(),
    // Rencana beli diisi tanggal hari ini, bukan null: Domus mengelompokkan daftar belanja per
    // tanggal, dan entri tanpa tanggal numpuk di grup "Lainnya". Tinggal diganti di sana kalau
    // rencananya lain.
    plannedDate: hariIni(),
    store: null,
    addedAt: serverTimestamp(),
  });
}
