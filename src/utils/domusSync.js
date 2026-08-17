import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, setDoc, addDoc, getDocs, runTransaction } from 'firebase/firestore';

export async function fetchDomusItems(uid) {
  const q = query(collection(db, 'domus_items'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((i) => i.isFood && !i.consumedAt);
}

export function subscribeDomusItems(uid, cb) {
  const q = query(collection(db, 'domus_items'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    // `isFood` = flag "kebaca Lomeal", dicentang di Domus (defaultnya ikut jenis lokasi).
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((i) => i.isFood && !i.consumedAt);
    cb(items);
  }, (err) => console.error('[domus_items] error:', err));
}

export function subscribeDomusLocations(uid, cb) {
  const q = query(collection(db, 'domus_locations'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[domus_locations] error:', err));
}

const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Cocokkan nama bahan resep ke item inventaris Domus.
 *
 * Bertingkat: nama sama persis dulu, baru semua kata bahan harus ada di nama item.
 * Saling-mengandung (versi lama) bikin item "Ayam" mencocoki bahan "Kaldu Ayam", lalu bahan itu
 * ditandai tersedia dan hilang dari daftar belanja padahal kaldunya tidak pernah ada.
 * ponytail: belum ada kamus sinonim ("santan" ≠ "kelapa parut"); tambahkan kalau sering meleset.
 */
export function matchDomusItem(domusItems, name) {
  if (!domusItems?.length || !name) return null;
  const n = norm(name);
  if (!n) return null;

  const exact = domusItems.find((di) => norm(di.name) === n);
  if (exact) return exact;

  const words = n.split(' ');
  return domusItems.find((di) => {
    const dn = norm(di.name);
    return dn && words.every((w) => dn.split(' ').includes(w));
  }) || null;
}

export async function markDomusItemConsumed(id) {
  // Samain persis dengan `markConsumed` di domus-app/src/lib/items.js: sisa & status ikut
  // dinolkan, bukan cuma `consumedAt`. Kalau cuma satu field, Domus masih nampilin bar penuh
  // buat barang yang sudah habis dari sini.
  await updateDoc(doc(db, 'domus_items', id), {
    consumedAt: serverTimestamp(),
    qtyValue: 0,
    quantity: '0',
    status: 'Habis',
  });
}

const formatQty = (qtyValue, qtyUnit) =>
  qtyValue == null || qtyValue === '' ? '' : `${qtyValue} ${qtyUnit || ''}`.trim();

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
    // Stok gak boleh minus: potong sampai nol saja, sisanya diabaikan.
    const next = Math.max(0, (Number(data.qtyValue) || 0) - gramsToDeduct);
    const full = data.qtyFull ?? data.qtyValue;
    tx.update(ref, {
      qtyValue: next,
      quantity: formatQty(next, data.qtyUnit),
      status: domusStatus(next, full),
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
export async function requestShoppingListDomus(uid, itemName, { qtyValue = null, qtyUnit = null } = {}) {
  return addDoc(collection(db, 'domus_shopping_list'), {
    uid,
    itemName,
    category: 'Bahan Makanan Mentah',
    source: 'lomeal',
    isPurchased: false,
    qtyValue,
    qtyUnit,
    qty: formatQty(qtyValue, qtyUnit) || null,
    // Belum pernah diurut manual -> ikut aturan Domus: yang baru masuk ke bawah.
    sortOrder: Date.now(),
    plannedDate: null,
    store: null,
    addedAt: serverTimestamp(),
  });
}
