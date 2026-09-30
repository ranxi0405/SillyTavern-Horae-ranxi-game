/**
 * Horae IdentitySchemaVersion v0.1 (Phase P7 skeleton)
 *
 * 职责：
 *   - 检测 identity schema 版本
 *   - 判断是否需要迁移
 *   - 提供 migrate / verify / rollback 骨架
 *   - 定义版本策略常量
 *
 * 阶段 7 边界：
 *   - 只建立骨架
 *   - migrate 调用 syncLegacyToEntries（阶段 1 已实现）
 *   - verify 做基础检查
 *   - rollback 留占位（阶段 4 才实现）
 *
 * 阶段 4 补充：
 *   - migrate 支持 backup（结构化深拷贝）
 *   - rollback 全量原地恢复（不调 syncLegacyMirror）
 *   - v0.2 缺 entries 且 legacy 为空 → 拒绝迁移，不改动
 *   - backup 仅通过 migrate 返回值带出，不持久化
 *
 * 依赖：
 *   - identityStore.js（版本常量 / getIdentityEntries / syncLegacyToEntries / LEGACY_FIELD_MAP）
 */

import {
    IDENTITY_VERSION,
    IDENTITY_VERSION_V02,
    getIdentityEntries,
    syncLegacyToEntries,
    LEGACY_FIELD_MAP,
} from './identityStore.js';

// ─── 版本常量 ───
export const SCHEMA_VERSION_LEGACY = IDENTITY_VERSION;          // 'v0.1'
export const SCHEMA_VERSION_CURRENT = IDENTITY_VERSION_V02;     // 'v0.2'
export const SUPPORTED_VERSIONS = [SCHEMA_VERSION_LEGACY, SCHEMA_VERSION_CURRENT];

// verify 时参与一致性检查的标量 kind
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
}

// ─── 版本检测 ───

/**
 * 检测 identity 对象的 schema 版本
 * @param {object} id
 * @returns {'v0.1'|'v0.2'|'unknown'}
 */
export function detectVersion(id) {
    if (!id || typeof id !== 'object') return 'unknown';
    const v = id._v;
    if (typeof v !== 'string' || !v.trim()) {
        // 无 _v 字段：视为 v0.1（旧数据）
        return SCHEMA_VERSION_LEGACY;
    }
    if (SUPPORTED_VERSIONS.includes(v)) return v;
    return 'unknown';
}

/**
 * 是否需要迁移
 * @param {object} id
 * @returns {boolean}
 */
export function needsMigration(id) {
    return detectVersion(id) === SCHEMA_VERSION_LEGACY;
}

// ─── 迁移（阶段 7 骨架版） ───

/**
 * 迁移 identity 到当前 schema 版本
 * @param {object} id
 * @param {object} [opts] - 保留给阶段 4（如 opts.backup, opts.dryRun）
 * @returns {{ ok: boolean, fromVersion: string, toVersion: string, migratedCount: number, entries: Array, reason?: string, verify?: object }}
 */
export function migrate(id, opts = {}) {
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
}

// ─── 校验（阶段 7 基础版） ───

/**
 * 校验 identity 结构完整性
 * @param {object} id
 * @returns {{ ok: boolean, version: string, issues: Array }}
 */
export function verify(id) {
    const issues = [];
    if (!id || typeof id !== 'object') {
        return { ok: false, version: 'unknown', issues: [{ type: 'notObject' }] };
    }

    const version = detectVersion(id);

    if (version === 'unknown') {
        issues.push({ type: 'unsupportedVersion', version: id._v });
        return { ok: false, version, issues };
    }

    if (version === SCHEMA_VERSION_CURRENT) {
        if (!Array.isArray(id.entries)) {
            issues.push({ type: 'entriesMissing' });
        } else {
            // 逐条 entry 字段检查
            id.entries.forEach((e, i) => {
                if (!e || typeof e !== 'object') { issues.push({ type: 'entryNotObject', index: i }); return; }
                if (!e.id) { issues.push({ type: 'entryMissingId', index: i }); }
                if (!e.kind) { issues.push({ type: 'entryMissingKind', index: i }); }
                if (e.value === undefined) { issues.push({ type: 'entryMissingValue', index: i }); }
            });

            // legacy 字段与 entries 一致性检查（标量 kind）
            for (const kind of _SCALAR_KINDS_FOR_VERIFY) {
                const legacyField = LEGACY_FIELD_MAP[kind];
                if (!legacyField) continue;
                const legacyValue = id[legacyField] ?? null;
                const entry = id.entries.find(e => e.kind === kind);
                const entryValue = entry ? entry.value : null;
                if (legacyValue !== entryValue) {
                    issues.push({ type: 'legacyMismatch', kind, legacyValue, entryValue });
                }
            }
        }
    }

    return { ok: issues.length === 0, version, issues };
}

// ─── 回滚（阶段 7 占位） ───

/**
 * 回滚到备份状态
 * 阶段 4 实现：从外部备份 JSON 恢复
 * @param {object} id
 * @param {object} backup - 备份的 identity 对象
 * @returns {{ ok: boolean, reason?: string }}
 */
export function rollback(id, backup = null) {
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
}
