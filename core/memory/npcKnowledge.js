/**
 * Horae NpcKnowledge v0.1 (Phase P7.2)
 *
 * 职责：
 *   - npcKnowledge 的唯一读写入口
 *   - 数据挂在 chat[0].horae_meta.npcKnowledge（本模块不负责挂载）
 *   - 纯数据操作，无 I/O，无单例状态
 *
 * 边界：
 *   - 不改 identity
 *   - 不改 visibility / view / Prompt
 *   - 不做过滤（过滤在 identityView 层）
 *   - 只有程序调用（AI 不可直接写）
 *
 * 数据模型（详见 docs/identity-npc-knowledge-design.md）：
 *   npcKnowledge = {
 *     '016': {
 *       'e_legacy_spiritRoot_0': {
 *         known: true,
 *         source: 'gm_manual' | 'npc_detected' | ...,
 *         at: { iso, story },
 *         note: null,
 *       },
 *     },
 *   }
 */

/**
 * 规范化 npcId
 * 'N016' / 'n016' / '016' / 16 / '16' → '016'
 * null / 空 / 非数字 → null
 * @param {any} npcId
 * @returns {string|null}
 */
export function normalizeNpcId(npcId) {
    if (npcId == null) return null;
    let s = String(npcId).trim();
    if (!s) return null;
    if (s.startsWith('N') || s.startsWith('n')) s = s.slice(1);
    if (!/^\d+$/.test(s)) return null;
    return s.padStart(3, '0');
}

function _nowIso() {
    return new Date().toISOString();
}

/**
 * 记录"某 NPC 知道某 entry"（唯一写入口）
 * @param {object} knowledge - chat[0].horae_meta.npcKnowledge（会被原地修改）
 * @param {string} entryId
 * @param {string} npcId
 * @param {object} [opts] - { source, story, note }
 * @returns {object|null} 写入的记录
 */
export function applyNpcKnow(knowledge, entryId, npcId, opts = {}) {
    if (!knowledge || typeof knowledge !== 'object') return null;
    if (!entryId || typeof entryId !== 'string') return null;
    const id = normalizeNpcId(npcId);
    if (!id) return null;
    if (!knowledge[id] || typeof knowledge[id] !== 'object') knowledge[id] = {};
    const existing = knowledge[id][entryId];
    if (existing && existing.known) {
        // 幂等：保留首次 at / source，只允许补 note
        if (opts && typeof opts.note === 'string') existing.note = opts.note;
        return existing;
    }
    const rec = {
        known: true,
        source: (opts && opts.source) || 'gm_manual',
        at: { iso: _nowIso(), story: (opts && opts.story) || null },
        note: (opts && typeof opts.note === 'string') ? opts.note : null,
    };
    knowledge[id][entryId] = rec;
    return rec;
}

/**
 * 删除某 NPC 对某 entry 的认知
 * @param {object} knowledge
 * @param {string} entryId
 * @param {string} npcId
 * @returns {boolean}
 */
export function applyNpcForget(knowledge, entryId, npcId) {
    if (!knowledge || typeof knowledge !== 'object') return false;
    if (!entryId || typeof entryId !== 'string') return false;
    const id = normalizeNpcId(npcId);
    if (!id) return false;
    if (!knowledge[id] || !knowledge[id][entryId]) return false;
    delete knowledge[id][entryId];
    if (Object.keys(knowledge[id]).length === 0) delete knowledge[id];
    return true;
}

/**
 * 读单条记录
 * @returns {object|null}
 */
export function getNpcKnowledge(knowledge, npcId, entryId) {
    if (!knowledge || typeof knowledge !== 'object') return null;
    if (!entryId || typeof entryId !== 'string') return null;
    const id = normalizeNpcId(npcId);
    if (!id) return null;
    return knowledge[id]?.[entryId] || null;
}

/**
 * 布尔判断：某 NPC 是否 know 某 entry
 * @returns {boolean}
 */
export function hasKnown(knowledge, npcId, entryId) {
    const rec = getNpcKnowledge(knowledge, npcId, entryId);
    return !!(rec && rec.known);
}

/**
 * 列某 NPC 全部认知
 * @returns {Array<{entryId, known, source, at, note}>}
 */
export function listNpcKnowledge(knowledge, npcId) {
    if (!knowledge || typeof knowledge !== 'object') return [];
    const id = normalizeNpcId(npcId);
    if (!id) return [];
    const bucket = knowledge[id];
    if (!bucket || typeof bucket !== 'object') return [];
    return Object.entries(bucket).map(([entryId, rec]) => ({ entryId, ...rec }));
}

/**
 * 反向查：哪些 NPC know 某 entry
 * @returns {string[]} npcId 列表（已 normalize）
 */
export function listEntryKnowers(knowledge, entryId) {
    if (!knowledge || typeof knowledge !== 'object') return [];
    if (!entryId || typeof entryId !== 'string') return [];
    const out = [];
    for (const [npcId, bucket] of Object.entries(knowledge)) {
        if (bucket && bucket[entryId] && bucket[entryId].known) out.push(npcId);
    }
    return out;
}
