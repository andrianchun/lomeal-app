import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, deleteDoc, setDoc, addDoc } from 'firebase/firestore';

export function subscribeDomusItems(uid, cb) {
  const q = query(collection(db, 'domus_items'), where('uid', '==', uid));
  return onSnapshot(q, (snap) => {
    // Only return active food items
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

export async function markDomusItemConsumed(id) {
  await updateDoc(doc(db, 'domus_items', id), { consumedAt: serverTimestamp() });
}

export async function updateDomusItemQuantity(id, newQuantity) {
  await updateDoc(doc(db, 'domus_items', id), { quantity: newQuantity });
}

export async function createDomusItem(uid, { name, locationId, quantity = '', isFood = true, sourceApp = 'lomeal' }) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, 'domus_items', id), {
    uid,
    name: name.trim(),
    locationId,
    quantity,
    isFood,
    sourceApp,
    consumedAt: null,
    addedAt: serverTimestamp(),
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
