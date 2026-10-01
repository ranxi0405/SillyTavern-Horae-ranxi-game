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
import { hasKnown } from './npcKnowledge.js';

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
    if (entry.visibility === 'gmOnly') return false;
    return true;
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
 * 生成隐藏占位符（AI 视角）
 * 用于 visibility=hidden 或 discoverable 未揭示的条目。
 * 避免真值泄露，同时告知 AI 该字段存在但不可见。
 * @param {string} label
 * @param {string} lang
 * @returns {string}
 */
function _hiddenPlaceholder(label, lang) {
    if (lang === 'en') return '[Hidden: ' + label + ']';
    if (lang === 'ja') return '[非公開: ' + label + ']';
    if (lang === 'ko') return '[숨김: ' + label + ']';
    if (lang === 'ru') return '[Скрыто: ' + label + ']';
    if (lang === 'zh-TW') return '[隱藏' + label + ']';
    return '[隐藏' + label + ']';
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
    const rows = [];
    for (const e of sorted) {
        const vis = e.visibility || 'public';
        const revealed = e.revealedAt != null;
        const hasDisplay = e.display != null && String(e.display).trim() !== '';

        let value;
        if (revealed) {
            value = e.value;
        } else if (hasDisplay) {
            value = e.display;
        } else if (vis === 'public') {
            value = e.value;
        } else {
            // hidden / discoverable + 未 reveal + 无有效 display
            // → 主角完全不知道，跳过
            continue;
        }

        rows.push({
            icon: _icon(e),
            label: _label(e, lang, false),
            value,
            extraCls: (e.kind === 'bloodline') ? 'horae-rpg-field-icon--bloodline' : '',
        });
    }
    return rows;
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
    const rows = [];
    for (const e of sorted) {
        const vis = e.visibility || 'public';
        const revealed = e.revealedAt != null;
        const hasDisplay = e.display != null && String(e.display).trim() !== '';

        // P6.5.1b: AI View = 世界当前认知（不是 GM 全知）
        //   revealedAt != null  → value（世界已确认真相）
        //   未 reveal + display → display（世界当前认知）
        //   未 reveal + public + 无 display → value
        //   未 reveal + hidden/discoverable + 无 display → 不输出
        // 不输出 [隐藏{label}] 占位（占位本身是信息泄露）
        // 不输出「对外：display」双层（display 就是世界当前认知）
        // discovery.discoveredAt 有值不影响输出（由剧情上下文体现）
        let output;
        if (revealed) {
            output = sanitizeHiddenKeywords(String(e.value));
        } else if (hasDisplay) {
            output = sanitizeHiddenKeywords(String(e.display));
        } else if (vis === 'public') {
            output = sanitizeHiddenKeywords(String(e.value));
        } else {
            continue;
        }
        rows.push('· ' + _label(e, lang, true) + ' = ' + output);
    }
    return rows;
}

/**
 * 生成 AI Prompt 的 identity 段（含 header）
 * 与 renderIdentityAiEntries 的区别：本函数返回可直接注入 Prompt 的完整字符串，
 * 空 identity / 无可见条目时返回 ''，由调用方决定是否拼接。
 * @param {object} id
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @returns {string}
 */
export function renderIdentityAiSection(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const rows = renderIdentityAiEntries(id, { lang });
    if (!Array.isArray(rows) || rows.length === 0) return '';
    return _sectionHeader(lang) + '\n' + rows.join('\n');
}

/**
 * identity section 的 header（多语言）
 * @param {string} lang
 * @returns {string}
 */
function _sectionHeader(lang) {
    if (lang === 'en') return '[Character Identity]';
    if (lang === 'ja') return '[キャラクター固有設定]';
    if (lang === 'ko') return '[캐릭터 고유 설정]';
    if (lang === 'ru') return '[Идентичность персонажа]';
    if (lang === 'zh-TW') return '[角色固有設定]';
    return '[角色固有设定]';
}

/**
 * 渲染 NPC 视角 rows（按 npcKnowledge 过滤）
 *
 * 与 renderIdentityAiEntries 的区别：
 *   - AI 是天道视角：hidden 一律占位
 *   - NPC 只有 known 才看得到；hidden + known → value
 *   - discoverable + known + 未 reveal → 占位（知道存在，不知内容）
 *
 * @param {object} id - identity 对象
 * @param {string} npcId - NPC 的 _id（'016' / 'N016' 均可，内部 normalize）
 * @param {object} knowledge - chat[0].horae_meta.npcKnowledge
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @param {'ai'|'public'} [opts.valueMode] - 占位，P7 未实现，P6.5 定案后使用
 * @returns {string[]} 每行 '· label = value'
 */
export function renderIdentityNpcRows(id, npcId, knowledge, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const sorted = _sortEntries(entries, { hiddenLast: true });
    const out = [];
    for (const e of sorted) {
        const r = _resolveNpcEntry(e, knowledge, npcId, lang);
        if (r) out.push('· ' + r.label + ' = ' + r.value);
    }
    return out;
}

/**
 * 单条 entry 的 NPC 视角解析
 * @param {object} entry
 * @param {object} knowledge
 * @param {string} npcId
 * @param {string} lang
 * @returns {{label:string, value:string}|null}
 */
function _resolveNpcEntry(entry, knowledge, npcId, lang) {
    if (!entry || entry.value == null) return null;
    const vis = entry.visibility || 'public';
    if (vis === 'gmOnly') return null;
    const label = _label(entry, lang, true);

    // public：始终输出
    if (vis === 'public') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // revealedAt 有：真相已公开（hidden / discoverable 都适用）
    if (entry.revealedAt) {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // 未 reveal + hidden/discoverable：需 known
    if (!hasKnown(knowledge, npcId, entry.id)) return null;
    // hidden + known → NPC 已获真知
    if (vis === 'hidden') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // discoverable + known + 未 reveal → 知道存在，不知内容
    return { label, value: _hiddenPlaceholder(label, lang) };
}
