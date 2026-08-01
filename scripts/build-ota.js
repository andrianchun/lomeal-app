import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '../dist');
const otaPath = path.resolve(__dirname, '../dist/ota');

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
  // version.json ditulis SETELAH zip selesai, supaya manifest tidak pernah menunjuk zip yang gagal dibuat.
  fs.writeFileSync(path.join(otaPath, 'version.json'), JSON.stringify({
    ota_version: version,
    ota_url: `https://lomeal.web.app/ota/${zipName}`,
    is_forced: false,
    release_notes: `Pembaruan v${version}`
  }, null, 2));
  console.log(`OTA ${zipName} + version.json siap (v${version}).`);
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
