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
];

const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background', 'xianZi'];
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
