#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_DIR = 'I:/AI/SillyTavern-1.19.0/public/scripts/extensions/third-party/SillyTavern-Horae';
const REL_FILES = [
    'core/memory/identityStore.js',
    'core/horaeManager.js',
    'index.js',
    'locales/zh-CN.json',
    'locales/en.json',
];
const BAK_PREFIX = '.bak-b3c2b-deploy-';
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
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

if (ROLLBACK) {
    if (!fs.existsSync(DEPLOY_DIR)) { console.error('XX deploy dir not found'); process.exit(1); }
    const entries = fs.readdirSync(DEPLOY_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith(BAK_PREFIX)).map(e => e.name).sort();
    if (entries.length === 0) { console.error('no backup dir'); process.exit(1); }
    const latest = entries[entries.length - 1];
    const bakDir = path.join(DEPLOY_DIR, latest);
    let n = 0;
    for (const rel of REL_FILES) {
        const bakF = path.join(bakDir, rel);
        const dstF = path.join(DEPLOY_DIR, rel);
        if (fs.existsSync(bakF)) { fs.copyFileSync(bakF, dstF); console.log('restored ' + rel); n++; }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== B3c-2b 部署 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(DEPLOY_DIR)) { console.error('XX deploy dir not found'); process.exit(1); }

const stamp = ts();
const bakDir = path.join(DEPLOY_DIR, BAK_PREFIX + stamp);
const plan = [];

for (const rel of REL_FILES) {
    const srcF = path.join(ROOT, rel);
    const dstF = path.join(DEPLOY_DIR, rel);
    const bakF = path.join(bakDir, rel);
    if (!fs.existsSync(srcF)) { console.error('XX source missing: ' + rel); process.exit(1); }
    const srcHash = sha256(srcF);
    const dstExists = fs.existsSync(dstF);
    const dstHash = dstExists ? sha256(dstF) : null;
    plan.push({ rel, srcF, dstF, bakF, srcHash, dstHash, dstExists, same: dstExists && srcHash === dstHash });
}

console.log('plan:');
for (const p of plan) {
    const tag = !p.dstExists ? 'NEW' : (p.same ? 'SAME' : 'DIFF');
    console.log(`  [${tag}] ${p.rel}`);
}
console.log('');

if (plan.every(p => p.same)) { console.log('nothing to do'); process.exit(0); }
console.log('backup dir : ' + bakDir);
console.log('');

if (DRY_RUN) {
    for (const p of plan) {
        if (p.same) { console.log('DRY-RUN: [skip] ' + p.rel); continue; }
        if (p.dstExists) console.log('DRY-RUN: [backup] ' + p.rel);
        console.log('DRY-RUN: [copy] ' + p.rel);
    }
    console.log('DRY-RUN done, nothing written.');
    process.exit(0);
}

let written = 0;
for (const p of plan) {
    if (p.same) { console.log('[skip]   ' + p.rel); continue; }
    if (p.dstExists) { ensureDir(path.dirname(p.bakF)); fs.copyFileSync(p.dstF, p.bakF); console.log('[backup] ' + p.rel); }
    ensureDir(path.dirname(p.dstF));
    fs.copyFileSync(p.srcF, p.dstF);
    console.log('[copy]   ' + p.rel);
    const afterDstHash = sha256(p.dstF);
    if (afterDstHash !== p.srcHash) { console.error('XX hash mismatch: ' + p.rel); process.exit(1); }
    console.log('[hash]   ' + p.rel + ' OK');
    if (p.rel.endsWith('.js')) {
        const r = spawnSync(process.execPath, ['--check', p.dstF], { encoding: 'utf8' });
        if (r.status !== 0) { console.error('XX check failed: ' + p.rel); console.error(r.stderr); process.exit(1); }
        console.log('[check]  ' + p.rel + ' OK');
    }
    const a = fs.readFileSync(p.srcF); const b = fs.readFileSync(p.dstF);
    if (Buffer.compare(a, b) !== 0) { console.error('XX byte diff: ' + p.rel); process.exit(1); }
    console.log('[diff]   ' + p.rel + ' 0 bytes');
    written++;
}

console.log('');
console.log('SUMMARY');
console.log('  backup : ' + bakDir);
console.log('  written: ' + written);
console.log('  status : OK');
console.log('done.');
