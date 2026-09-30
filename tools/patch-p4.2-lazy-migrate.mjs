#!/usr/bin/env node
/**
 * P4.2 Patch - getIdentityEntries v0.1 分支改为 mutate 迁移
 *
 * 目标文件：core/memory/identityStore.js
 * 新增文件：tools/test-p4.2-lazy-migrate.mjs
 *
 * 用法：
 *   node tools/patch-p4.2-lazy-migrate.mjs --dry-run
 *   node tools/patch-p4.2-lazy-migrate.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityStore.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p4.2-lazy-migrate.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCH_OLD = `export function getIdentityEntries(id, opts = {}) {
    if (!id || typeof id !== 'object') return [];
    let list;
    if (id._v === IDENTITY_VERSION_V02 && Array.isArray(id.entries)) {
        list = id.entries.map(_normalizeEntry).filter(Boolean);
    } else {
        list = _deriveEntriesFromLegacy(id);
    }
    if (opts.includeNotGenerated === false) {
        list = list.filter(e => e.value != null);
    }
    return list;
}`;

const PATCH_NEW = `export function getIdentityEntries(id, opts = {}) {
    if (!id || typeof id !== 'object') return [];
    let list;
    if (id._v === IDENTITY_VERSION_V02 && Array.isArray(id.entries)) {
        list = id.entries.map(_normalizeEntry).filter(Boolean);
    } else {
        // 懒迁移：v0.1 → v0.2（mutate id，保证后续读路径一致）
        // 幂等：迁移后 id._v='v0.2' + id.entries 存在，二次调用走上面的 v0.2 分支
        const r = syncLegacyToEntries(id);
        list = (r.entries || []).map(_normalizeEntry).filter(Boolean);
    }
    if (opts.includeNotGenerated === false) {
        list = list.filter(e => e.value != null);
    }
    return list;
}`;

const PATCHES = [
    { id: 'getEntries', desc: 'getIdentityEntries v0.1 分支改 mutate 迁移', match: PATCH_OLD, replace: PATCH_NEW },
];

const TEST_FILE_CONTENT = `import { getIdentityEntries, syncLegacyToEntries } from '../core/memory/identityStore.js';

console.log('=== P4.2 getIdentityEntries 懒迁移测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1: v0.1 输入 -> 调 getIdentityEntries 后应变成 v0.2
{
    const id = { gender: '女', spiritRoot: '无界灵根', talents: ['过目不忘', '气运加身'] };
    console.log('[case1 v0.1 -> 懒迁移]');
    check('before: _v undefined', id._v === undefined);
    check('before: entries undefined', id.entries === undefined);

    const list = getIdentityEntries(id);

    check('after: _v = v0.2', id._v === 'v0.2');
    check('after: entries 已写入', Array.isArray(id.entries));
    check('after: entries.len = 3', id.entries.length === 3);
    check('after: 返回列表 len = 3', list.length === 3);
    console.log('');
}

// case2: 幂等 - 二次调用走 v0.2 分支，不重复迁移
{
    const id = { gender: '男', talents: ['桃花运'] };
    const l1 = getIdentityEntries(id);
    const entriesRef1 = id.entries;
    const l2 = getIdentityEntries(id);
    const entriesRef2 = id.entries;

    console.log('[case2 幂等]');
    check('_v 仍 v0.2', id._v === 'v0.2');
    check('entries 引用未变', entriesRef1 === entriesRef2);
    check('两次返回长度一致', l1.length === l2.length);
    console.log('');
}

// case3: v0.2 输入 - 不触发迁移（走早分支）
{
    const existing = [{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }];
    const id = { _v: 'v0.2', entries: existing };
    const list = getIdentityEntries(id);
    console.log('[case3 已是 v0.2]');
    check('entries 引用未变', id.entries === existing);
    check('返回 len = 1', list.length === 1);
    console.log('');
}

// case4: null / 非对象
{
    check('null 返回 []', getIdentityEntries(null).length === 0);
    check('数字返回 []', getIdentityEntries(42).length === 0);
    check('字符串返回 []', getIdentityEntries('foo').length === 0);
    console.log('[case4 null/非对象] PASS if above all PASS');
    console.log('');
}

// case5: v0.2 但 entries 缺失 -> 走 lazy 分支恢复
{
    const id = { _v: 'v0.2', gender: '女', talents: ['过目不忘'] };
    const list = getIdentityEntries(id);
    console.log('[case5 v0.2 但无 entries]');
    check('entries 已恢复', Array.isArray(id.entries));
    check('返回 len = 2', list.length === 2);
    console.log('');
}

// case6: syncLegacyToEntries 仍是幂等
{
    const id = { gender: '女' };
    const r1 = syncLegacyToEntries(id);
    const r2 = syncLegacyToEntries(id);
    console.log('[case6 syncLegacyToEntries 幂等]');
    check('第一次 migratedCount = 1', r1.migratedCount === 1);
    check('第二次 migratedCount = 0', r2.migratedCount === 0);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(haystack, needle) {
    let n = 0, i = 0;
    while (true) {
        const j = haystack.indexOf(needle, i);
        if (j === -1) break;
        n++; i = j + needle.length;
    }
    return n;
}

console.log('=== P4.2 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }

const content = fs.readFileSync(TARGET, 'utf8');
const stats = [];
let failed = null;

for (const p of PATCHES) {
    const count = countOccurrences(content, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(11) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" match failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}

let next = content;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - content.length;

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;

console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE);
console.log('  exists: ' + testExists + (testSame ? ' (identical, will skip)' : ''));
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);

if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE + (testExists ? ' (overwritten)' : ' (created)'));
} else {
    console.log('[skip]  ' + TEST_FILE + ' (identical)');
}

console.log('');
console.log('done.');
