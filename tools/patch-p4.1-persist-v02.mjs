#!/usr/bin/env node
/**
 * P4.1 Patch - persist _v / entries through normalizeIdentity
 *
 * 目标文件：core/memory/identityStore.js
 * 新增文件：tools/test-p4.1-normalize.mjs
 *
 * 用法：
 *   node tools/patch-p4.1-persist-v02.mjs --dry-run
 *   node tools/patch-p4.1-persist-v02.mjs --apply
 *
 * 原则：精确 match + 唯一性检查 + 失败 abort，不按行号。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityStore.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p4.1-normalize.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCH_NORMALIZE_OLD = `export function normalizeIdentity(raw) {
    const base = emptyIdentity();
    if (!raw || typeof raw !== 'object') return base;

    for (const f of STRING_FIELDS) {
        base[f] = _normString(raw[f]);
    }
    for (const f of ARRAY_FIELDS) {
        base[f] = _normArray(raw[f]);
    }
    for (const f of DISPLAY_FIELDS) {
        base[f] = _normString(raw[f]);
    }
    base.hidden = raw.hidden === true;

    return base;
}`;

const PATCH_NORMALIZE_NEW = `export function normalizeIdentity(raw) {
    const base = emptyIdentity();
    if (!raw || typeof raw !== 'object') return base;

    for (const f of STRING_FIELDS) {
        base[f] = _normString(raw[f]);
    }
    for (const f of ARRAY_FIELDS) {
        base[f] = _normArray(raw[f]);
    }
    for (const f of DISPLAY_FIELDS) {
        base[f] = _normString(raw[f]);
    }
    base.hidden = raw.hidden === true;

    // v0.2 schema 字段：保留 _v 与 entries
    // 否则每次 save 都会把 _v 重置回 v0.1、丢掉 entries，导致无限重迁移
    if (typeof raw._v === 'string' && raw._v.trim()) {
        base._v = raw._v.trim();
    }
    if (Array.isArray(raw.entries)) {
        try {
            base.entries = JSON.parse(JSON.stringify(raw.entries));
        } catch (_) {
            base.entries = raw.entries.slice();
        }
    }

    return base;
}`;

const PATCHES = [
    { id: 'normalize', desc: 'normalizeIdentity 保留 _v / entries', match: PATCH_NORMALIZE_OLD, replace: PATCH_NORMALIZE_NEW },
];

const TEST_FILE_CONTENT = `import { normalizeIdentity } from '../core/memory/identityStore.js';

console.log('=== P4.1 normalizeIdentity 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1: v0.2 + entries 应被保留
{
    const raw = {
        _v: 'v0.2',
        entries: [
            { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
            { id: 'e2', kind: 'talent', value: '过目不忘', visibility: 'public' },
        ],
        gender: '女',
        talents: ['过目不忘'],
    };
    const n = normalizeIdentity(raw);
    console.log('[case1 v0.2 + entries]');
    check('_v preserved', n._v === 'v0.2');
    check('entries preserved len=2', Array.isArray(n.entries) && n.entries.length === 2);
    check('legacy gender', n.gender === '女');
    check('legacy talents len=1', Array.isArray(n.talents) && n.talents.length === 1);
    console.log('');
}

// case2: v0.2 但 entries 缺失 -> _v 保留，entries undefined
{
    const raw = { _v: 'v0.2', gender: '男' };
    const n = normalizeIdentity(raw);
    console.log('[case2 v0.2 无 entries]');
    check('_v preserved', n._v === 'v0.2');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case3: 无 _v -> 回退到 v0.1（emptyIdentity 默认）
{
    const raw = { gender: '女' };
    const n = normalizeIdentity(raw);
    console.log('[case3 无 _v]');
    check('_v defaults to v0.1', n._v === 'v0.1');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case4: null 输入
{
    const n = normalizeIdentity(null);
    console.log('[case4 null]');
    check('_v defaults to v0.1', n._v === 'v0.1');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case5: entries 深拷贝验证（修改 normalized 不应影响 raw）
{
    const raw = {
        _v: 'v0.2',
        entries: [{ id: 'e1', kind: 'gender', value: '女', meta: { tag: 'a' } }],
        gender: '女',
    };
    const n = normalizeIdentity(raw);
    n.entries[0].value = 'MUTATED';
    n.entries[0].meta.tag = 'MUTATED';
    console.log('[case5 deep clone]');
    check('raw entry value unchanged', raw.entries[0].value === '女');
    check('raw entry meta unchanged', raw.entries[0].meta.tag === 'a');
    console.log('');
}

// case6: entries 非数组时应忽略
{
    const raw = { _v: 'v0.2', entries: 'not-an-array', gender: '女' };
    const n = normalizeIdentity(raw);
    console.log('[case6 entries 非数组]');
    check('_v preserved', n._v === 'v0.2');
    check('entries undefined', n.entries === undefined);
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

console.log('=== P4.1 Patch ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(10) + ' ' + s.desc);
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
