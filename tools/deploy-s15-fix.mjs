#!/usr/bin/env node
/**
 * S1.5-fix 部署
 *
 * 默认只同步 index.js，源 -> 运行端。
 * 备份目录：<deploy>/  .bak-s15fix-deploy-<YYYYMMDD-HHMMSS>/
 *
 * 使用：
 *   node tools/deploy-s15-fix.mjs             # DRY-RUN
 *   node tools/deploy-s15-fix.mjs --apply     # APPLY
 *   node tools/deploy-s15-fix.mjs --rollback  # ROLLBACK（取最近一次备份）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = { ix: path.join(ROOT, 'index.js') };

const DEPLOY_DIR = 'I:/AI/SillyTavern-1.19.0/public/scripts/extensions/third-party/SillyTavern-Horae';
const DST = { ix: path.join(DEPLOY_DIR, 'index.js') };

const BAK_PREFIX = '.bak-s15fix-deploy-';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

function ts() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function sha256(f) {
    return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

if (ROLLBACK) {
    if (!fs.existsSync(DEPLOY_DIR)) { console.error('XX deploy dir not found: ' + DEPLOY_DIR); process.exit(1); }
    const entries = fs.readdirSync(DEPLOY_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith(BAK_PREFIX))
        .map(e => e.name)
        .sort();
    if (entries.length === 0) { console.error('no backup dir found in ' + DEPLOY_DIR); process.exit(1); }
    const latest = entries[entries.length - 1];
    const bakDir = path.join(DEPLOY_DIR, latest);
    let n = 0;
    for (const [k, srcF] of Object.entries(SRC)) {
        const bakF = path.join(bakDir, path.basename(srcF));
        if (fs.existsSync(bakF)) {
            fs.copyFileSync(bakF, DST[k]);
            console.log('restored ' + k + ' <- ' + latest);
            n++;
        }
    }
    console.log('rolled back ' + n + ' file(s)');
    process.exit(0);
}

console.log('=== S1.5-fix 部署 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('src : ' + ROOT);
console.log('dst : ' + DEPLOY_DIR);
console.log('');

if (!fs.existsSync(SRC.ix)) { console.error('XX source not found: ' + SRC.ix); process.exit(1); }
if (!fs.existsSync(DEPLOY_DIR)) { console.error('XX deploy dir not found: ' + DEPLOY_DIR); process.exit(1); }
if (!fs.existsSync(DST.ix)) { console.error('XX deploy target not found: ' + DST.ix); process.exit(1); }

const srcHash = sha256(SRC.ix);
const dstHash = sha256(DST.ix);
console.log('src sha256: ' + srcHash);
console.log('dst sha256: ' + dstHash);
console.log('identical (before): ' + (srcHash === dstHash));
console.log('');

if (srcHash === dstHash) {
    console.log('nothing to do: source and deploy already identical');
    process.exit(0);
}

const stamp = ts();
const bakDir = path.join(DEPLOY_DIR, BAK_PREFIX + stamp);
const bakFile = path.join(bakDir, 'index.js');

console.log('backup dir : ' + bakDir);
console.log('backup file: ' + bakFile);
console.log('');

if (DRY_RUN) {
    console.log('DRY-RUN: step1 backup  ' + DST.ix + '  ->  ' + bakFile);
    console.log('DRY-RUN: step2 copy    ' + SRC.ix + '  ->  ' + DST.ix);
    console.log('DRY-RUN: step3 verify  sha256(src) === sha256(dst)');
    console.log('DRY-RUN: step4 verify  node --check ' + DST.ix);
    console.log('DRY-RUN: step5 verify  byte diff === 0');
    console.log('DRY-RUN done, nothing written.');
    process.exit(0);
}

// APPLY
fs.mkdirSync(bakDir, { recursive: true });
fs.copyFileSync(DST.ix, bakFile);
console.log('[1/4] backup done: ' + bakFile);

fs.copyFileSync(SRC.ix, DST.ix);
console.log('[2/4] copied: ' + SRC.ix + ' -> ' + DST.ix);

const afterSrc = sha256(SRC.ix);
const afterDst = sha256(DST.ix);
if (afterSrc !== afterDst) {
    console.error('XX hash mismatch after copy: src=' + afterSrc + ' dst=' + afterDst);
    process.exit(1);
}
console.log('[3/4] hash match: ' + afterDst);

const r = spawnSync(process.execPath, ['--check', DST.ix], { encoding: 'utf8' });
if (r.status !== 0) {
    console.error('XX node --check failed on ' + DST.ix);
    console.error(r.stderr || r.stdout);
    process.exit(1);
}
console.log('[4/4] node --check: OK');

const a = fs.readFileSync(SRC.ix);
const b = fs.readFileSync(DST.ix);
console.log('byte diff: ' + (Buffer.compare(a, b) === 0 ? '0 bytes (identical)' : 'DIFF'));

console.log('');
console.log('SUMMARY');
console.log('  backup : ' + bakDir);
console.log('  src    : ' + SRC.ix);
console.log('  dst    : ' + DST.ix);
console.log('  sha256 : ' + afterDst);
console.log('  status : OK');
console.log('done.');
