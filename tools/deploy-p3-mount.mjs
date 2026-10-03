#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_DIR = 'I:/AI/SillyTavern-1.19.0/public/scripts/extensions/third-party/SillyTavern-Horae';
const REL_FILES = [
    'index.js',
    'core/horaeManager.js',
    'core/memory/hiddenKeywords.js',
    'core/memory/identityKindRegistry.js',
    'core/memory/identityStore.js',
    'core/memory/identityView.js',
    'core/memory/identityDiscovery.js',
    'core/memory/npcKnowledge.js',
    'core/memory/identitySchemaVersion.js',
    'core/memory/identityGmApi.js',
    'core/memory/identityNpcPrompt.js',
    'core/memory/directorStore.js',
];
const BAK_PREFIX = '.bak-p3-deploy-';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

function ts() { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
function sha256(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

console.log('=== P3 部署 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(DEPLOY_DIR)) { console.error('XX deploy dir not found'); process.exit(1); }
const bakDir = path.join(DEPLOY_DIR, BAK_PREFIX + ts());
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
for (const p of plan) { const tag = !p.dstExists ? 'NEW' : (p.same ? 'SAME' : 'DIFF'); console.log(`  [${tag}] ${p.rel}`); }
console.log('');
if (plan.every(p => p.same)) { console.log('nothing to do'); process.exit(0); }
console.log('backup dir : ' + bakDir);
console.log('');
if (DRY_RUN) {
    for (const p of plan) { if (p.same) continue; console.log('DRY-RUN: copy ' + p.rel); }
    console.log('DRY-RUN done.');
    process.exit(0);
}
let written = 0;
for (const p of plan) {
    if (p.same) { console.log('[skip]   ' + p.rel); continue; }
    if (p.dstExists) { ensureDir(path.dirname(p.bakF)); fs.copyFileSync(p.dstF, p.bakF); console.log('[backup] ' + p.rel); }
    ensureDir(path.dirname(p.dstF));
    fs.copyFileSync(p.srcF, p.dstF);
    console.log('[copy]   ' + p.rel);
    if (p.rel.endsWith('.js')) {
        const r = spawnSync(process.execPath, ['--check', p.dstF], { encoding: 'utf8' });
        if (r.status !== 0) { console.error('XX check failed: ' + p.rel); console.error(r.stderr); process.exit(1); }
    }
    written++;
}
console.log('');
console.log('written: ' + written);
console.log('done.');
