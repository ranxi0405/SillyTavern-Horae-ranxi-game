#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'worldbook-v0.9.json');
const DST = 'I:/AI/SillyTavern-1.19.0/data/default-user/worlds/worldbook-v0.9.json';
const BAK_DIR_BASE = path.join(ROOT, '.bak-w1-deploy');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

function ts() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function sha256(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

if (ROLLBACK) {
    if (!fs.existsSync(BAK_DIR_BASE)) { console.error('no backup dir: ' + BAK_DIR_BASE); process.exit(1); }
    const entries = fs.readdirSync(BAK_DIR_BASE, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name).sort();
    if (entries.length === 0) { console.error('no backup'); process.exit(1); }
    const latest = entries[entries.length - 1];
    const bakFile = path.join(BAK_DIR_BASE, latest, 'worldbook-v0.9.json');
    if (!fs.existsSync(bakFile)) { console.error('no bak file: ' + bakFile); process.exit(1); }
    fs.copyFileSync(bakFile, DST);
    console.log('restored from ' + latest);
    process.exit(0);
}

console.log('=== W1 worldbook 部署 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('src : ' + SRC);
console.log('dst : ' + DST);
console.log('');

if (!fs.existsSync(SRC)) { console.error('XX src not found'); process.exit(1); }
if (!fs.existsSync(DST)) { console.error('XX dst not found: ' + DST); process.exit(1); }

const srcHash = sha256(SRC);
const dstHash = sha256(DST);
console.log('src sha256: ' + srcHash);
console.log('dst sha256: ' + dstHash);
console.log('identical (before): ' + (srcHash === dstHash));
console.log('');

if (srcHash === dstHash) { console.log('nothing to do: identical'); process.exit(0); }

const stamp = ts();
const bakDir = path.join(BAK_DIR_BASE, stamp);
const bakFile = path.join(bakDir, 'worldbook-v0.9.json');

console.log('backup dir : ' + bakDir);
console.log('');

if (DRY_RUN) {
    console.log('DRY-RUN: [backup] ' + DST + ' -> ' + bakFile);
    console.log('DRY-RUN: [copy]   ' + SRC + ' -> ' + DST);
    console.log('DRY-RUN: [verify] sha256 + JSON.parse');
    console.log('DRY-RUN done, nothing written.');
    process.exit(0);
}

fs.mkdirSync(bakDir, { recursive: true });
fs.copyFileSync(DST, bakFile);
console.log('[1/3] backup: ' + bakFile);

fs.copyFileSync(SRC, DST);
console.log('[2/3] copied: ' + DST);

const afterDstHash = sha256(DST);
if (afterDstHash !== srcHash) { console.error('XX hash mismatch: ' + afterDstHash); process.exit(1); }
console.log('[3/3] hash match: ' + afterDstHash);

try {
    JSON.parse(fs.readFileSync(DST, 'utf8'));
    console.log('[4/4] JSON OK');
} catch (e) {
    console.error('XX JSON parse failed: ' + e.message);
    fs.copyFileSync(bakFile, DST);
    console.log('已从备份恢复');
    process.exit(1);
}

console.log('');
console.log('SUMMARY');
console.log('  backup : ' + bakDir);
console.log('  written: 1 file');
console.log('  status : OK');
console.log('done.');
