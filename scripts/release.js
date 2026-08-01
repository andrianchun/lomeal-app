// Satu perintah rilis: bump versi -> build -> zip OTA -> deploy hosting -> commit -> push.
// Ditulis sebagai script Node (bukan rantai && di package.json) karena rantai shell dan
// $npm_package_version tidak jalan konsisten di PowerShell/cmd.
//
//   npm run release          -> 0.1.18 -> 0.1.19
//   npm run release minor    -> 0.1.18 -> 0.2.0
//   npm run release major    -> 0.1.18 -> 1.0.0
import { execSync } from 'child_process';
import fs from 'fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

const bump = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Bump tidak dikenal: "${bump}". Pakai patch | minor | major.`);
  process.exit(1);
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion(); // WAJIB baca ulang: nilai lama sudah basi setelah bump
console.log(`\nRelease v${from} -> v${version}\n`);

run('npm run build:ota');
run('firebase deploy --only hosting');
run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\nv${version} live. PWA dapat kartu update, APK dapat OTA saat dibuka lagi.`);
