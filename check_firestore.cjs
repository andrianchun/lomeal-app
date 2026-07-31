const admin = require("firebase-admin");
const serviceAccount = require("E:/CODING/hexa-life-firebase-adminsdk-fbsvc-b9426ee0f0.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const doc = await db.collection("lomeal_settings").doc("ota_update").get();
  if (doc.exists) {
    console.log("Document data:", doc.data());
  } else {
    console.log("No such document!");
  }
}

run();
