/**
 * Horae FactStore v0.1
 *
 * 职责：
 *   - 存储长期确认事实（结构化）
 *   - 提供去重的 active facts 读取
 *   - 支持 supersede（旧事实被新事实取代）
 *
 * 设计原则：
 *   - Facts 独立于 narrative：narrative 是叙述，facts 是结论
 *   - Facts 去重更新：同一 (subject, predicate) 只有最新的 active
 *   - Facts 恒定大小：Prompt 注入时只读 active
 *   - 不改 createEmptyMeta，惰性初始化 chat[0].horae_meta.facts
 *
 * Fact 结构：
 *   {
 *     id: 'f_xxx',
 *     subject: '陆离',
 *     predicate: '身份',
 *     object: '天剑宗卧底',
 *     status: 'active' | 'superseded' | 'resolved' | 'invalidated',
 *     confidence: 'confirmed' | 'inferred',
 *     since: { storyDate: '946/3/15' },
 *     source: 'autoSummary:as_xxx',
 *     supersededBy: null,
 *   }
 */

const DEFAULT_STATUS = 'active';
const DEFAULT_VISIBILITY = 'public';
const VISIBILITY_VALUES = ['public', 'hidden', 'gm_only'];

export class FactStore {
    constructor(manager) {
        if (!manager) throw new Error('FactStore: manager required');
        this.manager = manager;
    }

    /** 惰性获取 facts 存储槽（不修改 createEmptyMeta） */
    _ensureSlot() {
        const chat = this.manager.getChat?.();
        if (!chat?.length) return null;
        if (!chat[0].horae_meta) return null;
        if (!Array.isArray(chat[0].horae_meta.facts)) {
            chat[0].horae_meta.facts = [];
        }
        return chat[0].horae_meta.facts;
    }

    /** 读取原始数组（深拷贝，防外部修改） */
    getAll() {
        const slot = this._ensureSlot();
        if (!slot) return [];
        return structuredClone(slot);
    }

    /** 只读 active facts */
    getActive({ subject = null, predicate = null } = {}) {
        const all = this.getAll();
        return all.filter(f => {
            if (f.status !== DEFAULT_STATUS) return false;
            if (subject && f.subject !== subject) return false;
            if (predicate && f.predicate !== predicate) return false;
            return true;
        });
    }

    /**
     * 按可见性读取 active facts
     * @param {string|string[]} filter - 'public' | 'hidden' | 'gm_only' | 数组 | 'all'
     */
    getVisible(filter = 'all') {
        const active = this.getActive();
        if (filter === 'all') return active;
        const allowed = Array.isArray(filter) ? new Set(filter) : new Set([filter]);
        return active.filter(f => allowed.has(f.visibility || DEFAULT_VISIBILITY));
    }

    /**
     * 向后兼容：读取旧数据时，没有 visibility 字段的视为 public
     */
    normalizeLegacy() {
        const slot = this._ensureSlot();
        if (!slot) return 0;
        let fixed = 0;
        for (const f of slot) {
            if (!f.visibility || !VISIBILITY_VALUES.includes(f.visibility)) {
                f.visibility = DEFAULT_VISIBILITY;
                fixed++;
            }
        }
        return fixed;
    }

    /**
     * 提交一条 fact
     * @returns {object} 提交后的 fact
     */
    commit({ subject, predicate, object, confidence = 'confirmed', visibility = DEFAULT_VISIBILITY, since = null, source = '' }) {
        if (!subject || !predicate || object === undefined || object === null) {
            throw new Error('FactStore.commit: subject/predicate/object required');
        }

        // visibility 规范化（非法值回退到 public）
        if (!VISIBILITY_VALUES.includes(visibility)) visibility = DEFAULT_VISIBILITY;

        const slot = this._ensureSlot();
        if (!slot) throw new Error('FactStore.commit: no chat slot');

        // 查找是否有相同 (subject, predicate) 的 active fact
        const existingIdx = slot.findIndex(
            f => f.status === DEFAULT_STATUS
                && f.subject === subject
                && f.predicate === predicate
        );

        const newFact = {
            id: 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            subject,
            predicate,
            object,
            status: DEFAULT_STATUS,
            confidence,
            visibility,
            since: since || null,
            source: source || '',
            supersededBy: null,
        };

        if (existingIdx >= 0) {
            const old = slot[existingIdx];
            // 值相同则跳过（幂等）
            if (String(old.object) === String(object) && old.confidence === confidence && (old.visibility || DEFAULT_VISIBILITY) === visibility) {
                return structuredClone(old);
            }
            // 值不同 → 旧 fact superseded
            old.status = 'superseded';
            old.supersededBy = newFact.id;
        }

        slot.push(newFact);
        return structuredClone(newFact);
    }

    /**
     * 批量提交
     * @param {Array} factsList
     * @returns {Array} 提交后的 fact 列表
     */
    commitBatch(factsList) {
        if (!Array.isArray(factsList)) return [];
        const results = [];
        for (const f of factsList) {
            try {
                results.push(this.commit(f));
            } catch (e) {
                results.push({ _error: String(e?.message || e) });
            }
        }
        return results;
    }

    /**
     * 显式 supersede（用于外部主动更新）
     * @param {string} oldId
     * @param {string} newId
     */
    supersede(oldId, newId) {
        const slot = this._ensureSlot();
        if (!slot) return false;
        const old = slot.find(f => f.id === oldId);
        if (!old) return false;
        old.status = 'superseded';
        old.supersededBy = newId;
        return true;
    }

    /** 统计信息（调试用） */
    stats() {
        const all = this.getAll();
        const byStatus = {};
        for (const f of all) {
            byStatus[f.status] = (byStatus[f.status] || 0) + 1;
        }
        return { total: all.length, byStatus };
    }
}

export function createFactStore(manager) {
    return new FactStore(manager);
}
