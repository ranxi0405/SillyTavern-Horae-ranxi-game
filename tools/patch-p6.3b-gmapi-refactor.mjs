#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityGmApi.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p6.3b-gmapi-refactor.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── A. import 加 applyDiscover / applyReveal ──

const IMP_OLD = `} from './identityStore.js';
import {
    detectVersion,`;

const IMP_NEW = `} from './identityStore.js';
import { applyDiscover, applyReveal } from './identityDiscovery.js';
import {
    detectVersion,`;

// ── B. discover() 改薄包装 ──

const DISC_OLD = `        discover(entryId, opts = {}) {
            if (!entryId) return _log('discover', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            if (!entry.discovery || typeof entry.discovery !== 'object') {
                entry.discovery = {
                    type: 'manual',
                    trigger: null,
                    requirement: null,
                    progress: 0,
                    discoveredAt: null,
                    meta: {},
                };
            }
            if (entry.discovery.discoveredAt == null) {
                entry.discovery.discoveredAt = {
                    iso: now,
                    story: (opts && opts.story) || null,
                };
            }
            entry.updatedAt = now;
            return _log('discover', entry);
        },`;

const DISC_NEW = `        discover(entryId, opts = {}) {
            if (!entryId) return _log('discover', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            return _log('discover', applyDiscover(entry, opts));
        },`;

// ── C. reveal() 改薄包装 ──

const REV_OLD = `        reveal(entryId, opts = {}) {
            if (!entryId) return _log('reveal', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            const story = (opts && opts.story) || null;
            if (!entry.revealedAt) {
                entry.revealedAt = { iso: now, story };
            } else {
                if (story) entry.revealedAt.story = story;
            }
            entry.updatedAt = now;
            return _log('reveal', entry);
        },`;

const REV_NEW = `        reveal(entryId, opts = {}) {
            if (!entryId) return _log('reveal', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            return _log('reveal', applyReveal(entry, opts));
        },`;

const PATCHES = [
    { id: 'imp',  desc: 'import 加 applyDiscover / applyReveal', match: IMP_OLD,  replace: IMP_NEW },
    { id: 'disc', desc: 'discover() 改薄包装',                    match: DISC_OLD, replace: DISC_NEW },
    { id: 'rev',  desc: 'reveal() 改薄包装',                      match: REV_OLD,  replace: REV_NEW },
];

const TEST_FILE_CONTENT = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== P6.3b GM API 重构验证 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const gm = read('core/memory/identityGmApi.js');
const disc = read('core/memory/identityDiscovery.js');

// import 断言
check('gm 顶部 import applyDiscover', gm.includes("import { applyDiscover, applyReveal } from './identityDiscovery.js'"));
check('gm import identityDiscovery 只出现一次', (gm.match(/from '.\\/identityDiscovery.js'/g) || []).length === 1);

// discover 薄包装断言
check('gm.discover 调用 applyDiscover', /discover\\(entryId, opts = \\{\\}\\)[\\s\\S]*?applyDiscover\\(entry, opts\\)/.test(gm));
check('gm.discover 不再内联创建 entry.discovery', !/discover\\(entryId[\\s\\S]*?entry\\.discovery = \\{/.test(gm));

// reveal 薄包装断言
check('gm.reveal 调用 applyReveal', /reveal\\(entryId, opts = \\{\\}\\)[\\s\\S]*?applyReveal\\(entry, opts\\)/.test(gm));
check('gm.reveal 不再内联写 entry.revealedAt', !/reveal\\(entryId[\\s\\S]*?entry\\.revealedAt = \\{/.test(gm));

// 唯一入口断言
check('identityDiscovery 导出 applyDiscover', disc.includes('export function applyDiscover'));
check('identityDiscovery 导出 applyReveal', disc.includes('export function applyReveal'));

// 未动 help
check('gm.help 仍含 discover 行', gm.includes("discover(id, opts)"));
check('gm.help 仍含 reveal 行', gm.includes("reveal(id, opts)"));

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.3b Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');
if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }
const src = fs.readFileSync(TARGET, 'utf8');
const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(src, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(5) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - src.length;
let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE + ' exists=' + testExists);
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
