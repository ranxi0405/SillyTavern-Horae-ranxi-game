/**
 * Horae IdentityStore v0.1
 *
 * 职责：
 *   - 定义「角色固有设定」的数据结构与校验规则
 *   - 纯数据结构层，不做 I/O
 *   - 与 StateStore / FactStore 完全隔离
 *
 * 数据流向：
 *   角色卡 extensions.horae.identity（权威）
 *        ↓ _readCardIdentity()（index.js）
 *    chat[0].horae_meta.identity（运行缓存）
 *
 * 设计原则：
 *   - 固定字段集，不动态扩展
 *   - 空值统一为 null / [] / false
 *   - hidden 只表示「存在隐藏内容」，不代表具体哪个字段隐藏
 *   - 具体隐藏字段由 HIDDEN_MAP + sanitizeHiddenKeywords 处理
 */

export const IDENTITY_VERSION = 'v0.1';

export const IDENTITY_FIELDS = [
    'spiritRoot',
    'constitution',
    'talents',
    'hidden',
    'bloodline',
    'arts',
    'background',
    'xianZi',
    'spiritRootDisplay',
    'constitutionDisplay',
    'gender',
];

const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background', 'xianZi', 'gender'];
const ARRAY_FIELDS = ['talents', 'arts'];
const DISPLAY_FIELDS = ['spiritRootDisplay', 'constitutionDisplay'];

export function emptyIdentity() {
    return {
        _v: IDENTITY_VERSION,
        spiritRoot: null,
        constitution: null,
        talents: [],
        hidden: false,
        bloodline: null,
        arts: [],
        background: null,
        xianZi: null,
        spiritRootDisplay: null,
        constitutionDisplay: null,
        gender: null,
    };
}

function _normString(v) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
}

function _normArray(v) {
    if (!Array.isArray(v)) return [];
    const seen = new Set();
    const out = [];
    for (const item of v) {
        if (typeof item !== 'string') continue;
        const t = item.trim();
        if (t === '') continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

export function normalizeIdentity(raw) {
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
}

export function validateIdentity(raw) {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, reason: 'notObject' };
    }
    const id = normalizeIdentity(raw);
    if (isIdentityEmpty(id)) {
        return { ok: false, reason: 'allEmpty' };
    }
    return { ok: true, identity: id };
}

export function isIdentityEmpty(id) {
    if (!id || typeof id !== 'object') return true;
    for (const f of STRING_FIELDS) {
        if (typeof id[f] === 'string' && id[f].trim() !== '') return false;
    }
    for (const f of ARRAY_FIELDS) {
        if (Array.isArray(id[f]) && id[f].length > 0) return false;
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// Phase P1B: entries 双写接口（追加，不修改上方现有导出）
// ═══════════════════════════════════════════════════════════════

export const IDENTITY_VERSION_V02 = 'v0.2';

export const LEGACY_FIELD_MAP = {
    spiritRoot:     'spiritRoot',
    constitution:   'constitution',
    bloodline:      'bloodline',
    background:     'background',
    xianZi:         'xianZi',
    gender:         'gender',
    talent:         'talents',
    arts:           'arts',
};

const LEGACY_DISPLAY_MAP = {
    spiritRoot:     'spiritRootDisplay',
    constitution:   'constitutionDisplay',
};

const ARRAY_KINDS = new Set(['talent', 'arts']);

// ─── 内部 helper（不导出） ───

function _genLegacyEntryId(kind, idx) {
    return 'e_legacy_' + kind + '_' + idx;
}

function _createEntry(kind, value, opts = {}) {
    const now = new Date().toISOString();
    return {
        id: opts.id || ('e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)),
        kind,
        value,
        display: opts.display ?? null,
        visibility: opts.visibility || 'public',
        generation: opts.generation || 'fixed',
        generationConfig: opts.generationConfig ?? null,
        bound: opts.bound !== false,
        discovery: opts.discovery ?? null,
        revealedAt: opts.revealedAt ?? null,
        source: opts.source || 'designer',
        meta: opts.meta && typeof opts.meta === 'object' ? { ...opts.meta } : {},
        createdAt: opts.createdAt || now,
        updatedAt: now,
        _userEdited: opts._userEdited === true,
    };
}

function _normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.kind || raw.value === undefined) return null;
    const now = new Date().toISOString();
    return {
        id: raw.id || ('e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)),
        kind: raw.kind,
        value: raw.value,
        display: raw.display ?? null,
        visibility: raw.visibility || 'public',
        generation: raw.generation || 'fixed',
        generationConfig: raw.generationConfig ?? null,
        bound: raw.bound !== false,
        discovery: raw.discovery ?? null,
        revealedAt: raw.revealedAt ?? null,
        source: raw.source || 'designer',
        meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
        createdAt: raw.createdAt || now,
        updatedAt: raw.updatedAt || now,
        _userEdited: raw._userEdited === true,
    };
}

function _deriveEntriesFromLegacy(id) {
    if (!id || typeof id !== 'object') return [];
    const out = [];
    const scalarKinds = ['gender', 'spiritRoot', 'constitution', 'bloodline', 'xianZi', 'background'];
    for (const kind of scalarKinds) {
        const legacyField = LEGACY_FIELD_MAP[kind];
        const val = id[legacyField];
        if (val === null || val === undefined) continue;
        if (typeof val === 'string' && !val.trim()) continue;
        const displayField = LEGACY_DISPLAY_MAP[kind];
        const display = displayField ? id[displayField] : null;
        out.push(_createEntry(kind, val, {
            id: _genLegacyEntryId(kind, 0),
            display: display || null,
            visibility: 'public',
            source: 'designer',
        }));
    }
    if (Array.isArray(id.talents)) {
        id.talents.forEach((val, idx) => {
            if (typeof val !== 'string' || !val.trim()) return;
            out.push(_createEntry('talent', val, {
                id: _genLegacyEntryId('talent', idx),
                visibility: 'public',
                source: 'designer',
            }));
        });
    }
    if (Array.isArray(id.arts)) {
        id.arts.forEach((val, idx) => {
            if (typeof val !== 'string' || !val.trim()) return;
            out.push(_createEntry('arts', val, {
                id: _genLegacyEntryId('arts', idx),
                visibility: 'public',
                source: 'designer',
            }));
        });
    }
    return out;
}

export function syncLegacyMirror(id, kind) {
    const legacyField = LEGACY_FIELD_MAP[kind];
    if (!legacyField) return;
    const matching = id.entries.filter(e => e.kind === kind);
    if (ARRAY_KINDS.has(kind)) {
        id[legacyField] = matching.map(e => e.value);
    } else {
        id[legacyField] = matching.length > 0 ? matching[0].value : null;
    }
    const displayField = LEGACY_DISPLAY_MAP[kind];
    if (displayField) {
        id[displayField] = matching.length > 0 ? (matching[0].display || null) : null;
    }
}

// ─── 主接口（追加导出） ───

/**
 * 获取 entries 数组
 * 注意：返回标准化副本，不直接暴露 id.entries 引用
 * @param {object} id
 * @param {object} [opts]
 * @param {boolean} [opts.includeNotGenerated=true]
 * @returns {Array<object>}
 */
export function getIdentityEntries(id, opts = {}) {
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
}

/**
 * 获取单个 kind 的值（v0.2 优先 entries，v0.1 fallback）
 * 数组 kind 返回数组，标量 kind 返回 value 或 null
 */
export function getIdentityField(id, kind) {
    if (!id || typeof id !== 'object' || !kind) return null;
    if (id._v === IDENTITY_VERSION_V02 && Array.isArray(id.entries)) {
        const matching = id.entries.filter(e => e.kind === kind);
        if (ARRAY_KINDS.has(kind)) return matching.map(e => e.value);
        return matching.length > 0 ? matching[0].value : null;
    }
    const legacyField = LEGACY_FIELD_MAP[kind];
    if (!legacyField) return null;
    const val = id[legacyField];
    if (ARRAY_KINDS.has(kind)) return Array.isArray(val) ? [...val] : [];
    return val ?? null;
}

/**
 * 写入单个 kind（双写 entries + 旧字段镜像）
 * @param {object} id
 * @param {string} kind
 * @param {any} value
 * @param {object} [opts]
 * @param {boolean} [opts.replace=false] - 数组 kind 是否先清空
 * @returns {object|object[]|null}
 *   数组 kind → Entry[]（可能为空）
 *   标量 kind → Entry 或 null
 */
export function setIdentityField(id, kind, value, opts = {}) {
    if (!id || typeof id !== 'object') return null;
    if (!kind || typeof kind !== 'string') return null;

    if (id._v !== IDENTITY_VERSION_V02) {
        id._v = IDENTITY_VERSION_V02;
        id.entries = _deriveEntriesFromLegacy(id);
    } else if (!Array.isArray(id.entries)) {
        console.warn('[IdentityStore] v0.2 但 entries 缺失，从旧字段恢复');
        id.entries = _deriveEntriesFromLegacy(id);
    }

    if (ARRAY_KINDS.has(kind)) {
        const newVals = Array.isArray(value) ? value : [value];
        if (opts.replace) {
            id.entries = id.entries.filter(e => e.kind !== kind);
        }
        const existingVals = new Set(
            id.entries.filter(e => e.kind === kind).map(e => String(e.value))
        );
        const added = [];
        for (const v of newVals) {
            if (v === null || v === undefined) continue;
            const s = String(v).trim();
            if (!s || existingVals.has(s)) continue;
            const entry = _createEntry(kind, s, {
                display: opts.display ?? null,
                visibility: opts.visibility || 'public',
                generation: opts.generation || 'fixed',
                bound: opts.bound !== false,
                source: opts.source || 'designer',
                meta: opts.meta,
            });
            id.entries.push(entry);
            existingVals.add(s);
            added.push(entry);
        }
        syncLegacyMirror(id, kind);
        return added;
    }

    id.entries = id.entries.filter(e => e.kind !== kind);
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
        syncLegacyMirror(id, kind);
        return null;
    }
    const entry = _createEntry(kind, typeof value === 'string' ? value.trim() : value, {
        display: opts.display ?? null,
        visibility: opts.visibility || 'public',
        generation: opts.generation || 'fixed',
        bound: opts.bound !== false,
        source: opts.source || 'designer',
        meta: opts.meta,
    });
    id.entries.push(entry);
    syncLegacyMirror(id, kind);
    return entry;
}

/**
 * 一次性迁移：从旧字段派生 entries，写入 id
 * @param {object} id
 * @returns {{ migratedCount: number, entries: Array }}
 */
export function syncLegacyToEntries(id) {
    if (!id || typeof id !== 'object') return { migratedCount: 0, entries: [] };
    if (id._v === IDENTITY_VERSION_V02 && Array.isArray(id.entries)) {
        return { migratedCount: 0, entries: id.entries };
    }
    const derived = _deriveEntriesFromLegacy(id);
    id._v = IDENTITY_VERSION_V02;
    id.entries = derived;
    return { migratedCount: derived.length, entries: derived };
}
