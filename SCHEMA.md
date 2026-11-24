# LOMEAL — Schema Contract (`SCHEMA.md`)

Kontrak resmi koleksi Firestore pada project **`hexa-life`** (dideklarasikan di [`E:\CODING\hexa-life\firestore.rules`](file:///e:/CODING/hexa-life/firestore.rules)).

## Koleksi LoMeal
- `lomeal_users/{uid}` — Profil fisik, `dietProfile`, `pace`, `targets`, konsen onboarding
  - `/food_logs/{docId}` — Log makanan harian per bulan (`log_YYYY-MM`), daftar sesi makan, resep, & custom foods
  - `/ai_sessions/{sessionId}` — Riwayat percakapan AI Coach Lomy
- `lomeal_globalPatternCache/{id}` — Cache hasil parse teks makanan lintas-user
- `lomeal_food_popularity/{foodId}` — Counter popularitas makanan (`{ count }`, hanya boleh `+1` per write)
- `lomeal_settings/{id}` — Pengaturan baca-saja sisi klien

## Koleksi Terhubung Lintas-App (`hexa-life`)
- `hexa_profiles/{uid}` — Profil bersama
- `domus_items/{id}` — Pengurangan stok kulkas via `runTransaction` (`domusSync.js`)
- `darka_shared_items/{id}` — Inbox belanja bahan makanan dari Darka (`subscribeInbox`)

## Storage
- `lomeal_users/{uid}/{allPaths=**}` — Foto sesi makan & resep (< 10 MB)
