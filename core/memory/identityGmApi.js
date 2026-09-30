/**
 * Horae IdentityGmApi v0.1 (Phase P3)
 *
 * 职责：
 *   - 提供 window.Horae.identity.gm.* Console 命令集
 *   - 通过 ctx 参数注入 I/O（避免循环依赖）
 *   - 所有命令走 identityStore / identitySchemaVersion / identityView
 *
 * 阶段 3 边界：
 *   - 不做权限校验（只有懂技术的设计者会用 Console）
 *   - 不提供 UI
 *   - 不接入 Prompt
 *   - 不做自动触发（migrate 需手动调用）
 *
 * ctx 参数（由 index.js 提供）：
 *   - getIdentity()   → 返回 chat[0].horae_meta.identity（只读引用）
 *   - setIdentity(id) → 写回 chat[0].horae_meta.identity
 *   - saveCard()      → Promise<boolean>，写回角色卡
 */

import {
    getIdentityEntries,
    getIdentityField,
    setIdentityField,
    syncLegacyToEntries,
    syncLegacyMirror,
} from './identityStore.js';
import {
    detectVersion,
    needsMigration,
    migrate as migrateSchema,
    verify as verifySchema,
    rollback as rollbackSchema,
    SCHEMA_VERSION_CURRENT,
} from './identitySchemaVersion.js';
import { renderIdentityGmRows } from './identityView.js';

const TAG = '[Horae][GM]';

function _log(cmd, result) {
    console.log(TAG, cmd + ':', result);
    return result;
}

function _warn(msg) {
    console.warn(TAG, msg);
}

/**
 * 创建 GM API
 * @param {object} ctx - { getIdentity, setIdentity, saveCard }
 * @returns {object} gm API
 */
export function createIdentityGmApi(ctx) {
    if (!ctx || typeof ctx !== 'object') {
        throw new Error('[IdentityGmApi] ctx required');
    }
    const { getIdentity, setIdentity, saveCard } = ctx;
    if (typeof getIdentity !== 'function') {
        throw new Error('[IdentityGmApi] ctx.getIdentity must be a function');
    }
    if (typeof setIdentity !== 'function') {
        throw new Error('[IdentityGmApi] ctx.setIdentity must be a function');
    }
    if (typeof saveCard !== 'function') {
        throw new Error('[IdentityGmApi] ctx.saveCard must be a function');
    }

    function _get() {
        const id = getIdentity();
        if (!id || typeof id !== 'object') return null;
        return id;
    }

    function _getOrThrow() {
        const id = _get();
        if (!id) {
            _warn('identity 不存在或为空');
            return null;
        }
        return id;
    }

    function _findEntry(id, entryId) {
        if (!id || !Array.isArray(id.entries)) return null;
        return id.entries.find(e => e && e.id === entryId) || null;
    }

    return {
        help() {
            const lines = [
                'Horae.identity.gm.* 命令集：',
                '',
                '  读操作：',
                '    help()                       - 显示本帮助',
                '    list([filter])               - 列出所有 entries',
                '                                   filter: { kind, visibility }',
                '    get(id)                      - 获取单条 entry',
                '    export()                     - 导出 JSON 字符串',
                '    verifyMigration()            - 校验 identity 结构',
                '',
                '  写操作：',
                '    set(id, patch)               - 修改 entry（禁止改 kind）',
                '    add(fields)                  - 新增 entry',
                '    remove(id)                   - 删除 entry',
                '    reveal(id)                   - 揭示（设置 revealedAt）',
                '    hide(id)                     - 隐藏（visibility=hidden）',
                '    generate(id)                 - 触发随机生成（占位）',
                '    import(json, {dryRun})       - 导入 entries（默认 dryRun）',
                '',
                '  版本 / 持久化：',
                '    migrate()                    - 迁移到当前 schema 版本',
                '    save()                       - 写回角色卡',
                '',
                '  说明：',
                '    - 所有命令直接修改 chat[0].horae_meta.identity',
                '    - 不自动写角色卡，需手动调用 save()',
                '    - gmOnly 条目不会注入 Prompt',
            ];
            console.log(lines.join('\n'));
            return lines.join('\n');
        },

        list(filter = null) {
            const id = _get();
            if (!id) return _log('list', []);
            let entries = getIdentityEntries(id, { includeNotGenerated: true });
            if (filter && typeof filter === 'object') {
                if (filter.kind) {
                    entries = entries.filter(e => e.kind === filter.kind);
                }
                if (filter.visibility) {
                    entries = entries.filter(e => e.visibility === filter.visibility);
                }
            }
            const rows = renderIdentityGmRows(id, { lang: 'zh-CN' });
            const filteredRows = filter ? rows.filter(r => {
                if (filter.kind && r.kind !== filter.kind) return false;
                if (filter.visibility && r.visibility !== filter.visibility) return false;
                return true;
            }) : rows;
            return _log('list', filteredRows);
        },

        get(entryId) {
            if (!entryId) return _log('get', null);
            const id = _get();
            if (!id) return _log('get', null);
            const entry = _findEntry(id, entryId);
            return _log('get', entry);
        },

        set(entryId, patch) {
            if (!entryId || !patch || typeof patch !== 'object') {
                return _log('set', null);
            }
            const id = _getOrThrow();
            if (!id) return null;
            if (patch.kind !== undefined) {
                _warn('set 不允许修改 kind；如需修改请先 remove 再 add');
                return null;
            }
            // 确保 entries 已同步（v0.1 会先迁移）
            if (id._v !== SCHEMA_VERSION_CURRENT) {
                syncLegacyToEntries(id);
            }
            if (!Array.isArray(id.entries)) {
                _warn('entries 不存在');
                return null;
            }
            const idx = id.entries.findIndex(e => e && e.id === entryId);
            if (idx < 0) { _warn('未找到 entry: ' + entryId); return null; }
            const entry = id.entries[idx];
            const ALLOWED = ['value', 'display', 'visibility', 'generation', 'generationConfig', 'bound', 'source', 'meta', 'revealedAt', 'discovery', '_userEdited'];
            for (const k of ALLOWED) {
                if (k in patch) entry[k] = patch[k];
            }
            entry.updatedAt = new Date().toISOString();
            // 同步旧字段镜像（不改 entries，只更新旧字段）
            syncLegacyMirror(id, entry.kind);
            _log('set', entry);
            return entry;
        },

        add(fields) {
            if (!fields || typeof fields !== 'object') return _log('add', null);
            if (!fields.kind) { _warn('add 需要 kind'); return null; }
            if (fields.value === undefined) { _warn('add 需要 value'); return null; }
            const id = _getOrThrow();
            if (!id) return null;
            const result = setIdentityField(id, fields.kind, fields.value, {
                display: fields.display ?? null,
                visibility: fields.visibility || 'public',
                generation: fields.generation || 'fixed',
                generationConfig: fields.generationConfig ?? null,
                bound: fields.bound !== false,
                source: fields.source || 'designer',
                meta: fields.meta,
            });
            return _log('add', result);
        },

        remove(entryId) {
            if (!entryId) return _log('remove', false);
            const id = _getOrThrow();
            if (!id) return false;
            if (!Array.isArray(id.entries)) {
                syncLegacyToEntries(id);
            }
            const idx = id.entries.findIndex(e => e && e.id === entryId);
            if (idx < 0) { _warn('未找到 entry: ' + entryId); return false; }
            const removed = id.entries.splice(idx, 1)[0];
            return _log('remove', removed);
        },

        reveal(entryId) {
            if (!entryId) return _log('reveal', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            entry.revealedAt = { iso: now, story: null };
            entry.updatedAt = now;
            return _log('reveal', entry);
        },

        hide(entryId) {
            if (!entryId) return _log('hide', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            entry.visibility = 'hidden';
            entry.updatedAt = new Date().toISOString();
            return _log('hide', entry);
        },

        generate(entryId) {
            // 阶段 3 占位：随机生成逻辑留给后续阶段
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            if (entry.generation === 'fixed') {
                _warn('该 entry generation=fixed，不支持随机生成');
                return null;
            }
            _warn('generate 尚未实现（阶段 4 补充）');
            return null;
        },

        migrate() {
            const id = _getOrThrow();
            if (!id) return null;
            const result = migrateSchema(id);
            _log('migrate', result);
            return result;
        },

        verifyMigration() {
            const id = _getOrThrow();
            if (!id) return null;
            const result = verifySchema(id);
            _log('verifyMigration', result);
            return result;
        },

        export() {
            const id = _getOrThrow();
            if (!id) return null;
            const json = JSON.stringify(id, null, 2);
            console.log(TAG, 'export: 已输出到下方（可复制保存）');
            console.log(json);
            return json;
        },

        import(json, opts = {}) {
            const dryRun = opts.dryRun !== false;
            if (typeof json === 'string') {
                try { json = JSON.parse(json); } catch (e) {
                    _warn('import JSON 解析失败: ' + e.message);
                    return null;
                }
            }
            if (!json || typeof json !== 'object') {
                _warn('import 需要对象或 JSON 字符串');
                return null;
            }
            const version = detectVersion(json);
            if (version !== SCHEMA_VERSION_CURRENT) {
                _warn('import schema version 不匹配: ' + version + '（需要 ' + SCHEMA_VERSION_CURRENT + '）');
                return null;
            }
            if (!Array.isArray(json.entries)) {
                _warn('import entries 缺失');
                return null;
            }
            const current = _get();
            const diff = {
                currentEntries: Array.isArray(current?.entries) ? current.entries.length : 0,
                incomingEntries: json.entries.length,
                dryRun,
            };
            if (dryRun) {
                _log('import(dryRun)', diff);
                return { ok: true, dryRun: true, diff };
            }
            setIdentity(json);
            _log('import(applied)', diff);
            return { ok: true, dryRun: false, diff };
        },

        save() {
            const id = _get();
            if (!id) { _warn('save: identity 不存在'); return Promise.resolve(false); }
            return Promise.resolve(saveCard(id)).then(r => _log('save', r));
        },
    };
}
