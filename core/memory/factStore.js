/**
 * Horae FactStore v0.4（最终版）
 *
 * Fact Action Record v0.4 契约：
 *   - action: 'add' | 'supersede' | 'invalidate'
 *   - action 缺失 / 非法 → 默认 add
 *   - supersede / invalidate 需要 target { subject, predicate, object }
 *   - target 校验失败（缺失/找不到/匹配多个/subject-predicate 不匹配）
 *     → 降级为 add（宁可冗余，不可误删）
 *   - 永不物理删除，全部保留 history
 *
 * 关键原则：
 *   - 程序只验证，不替 AI 猜
 *   - 不根据 predicate 名字判断单值/多值
 *   - 不物理删除历史
 *
 * Fact 结构：
 *   {
 *     id, subject, predicate, object,
 *     status: 'active' | 'superseded' | 'invalidated',
 *     confidence: 'confirmed' | 'inferred',
 *     visibility: 'public' | 'hidden' | 'gm_only',
 *     since,
 *     source,
 *     sourceEventIds: [],
 *     supersededBy: null,
 *     invalidatedAt: null,
 *     createdAt, updatedAt,
 *   }
 */

const DEFAULT_STATUS = 'active';
const DEFAULT_VISIBILITY = 'public';
const DEFAULT_ACTION = 'add';
const VISIBILITY_VALUES = ['public', 'hidden', 'gm_only'];
const ACTION_VALUES = ['add', 'supersede', 'invalidate'];

export class FactStore {
    constructor(manager) {
        if (!manager) throw new Error('FactStore: manager required');
        this.manager = manager;
    }

    _ensureSlot() {
        const chat = this.manager.getChat?.();
        if (!chat?.length) return null;
        if (!chat[0].horae_meta) return null;
        if (!Array.isArray(chat[0].horae_meta.facts)) {
            chat[0].horae_meta.facts = [];
        }
        return chat[0].horae_meta.facts;
    }

    getAll() {
        const slot = this._ensureSlot();
        if (!slot) return [];
        return structuredClone(slot);
    }

    getActive({ subject = null, predicate = null } = {}) {
        const all = this.getAll();
        return all.filter(f => {
            if (f.status !== DEFAULT_STATUS) return false;
            if (subject && f.subject !== subject) return false;
            if (predicate && f.predicate !== predicate) return false;
            return true;
        });
    }

    /** (subject, predicate) 下所有 active facts */
    getAllFor(subject, predicate) {
        return this.getActive({ subject, predicate });
    }

    /** (subject, predicate) 下 active 中最新一个（不是"唯一正确"） */
    getLatest(subject, predicate) {
        const list = this.getAllFor(subject, predicate);
        if (list.length === 0) return null;
        return list[list.length - 1];
    }

    /** subject 的所有 active facts */
    getBySubject(subject) {
        return this.getActive({ subject });
    }

    getVisible(filter = 'all') {
        const active = this.getActive();
        if (filter === 'all') return active;
        const allowed = Array.isArray(filter) ? new Set(filter) : new Set([filter]);
        return active.filter(f => allowed.has(f.visibility || DEFAULT_VISIBILITY));
    }

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

    static _sameTriple(f, triple) {
        return f.subject === triple.subject
            && f.predicate === triple.predicate
            && String(f.object) === String(triple.object);
    }

    /** 返回所有匹配的 active facts（数组，可能 0/1/多个） */
    _findActiveByTriple(slot, triple) {
        return slot.filter(f => f.status === DEFAULT_STATUS && FactStore._sameTriple(f, triple));
    }

    /**
     * 提交一条 fact
     * @param {object} opts
     *   - subject, predicate, object 必填
     *   - action: 'add' | 'supersede' | 'invalidate'
     *   - target: { subject, predicate, object }（supersede / invalidate 需要）
     *   - confidence, visibility, since, source, sourceEventIds
     */
    commit({
        subject, predicate, object,
        action = DEFAULT_ACTION,
        target = null,
        confidence = 'confirmed',
        visibility = DEFAULT_VISIBILITY,
        since = null,
        source = '',
        sourceEventIds = [],
    }) {
        if (!subject || !predicate || object === undefined || object === null) {
            throw new Error('FactStore.commit: subject/predicate/object required');
        }
        if (!VISIBILITY_VALUES.includes(visibility)) visibility = DEFAULT_VISIBILITY;
        if (!ACTION_VALUES.includes(action)) action = DEFAULT_ACTION;

        const slot = this._ensureSlot();
        if (!slot) throw new Error('FactStore.commit: no chat slot');

        const now = new Date().toISOString();

        // 校验 supersede / invalidate 的 target
        let effectiveAction = action;
        let validatedTarget = null;

        if (action === 'supersede' || action === 'invalidate') {
            if (!target || !target.subject || !target.predicate || target.object === undefined) {
                console.warn('[FactStore] action=', action, '缺少 target，降级为 add');
                effectiveAction = 'add';
            } else {
                const matches = this._findActiveByTriple(slot, target);
                if (matches.length === 0) {
                    console.warn('[FactStore] target 未找到，降级为 add:', JSON.stringify(target));
                    effectiveAction = 'add';
                } else if (matches.length > 1) {
                    console.warn('[FactStore] target 匹配到', matches.length, '个 active，降级为 add:', JSON.stringify(target));
                    effectiveAction = 'add';
                } else {
                    validatedTarget = matches[0];
                    if (validatedTarget.subject !== subject || validatedTarget.predicate !== predicate) {
                        console.warn('[FactStore] target subject/predicate 不匹配，降级为 add');
                        effectiveAction = 'add';
                        validatedTarget = null;
                    }
                }
            }
        }

        // invalidate：只标失效，不新增
        if (effectiveAction === 'invalidate') {
            validatedTarget.status = 'invalidated';
            validatedTarget.invalidatedAt = now;
            validatedTarget.updatedAt = now;
            return structuredClone(validatedTarget);
        }

        // 三元组幂等
        const exact = slot.find(f =>
            f.status === DEFAULT_STATUS
                && f.subject === subject
                && f.predicate === predicate
                && String(f.object) === String(object)
        );
        if (exact) return structuredClone(exact);

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
            sourceEventIds: Array.isArray(sourceEventIds) ? [...sourceEventIds] : [],
            supersededBy: null,
            invalidatedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        // supersede：标旧 + 加新
        if (effectiveAction === 'supersede' && validatedTarget) {
            validatedTarget.status = 'superseded';
            validatedTarget.supersededBy = newFact.id;
            validatedTarget.updatedAt = now;
        }

        slot.push(newFact);
        return structuredClone(newFact);
    }

    /** 显式失效（不新增 fact） */
    invalidate({ subject, predicate, object }) {
        const slot = this._ensureSlot();
        if (!slot) return null;
        const matches = this._findActiveByTriple(slot, { subject, predicate, object });
        if (matches.length === 0) {
            console.warn('[FactStore] invalidate target 未找到');
            return null;
        }
        if (matches.length > 1) {
            console.warn('[FactStore] invalidate target 匹配到多个，放弃');
            return null;
        }
        const now = new Date().toISOString();
        matches[0].status = 'invalidated';
        matches[0].invalidatedAt = now;
        matches[0].updatedAt = now;
        return structuredClone(matches[0]);
    }

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

    /** 兼容旧 API（按 ID） */
    supersede(oldId, newId) {
        const slot = this._ensureSlot();
        if (!slot) return false;
        const old = slot.find(f => f.id === oldId);
        if (!old) return false;
        old.status = 'superseded';
        old.supersededBy = newId;
        old.updatedAt = new Date().toISOString();
        return true;
    }

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
