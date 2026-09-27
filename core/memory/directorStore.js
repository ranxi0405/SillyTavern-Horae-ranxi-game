/**
 * Horae DirectorStore v0.1
 *
 * 职责：
 *   - 存储"玩家对天道的长期导演要求"
 *   - 识别玩家输入中的导演指令（不依赖 AI）
 *   - 复发计数：同一指令反复提醒 → 加强，不累积
 *
 * 设计原则：
 *   - 玩家输入时识别，AI 不能干预
 *   - 同 category + 语义相似 → 归并（count++）
 *   - 相似度用 bigram Jaccard，阈值 0.5
 *   - 惰性初始化 chat[0].horae_meta.directorNotes
 *
 * DirectorNote 结构：
 *   {
 *     id: 'd_xxx',
 *     category: 'pacing' | 'world' | ...,
 *     text: '玩家原始指令',
 *     createdAt: ISO,
 *     lastReinforcedAt: ISO,
 *     reinforcementCount: 1,
 *     source: 'msg:1165,msg:1180',
 *     status: 'active' | 'resolved',
 *   }
 */

const SIMILARITY_THRESHOLD = 0.4;

const DIRECTOR_CATEGORIES = {
    pacing:     /节奏|太快|太慢|太琐碎|推进|一步到位|跳跃|拖沓|压缩|详略/,
    world:      /世界.{0,10}(活|运转|时间线|回响|规律|自转)|NPC.{0,5}独立|不围绕|世界是活/,
    format:     /时间格式|阿拉伯数字|24\s*小时|年份|日期.{0,4}(格式|写)|几点|时刻/,
    rules:      /规则|设定|机制|判定|数值.{0,3}(计算|规则)|按.{0,4}设定/,
    style:      /叙事|文风|风格|描写|细节|啰嗦|简洁|写实|不.{0,3}(要|需).{0,3}(华丽|冗长)/,
    constraint: /不要|禁止|别|不许|严禁|不准|不得/,
    protagonist:/替玩家|控制.{0,3}(角色|玩家)|发言|心理|行动|未声明|意图/,
    npc:        /NPC|角色.{0,4}(行为|反应|独立|性格)|人物|反应|性格/,
    causality:  /因果|为什么|突然|不合理|理由|凭空|没.{0,3}铺垫|没.{0,3}(原因|由来)/,
    continuity: /记忆|忘了|忘.{0,3}记|连续性|前后|矛盾|不一致|断裂|对不上/,
    correction: /纠正|修正|错了|不对|属性|数值|状态|数据|不.{0,3}符合/,
    content:    /尺度|内容|暴力|血腥|NSFW|色情|残酷|重口味/,
};

const QUERY_PATTERNS = [
    /^查询/,
    /^查看/,
    /^显示/,
    /^看看.{0,5}(状态|属性|修为|灵根|体质|背包|物品|时间|地点)/,
    /^我.{0,4}(是谁|在哪|有什么|多少|几年)/,
    /^现在.{0,4}(是什么|几点|哪年|在哪)/,
    /状态$/,
];

export class DirectorStore {
    constructor(manager) {
        if (!manager) throw new Error('DirectorStore: manager required');
        this.manager = manager;
    }

    _ensureSlot() {
        const chat = this.manager.getChat?.();
        if (!chat?.length) return null;
        if (!chat[0].horae_meta) return null;
        if (!Array.isArray(chat[0].horae_meta.directorNotes)) {
            chat[0].horae_meta.directorNotes = [];
        }
        return chat[0].horae_meta.directorNotes;
    }

    /** 读取全部（深拷贝） */
    getAll() {
        const slot = this._ensureSlot();
        if (!slot) return [];
        return structuredClone(slot);
    }

    /** 只读 active */
    getActive() {
        const all = this.getAll();
        return all.filter(d => d.status === 'active');
    }

    /** 检测玩家输入是否是查询类（不记录） */
    isQuery(text) {
        if (!text || typeof text !== 'string') return false;
        const t = text.trim();
        return QUERY_PATTERNS.some(re => re.test(t));
    }

    /** 检测玩家输入是否是导演指令，返回 { category, text } 或 null */
    detect(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        if (t.length < 3) return null;
        if (this.isQuery(t)) return null;

        for (const [category, re] of Object.entries(DIRECTOR_CATEGORIES)) {
            if (re.test(t)) {
                return { category, text: t };
            }
        }
        return null;
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

    /** bigram Jaccard 相似度 */
    static _similarity(a, b) {
        const A = DirectorStore._bigrams(a);
        const B = DirectorStore._bigrams(b);
        if (A.size === 0 || B.size === 0) return 0;
        let inter = 0;
        for (const x of A) if (B.has(x)) inter++;
        const union = A.size + B.size - inter;
        return union > 0 ? inter / union : 0;
    }

    /**
     * 提交一条导演指令
     */
    commit({ category, text, source = '' }) {
        if (!category || !text) {
            throw new Error('DirectorStore.commit: category/text required');
        }
        const slot = this._ensureSlot();
        if (!slot) throw new Error('DirectorStore.commit: no slot');

        const now = new Date().toISOString();

        let matchedIdx = -1;
        let bestScore = 0;
        for (let i = 0; i < slot.length; i++) {
            const d = slot[i];
            if (d.status !== 'active') continue;
            if (d.category !== category) continue;
            const sim = DirectorStore._similarity(d.text, text);
            if (sim >= SIMILARITY_THRESHOLD && sim > bestScore) {
                bestScore = sim;
                matchedIdx = i;
            }
        }

        if (matchedIdx >= 0) {
            const d = slot[matchedIdx];
            d.reinforcementCount = (d.reinforcementCount || 1) + 1;
            d.lastReinforcedAt = now;
            if (source) {
                const srcs = (d.source || '').split(',').filter(Boolean);
                if (!srcs.includes(source)) srcs.push(source);
                d.source = srcs.join(',');
            }
            return { ...structuredClone(d), _isNew: false, _similarity: bestScore };
        }

        const newNote = {
            id: 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            category,
            text,
            createdAt: now,
            lastReinforcedAt: now,
            reinforcementCount: 1,
            source: source || '',
            status: 'active',
        };
        slot.push(newNote);
        return { ...structuredClone(newNote), _isNew: true };
    }

    /** 标记已解决 */
    resolve(id) {
        const slot = this._ensureSlot();
        if (!slot) return false;
        const d = slot.find(x => x.id === id);
        if (!d) return false;
        d.status = 'resolved';
        return true;
    }

    /** 统计 */
    stats() {
        const all = this.getAll();
        const byCategory = {};
        let active = 0;
        for (const d of all) {
            if (d.status === 'active') {
                active++;
                byCategory[d.category] = (byCategory[d.category] || 0) + 1;
            }
        }
        return { total: all.length, active, byCategory };
    }
}

export function createDirectorStore(manager) {
    return new DirectorStore(manager);
}
