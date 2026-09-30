/**
 * Horae IdentityDiscovery v0.1 (Phase P6.3)
 *
 * 职责：
 *   - 评估 identity entries 的 discovery.requirement
 *   - 生成 action list（不直接改 identity）
 *   - applyDiscover / applyReveal 为唯一状态修改入口
 *   - runDiscovery 为编排入口
 *
 * 边界：
 *   - 只做 condition 类型（event / item / npc 延后）
 *   - 不改 visibility / view / Prompt
 *   - 不落盘（依赖常规保存机制）
 *
 * 数据源（state）：
 *   - state.rpg.spirit.tier        神识段位
 *   - state.rpg.realm.name         大境界名
 *   - state.affection[npcName]     好感度
 *   - state.items[itemName]        持有物
 *
 * discovery.requirement 示例：
 *   {
 *     discoverAt: {
 *       senseRealm: '清明',
 *       affinityMin: { npc: 'N016', min: 60 },
 *       realm: '筑基',
 *       itemHeld: '天机镜',
 *     },
 *     revealAt: { ... }
 *   }
 */

import { applyNpcKnow, hasKnown } from './npcKnowledge.js';

const SENSE_TIER_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];

function _nowIso() {
    return new Date().toISOString();
}

/**
 * 应用 discover（唯一状态修改入口）
 * @param {object} entry
 * @param {object} [opts]
 * @returns {object|null}
 */
export function applyDiscover(entry, opts = {}) {
    if (!entry || typeof entry !== 'object') return null;
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
            iso: _nowIso(),
            story: (opts && opts.story) || null,
        };
    }
    entry.updatedAt = _nowIso();
    return entry;
}

/**
 * 应用 reveal（唯一状态修改入口）
 * @param {object} entry
 * @param {object} [opts]
 * @returns {object|null}
 */
export function applyReveal(entry, opts = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const now = _nowIso();
    const story = (opts && opts.story) || null;
    if (!entry.revealedAt) {
        entry.revealedAt = { iso: now, story };
    } else if (story) {
        entry.revealedAt.story = story;
    }
    entry.updatedAt = now;
    return entry;
}

// ─── 数据源读取 ───

function _getSenseRealm(state) {
    return state?.rpg?.spirit?.tier ?? null;
}

function _getRealm(state) {
    return state?.rpg?.realm?.name ?? null;
}

function _getAffinity(state, npcName) {
    if (!state?.affection) return null;
    const v = state.affection[npcName];
    return typeof v === 'number' ? v : null;
}

function _hasItem(state, itemName) {
    if (!state?.items) return false;
    return !!state.items[itemName];
}

// ─── condition 匹配 ───

/**
 * 匹配单个 condition key
 * @param {string} key
 * @param {any} value
 * @param {object} state
 * @returns {boolean}
 */
function _matchOne(key, value, state) {
    if (key === 'senseRealm') {
        const cur = _getSenseRealm(state);
        if (cur == null) return false;
        const curIdx = SENSE_TIER_ORDER.indexOf(cur);
        const reqIdx = SENSE_TIER_ORDER.indexOf(String(value));
        if (curIdx < 0 || reqIdx < 0) return cur === String(value);
        return curIdx >= reqIdx;
    }
    if (key === 'realm') {
        const cur = _getRealm(state);
        if (cur == null) return false;
        return cur === String(value);
    }
    if (key === 'affinityMin') {
        if (!value || typeof value !== 'object') return false;
        const npc = value.npc;
        const min = Number(value.min);
        if (!npc || !Number.isFinite(min)) return false;
        const cur = _getAffinity(state, npc);
        if (cur == null) return false;
        return cur >= min;
    }
    if (key === 'itemHeld') {
        return _hasItem(state, String(value));
    }
    // 未知 key → 保守不匹配
    return false;
}

function _matchAll(requirement, state) {
    if (!requirement || typeof requirement !== 'object') return false;
    for (const [k, v] of Object.entries(requirement)) {
        if (!_matchOne(k, v, state)) return false;
    }
    return true;
}

// ─── 评估 ───

/**
 * 评估单条 entry，返回待执行 action（不修改 entry）
 * @param {object} entry
 * @param {object} state
 * @returns {{entryId:string, action:'discover'|'reveal', reason:string}|null}
 */
export function evaluateEntry(entry, state) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.visibility !== 'discoverable') return null;
    const d = entry.discovery;
    if (!d || typeof d !== 'object') return null;

    if (d.type === 'condition') {
        const req = d.requirement;
        if (!req || typeof req !== 'object') return null;
        // reveal 优先（若条件都满足）
        if (req.revealAt && _matchAll(req.revealAt, state)) {
            if (!entry.revealedAt) {
                return { entryId: entry.id, action: 'reveal', reason: 'revealAt matched' };
            }
        }
        if (req.discoverAt && _matchAll(req.discoverAt, state)) {
            if (!d.discoveredAt) {
                return { entryId: entry.id, action: 'discover', reason: 'discoverAt matched' };
            }
        }
        return null;
    }

    if (d.type === 'npc') {
        if (!d.npcId) return null;
        const req = d.requirement;
        if (!req || typeof req !== 'object') return null;
        if (_matchAll(req, state)) {
            return { entryId: entry.id, action: 'npcKnow', npcId: d.npcId, reason: 'npc requirement matched' };
        }
        return null;
    }

    return null;
}

/**
 * 全量评估，返回 action list（不修改 identity）
 * @param {object} identity
 * @param {object} state
 * @returns {Array}
 */
export function evaluateAll(identity, state) {
    if (!identity || !Array.isArray(identity.entries)) return [];
    const actions = [];
    for (const e of identity.entries) {
        const a = evaluateEntry(e, state);
        if (a) actions.push(a);
    }
    return actions;
}

/**
 * 编排：评估 + 应用
 * @param {object} identity
 * @param {object} state
 * @param {object} [opts]
 * @returns {{actions:Array, applied:Array}}
 */
export function runDiscovery(identity, state, opts = {}) {
    const actions = evaluateAll(identity, state);
    if (actions.length === 0) return { actions: [], applied: [] };
    const knowledge = (opts && opts.knowledge) || null;
    const applied = [];
    for (const a of actions) {
        if (a.action === 'npcKnow') {
            if (!knowledge) continue;
            if (hasKnown(knowledge, a.npcId, a.entryId)) continue;
            applyNpcKnow(knowledge, a.entryId, a.npcId, {
                source: 'npc_detected',
                story: (opts && opts.story) || null,
            });
            applied.push(a);
            continue;
        }
        const entry = identity.entries.find(e => e && e.id === a.entryId);
        if (!entry) continue;
        if (a.action === 'discover') {
            applyDiscover(entry, opts);
        } else if (a.action === 'reveal') {
            applyReveal(entry, opts);
        }
        applied.push(a);
    }
    return { actions, applied };
}
