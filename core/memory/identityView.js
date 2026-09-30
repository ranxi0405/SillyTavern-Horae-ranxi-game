/**
 * Horae IdentityView v0.1
 *
 * 职责：
 *   - 提供 identity entries 的三种视图渲染
 *     · renderIdentityPlayerRows: 玩家可见（UI）
 *     · renderIdentityGmRows:     GM 全量（Console / 未来 GM UI）
 *     · renderIdentityAiEntries:  AI Prompt 注入
 *   - 提供 visibility 过滤辅助函数
 *   - 纯数据转换，无副作用
 *
 * 设计原则：
 *   - 不修改 identity
 *   - 不负责保存
 *   - 不负责 UI 呈现
 *   - Player / AI / GM 三套逻辑严格分离
 *   - 依赖 identityStore + identityKindRegistry + hiddenKeywords
 */

import { getIdentityEntries } from './identityStore.js';
import {
    getKindLabel,
    getKindAiLabel,
    getKindIcon,
    getKindOrder,
    isCoreKind,
    getExtendedKindLabel,
    getExtendedKindIcon,
} from './identityKindRegistry.js';
import { sanitizeHiddenKeywords } from './hiddenKeywords.js';

// ═══════════════════════════════════════════════════════════════
// 过滤函数
// ═══════════════════════════════════════════════════════════════

/**
 * 玩家可见判定
 * @param {object} entry
 * @returns {boolean}
 */
export function isPlayerVisible(entry) {
    if (!entry || entry.value == null) return false;
    if (entry.visibility === 'public') return true;
    if (entry.visibility === 'discoverable' && entry.revealedAt != null) return true;
    return false;
}

/**
 * AI 可见判定（gmOnly 不注入）
 * @param {object} entry
 * @returns {boolean}
 */
export function isAiVisible(entry) {
    if (!entry || entry.value == null) return false;
    if (entry.visibility === 'gmOnly') return false;
    return true;
}

/**
 * GM 可见判定（全部显示）
 * @param {object} entry
 * @returns {boolean}
 */
export function isGmVisible(entry) {
    return !!entry;
}

// ═══════════════════════════════════════════════════════════════
// 内部辅助
// ═══════════════════════════════════════════════════════════════

/**
 * 排序 entries
 * 1. 核心 kind 优先（按 getKindOrder）
 * 2. 扩展 kind 按 createdAt
 * 3. hiddenLast=true 时，hidden / gmOnly 条目排最后
 */
function _sortEntries(entries, opts = {}) {
    const hiddenLast = !!opts.hiddenLast;
    return [...entries].sort((a, b) => {
        if (hiddenLast) {
            const _isHiddenGroup = (e) =>
                e.visibility === 'hidden' ||
                e.visibility === 'gmOnly' ||
                (e.visibility === 'discoverable' && e.revealedAt == null);
            const aHidden = _isHiddenGroup(a) ? 1 : 0;
            const bHidden = _isHiddenGroup(b) ? 1 : 0;
            if (aHidden !== bHidden) return aHidden - bHidden;
        }
        const orderA = getKindOrder(a.kind);
        const orderB = getKindOrder(b.kind);
        if (orderA !== orderB) return orderA - orderB;
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
}

/**
 * 解析 label（核心 kind 走注册表，扩展 kind 走 meta fallback）
 * @param {object} entry
 * @param {string} lang
 * @param {boolean} forAI
 * @returns {string}
 */
function _label(entry, lang, forAI = false) {
    if (isCoreKind(entry.kind)) {
        return forAI ? getKindAiLabel(entry.kind, lang) : getKindLabel(entry.kind, lang);
    }
    return getExtendedKindLabel(entry.kind, entry, lang, forAI);
}

/**
 * 解析 icon
 * @param {object} entry
 * @returns {string}
 */
function _icon(entry) {
    if (isCoreKind(entry.kind)) return getKindIcon(entry.kind);
    return getExtendedKindIcon(entry.kind, entry);
}

// ═══════════════════════════════════════════════════════════════
// 主渲染函数
// ═══════════════════════════════════════════════════════════════

/**
 * 渲染 Player View rows（玩家可见设定）
 * @param {object} id - identity 对象
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @returns {Array<{icon: string, label: string, value: any, extraCls: string}>}
 */
export function renderIdentityPlayerRows(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isPlayerVisible);
    const sorted = _sortEntries(visible);
    return sorted.map(e => ({
        icon: _icon(e),
        label: _label(e, lang, false),
        value: (e.display != null) ? e.display : e.value,
        extraCls: (e.kind === 'bloodline') ? 'horae-rpg-field-icon--bloodline' : '',
    }));
}

/** visibility 徽章映射 */
const _VIS_BADGE = {
    'public': '',
    'hidden': '🚫',
    'discoverable': '🔓',
    'gmOnly': '🔒',
};

/**
 * 渲染 GM View rows（全量，含隐藏）
 * 仅返回数据，不负责 UI 呈现
 * @param {object} id
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @returns {Array<object>}
 */
export function renderIdentityGmRows(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: true });
    const sorted = _sortEntries(entries);
    return sorted.map(e => ({
        id: e.id,
        kind: e.kind,
        icon: _icon(e),
        label: _label(e, lang, false),
        value: e.value,
        display: e.display,
        visibility: e.visibility,
        visibilityBadge: _VIS_BADGE[e.visibility] ?? '?',
        generation: e.generation,
        generationBadge: (e.generation && e.generation !== 'fixed') ? '🎲' : '',
        revealedAt: e.revealedAt?.story || null,
        bound: e.bound,
        source: e.source,
        raw: e,
    }));
}

/**
 * 渲染 AI Prompt 条目（含 sanitize）
 * @param {object} id
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @returns {string[]} lines，如 '· 灵根 = [隐藏灵根]'
 */
export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    return sorted.map(e => {
        const label = _label(e, lang, true);
        const safe = sanitizeHiddenKeywords(String(e.value));
        return '· ' + label + ' = ' + safe;
    });
}
