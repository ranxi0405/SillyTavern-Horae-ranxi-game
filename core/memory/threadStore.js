/**
 * Horae ThreadStore v0.1
 *
 * 职责：
 *   - 存储长期未完成事务（玩家目标、NPC 目标、谜团、预约事件等）
 *   - 与 Agenda 共存：Agenda 是 UI 投影，Thread 是后端真源
 *   - 提供 open / progressing / blocked 状态读取
 *
 * 设计原则：
 *   - Thread 永不自动删除，只改 status
 *   - 幂等：同 (type, title 相似) → 更新，不新建
 *   - 惰性初始化 chat[0].horae_meta.threads
 *   - visibility 复用 Fact 机制（public / hidden / gm_only）
 *
 * Thread 结构：
 *   {
 *     id: 't_xxx',
 *     type: 'quest' | 'npc_goal' | 'world_event' | 'mystery' | 'appointment',
 *     title: '...',
 *     status: 'open' | 'progressing' | 'blocked' | 'completed' | 'failed' | 'abandoned',
 *     priority: 'low' | 'normal' | 'high' | 'critical',
 *     participants: ['冉汐', ...],
 *     visibility: 'public' | 'hidden' | 'gm_only',
 *     deadline: string | null,
 *     notes: '...',
 *     relatedFactIds: [FactId],
 *     createdAt: ISO,
 *     lastUpdateAt: ISO,
 *     source: string,
 *   }
 */

const SIMILARITY_THRESHOLD = 0.5;
const ACTIVE_STATUSES = new Set(['open', 'progressing', 'blocked']);

export class ThreadStore {
    constructor(manager) {
        if (!manager) throw new Error('ThreadStore: manager required');
        this.manager = manager;
    }

    _ensureSlot() {
        const chat = this.manager.getChat?.();
        if (!chat?.length) return null;
        if (!chat[0].horae_meta) return null;
        if (!Array.isArray(chat[0].horae_meta.threads)) {
            chat[0].horae_meta.threads = [];
        }
        return chat[0].horae_meta.threads;
    }

    /** 读取全部（深拷贝） */
    getAll() {
        const slot = this._ensureSlot();
        if (!slot) return [];
        return structuredClone(slot);
    }

    /** 只读 active（open / progressing / blocked） */
    getActive({ type = null, participant = null } = {}) {
        const all = this.getAll();
        return all.filter(t => {
            if (!ACTIVE_STATUSES.has(t.status)) return false;
            if (type && t.type !== type) return false;
            if (participant && !(t.participants || []).includes(participant)) return false;
            return true;
        });
    }

    /** bigram 集合 */
    static _bigrams(text) {
        const s = String(text || '').replace(/\s+/g, '');
        const set = new Set();
        for (let i = 0; i < s.length - 1; i++) {
            set.add(s.slice(i, i + 2));
        }
        return set;
    }

    /** union Jaccard 相似度 */
    static _similarity(a, b) {
        const A = ThreadStore._bigrams(a);
        const B = ThreadStore._bigrams(b);
        if (A.size === 0 || B.size === 0) return 0;
        let inter = 0;
        for (const x of A) if (B.has(x)) inter++;
        const union = A.size + B.size - inter;
        return union > 0 ? inter / union : 0;
    }

    /**
     * 提交一个 thread
     * - 同 type + title 相似 → 更新已有
     * - 否则新建
     */
    commit({
        type, title, status = 'open', priority = 'normal',
        participants = [], visibility = 'public', deadline = null,
        notes = '', relatedFactIds = [], source = ''
    }) {
        if (!type || !title) {
            throw new Error('ThreadStore.commit: type/title required');
        }
        const slot = this._ensureSlot();
        if (!slot) throw new Error('ThreadStore.commit: no slot');

        const now = new Date().toISOString();

        // 找同 type + 相似 title 的条目（不限 status，防止旧的 completed 被新建）
        let matchedIdx = -1;
        let bestScore = 0;
        for (let i = 0; i < slot.length; i++) {
            const t = slot[i];
            if (t.type !== type) continue;
            const sim = ThreadStore._similarity(t.title, title);
            if (sim >= SIMILARITY_THRESHOLD && sim > bestScore) {
                bestScore = sim;
                matchedIdx = i;
            }
        }

        if (matchedIdx >= 0) {
            const t = slot[matchedIdx];
            // 更新字段（不覆盖已有 participants，做并集）
            if (status) t.status = status;
            if (priority) t.priority = priority;
            if (visibility) t.visibility = visibility;
            if (deadline !== null && deadline !== undefined) t.deadline = deadline;
            if (notes) t.notes = notes;
            if (Array.isArray(participants) && participants.length) {
                const merged = new Set([...(t.participants || []), ...participants]);
                t.participants = [...merged];
            }
            if (Array.isArray(relatedFactIds) && relatedFactIds.length) {
                const merged = new Set([...(t.relatedFactIds || []), ...relatedFactIds]);
                t.relatedFactIds = [...merged];
            }
            t.lastUpdateAt = now;
            return { ...structuredClone(t), _isNew: false, _similarity: bestScore };
        }

        // 新建
        const newThread = {
            id: 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            type,
            title,
            status,
            priority,
            participants: [...participants],
            visibility,
            deadline,
            notes,
            relatedFactIds: [...relatedFactIds],
            createdAt: now,
            lastUpdateAt: now,
            source: source || '',
        };
        slot.push(newThread);
        return { ...structuredClone(newThread), _isNew: true };
    }

    /** 显式更新（不改 title） */
    update(id, patch = {}) {
        const slot = this._ensureSlot();
        if (!slot) return null;
        const t = slot.find(x => x.id === id);
        if (!t) return null;
        const allowed = ['status', 'priority', 'visibility', 'deadline', 'notes'];
        for (const k of allowed) {
            if (k in patch) t[k] = patch[k];
        }
        if (Array.isArray(patch.participants)) {
            const merged = new Set([...(t.participants || []), ...patch.participants]);
            t.participants = [...merged];
        }
        if (Array.isArray(patch.relatedFactIds)) {
            const merged = new Set([...(t.relatedFactIds || []), ...patch.relatedFactIds]);
            t.relatedFactIds = [...merged];
        }
        t.lastUpdateAt = new Date().toISOString();
        return structuredClone(t);
    }

    /** 关闭 thread */
    close(id, status = 'completed') {
        if (!['completed', 'failed', 'abandoned'].includes(status)) {
            throw new Error('ThreadStore.close: invalid status');
        }
        return this.update(id, { status });
    }

    /** 批量提交 */
    commitBatch(threadsList) {
        if (!Array.isArray(threadsList)) return [];
        const results = [];
        for (const t of threadsList) {
            try {
                results.push(this.commit(t));
            } catch (e) {
                results.push({ _error: String(e?.message || e) });
            }
        }
        return results;
    }

    /** 统计 */
    stats() {
        const all = this.getAll();
        const byStatus = {};
        const byType = {};
        for (const t of all) {
            byStatus[t.status] = (byStatus[t.status] || 0) + 1;
            byType[t.type] = (byType[t.type] || 0) + 1;
        }
        return { total: all.length, byStatus, byType };
    }
}

export function createThreadStore(manager) {
    return new ThreadStore(manager);
}
