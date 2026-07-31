import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'hexa-life' });
const db = getFirestore();

await db.doc('lomeal_settings/ota_update').set({
  ota_version: '0.1.5',
  is_forced: false,
  ota_url: 'https://lomeal.web.app/ota/update_015.zip',
  release_notes: 'Fix: popup update tidak akan muncul terus-menerus setelah di-dismiss atau di-update.'
}, { merge: true });

console.log('✅ Firestore updated: ota_version=0.1.5, url=update_015.zip');
process.exit(0);
