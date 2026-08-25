// Satu perintah rilis: bump versi -> build -> zip OTA -> deploy hosting -> commit -> push.
// Ditulis sebagai script Node (bukan rantai && di package.json) karena rantai shell dan
// $npm_package_version tidak jalan konsisten di PowerShell/cmd.
//
//   npm run release                          -> 0.1.18 -> 0.1.19
//   npm run release minor                    -> 0.1.18 -> 0.2.0
//   npm run release major                    -> 0.1.18 -> 1.0.0
//   npm run release force "Perbaikan kritis" -> update WAJIB, user diblokir sampai memperbarui
//
// Argumen bebas urutan: patch|minor|major, kata `force`, dan teks catatan rilis.
import { execSync } from 'child_process';
import fs from 'fs';

const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

const BUMPS = ['patch', 'minor', 'major'];
const args = process.argv.slice(2);
const forced = args.includes('force');
const bump = args.find(a => BUMPS.includes(a)) || 'patch';
// Sisa argumen = catatan rilis. Ditulis apa adanya ke version.json dan tampil di
// kartu/modal update, jadi kalimat lengkap — bukan satu kata asal.
const rest = args.filter(a => a !== 'force' && !BUMPS.includes(a));
if (rest.length > 1) {
  console.error(`Catatan rilis harus satu argumen (pakai tanda kutip): ${rest.join(' | ')}`);
  process.exit(1);
}
const notes = rest[0];
if (notes && !/\s/.test(notes)) {
  console.error(`Catatan rilis "${notes}" cuma satu kata — kelihatan seperti salah ketik.\nPakai: npm run release [patch|minor|major] [force] ["kalimat catatan rilis"]`);
  process.exit(1);
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion(); // WAJIB baca ulang: nilai lama sudah basi setelah bump
console.log(`\nRelease v${from} -> v${version}${forced ? '  [WAJIB — user diblokir sampai update]' : ''}\n`);

run('npm run build:ota', { OTA_FORCE: forced ? '1' : '0', OTA_NOTES: notes || '' });

// Buang cache unggah Firebase sebelum deploy. Cache ini bikin firebase-tools melewati file
// yang dikira sudah terunggah, dan berkali-kali bikin SELURUH /ota/** raib dari hosting:
// version.json & zip kena rewrite SPA (balik index.html 200, bukan 404), jadi pengecekan
// update di app gagal diam-diam ("Unexpected token '<'") dan APK nyangkut di bundle lama
// selamanya. Kejadian 4x di Logym; hapus cache selalu memperbaikinya. Deploy jadi sedikit
// lebih lama karena semua file diunggah ulang — murah dibanding rilis yang tidak sampai.
const deployHosting = () => {
  fs.rmSync('.firebase', { recursive: true, force: true });
  run('firebase deploy --only hosting');
};

/**
 * Deploy bisa bilang "complete" padahal /ota/** GAK sampai ke hosting — permintaan ke situ kena
 * rewrite SPA dan balik index.html 200 (bukan 404). Dari terminal kelihatan sukses; yang ketahuan
 * belakangan cuma "updater gak muncul di HP", dan APK nyangkut di bundle lama selamanya.
 * Makanya hasilnya diperiksa beneran, bukan dipercaya. Kembarannya ada di darka-app & domus-app.
 */
const BASE = 'https://lomeal.web.app/ota';
const zipName = (v) => `update_${v.replace(/\./g, '')}.zip`;
const verifyDeploy = async (v) => {
  const problems = [];
  const localZipSize = fs.statSync(`dist/ota/${zipName(v)}`).size;

  const versionRes = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
  const versionType = versionRes.headers.get('content-type') || '';
  if (!versionType.includes('application/json')) {
    problems.push(`version.json balik ${versionType || 'tanpa content-type'} (harusnya application/json) — folder /ota/ gak sampai ke hosting`);
  } else {
    const data = await versionRes.json();
    if (data.ota_version !== v) problems.push(`version.json masih v${data.ota_version}, harusnya v${v}`);
  }

  // Sengaja GET, bukan HEAD: Firebase Hosting gak ngirim Content-Length di respons HEAD, jadi
  // ukurannya kebaca 0 dan rilis yang sebenernya sehat malah divonis gagal.
  const zipRes = await fetch(`${BASE}/${zipName(v)}?t=${Date.now()}`, { cache: 'no-store' });
  const zipType = zipRes.headers.get('content-type') || '';
  const zipSize = (await zipRes.arrayBuffer()).byteLength;
  if (!zipType.includes('zip')) problems.push(`${zipName(v)} balik ${zipType || 'tanpa content-type'} (harusnya application/zip)`);
  else if (zipSize !== localZipSize) problems.push(`${zipName(v)} di hosting ${zipSize} byte, lokal ${localZipSize} byte`);

  // APK ngecek update lewat fetch lintas-origin dari WebView — tanpa header ini, browser-nya yang
  // mblokir sebelum respons kebaca, dan updater gak akan pernah muncul walau file-nya bener.
  if (versionRes.headers.get('access-control-allow-origin') !== '*') {
    problems.push('version.json gak punya header Access-Control-Allow-Origin — APK bakal keblokir CORS');
  }
  return problems;
};

/**
 * Diperiksa DUA KALI: sekali langsung, sekali lagi sesudah jeda. Rilis Darka v0.1.25 LOLOS
 * pemeriksaan pertama lalu /ota/** tetap raib beberapa menit kemudian — jadi "sempat kelihatan
 * bener" bukan bukti file itu ikut ke versi hosting yang dirilis.
 *
 * ponytail: 20 detik itu tebakan — cukup buat nangkep kejadian itu. Naikin kalau masih ada yang
 * lolos di sini tapi hilang belakangan.
 */
const JEDA_CEK_ULANG_MS = 20_000;
const jeda = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const periksaDuaKali = async () => {
  const pertama = await verifyDeploy(version);
  if (pertama.length) return pertama;
  console.log(`\nCek pertama lolos. Cek ulang ${JEDA_CEK_ULANG_MS / 1000} detik lagi (file OTA pernah raib SESUDAH deploy sukses)...`);
  await jeda(JEDA_CEK_ULANG_MS);
  return verifyDeploy(version);
};

deployHosting();

let problems = await periksaDuaKali();
if (problems.length) {
  console.warn(`\n! Hasil deploy gak beres:\n${problems.map((p) => `  - ${p}`).join('\n')}\n\nDeploy ulang sekali...\n`);
  deployHosting();
  problems = await periksaDuaKali();
}
if (problems.length) {
  console.error(`\nRILIS GAGAL — file OTA gak bener di hosting:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  console.error(`\nVersi udah ke-bump ke v${version} tapi BELUM di-commit. Betulin hostingnya dulu, baru:`);
  console.error('  npx firebase deploy --only hosting');
  process.exit(1);
}
console.log(`\nOTA terverifikasi di hosting: version.json v${version} + zip ${fs.statSync(`dist/ota/${zipName(version)}`).size} byte\n`);

run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\nv${version} live. PWA dapat kartu update, APK dapat OTA saat dibuka lagi.`);
