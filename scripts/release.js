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
const notes = args.find(a => a !== 'force' && !BUMPS.includes(a));

const unknown = args.filter(a => a !== 'force' && !BUMPS.includes(a) && a !== notes);
if (unknown.length) {
  console.error(`Argumen tidak dikenal: ${unknown.join(', ')}. Pakai: [patch|minor|major] [force] ["catatan rilis"]`);
  process.exit(1);
}

const from = readVersion();
run(`npm version ${bump} --no-git-tag-version`);
const version = readVersion(); // WAJIB baca ulang: nilai lama sudah basi setelah bump
console.log(`\nRelease v${from} -> v${version}${forced ? '  [WAJIB — user diblokir sampai update]' : ''}\n`);

run('npm run build:ota', { OTA_FORCE: forced ? '1' : '0', OTA_NOTES: notes || '' });
run('firebase deploy --only hosting');
run('git add -A');
run(`git commit -m "release v${version}"`);
run('git push');

console.log(`\nv${version} live. PWA dapat kartu update, APK dapat OTA saat dibuka lagi.`);
