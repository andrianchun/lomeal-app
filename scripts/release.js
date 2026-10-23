// Satu perintah rilis: bump versi -> build -> zip OTA -> deploy hosting -> commit -> push.
// Ditulis sebagai script Node (bukan rantai && di package.json) karena rantai shell dan
// $npm_package_version tidak jalan konsisten di PowerShell/cmd.
//
//   npm run release                          -> bump patch (0.3.59 -> 0.3.60)
//   npm run release minor                    -> bump minor
//   npm run release major                    -> bump major
//   npm run release force "Perbaikan kritis" -> update WAJIB (modal memblokir di app)
//   npm run release apk "Versi APK baru"     -> update jalur APK di hosting
//
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

const BUMPS = ['patch', 'minor', 'major'];
const args = process.argv.slice(2);
const forced = args.includes('force');
const apk = args.includes('apk');
const bump = args.find(a => BUMPS.includes(a)) || 'patch';

const rest = args.filter(a => a !== 'force' && a !== 'apk' && !BUMPS.includes(a));
if (rest.length > 1) {
  console.error(`Catatan rilis harus satu argumen (pakai tanda kutip): ${rest.join(' | ')}`);
  process.exit(1);
}
const notes = rest[0];
if (notes && !/\s/.test(notes)) {
  console.error(`Catatan rilis "${notes}" cuma satu kata — gunakan kalimat lengkap.\nPakai: npm run release [patch|minor|major] [force] [apk] ["kalimat catatan rilis"]`);
  process.exit(1);
}

function syncAndroidVersion(newVersion) {
  const gradlePath = 'android/app/build.gradle';
  if (!fs.existsSync(gradlePath)) return;
  let content = fs.readFileSync(gradlePath, 'utf8');

  // Bump versionCode
  content = content.replace(/versionCode\s+(\d+)/, (match, code) => {
    const nextCode = parseInt(code, 10) + 1;
    console.log(`📱 Bumping Android versionCode: ${code} -> ${nextCode}`);
    return `versionCode ${nextCode}`;
  });

  // Update versionName
  content = content.replace(/versionName\s+"[^"]+"/, () => {
    console.log(`📱 Updating Android versionName -> "${newVersion}"`);
    return `versionName "${newVersion}"`;
  });

  fs.writeFileSync(gradlePath, content, 'utf8');
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion(); // WAJIB baca ulang: nilai lama sudah basi setelah bump
console.log(`\n🚀 Memulai Rilis Lomeal v${from} -> v${version}${forced ? '  [WAJIB / FORCED]' : ''}${apk ? '  [JALUR APK]' : ''}\n`);

run('npm run build:ota', {
  OTA_FORCE: forced ? '1' : '0',
  OTA_NOTES: notes || '',
  OTA_APK: apk ? '1' : '0'
});

if (apk) {
  console.log('\n📱 Menyiapkan pembaruan biner APK native...');
  syncAndroidVersion(version);
  console.log('🔄 Menyinkronkan aset web terbaru ke project Android...');
  run('npx cap sync android');

  // Bersihkan arsip OTA dan APK dari android assets agar tidak menggembungkan ukuran APK
  const assetsDir = 'android/app/src/main/assets/public';
  if (fs.existsSync(path.join(assetsDir, 'ota'))) {
    fs.rmSync(path.join(assetsDir, 'ota'), { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(assetsDir, 'apk'))) {
    fs.rmSync(path.join(assetsDir, 'apk'), { recursive: true, force: true });
  }
  if (fs.existsSync(path.join(assetsDir, 'lomeal.apk'))) {
    fs.rmSync(path.join(assetsDir, 'lomeal.apk'), { force: true });
  }

  console.log('⚙️ Mengompilasi APK rilis (gradlew assembleRelease)...');
  execSync(process.platform === 'win32' ? 'gradlew.bat assembleRelease' : './gradlew assembleRelease', {
    stdio: 'inherit',
    cwd: 'android'
  });

  if (!fs.existsSync('public/apk')) {
    fs.mkdirSync('public/apk', { recursive: true });
  }
  fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'public/apk/lomeal-latest.apk');
  fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'public/lomeal.apk');

  if (fs.existsSync('dist')) {
    if (!fs.existsSync('dist/apk')) {
      fs.mkdirSync('dist/apk', { recursive: true });
    }
    fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'dist/apk/lomeal-latest.apk');
    fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'dist/lomeal.apk');
  }
  console.log('✓ APK rilis baru berhasil dikompilasi dan disalin ke public/apk & dist/apk\n');
}

const deployHosting = () => {
  fs.rmSync('.firebase', { recursive: true, force: true });
  run('firebase deploy --only hosting,storage');
};

const BASE = 'https://lomeal.web.app/ota';
const zipName = (v) => `update_${v.replace(/\./g, '')}.zip`;
const verifyDeploy = async (v) => {
  const problems = [];
  const localZipPath = `dist/ota/${zipName(v)}`;
  const localZipSize = fs.existsSync(localZipPath) ? fs.statSync(localZipPath).size : 0;

  try {
    const versionRes = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    const versionType = versionRes.headers.get('content-type') || '';
    if (!versionType.includes('application/json')) {
      problems.push(`version.json balik ${versionType || 'tanpa content-type'} (harusnya application/json) — folder /ota/ gak sampai ke hosting`);
    } else {
      const data = await versionRes.json();
      if (data.ota_version !== v) problems.push(`version.json masih v${data.ota_version}, harusnya v${v}`);
    }

    if (versionRes.headers.get('access-control-allow-origin') !== '*') {
      problems.push('version.json gak punya header Access-Control-Allow-Origin — APK bakal keblokir CORS');
    }

    const zipRes = await fetch(`${BASE}/${zipName(v)}?t=${Date.now()}`, { cache: 'no-store' });
    const zipType = zipRes.headers.get('content-type') || '';
    const zipSize = (await zipRes.arrayBuffer()).byteLength;
    if (!zipType.includes('zip') && !zipType.includes('octet-stream')) {
      problems.push(`${zipName(v)} balik ${zipType || 'tanpa content-type'} (harusnya application/zip)`);
    } else if (localZipSize > 0 && zipSize !== localZipSize) {
      problems.push(`${zipName(v)} di hosting ${zipSize} byte, lokal ${localZipSize} byte`);
    }

    if (apk) {
      const apkRes = await fetch(`https://lomeal.web.app/apk/lomeal-latest.apk?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
      const apkType = apkRes.headers.get('content-type') || '';
      if (!apkType.includes('package-archive') && !apkType.includes('octet-stream')) {
        problems.push(`lomeal-latest.apk balik ${apkType || 'tanpa content-type'} (harusnya application/vnd.android.package-archive)`);
      }
    }
  } catch (err) {
    problems.push(`Gagal menghubungi server hosting: ${err.message}`);
  }

  return problems;
};

const JEDA_CEK_ULANG_MS = 20_000;
const jeda = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const periksaDuaKali = async () => {
  const pertama = await verifyDeploy(version);
  if (pertama.length) return pertama;
  console.log(`\nCek pertama lolos. Cek ulang ${JEDA_CEK_ULANG_MS / 1000} detik lagi (file OTA pernah raib SESUDAH deploy sukses)...`);
  await jeda(JEDA_CEK_ULANG_MS);
  return verifyDeploy(version);
};

console.log('\n📡 Mengunggah ke Firebase Hosting & Storage...');
deployHosting();

console.log('\n🔍 Menjalankan verifikasi deploy otomatis ke hosting...');
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
console.log(`\nOTA terverifikasi di hosting: version.json v${version} + zip valid\n`);

run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\nv${version} live. PWA dapat kartu update, APK dapat OTA / pembaruan saat dibuka lagi.`);
