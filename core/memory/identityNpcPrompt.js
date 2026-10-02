/**
 * Horae IdentityNpcPrompt v0.1 (Phase P7.5.1)
 *
 * 职责：
 *   - 生成 Prompt 段 [NPC 认知]（P7.5 设计）
 *   - 只读 identity / npcKnowledge / state，不写
 *   - 继续调用 renderIdentityNpcRows 获取 NPC 视角 rows
 *   - 单 NPC ≤100 字符（含省略号），总段 ≤400 字符（含段头/换行/前缀）
 *
 * 边界：
 *   - 不复制 identityView 的 visibility / display / value / placeholder 逻辑
 *   - 不修改 npcKnowledge 结构
 *   - 不新增状态存储
 *   - 不使用 _findMentionedNpcs 逻辑（只处理 state.scene.characters_present）
 *   - 玩家永不为候选
 *
 * 数据链：
 *   state.scene.characters_present
 *     → 排除玩家
 *     → state.npcs[name]._id
 *     → npcKnowledge[npcId]
 *     → known === true
 *     → 排除 public / gmOnly entry
 *     → isNpcPerceivable()
 *     → renderIdentityNpcRows(identity, npcId, filteredKnowledge, { lang })
 *     → 单 NPC ≤100（含省略号）
 *     → 总段 ≤400（含段头/前缀/换行）
 *     → [NPC 认知]
 */

import { renderIdentityNpcRows } from './identityView.js';

const PER_NPC_LIMIT = 100;
const TOTAL_LIMIT = 400;
const SECTION_HEADER = '[NPC 认知]';
const ELLIPSIS = '…';

/**
 * P7.5 §10.1 预留接口，本版恒 true
 */
function _isNpcPerceivable(_entryId, _npcId, _identity) {
    return true;
}

/**
 * 生成 [NPC 认知] 段
 * @param {object} identity - chat[0].horae_meta.identity
 * @param {object} knowledge - chat[0].horae_meta.npcKnowledge
 * @param {object} state - horaeManager.getLatestState(0)
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @param {string} [opts.userName=''] - 玩家名（用于排除）
 * @returns {string} 完整段文本（含段头），空则返回 ''
 */
export function generateNpcKnowledgeSection(identity, knowledge, state, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const userName = opts.userName || '';

    if (!identity || !knowledge || !state) return '';
    const entries = Array.isArray(identity.entries) ? identity.entries : [];
    if (entries.length === 0) return '';

    const present = Array.isArray(state.scene?.characters_present) ? state.scene.characters_present : [];
    if (present.length === 0) return '';

    const npcs = state.npcs || {};

    // 第一层：候选 NPC 筛选
    const candidates = [];
    for (const name of present) {
        if (!name || name === userName) continue;
        const info = npcs[name];
        if (!info || !info._id) continue;
        const npcId = String(info._id);
        const bucket = knowledge[npcId];
        if (!bucket || typeof bucket !== 'object' || Object.keys(bucket).length === 0) continue;
        candidates.push({ name, npcId });
    }
    if (candidates.length === 0) return '';

    // 第二层：entry 候选筛选（预计算）
    const allowedEntryIds = new Set();
    for (const e of entries) {
        if (!e || !e.id) continue;
        if (e.visibility === 'public') continue;  // Prompt 去重优化（非安全边界）
        if (e.visibility === 'gmOnly') continue;  // 永不输出
        allowedEntryIds.add(e.id);
    }
    if (allowedEntryIds.size === 0) return '';

    // 浅复制 identity，只替换 entries（不重构 Identity 对象，不动 getIdentityEntries）
    // 目的：避免 renderIdentityNpcRows 遍历完整 identity.entries 时对 public entry 无条件输出
    const filteredEntries = entries.filter(e => e.id && allowedEntryIds.has(e.id));
    const filteredIdentity = { ...identity, entries: filteredEntries };

    // 第三/四层：单 NPC 渲染 + 单 NPC 100 字符裁剪
    const rendered = [];
    for (const { name, npcId } of candidates) {
        const bucket = knowledge[npcId];
        const filtered = { [npcId]: {} };
        let hasAny = false;
        for (const [eid, rec] of Object.entries(bucket)) {
            if (!rec || rec.known !== true) continue;
            if (!allowedEntryIds.has(eid)) continue;
            if (!_isNpcPerceivable(eid, npcId, identity)) continue;
            filtered[npcId][eid] = rec;
            hasAny = true;
        }
        if (!hasAny) continue;

        const rows = renderIdentityNpcRows(filteredIdentity, npcId, filtered, { lang });
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const prefix = 'N' + npcId + ' ' + name + ': ';
        if (prefix.length >= PER_NPC_LIMIT) continue;

        let acc = '';
        let truncated = false;
        for (const row of rows) {
            const sep = acc ? '\n' : '';
            const candidate = acc + sep + row;
            if ((prefix + candidate).length <= PER_NPC_LIMIT) {
                acc = candidate;
            } else {
                truncated = true;
                break;
            }
        }
        if (!acc) continue;
        if (truncated) {
            // 保证 (prefix + acc + '…').length = PER_NPC_LIMIT
            const maxBodyLen = PER_NPC_LIMIT - prefix.length - ELLIPSIS.length;
            if (maxBodyLen <= 0) continue;
            acc = acc.length > maxBodyLen ? acc.slice(0, maxBodyLen) : acc;
            acc = acc + ELLIPSIS;
        }
        const full = prefix + acc;
        if (full.length > PER_NPC_LIMIT) continue;
        rendered.push({ full });
    }
    if (rendered.length === 0) return '';

    // 第五层：总 400 字符裁剪（含段头 / 前缀 / 换行 / 省略号）
    let total = SECTION_HEADER.length;
    const lines = [SECTION_HEADER];
    for (const r of rendered) {
        const add = 1 + r.full.length;
        if (total + add > TOTAL_LIMIT) break;
        lines.push(r.full);
        total += add;
    }
    if (lines.length === 1) return '';
    return lines.join('\n');
}
