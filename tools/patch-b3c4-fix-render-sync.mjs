#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'index.js');
const SUFFIX = '.bak-before-b3c4-fix';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    const b = F + SUFFIX;
    if (fs.existsSync(b)) { fs.copyFileSync(b, F); fs.unlinkSync(b); console.log('restored'); }
    else console.log('no backup');
    process.exit(0);
}

console.log('=== B3c-4-fix: _cacheIdentityToChat 触发面板渲染 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

const OLD = `function _cacheIdentityToChat(identity) {
    const chat = horaeManager.getChat();
    if (!chat?.[0]?.horae_meta) return;
    chat[0].horae_meta.identity = identity || null;
}`;

const NEW = `function _cacheIdentityToChat(identity) {
    const chat = horaeManager.getChat();
    if (!chat?.[0]?.horae_meta) return;
    chat[0].horae_meta.identity = identity || null;
    // 缓存变更后立即触发面板重渲染，避免 DOM 停在旧值
    try { renderIdentityPanel(); } catch (_) {}
}`;

if (raw.includes('// 缓存变更后立即触发面板重渲染，避免 DOM 停在旧值')) {
    console.log('  .. already applied');
    process.exit(0);
}
const occ = raw.split(OLD).length - 1;
if (occ !== 1) { console.error('  XX anchor occ=' + occ + ' expect=1'); process.exit(1); }
console.log('  OK anchor (1 处)');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? raw.split(OLD).join(NEW).replace(/\n/g, '\r\n') : raw.split(OLD).join(NEW), 'utf8');
console.log('  APPLIED');
console.log('done.');
