import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '../dist');
const otaPath = path.resolve(__dirname, '../dist/ota');
// vite build mengosongkan dist/ tiap rilis, jadi zip lama ikut hilang dan client yang masih
// menunjuk URL lama dapat HTML (kena rewrite SPA) — bukan 404 — lalu gagal unzip.
// Arsip di luar dist supaya selamat, dan beberapa versi terakhir ikut ter-deploy lagi.
const archivePath = path.resolve(__dirname, '../.ota-archive');
const KEEP = 3;

// Jembatan untuk bundle BAWAAN APK (yang aktif lagi tiap user hapus data / install ulang).
// Bundle itu kode lama: dia cuma baca Firestore lomeal_settings/ota_update, dan dokumen itu
// menunjuk ke update_0118.zip secara permanen. Jadi nama file ini harus selalu ada dan selalu
// berisi build TERBARU — kalau hilang, Capgo dapat HTML (kena rewrite SPA) lalu gagal dengan
// pesan "periksa koneksi internet". Hapus baris ini hanya setelah APK di-build ulang.
const LEGACY_BRIDGE = 'update_0118.zip';

// Versi selalu diambil dari package.json — JANGAN oper versi lewat argumen.
// Bump versi dilakukan otomatis oleh scripts/release.js.
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version;
const zipName = `update_${version.replace(/\./g, '')}.zip`;
const outputPath = path.join(otaPath, zipName);

console.log(`Building OTA ZIP: ${zipName}`);

if (!fs.existsSync(distPath)) {
  console.error('dist folder does not exist! Please run build first.');
  process.exit(1);
}

if (!fs.existsSync(otaPath)) {
  fs.mkdirSync(otaPath, { recursive: true });
}

const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({
  zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');

  // Simpan ke arsip, buang yang paling tua, lalu kembalikan sisanya ke dist/ota
  // supaya ikut ter-deploy dan URL rilis sebelumnya tetap hidup.
  fs.mkdirSync(archivePath, { recursive: true });
  fs.copyFileSync(outputPath, path.join(archivePath, zipName));
  const kept = fs.readdirSync(archivePath)
    .filter(f => f.endsWith('.zip'))
    .sort((a, b) => fs.statSync(path.join(archivePath, b)).mtimeMs - fs.statSync(path.join(archivePath, a)).mtimeMs);
  kept.slice(KEEP).forEach(f => fs.rmSync(path.join(archivePath, f)));
  kept.slice(0, KEEP).forEach(f => fs.copyFileSync(path.join(archivePath, f), path.join(otaPath, f)));

  // Regenerasi tiap rilis, jadi tidak pernah kena pruning dan isinya selalu build terbaru.
  fs.copyFileSync(outputPath, path.join(otaPath, LEGACY_BRIDGE));

  // version.json ditulis SETELAH zip selesai, supaya manifest tidak pernah menunjuk zip yang gagal dibuat.
  // OTA_FORCE/OTA_NOTES di-set oleh scripts/release.js (`npm run release force "catatan"`).
  fs.writeFileSync(path.join(otaPath, 'version.json'), JSON.stringify({
    ota_version: version,
    ota_url: `https://lomeal.web.app/ota/${zipName}`,
    is_forced: process.env.OTA_FORCE === '1',
    release_notes: process.env.OTA_NOTES || `Pembaruan v${version}`
  }, null, 2));
  console.log(`OTA siap (v${version}). Zip ter-deploy: ${kept.slice(0, KEEP).join(', ')}`);
});

archive.on('warning', function(err) {
  if (err.code === 'ENOENT') {
    console.warn(err);
  } else {
    throw err;
  }
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Append files from the dist directory, putting its contents at the root of archive.
// - 'ota/**' wajib di-ignore supaya zip tidak me-zip dirinya sendiri.
// - service worker & manifest PWA dibuang: tidak berguna di WebView native, dan kalau
//   sampai ter-register di dalam WebView, SW itu akan menyajikan index.html lamanya
//   sendiri dan menutupi bundle yang baru dipasang Capgo.
archive.glob('**/*', {
  cwd: distPath,
  ignore: ['ota/**', 'sw.js', 'workbox-*.js', 'registerSW.js', 'manifest.webmanifest']
});

archive.finalize();
