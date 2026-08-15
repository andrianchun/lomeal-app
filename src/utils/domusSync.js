import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, deleteDoc, setDoc, addDoc, getDocs } from 'firebase/firestore';

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
  await updateDoc(doc(db, 'domus_items', id), { consumedAt: serverTimestamp() });
}

const formatQty = (qtyValue, qtyUnit) =>
  qtyValue == null || qtyValue === '' ? '' : `${qtyValue} ${qtyUnit || ''}`.trim();

export async function updateDomusItemQuantity(id, qtyValue, qtyUnit = '') {
  // `quantity` string ikut ditulis: bundle APK Lomeal lama dan Domus lama masih membacanya.
  await updateDoc(doc(db, 'domus_items', id), { qtyValue, qtyUnit, quantity: formatQty(qtyValue, qtyUnit) });
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
    isFood,
    sourceApp,
    consumedAt: null,
    addedAt: serverTimestamp(),
    ...rest,
  });
  return id;
}

export async function requestShoppingListDomus(uid, itemName) {
  return addDoc(collection(db, 'domus_shopping_list'), {
    uid,
    itemName,
    category: 'Bahan Makanan Mentah',
    source: 'lomeal',
    isPurchased: false,
    addedAt: serverTimestamp(),
  });
}
