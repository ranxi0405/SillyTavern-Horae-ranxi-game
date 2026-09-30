#!/usr/bin/env node
/**
 * P4 Migration Patch
 *
 * 目标文件：core/memory/identitySchemaVersion.js
 * 新增文件：tools/test-p4-rollback.mjs
 *
 * 用法：
 *   node tools/patch-p4-migration.mjs --dry-run   # 默认，只输出 plan
 *   node tools/patch-p4-migration.mjs --apply
 *
 * 原则：
 *   - 每个 patch 使用精确 match；匹配失败立刻 abort，不写任何文件
 *   - 每个 match 必须唯一命中（count === 1），否则 abort
 *   - 不按行号，按函数边界（完整旧函数体）定位
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identitySchemaVersion.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p4-rollback.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ───────────────────────────────────────────────────────────
// patch 定义（每段旧代码必须与实际文件一字不差）
// ───────────────────────────────────────────────────────────

const PATCH_COMMENT_OLD = ` * 阶段 4 补充：
 *   - 更复杂的迁移规则（字段别名、数据清洗）
 *   - 更严格的 verify（entries 与 legacy 逐字段对比）
 *   - 真正的 rollback（从外部备份 JSON 恢复）
 *   - 触发时机与 Console 提示`;

const PATCH_COMMENT_NEW = ` * 阶段 4 补充：
 *   - migrate 支持 backup（结构化深拷贝）
 *   - rollback 全量原地恢复（不调 syncLegacyMirror）
 *   - v0.2 缺 entries 且 legacy 为空 → 拒绝迁移，不改动
 *   - backup 仅通过 migrate 返回值带出，不持久化`;

const PATCH_HELPERS_OLD = `// verify 时参与一致性检查的标量 kind
const _SCALAR_KINDS_FOR_VERIFY = ['gender', 'spiritRoot', 'constitution', 'bloodline', 'xianZi', 'background'];`;

const PATCH_HELPERS_NEW = `// verify 时参与一致性检查的标量 kind
const _SCALAR_KINDS_FOR_VERIFY = ['gender', 'spiritRoot', 'constitution', 'bloodline', 'xianZi', 'background'];

// ─── 内部：深拷贝（structuredClone 优先，JSON 兜底） ───
function _clone(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(obj); } catch (_) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(obj));
}

// ─── 内部：legacy 是否有可用内容 ───
function _hasLegacyFields(id) {
    if (!id || typeof id !== 'object') return false;
    for (const field of Object.values(LEGACY_FIELD_MAP)) {
        const v = id[field];
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        return true;
    }
    return false;
}`;

const PATCH_MIGRATE_OLD = `export function migrate(id, opts = {}) {
    if (!id || typeof id !== 'object') {
        return { ok: false, reason: 'notObject', fromVersion: 'unknown', toVersion: SCHEMA_VERSION_CURRENT, migratedCount: 0, entries: [] };
    }

    const fromVersion = detectVersion(id);

    if (fromVersion === SCHEMA_VERSION_CURRENT) {
        // 边界：v0.2 但 entries 缺失 → 从 legacy 恢复
        if (!Array.isArray(id.entries)) {
            const recovered = syncLegacyToEntries(id);
            return {
                ok: true, reason: 'repairedMissingEntries',
                fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
                migratedCount: recovered.migratedCount,
                entries: recovered.entries,
                verify: verify(id),
            };
        }
        return {
            ok: true, reason: 'alreadyCurrent',
            fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
            migratedCount: 0, entries: getIdentityEntries(id),
        };
    }

    if (fromVersion === 'unknown') {
        return {
            ok: false, reason: 'unsupportedVersion',
            fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
            migratedCount: 0, entries: [],
        };
    }

    // v0.1 → v0.2（阶段 1 已实现 syncLegacyToEntries）
    const result = syncLegacyToEntries(id);
    const vResult = verify(id);
    return {
        ok: vResult.ok,
        fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
        migratedCount: result.migratedCount,
        entries: result.entries,
        verify: vResult,
    };
}`;

const PATCH_MIGRATE_NEW = `export function migrate(id, opts = {}) {
    if (!id || typeof id !== 'object') {
        return { ok: false, reason: 'notObject', fromVersion: 'unknown', toVersion: SCHEMA_VERSION_CURRENT, migratedCount: 0, entries: [] };
    }

    const fromVersion = detectVersion(id);

    // 已就绪：不动，不生成 backup
    if (fromVersion === SCHEMA_VERSION_CURRENT && Array.isArray(id.entries)) {
        return {
            ok: true, reason: 'alreadyCurrent',
            fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
            migratedCount: 0, entries: getIdentityEntries(id),
        };
    }

    // 不支持的版本：不动，不生成 backup
    if (fromVersion === 'unknown') {
        return {
            ok: false, reason: 'unsupportedVersion',
            fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
            migratedCount: 0, entries: [],
        };
    }

    // v0.2 但 entries 缺失：先判 legacy 是否有内容
    if (fromVersion === SCHEMA_VERSION_CURRENT) {
        if (!_hasLegacyFields(id)) {
            // 无法修复：不改动，不生成 backup
            return {
                ok: false, reason: 'entriesMissingAndLegacyEmpty',
                fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
                migratedCount: 0, entries: [],
            };
        }
        const backup = (opts && opts.backup && typeof opts.backup === 'object')
            ? opts.backup
            : _clone(id);
        const recovered = syncLegacyToEntries(id);
        return {
            ok: true, reason: 'repairedMissingEntries',
            fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
            migratedCount: recovered.migratedCount,
            entries: recovered.entries,
            backup,
            verify: verify(id),
        };
    }

    // v0.1 → v0.2：正常迁移
    const backup = (opts && opts.backup && typeof opts.backup === 'object')
        ? opts.backup
        : _clone(id);
    const result = syncLegacyToEntries(id);
    const vResult = verify(id);
    return {
        ok: vResult.ok,
        fromVersion, toVersion: SCHEMA_VERSION_CURRENT,
        migratedCount: result.migratedCount,
        entries: result.entries,
        backup,
        verify: vResult,
    };
}`;

const PATCH_ROLLBACK_OLD = `export function rollback(id, backup = null) {
    if (!id || typeof id !== 'object') return { ok: false, reason: 'notObject' };
    if (!backup || typeof backup !== 'object') return { ok: false, reason: 'noBackup' };
    // 阶段 4 实现真正的恢复逻辑
    return { ok: false, reason: 'notImplemented' };
}`;

const PATCH_ROLLBACK_NEW = `export function rollback(id, backup = null) {
    if (!id || typeof id !== 'object') return { ok: false, reason: 'notObject' };
    if (!backup || typeof backup !== 'object') return { ok: false, reason: 'noBackup' };
    if (backup === id) return { ok: false, reason: 'backupIsSameObject' };

    try {
        for (const k of Object.keys(id)) delete id[k];
        const restored = _clone(backup);
        for (const k of Object.keys(restored)) id[k] = restored[k];
    } catch (e) {
        return { ok: false, reason: 'assignFailed', error: String(e) };
    }

    const v = verify(id);
    return {
        ok: v.ok,
        reason: v.ok ? 'restored' : 'restoredWithIssues',
        verify: v,
    };
}`;

const PATCHES = [
    { id: 'comment',  desc: '顶部注释：阶段 4 补充段落',  match: PATCH_COMMENT_OLD,  replace: PATCH_COMMENT_NEW },
    { id: 'helpers',  desc: '插入 _clone / _hasLegacyFields', match: PATCH_HELPERS_OLD,  replace: PATCH_HELPERS_NEW },
    { id: 'migrate',  desc: '替换 migrate()',             match: PATCH_MIGRATE_OLD,  replace: PATCH_MIGRATE_NEW },
    { id: 'rollback', desc: '替换 rollback()',            match: PATCH_ROLLBACK_OLD, replace: PATCH_ROLLBACK_NEW },
];

// ───────────────────────────────────────────────────────────
// 新文件：tools/test-p4-rollback.mjs
// ───────────────────────────────────────────────────────────

const TEST_FILE_CONTENT = `import { migrate, rollback } from '../core/memory/identitySchemaVersion.js';

console.log('=== P4 migrate / rollback 测试 ===\\n');

// case 1: v0.1 -> v0.2，应生成 backup
{
    const id = { gender: '女', spiritRoot: '无界灵根', talents: ['过目不忘'] };
    const r = migrate(id);
    console.log('[case1 v0.1->v0.2]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| count:', r.migratedCount, '| hasBackup:', !!r.backup);
    console.log('  id._v:', id._v, '| entries.len:', id.entries?.length);
    console.log('');
}

// case 2: rollback 到备份，逐字段比对
{
    const id = { gender: '女', spiritRoot: '无界灵根' };
    const snapshotBefore = JSON.stringify(id);
    const r = migrate(id);
    const snapshotAfterMigrate = JSON.stringify(id);

    const rb = rollback(id, r.backup);
    const snapshotAfterRollback = JSON.stringify(id);

    console.log('[case2 rollback]');
    console.log('  rb.ok:', rb.ok, '| rb.reason:', rb.reason);
    console.log('  after rollback matches pre-migrate:', snapshotAfterRollback === snapshotBefore);
    console.log('  after migrate differs from pre-migrate:', snapshotAfterMigrate !== snapshotBefore);
    console.log('  gender restored:', id.gender === '女');
    console.log('  spiritRoot restored:', id.spiritRoot === '无界灵根');
    console.log('  _v cleared:', id._v === undefined, '| entries cleared:', id.entries === undefined);
    console.log('');
}

// case 3: v0.2 缺 entries 但 legacy 有内容 -> repairedMissingEntries + backup
{
    const id = { _v: 'v0.2', gender: '男' };
    const r = migrate(id);
    console.log('[case3 v0.2 缺 entries，legacy 有值]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  after: _v =', id._v, '| entries.len =', id.entries?.length);
    console.log('');
}

// case 4: v0.2 缺 entries 且 legacy 也为空 -> 拒绝迁移
{
    const id = { _v: 'v0.2' };
    const before = JSON.stringify(id);
    const r = migrate(id);
    const after = JSON.stringify(id);
    console.log('[case4 v0.2 缺 entries，legacy 也空]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  untouched:', before === after);
    console.log('');
}

// case 5: alreadyCurrent -> 不生成 backup
{
    const id = { _v: 'v0.2', entries: [] };
    const r = migrate(id);
    console.log('[case5 alreadyCurrent]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('');
}

// case 6: unknown -> ok:false，不改动
{
    const id = { _v: 'v99.9', foo: 1 };
    const before = JSON.stringify(id);
    const r = migrate(id);
    const after = JSON.stringify(id);
    console.log('[case6 unknown]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  untouched:', before === after);
    console.log('');
}

// case 7: rollback noBackup
{
    const id = { a: 1 };
    const rb = rollback(id, null);
    console.log('[case7 rollback noBackup]');
    console.log('  ok:', rb.ok, '| reason:', rb.reason);
    console.log('');
}

// case 8: rollback backupIsSameObject
{
    const id = { a: 1 };
    const rb = rollback(id, id);
    console.log('[case8 rollback same object]');
    console.log('  ok:', rb.ok, '| reason:', rb.reason);
    console.log('');
}
`;

// ───────────────────────────────────────────────────────────
// 工具
// ───────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
    let n = 0, i = 0;
    while (true) {
        const j = haystack.indexOf(needle, i);
        if (j === -1) break;
        n++; i = j + needle.length;
    }
    return n;
}

// ───────────────────────────────────────────────────────────
// 主流程
// ───────────────────────────────────────────────────────────

console.log('=== P4 Migration Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) {
    console.error('XX target missing: ' + TARGET);
    process.exit(1);
}

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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(9) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" (' + failed.desc + ') match failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}

// 内存中依次替换
let next = content;
for (const p of PATCHES) {
    next = next.replace(p.match, p.replace);
}

const delta = next.length - content.length;

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) {
    testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
}

console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE);
console.log('  exists: ' + testExists + (testSame ? ' (identical, will skip)' : ''));
console.log('');

if (DRY_RUN) {
    console.log('DRY-RUN done. no files written.');
    process.exit(0);
}

// apply
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
