/**
 * Horae StateStore v0.1
 *
 * 职责：
 *   - 从 _rpgChanges 事件流重放生成 State 快照
 *   - 提供 replay(skipLast) 接口
 *   - 未来扩展：getCurrent() / applyChanges() / rebuild()
 *
 * 设计原则：
 *   - State 是派生的：可从 _rpgChanges 完整重建
 *   - StateStore 是权威：所有 State 读取走这里
 *   - 不修改 _mergeRpgData / rebuildRpgData（下一轮）
 */

// ⚠ 数值权威来自 Worldbook「〖核心数据〗修仙境界与寿元」/「〖核心数据〗神识与神念」
// 修改世界书后必须同步此表
export const REALM_BASE_HP = {
    '炼气': 100, '筑基': 300, '结晶': 600, '金丹': 1200, '具灵': 2000,
    '元婴': 3500, '化神': 6000, '悟道': 10000, '羽化': 18000, '登仙': 30000,
    '飞升': Infinity,
};
export const REALM_BASE_MP = {
    '炼气': 100, '筑基': 300, '结晶': 600, '金丹': 1200, '具灵': 2000,
    '元婴': 3500, '化神': 6000, '悟道': 10000, '羽化': 18000, '登仙': 30000,
    '飞升': Infinity,
};
export const SPIRIT_BASE_SP = {
    '蒙昧': 100, '清明': 250, '凝照': 600, '洞玄': 1500, '明心': 3500, '太虚': 8000,
};
export const SPIRIT_THRESHOLD = {
    '蒙昧': 1000, '清明': 3000, '凝照': 6000, '洞玄': 10000, '明心': 15000, '太虚': Infinity,
};
export const SPIRIT_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];

export const REALM_BASE_CULTIVATION = {
    '炼气': 1000, '筑基': 2000, '结晶': 4000, '金丹': 8000, '具灵': 16000,
    '元婴': 32000, '化神': 64000, '悟道': 128000, '羽化': 256000, '登仙': 512000,
    '飞升': Infinity,
};

function deriveCultivationMax(realmName) {
    if (!realmName || !(realmName in REALM_BASE_CULTIVATION)) return null;
    return REALM_BASE_CULTIVATION[realmName];
}

function calcCultivationSegment(cur, realmName) {
    if (!realmName || !(realmName in REALM_BASE_CULTIVATION)) return null;
    const max = REALM_BASE_CULTIVATION[realmName];
    if (max === Infinity || realmName === '飞升') {
        return { phase: null, segCur: cur, segMax: Infinity };
    }
    const curSafe = Math.max(0, cur);
    const r = curSafe / max;
    if (r < 0.15) {
        return { phase: '初期', segCur: Math.round(curSafe), segMax: Math.round(0.15 * max) };
    }
    if (r < 0.35) {
        return { phase: '中期', segCur: Math.round(curSafe - 0.15 * max), segMax: Math.round(0.20 * max) };
    }
    if (r < 0.60) {
        return { phase: '后期', segCur: Math.round(curSafe - 0.35 * max), segMax: Math.round(0.25 * max) };
    }
    // 圆满段
    if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };
    }
    const curClamped = Math.min(curSafe, max);
    return { phase: '圆满', segCur: Math.round(curClamped - 0.60 * max), segMax: Math.round(0.40 * max) };
}

export { deriveCultivationMax, calcCultivationSegment };

const EMPTY_SNAPSHOT = () => ({
    bars: {}, status: {}, skills: {}, attributes: {},
    reputation: {}, equipment: {},
    currency: {}, strongholds: [],
    spirit: null,
    arts: {}, shenTong: {},
    realm: null, cultivation: null, age: null, lifespan: null,
    barBonuses: {},
});

// ── 数值派生辅助函数 ──

function _deriveMaxFor(state, owner, type, cur) {
    const bonus = (state.barBonuses?.[owner]?.[type]) || 0;
    let derived = null;
    if (type === 'hp') {
        const name = state.realm?.name;
        if (!name || !(name in REALM_BASE_HP)) return null;
        const base = REALM_BASE_HP[name];
        derived = base === Infinity ? Infinity : base + bonus;
    } else if (type === 'mp') {
        const name = state.realm?.name;
        if (!name || !(name in REALM_BASE_MP)) return null;
        const base = REALM_BASE_MP[name];
        derived = base === Infinity ? Infinity : base + bonus;
    } else if (type === 'sp') {
        const tier = state.spirit?.tier;
        if (!tier || !(tier in SPIRIT_BASE_SP)) return null;
        const base = SPIRIT_BASE_SP[tier];
        if (base === Infinity) return Infinity;
        const xp = state.spirit?.xp || 0;
        derived = base + Math.floor(xp / 100) + bonus;
    } else {
        return null;
    }
    if (derived === null) return null;
    if (derived === Infinity) return Infinity;
    // 兜底：避免 cur > max 出现 280/100 之类的非法显示
    if (typeof cur === 'number' && Number.isFinite(cur) && cur > derived) return cur;
    return derived;
}

function _barsNeedMaxInit(state) {
    if (!state.bars) return false;
    for (const bars of Object.values(state.bars)) {
        if (!bars || typeof bars !== 'object') continue;
        for (const val of Object.values(bars)) {
            if (!Array.isArray(val) || val.length < 2) return true;
            if (val[1] === null || val[1] === undefined) return true;
        }
    }
    return false;
}

function _deriveAllBarsMax(state) {
    if (!state.bars) return;
    for (const [owner, bars] of Object.entries(state.bars)) {
        if (!bars || typeof bars !== 'object') continue;
        for (const [type, val] of Object.entries(bars)) {
            if (!Array.isArray(val) || val.length < 1) continue;
            const newMax = _deriveMaxFor(state, owner, type, val[0]);
            if (newMax === null) continue;
            const cur = val[0];
            const label = val[2];
            if (label !== undefined && label !== null && label !== '') {
                bars[type] = [cur, newMax, label];
            } else {
                bars[type] = [cur, newMax];
            }
        }
    }
}

function _applySpiritChange(state, changes) {
    if (!changes || typeof changes !== 'object') return false;
    const hasTier = typeof changes.tier === 'string';
    const hasXp = typeof changes.xp === 'number';
    if (!hasTier && !hasXp) return false;

    if (hasXp) {
        if (!Number.isSafeInteger(changes.xp) || changes.xp < 0) {
            console.warn('[Horae][spirit] 非法 xp，整条拒绝:', changes.xp);
            return false;
        }
    }

    const curTier = state.spirit?.tier || null;
    const curXp = state.spirit?.xp || 0;
    const curTotalXpRaw = state.spirit?.totalXp;
    const curTotalXp = (curTotalXpRaw !== undefined && curTotalXpRaw !== null) ? curTotalXpRaw : curXp;

    let finalTier = curTier;
    let tierChanged = false;
    if (hasTier) {
        const t = changes.tier;
        if (!SPIRIT_ORDER.includes(t)) {
            console.warn('[Horae][spirit] 非法 tier，整条拒绝:', t);
            return false;
        }
        if (curTier && t !== curTier) {
            const curIdx = SPIRIT_ORDER.indexOf(curTier);
            const newIdx = SPIRIT_ORDER.indexOf(t);
            if (newIdx !== curIdx + 1) {
                console.warn('[Horae][spirit] 非法跳段，整条拒绝:', curTier, '->', t);
                return false;
            }
            const threshold = SPIRIT_THRESHOLD[curTier];
            if (!(curXp >= threshold)) {
                console.warn('[Horae][spirit] xp 未达阈值，晋升失败，整条拒绝:', curTier, 'xp=' + curXp, 'threshold=' + threshold);
                return false;
            }
            finalTier = t;
            tierChanged = true;
        } else if (!curTier) {
            finalTier = t;
            tierChanged = true;
        }
    }

    let finalXp;
    if (tierChanged) {
        finalXp = hasXp ? changes.xp : 0;
        const t = SPIRIT_THRESHOLD[finalTier];
        if (finalTier !== '太虚' && finalXp > t) {
            console.warn('[Horae][spirit] 新段 xp 超上限，整条拒绝:', finalXp, 'max=' + t);
            return false;
        }
    } else {
        if (!finalTier && hasXp) {
            console.warn('[Horae][spirit] 无 tier 时不可设置 xp，整条拒绝');
            return false;
        }
        finalXp = hasXp ? changes.xp : curXp;
        if (hasXp) {
            if (finalXp < curXp) {
                console.warn('[Horae][spirit] xp 倒退，整条拒绝:', curXp, '->', finalXp);
                return false;
            }
            if (finalTier !== '太虚') {
                const t = SPIRIT_THRESHOLD[finalTier];
                if (finalXp > t) {
                    console.warn('[Horae][spirit] xp 超上限，整条拒绝:', finalXp, 'max=' + t);
                    return false;
                }
            }
        }
    }

    let finalTotalXp;
    if (tierChanged) {
        // totalXp 已包含旧段累计值，晋升后只增加新段获得的 xp
        finalTotalXp = curTotalXp + finalXp;
    } else {
        finalTotalXp = curTotalXp + (finalXp - curXp);
    }

    if (!state.spirit) state.spirit = {};
    state.spirit.tier = finalTier;
    state.spirit.xp = finalXp;
    state.spirit.totalXp = finalTotalXp;
    return true;
}

function _applyBarBonusChanges(state, changes) {
    if (!Array.isArray(changes) || changes.length === 0) return false;
    if (!state.barBonuses) state.barBonuses = {};
    let applied = false;
    for (const c of changes) {
        const owner = c && c.owner;
        const type = c && c.type;
        const delta = c && c.delta;
        if (!owner || !type || !Number.isSafeInteger(delta) || delta <= 0) continue;
        if (type !== 'hp' && type !== 'mp' && type !== 'sp') continue;
        if (!state.barBonuses[owner]) state.barBonuses[owner] = {};
        state.barBonuses[owner][type] = (state.barBonuses[owner][type] || 0) + delta;
        applied = true;
    }
    return applied;
}

import { createEmptyMeta, findExistingItemByBaseName, getItemBaseName } from '../horaeManager.js';

export class StateStore {
    constructor(manager) {
        if (!manager) throw new Error('StateStore: manager required');
        this.manager = manager;
    }

    /**
     * 从所有消息重放生成 State 快照
     * @param {number} skipLast - 跳过末尾 N 条消息（swipe 时 =1）
     */
    replay(skipLast = 0) {
        const chat = this.manager.getChat();
        if (!chat?.length) return EMPTY_SNAPSHOT();

        const end = Math.max(1, chat.length - skipLast);
        const first = chat[0];
        const rpgMeta = first?.horae_meta?.rpg || {};
        const _cfgs = first?.horae_meta?._rpgConfigs || {};

        const repConfig = _cfgs.reputationConfig || rpgMeta.reputationConfig || { categories: [], _deletedCategories: [] };
        const curConfig = _cfgs.currencyConfig || rpgMeta.currencyConfig || { denominations: [] };
        const deletedCurrencies = _cfgs._deletedCurrencies || rpgMeta._deletedCurrencies || [];
        const userStrongholds = (_cfgs.strongholds || rpgMeta.strongholds || []).filter(n => n._userAdded);
        const deletedSh = _cfgs._deletedStrongholds || rpgMeta._deletedStrongholds || [];

        const snapshot = EMPTY_SNAPSHOT();
        snapshot.strongholds = JSON.parse(JSON.stringify(userStrongholds));

        // 用户手动编辑的数据
        const userSkills = {};
        for (const [owner, arr] of Object.entries(rpgMeta.skills || {})) {
            const ua = (arr || []).filter(s => s._userAdded);
            if (ua.length) userSkills[owner] = ua;
        }
        const deletedSkills = rpgMeta._deletedSkills || [];
        const userAttrs = {};
        for (const [owner, vals] of Object.entries(rpgMeta.attributes || {})) {
            userAttrs[owner] = { ...vals };
        }
        const userCurrency = rpgMeta.currency || {};

        const _eqCfg = _cfgs.equipmentConfig || rpgMeta.equipmentConfig || { locked: false, perChar: {} };
        const _eqPerChar = _eqCfg.perChar || {};

        const _resolve = (raw) => this.manager._resolveRpgOwner(raw);
        const _isCurDel = (name, list, idx) => this.manager._isCurrencyDeletedAt(name, list, idx);

        const _epochRaw = first?.horae_meta?.rpg?._deriveEpoch;
        const _epoch = (_epochRaw !== undefined && _epochRaw !== null) ? _epochRaw : chat.length;

        for (let i = 0; i < end; i++) {
            const changes = chat[i]?.horae_meta?._rpgChanges;
            if (!changes) continue;

            for (const [raw, barData] of Object.entries(changes.bars || {})) {
                const owner = _resolve(raw);
                if (!snapshot.bars[owner]) snapshot.bars[owner] = {};
                for (const [type, val] of Object.entries(barData)) {
                    const old = snapshot.bars[owner][type];
                    if (old && Array.isArray(old) && old[2] && Array.isArray(val) && !val[2]) {
                        snapshot.bars[owner][type] = [val[0], val[1], old[2]];
                    } else {
                        snapshot.bars[owner][type] = val;
                    }
                }
            }

            // spirit 回放（含晋升校验 + totalXp 结算，非法整条拒绝）
            if (changes.spirit && typeof changes.spirit === 'object') {
                _applySpiritChange(snapshot, changes.spirit);
            }

            // realm 回放（与 applyChanges 逻辑一致）
            if (changes.realm && typeof changes.realm === 'object') {
                const VALID_NAMES = ['炼气', '筑基', '结晶', '金丹', '具灵', '元婴', '化神', '悟道', '羽化', '登仙', '飞升'];
                const VALID_PHASES = ['初期', '中期', '后期', '圆满'];
                const cName = changes.realm.name;
                const cPhase = changes.realm.phase;
                const hasName = typeof cName === 'string' && cName.length > 0;
                const hasPhase = typeof cPhase === 'string' && cPhase.length > 0;

                if (hasName) {
                    if (VALID_NAMES.includes(cName)) {
                        let finalPhase = null;
                        if (cName === '飞升') {
                            finalPhase = null;
                        } else if (hasPhase && VALID_PHASES.includes(cPhase)) {
                            finalPhase = cPhase;
                        }
                        snapshot.realm = { name: cName, phase: finalPhase };
                    }
                } else if (hasPhase) {
                    if (snapshot.realm && snapshot.realm.name && snapshot.realm.name !== '飞升' && VALID_PHASES.includes(cPhase)) {
                        snapshot.realm.phase = cPhase;
                    }
                }
            }

            // cultivation 回放（epoch 门控 + max 从境界派生）
            if (Array.isArray(changes.cultivation) && changes.cultivation.length >= 2) {
                const cur = changes.cultivation[0];
                if (Number.isSafeInteger(cur) && cur >= 0) {
                    let finalMax;
                    if (i >= _epoch) {
                        const derived = deriveCultivationMax(snapshot.realm?.name);
                        finalMax = derived !== null ? derived : (Number.isSafeInteger(changes.cultivation[1]) ? changes.cultivation[1] : 0);
                    } else {
                        finalMax = Number.isSafeInteger(changes.cultivation[1]) ? changes.cultivation[1] : 0;
                    }
                    snapshot.cultivation = [cur, finalMax];
                }
            }

            // age 回放
            if (typeof changes.age === 'number' && Number.isSafeInteger(changes.age) && changes.age >= 0) {
                snapshot.age = changes.age;
            }

            // lifespan 回放
            if (typeof changes.lifespan === 'number' && Number.isSafeInteger(changes.lifespan) && changes.lifespan >= 0) {
                snapshot.lifespan = changes.lifespan;
            }

            for (const [raw, effects] of Object.entries(changes.status || {})) {
                const owner = _resolve(raw);
                snapshot.status[owner] = effects;
            }
            for (const sk of (changes.skills || [])) {
                const owner = _resolve(sk.owner);
                if (!snapshot.skills[owner]) snapshot.skills[owner] = [];
                const idx = snapshot.skills[owner].findIndex(s => s.name === sk.name);
                if (idx >= 0) {
                    if (sk.level != null) snapshot.skills[owner][idx].level = sk.level;
                    if (sk.desc != null) snapshot.skills[owner][idx].desc = sk.desc;
                    if (sk.category != null) snapshot.skills[owner][idx].category = sk.category;
                } else {
                    snapshot.skills[owner].push({ name: sk.name, level: sk.level, desc: sk.desc, category: sk.category || 'other' });
                }
            }
            // arts 回放
            for (const art of (changes.arts || [])) {
                const owner = _resolve(art.owner);
                if (!owner || !art.name || !art.tier) continue;
                if (!snapshot.arts[owner]) snapshot.arts[owner] = {};
                snapshot.arts[owner][art.name] = { tier: art.tier };
                if (typeof art.xp === 'number' && Number.isSafeInteger(art.xp) && art.xp >= 0) {
                    snapshot.arts[owner][art.name].xp = art.xp;
                }
            }
            // shenTong 回放
            for (const st of (changes.shenTong || [])) {
                const owner = _resolve(st.owner);
                if (!owner || !st.name) continue;
                if (!snapshot.shenTong[owner]) snapshot.shenTong[owner] = [];
                const idx = snapshot.shenTong[owner].findIndex(x => x.name === st.name);
                if (idx >= 0) {
                    if (typeof st.desc === 'string') snapshot.shenTong[owner][idx].desc = st.desc;
                } else {
                    snapshot.shenTong[owner].push({ name: st.name, desc: st.desc || '' });
                }
            }
            for (const sk of (changes.removedSkills || [])) {
                const owner = _resolve(sk.owner);
                if (snapshot.skills[owner]) {
                    snapshot.skills[owner] = snapshot.skills[owner].filter(s => s.name !== sk.name);
                }
            }
            for (const [raw, vals] of Object.entries(changes.attributes || {})) {
                const owner = _resolve(raw);
                snapshot.attributes[owner] = { ...(snapshot.attributes[owner] || {}), ...vals };
            }
            for (const [raw, cats] of Object.entries(changes.reputation || {})) {
                const owner = _resolve(raw);
                if (!snapshot.reputation[owner]) snapshot.reputation[owner] = {};
                for (const [catName, val] of Object.entries(cats)) {
                    if (!snapshot.reputation[owner][catName]) {
                        snapshot.reputation[owner][catName] = { value: val, subItems: {} };
                    } else {
                        snapshot.reputation[owner][catName].value = val;
                    }
                }
            }
            for (const u of (changes.unequip || [])) {
                const owner = _resolve(u.owner);
                if (!snapshot.equipment[owner]?.[u.slot]) continue;
                snapshot.equipment[owner][u.slot] = snapshot.equipment[owner][u.slot].filter(e => e.name !== u.name);
                if (!snapshot.equipment[owner][u.slot].length) delete snapshot.equipment[owner][u.slot];
                if (!Object.keys(snapshot.equipment[owner] || {}).length) delete snapshot.equipment[owner];
            }
            for (const eq of (changes.equipment || [])) {
                const owner = _resolve(eq.owner);
                const ownerCfg = _eqPerChar[owner];
                const maxCount = (ownerCfg && Array.isArray(ownerCfg.slots))
                    ? (ownerCfg.slots.find(s => s.name === eq.slot)?.maxCount ?? 1) : 1;
                if (!snapshot.equipment[owner]) snapshot.equipment[owner] = {};
                if (!snapshot.equipment[owner][eq.slot]) snapshot.equipment[owner][eq.slot] = [];
                const idx = snapshot.equipment[owner][eq.slot].findIndex(e => e.name === eq.name);
                if (idx >= 0) {
                    snapshot.equipment[owner][eq.slot][idx].attrs = eq.attrs;
                } else {
                    while (snapshot.equipment[owner][eq.slot].length >= maxCount) snapshot.equipment[owner][eq.slot].shift();
                    snapshot.equipment[owner][eq.slot].push({ name: eq.name, attrs: eq.attrs || {} });
                }
            }
            const validDenoms = new Set((curConfig.denominations || []).map(d => d.name));
            for (const c of (changes.currency || [])) {
                if (_isCurDel(c.name, deletedCurrencies, i)) continue;
                if (validDenoms.size && !validDenoms.has(c.name)) continue;
                const owner = _resolve(c.owner);
                if (!snapshot.currency[owner]) snapshot.currency[owner] = {};
                if (c.isDelta) {
                    snapshot.currency[owner][c.name] = (snapshot.currency[owner][c.name] || 0) + c.value;
                } else {
                    snapshot.currency[owner][c.name] = c.value;
                }
            }
            if (changes.baseChanges?.length > 0) {
                for (const bc of changes.baseChanges) {
                    const pathParts = bc.path.split('>').map(s => s.trim()).filter(Boolean);
                    let parentId = null;
                    let targetNode = null;
                    let blocked = false;
                    for (const part of pathParts) {
                        const parentName = parentId ? (snapshot.strongholds.find(n => n.id === parentId)?.name || null) : null;
                        if (deletedSh.some(d => d.name === part && (d.parent || null) === parentName)) { blocked = true; break; }
                        targetNode = snapshot.strongholds.find(n => n.name === part && (n.parent || null) === parentId);
                        if (!targetNode) {
                            targetNode = { id: 'sh_' + i + '_' + Math.random().toString(36).slice(2, 6), name: part, level: null, desc: '', parent: parentId };
                            snapshot.strongholds.push(targetNode);
                        }
                        parentId = targetNode.id;
                    }
                    if (blocked || !targetNode) continue;
                    if (bc.field === 'level') targetNode.level = typeof bc.value === 'number' ? bc.value : parseInt(bc.value);
                    else if (bc.field === 'desc') targetNode.desc = String(bc.value);
                }
            }

            // ── barBonus 重放 + bars max 派生（仅 epoch 范围内）──
            {
                const _bonusApplied = _applyBarBonusChanges(snapshot, changes.barBonusChanges);
                const _realmChanged = !!changes.realm;
                const _spiritChanged = !!(
                    changes.spirit &&
                    typeof changes.spirit === 'object' &&
                    (
                        Object.prototype.hasOwnProperty.call(changes.spirit, 'tier') ||
                        Object.prototype.hasOwnProperty.call(changes.spirit, 'xp')
                    )
                );
                const _needInit = _barsNeedMaxInit(snapshot);
                if ((_realmChanged || _spiritChanged || _bonusApplied || _needInit) && i >= _epoch) {
                    _deriveAllBarsMax(snapshot);
                }
            }
        }

        // 合入用户手动属性（AI 数据优先覆盖）
        for (const [owner, vals] of Object.entries(userAttrs)) {
            if (!snapshot.attributes[owner]) snapshot.attributes[owner] = {};
            for (const [k, v] of Object.entries(vals)) {
                if (snapshot.attributes[owner][k] === undefined) snapshot.attributes[owner][k] = v;
            }
        }
        // 回填用户手动技能
        for (const [owner, arr] of Object.entries(userSkills)) {
            if (!snapshot.skills[owner]) snapshot.skills[owner] = [];
            for (const sk of arr) {
                if (!snapshot.skills[owner].some(s => s.name === sk.name)) snapshot.skills[owner].push(sk);
            }
        }
        // 过滤用户手动删除的技能
        for (const del of deletedSkills) {
            if (snapshot.skills[del.owner]) {
                snapshot.skills[del.owner] = snapshot.skills[del.owner].filter(s => s.name !== del.name);
                if (!snapshot.skills[del.owner].length) delete snapshot.skills[del.owner];
            }
        }
        // 回填手动经验/货币；已有回放值优先
        for (const [owner, coins] of Object.entries(userCurrency)) {
            if (!snapshot.currency[owner]) snapshot.currency[owner] = {};
            for (const [name, val] of Object.entries(coins || {})) {
                if (_isCurDel(name, deletedCurrencies, null)) continue;
                if (snapshot.currency[owner][name] === undefined) snapshot.currency[owner][name] = val;
            }
            if (!Object.keys(snapshot.currency[owner]).length) delete snapshot.currency[owner];
        }
        // 声望：合入用户细项
        const validRepNames = new Set((repConfig.categories || []).map(c => c.name));
        const deletedRepNames = new Set(repConfig._deletedCategories || []);
        const userRep = rpgMeta.reputation || {};
        for (const [owner, cats] of Object.entries(userRep)) {
            if (!snapshot.reputation[owner]) snapshot.reputation[owner] = {};
            for (const [catName, data] of Object.entries(cats)) {
                if (deletedRepNames.has(catName) || (validRepNames.size > 0 && !validRepNames.has(catName))) continue;
                if (!snapshot.reputation[owner][catName]) {
                    snapshot.reputation[owner][catName] = { ...data };
                } else {
                    snapshot.reputation[owner][catName].subItems = data.subItems || {};
                    if (data._userEdited) {
                        snapshot.reputation[owner][catName].value = data.value;
                        snapshot.reputation[owner][catName]._userEdited = true;
                    }
                }
            }
        }
        // 移除快照中已删除的声望分类
        for (const [owner, cats] of Object.entries(snapshot.reputation)) {
            for (const catName of Object.keys(cats)) {
                if (deletedRepNames.has(catName) || (validRepNames.size > 0 && !validRepNames.has(catName))) {
                    delete cats[catName];
                }
            }
            if (!Object.keys(cats).length) delete snapshot.reputation[owner];
        }
        snapshot.reputationConfig = repConfig;
        // 装备：按角色过滤已删除格位
        for (const [owner, slots] of Object.entries(snapshot.equipment)) {
            const ownerCfg = _eqPerChar[owner];
            if (!ownerCfg || !Array.isArray(ownerCfg.slots)) continue;
            const validEqSlots = new Set(ownerCfg.slots.map(s => s.name));
            const deletedEqSlots = new Set(ownerCfg._deletedSlots || []);
            for (const slotName of Object.keys(slots)) {
                if (deletedEqSlots.has(slotName) || (validEqSlots.size > 0 && !validEqSlots.has(slotName))) {
                    delete slots[slotName];
                }
            }
            if (!Object.keys(slots).length) delete snapshot.equipment[owner];
        }
        snapshot.equipmentConfig = _eqCfg;
        snapshot.currencyConfig = curConfig;
        return snapshot;
    }

    /**
     * 应用 State 变更（从 _mergeRpgData 搬运）
     * @param {object} changes
     * @param {object} options - { readOnly, messageIndex }
     */
    applyChanges(changes, options = {}) {
        const { readOnly = false, messageIndex = null } = options;
        const manager = this.manager;
        const chat = manager.getChat();
        if (!chat?.length || !changes) return;
        const first = chat[0];
        if (!first.horae_meta) first.horae_meta = createEmptyMeta();
        if (!first.horae_meta.rpg) first.horae_meta.rpg = { bars: {}, status: {}, skills: {} };
        const rpg = first.horae_meta.rpg;

        const _mUN = manager.context?.name1 || '主角';

        for (const [raw, barData] of Object.entries(changes.bars || {})) {
            const owner = manager._resolveRpgOwner(raw);
            if (manager.settings?.rpgBarsUserOnly && owner !== _mUN) continue;
            if (!rpg.bars[owner]) rpg.bars[owner] = {};
            for (const [type, val] of Object.entries(barData)) {
                const old = rpg.bars[owner][type];
                if (old && Array.isArray(old) && old[2] && Array.isArray(val) && !val[2]) {
                    rpg.bars[owner][type] = [val[0], val[1], old[2]];
                } else {
                    rpg.bars[owner][type] = val;
                }
            }
        }

        // spirit 合并（含晋升校验 + totalXp 结算，非法整条拒绝）
        if (changes.spirit && typeof changes.spirit === 'object') {
            _applySpiritChange(rpg, changes.spirit);
        }

        // realm 合并（支持 phase-only 增量）
        if (changes.realm && typeof changes.realm === 'object') {
            const VALID_NAMES = ['炼气', '筑基', '结晶', '金丹', '具灵', '元婴', '化神', '悟道', '羽化', '登仙', '飞升'];
            const VALID_PHASES = ['初期', '中期', '后期', '圆满'];
            const cName = changes.realm.name;
            const cPhase = changes.realm.phase;
            const hasName = typeof cName === 'string' && cName.length > 0;
            const hasPhase = typeof cPhase === 'string' && cPhase.length > 0;

            if (hasName) {
                if (!VALID_NAMES.includes(cName)) {
                    console.warn('[Horae][realm] 非法 name，忽略:', cName);
                } else {
                    let finalPhase = null;
                    if (cName === '飞升') {
                        finalPhase = null;
                    } else if (hasPhase) {
                        if (VALID_PHASES.includes(cPhase)) {
                            finalPhase = cPhase;
                        } else {
                            console.warn('[Horae][realm] 非法 phase，忽略 phase:', cPhase);
                            finalPhase = null;
                        }
                    }
                    rpg.realm = { name: cName, phase: finalPhase };
                }
            } else if (hasPhase) {
                if (!rpg.realm || !rpg.realm.name) {
                    console.warn('[Horae][realm] phase-only 但 State 无 realm，忽略:', cPhase);
                } else if (rpg.realm.name === '飞升') {
                    console.warn('[Horae][realm] phase-only 但 State 是飞升，忽略:', cPhase);
                } else if (VALID_PHASES.includes(cPhase)) {
                    rpg.realm.phase = cPhase;
                } else {
                    console.warn('[Horae][realm] 非法 phase，忽略:', cPhase);
                }
            }
        }

        // cultivation 合并（epoch 门控 + max 从境界派生）
        if (Array.isArray(changes.cultivation) && changes.cultivation.length >= 2) {
            const cur = changes.cultivation[0];
            if (Number.isSafeInteger(cur) && cur >= 0) {
                const _epochRaw = rpg._deriveEpoch;
                const _epoch = (_epochRaw !== undefined && _epochRaw !== null) ? _epochRaw : chat.length;
                const _hasMsgIdx = Number.isInteger(messageIndex);
                const _inEpoch = !_hasMsgIdx || messageIndex >= _epoch;
                let finalMax;
                if (_inEpoch) {
                    const derived = deriveCultivationMax(rpg.realm?.name);
                    finalMax = derived !== null ? derived : (Number.isSafeInteger(changes.cultivation[1]) ? changes.cultivation[1] : 0);
                } else {
                    finalMax = Number.isSafeInteger(changes.cultivation[1]) ? changes.cultivation[1] : 0;
                }
                rpg.cultivation = [cur, finalMax];
            } else {
                console.warn('[Horae][cultivation] 非法值，忽略:', changes.cultivation);
            }
        }

        // age 合并
        if (typeof changes.age === 'number') {
            if (Number.isSafeInteger(changes.age) && changes.age >= 0) {
                rpg.age = changes.age;
            } else {
                console.warn('[Horae][age] 非法值，忽略:', changes.age);
            }
        }

        // lifespan 合并
        if (typeof changes.lifespan === 'number') {
            if (Number.isSafeInteger(changes.lifespan) && changes.lifespan >= 0) {
                rpg.lifespan = changes.lifespan;
            } else {
                console.warn('[Horae][lifespan] 非法值，忽略:', changes.lifespan);
            }
        }

        // ── barBonus 处理 + bars max 派生 ──
        {
            const _bonusApplied = _applyBarBonusChanges(rpg, changes.barBonusChanges);
            const _realmChanged = !!changes.realm;
            const _spiritChanged = !!(
                changes.spirit &&
                typeof changes.spirit === 'object' &&
                (
                    Object.prototype.hasOwnProperty.call(changes.spirit, 'tier') ||
                    Object.prototype.hasOwnProperty.call(changes.spirit, 'xp')
                )
            );
            const _needInit = _barsNeedMaxInit(rpg);
            const _epochRaw = rpg._deriveEpoch;
            const _epoch = (_epochRaw !== undefined && _epochRaw !== null) ? _epochRaw : chat.length;
            const _hasMsgIdx = Number.isInteger(messageIndex);
            const _inEpoch = !_hasMsgIdx || messageIndex >= _epoch;
            if ((_realmChanged || _spiritChanged || _bonusApplied || _needInit) && _inEpoch) {
                _deriveAllBarsMax(rpg);
            }
        }

        for (const [raw, effects] of Object.entries(changes.status || {})) {
            const owner = manager._resolveRpgOwner(raw);
            if (manager.settings?.rpgBarsUserOnly && owner !== _mUN) continue;
            if (!rpg.status) rpg.status = {};
            rpg.status[owner] = effects;
        }
        const _deletedSkillSet = new Set((rpg._deletedSkills || []).map(d => `${d.owner}\0${d.name}`));
        for (const sk of (changes.skills || [])) {
            const owner = manager._resolveRpgOwner(sk.owner);
            if (manager.settings?.rpgSkillsUserOnly && owner !== _mUN) continue;
            if (_deletedSkillSet.has(`${owner}\0${sk.name}`)) continue;
            if (!rpg.skills[owner]) rpg.skills[owner] = [];
            const idx = rpg.skills[owner].findIndex(s => s.name === sk.name);
            if (idx >= 0) {
                if (sk.level != null) rpg.skills[owner][idx].level = sk.level;
                if (sk.desc != null) rpg.skills[owner][idx].desc = sk.desc;
                if (sk.category != null) rpg.skills[owner][idx].category = sk.category;
            } else {
                rpg.skills[owner].push({ name: sk.name, level: sk.level, desc: sk.desc, category: sk.category || 'other' });
            }
        }
        // arts 合并（B1 不扩展 userOnly，按 owner 正常写入）
        for (const art of (changes.arts || [])) {
            const owner = manager._resolveRpgOwner(art.owner);
            if (!owner || !art.name || !art.tier) continue;
            if (!rpg.arts) rpg.arts = {};
            if (!rpg.arts[owner]) rpg.arts[owner] = {};
            rpg.arts[owner][art.name] = { tier: art.tier };
            if (typeof art.xp === 'number' && Number.isSafeInteger(art.xp) && art.xp >= 0) {
                rpg.arts[owner][art.name].xp = art.xp;
            }
        }
        // shenTong 合并（B1 不扩展 userOnly，按 owner 正常写入）
        for (const st of (changes.shenTong || [])) {
            const owner = manager._resolveRpgOwner(st.owner);
            if (!owner || !st.name) continue;
            if (!rpg.shenTong) rpg.shenTong = {};
            if (!rpg.shenTong[owner]) rpg.shenTong[owner] = [];
            const idx = rpg.shenTong[owner].findIndex(x => x.name === st.name);
            if (idx >= 0) {
                if (typeof st.desc === 'string') rpg.shenTong[owner][idx].desc = st.desc;
            } else {
                rpg.shenTong[owner].push({ name: st.name, desc: st.desc || '' });
            }
        }
        for (const sk of (changes.removedSkills || [])) {
            const owner = manager._resolveRpgOwner(sk.owner);
            if (manager.settings?.rpgSkillsUserOnly && owner !== _mUN) continue;
            if (rpg.skills[owner]) {
                rpg.skills[owner] = rpg.skills[owner].filter(s => s.name !== sk.name);
            }
        }
        // 多维属性
        for (const [raw, vals] of Object.entries(changes.attributes || {})) {
            const owner = manager._resolveRpgOwner(raw);
            if (manager.settings?.rpgAttrsUserOnly && owner !== _mUN) continue;
            if (!rpg.attributes) rpg.attributes = {};
            rpg.attributes[owner] = { ...(rpg.attributes[owner] || {}), ...vals };
        }
        // 装备：按角色独立格位配置
        if (changes.equipment?.length > 0 || changes.unequip?.length > 0) {
            if (!rpg.equipmentConfig) rpg.equipmentConfig = { locked: false, perChar: {} };
            if (!rpg.equipmentConfig.perChar) rpg.equipmentConfig.perChar = {};
            if (!rpg.equipment) rpg.equipment = {};
            const _getOwnerSlots = (owner) => {
                const pc = rpg.equipmentConfig.perChar[owner];
                if (!pc || !Array.isArray(pc.slots)) return { valid: new Set(), deleted: new Set(), maxMap: {}, locked: !!rpg.equipmentConfig.locked };
                return {
                    valid: new Set(pc.slots.map(s => s.name)),
                    deleted: new Set(pc._deletedSlots || []),
                    maxMap: Object.fromEntries(pc.slots.map(s => [s.name, s.maxCount ?? 1])),
                    locked: !!rpg.equipmentConfig.locked,
                };
            };
            const _findAndTakeItem = (name) => {
                if (readOnly) return null;
                const state = manager.getLatestState();
                const exactInfo = state?.items?.[name];
                const existingKey = exactInfo
                    ? name
                    : findExistingItemByBaseName(
                        state?.items || {},
                        name
                    );

                const itemInfo = existingKey
                    ? state?.items?.[existingKey]
                    : null;

                if (!itemInfo) return null;
                const meta = { icon: itemInfo.icon || '', description: itemInfo.description || '', importance: itemInfo.importance || '', _id: itemInfo._id || '', _locked: itemInfo._locked || false };

                for (let k = chat.length - 1; k >= 0; k--) {
                    const messageItems = chat[k]?.horae_meta?.items;
                    if (!messageItems) continue;

                    if (messageItems[existingKey]) {
                        delete messageItems[existingKey];
                        break;
                    }

                    const targetBase =
                        getItemBaseName(existingKey).toLowerCase();

                    const candidateNames = Object.keys(messageItems).filter(
                        itemName =>
                            getItemBaseName(itemName).toLowerCase() === targetBase
                    );

                    if (candidateNames.length === 1) {
                        delete messageItems[candidateNames[0]];
                        break;
                    }
                }
                return meta;
            };
            const _returnItemFromEquip = (entry, owner) => {
                if (readOnly) return;
                if (!first.horae_meta.items) first.horae_meta.items = {};
                const m = entry._itemMeta || {};
                first.horae_meta.items[entry.name] = {
                    icon: m.icon || '📦', description: m.description || '', importance: m.importance || '',
                    holder: owner, location: '', _id: m._id || '', _locked: m._locked || false,
                };
            };
            for (const u of (changes.unequip || [])) {
                const owner = manager._resolveRpgOwner(u.owner);
                if (manager.settings?.rpgEquipmentUserOnly && owner !== _mUN) continue;
                if (!rpg.equipment[owner]?.[u.slot]) continue;
                const removed = rpg.equipment[owner][u.slot].find(e => e.name === u.name);
                rpg.equipment[owner][u.slot] = rpg.equipment[owner][u.slot].filter(e => e.name !== u.name);
                if (removed) _returnItemFromEquip(removed, owner);
                if (!rpg.equipment[owner][u.slot].length) delete rpg.equipment[owner][u.slot];
                if (rpg.equipment[owner] && !Object.keys(rpg.equipment[owner]).length) delete rpg.equipment[owner];
            }
            for (const eq of (changes.equipment || [])) {
                const slotName = eq.slot;
                const owner = manager._resolveRpgOwner(eq.owner);
                if (manager.settings?.rpgEquipmentUserOnly && owner !== _mUN) continue;
                const { valid, deleted, maxMap, locked } = _getOwnerSlots(owner);
                if (locked && (valid.size === 0 || !valid.has(slotName) || deleted.has(slotName))) continue;
                if (valid.size > 0 && (!valid.has(slotName) || deleted.has(slotName))) continue;
                if (!rpg.equipment[owner]) rpg.equipment[owner] = {};
                if (!rpg.equipment[owner][slotName]) rpg.equipment[owner][slotName] = [];
                const existing = rpg.equipment[owner][slotName].findIndex(e => e.name === eq.name);
                if (existing >= 0) {
                    rpg.equipment[owner][slotName][existing].attrs = eq.attrs;
                } else {
                    const maxCount = maxMap[slotName] ?? 1;
                    if (rpg.equipment[owner][slotName].length >= maxCount) {
                        const bumped = rpg.equipment[owner][slotName].shift();
                        if (bumped) _returnItemFromEquip(bumped, owner);
                    }
                    const itemMeta = _findAndTakeItem(eq.name);
                    rpg.equipment[owner][slotName].push({ name: eq.name, attrs: eq.attrs || {}, ...(itemMeta ? { _itemMeta: itemMeta } : {}) });
                }
            }
        }
        // 声望：只接受 reputationConfig 中已定义且未删除的分类（配置为空时不限制）
        if (changes.reputation && Object.keys(changes.reputation).length > 0) {
            const _cfgs = manager.getChat()?.[0]?.horae_meta?._rpgConfigs;
            const repCfg = _cfgs?.reputationConfig || rpg.reputationConfig || { categories: [], _deletedCategories: [] };
            if (!rpg.reputationConfig) rpg.reputationConfig = repCfg;
            if (!rpg.reputation) rpg.reputation = {};
            const validNames = new Set((repCfg.categories || []).map(c => c.name));
            const deleted = new Set(repCfg._deletedCategories || []);
            for (const [raw, cats] of Object.entries(changes.reputation)) {
                const owner = manager._resolveRpgOwner(raw);
                if (manager.settings?.rpgReputationUserOnly && owner !== _mUN) continue;
                if (!rpg.reputation[owner]) rpg.reputation[owner] = {};
                for (const [catName, val] of Object.entries(cats)) {
                    if (deleted.has(catName)) continue;
                    if (validNames.size > 0 && !validNames.has(catName)) continue;
                    const cfg = rpg.reputationConfig.categories.find(c => c.name === catName);
                    const clamped = Math.max(cfg?.min ?? -100, Math.min(cfg?.max ?? 100, val));
                    if (!rpg.reputation[owner][catName]) {
                        rpg.reputation[owner][catName] = { value: clamped, subItems: {} };
                    } else if (!rpg.reputation[owner][catName]._userEdited) {
                        rpg.reputation[owner][catName].value = clamped;
                    }
                }
            }
        }
        // 货币：只接受 currencyConfig 中已定义的币种（配置为空时不限制）
        if (changes.currency?.length > 0) {
            const _cfgs2 = manager.getChat()?.[0]?.horae_meta?._rpgConfigs;
            const curCfg = _cfgs2?.currencyConfig || rpg.currencyConfig || { denominations: [] };
            if (!rpg.currencyConfig) rpg.currencyConfig = curCfg;
            if (!rpg.currency) rpg.currency = {};
            const validDenoms = new Set((curCfg.denominations || []).map(d => d.name));
            const deletedDenoms = _cfgs2?._deletedCurrencies || rpg._deletedCurrencies || [];
            for (const c of changes.currency) {
                const owner = manager._resolveRpgOwner(c.owner);
                if (manager.settings?.rpgCurrencyUserOnly && owner !== _mUN) continue;
                if (manager._isCurrencyDeletedAt(c.name, deletedDenoms, messageIndex)) continue;
                if (validDenoms.size > 0 && !validDenoms.has(c.name)) continue;
                if (!rpg.currency[owner]) rpg.currency[owner] = {};
                if (c.isDelta) {
                    rpg.currency[owner][c.name] = (rpg.currency[owner][c.name] || 0) + c.value;
                } else {
                    rpg.currency[owner][c.name] = c.value;
                }
            }
        }
        // 据点变更（跳过用户已删除的节点，防回滚）
        if (changes.baseChanges?.length > 0) {
            if (!rpg.strongholds) rpg.strongholds = [];
            const deletedSh = rpg._deletedStrongholds || [];
            for (const bc of changes.baseChanges) {
                const pathParts = bc.path.split('>').map(s => s.trim()).filter(Boolean);
                let parentId = null;
                let targetNode = null;
                let blocked = false;
                for (const part of pathParts) {
                    const parentName = parentId ? (rpg.strongholds.find(n => n.id === parentId)?.name || null) : null;
                    if (deletedSh.some(d => d.name === part && (d.parent || null) === parentName)) {
                        blocked = true;
                        break;
                    }
                    targetNode = rpg.strongholds.find(n => n.name === part && (n.parent || null) === parentId);
                    if (!targetNode) {
                        targetNode = { id: 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: part, level: null, desc: '', parent: parentId };
                        rpg.strongholds.push(targetNode);
                    }
                    parentId = targetNode.id;
                }
                if (blocked || !targetNode) continue;
                if (bc.field === 'level') targetNode.level = typeof bc.value === 'number' ? bc.value : parseInt(bc.value);
                else if (bc.field === 'desc') targetNode.desc = String(bc.value);
            }
        }
    }

    /**
     * 从所有消息重建 State（从 rebuildRpgData 搬运）
     */
    rebuild() {
        const manager = this.manager;
        const chat = manager.getChat();
        if (!chat?.length) return;
        const first = chat[0];
        if (!first.horae_meta) first.horae_meta = createEmptyMeta();
        if (!first.horae_meta.rpg) first.horae_meta.rpg = {};
        const rpg = first.horae_meta.rpg;

        // ── 从 _rpgConfigs 权威来源读取 config，fallback 到 rpg 内部（旧数据迁移） ──
        const cfgs = first.horae_meta._rpgConfigs || {};
        const repCfg = cfgs.reputationConfig || rpg.reputationConfig || { categories: [], _deletedCategories: [] };
        const eqCfg = cfgs.equipmentConfig || rpg.equipmentConfig || { locked: false, perChar: {} };
        const curCfg = cfgs.currencyConfig || rpg.currencyConfig || { denominations: [] };
        const shs = cfgs.strongholds || rpg.strongholds || [];
        const delShs = cfgs._deletedStrongholds || rpg._deletedStrongholds || [];
        const delSkills = cfgs._deletedSkills || rpg._deletedSkills || [];
        const delCurrencies = cfgs._deletedCurrencies || rpg._deletedCurrencies || [];

        // ── 保留用户手动数据 ──
        const userSkills = {};
        for (const [owner, arr] of Object.entries(rpg.skills || {})) {
            const ua = (arr || []).filter(s => s._userAdded);
            if (ua.length) userSkills[owner] = ua;
        }
        const userAttrs = rpg.attributes || {};
        const oldReputation = rpg.reputation ? JSON.parse(JSON.stringify(rpg.reputation)) : {};
        const oldCurrency = rpg.currency ? JSON.parse(JSON.stringify(rpg.currency)) : {};

        // ── 只重置可重放的数据字段 ──
        rpg.bars = {};
        rpg.status = {};
        rpg.skills = {};
        rpg.attributes = { ...userAttrs };
        rpg.reputation = {};
        rpg.equipment = {};
        rpg.currency = {};
        rpg.spirit = null;
        rpg.arts = {};
        rpg.shenTong = {};
        rpg.realm = null;
        rpg.cultivation = null;
        rpg.age = null;
        rpg.lifespan = null;
        rpg.barBonuses = {};

        // ── config 从权威来源写入 rpg（供 _mergeRpgData 使用） ──
        rpg.reputationConfig = repCfg;
        rpg.equipmentConfig = eqCfg;
        rpg.currencyConfig = curCfg;
        rpg._deletedSkills = delSkills;
        rpg._deletedCurrencies = delCurrencies;
        rpg.strongholds = JSON.parse(JSON.stringify(shs));
        rpg._deletedStrongholds = JSON.parse(JSON.stringify(delShs));

        // ── 从所有消息重放 _rpgChanges ──
        for (let i = 0; i < chat.length; i++) {
            const changes = chat[i]?.horae_meta?._rpgChanges;
            if (changes) this.applyChanges(changes, { readOnly: true, messageIndex: i });
        }

        // ── 回填用户手动添加的技能 ──
        for (const [owner, arr] of Object.entries(userSkills)) {
            if (!rpg.skills[owner]) rpg.skills[owner] = [];
            for (const sk of arr) {
                if (!rpg.skills[owner].some(s => s.name === sk.name)) rpg.skills[owner].push(sk);
            }
        }
        for (const del of delSkills) {
            if (rpg.skills[del.owner]) {
                rpg.skills[del.owner] = rpg.skills[del.owner].filter(s => s.name !== del.name);
                if (!rpg.skills[del.owner].length) delete rpg.skills[del.owner];
            }
        }

        // ── 回填手动设置的等级/经验/货币；已有回放值优先，避免覆盖历史变化 ──
        for (const [owner, coins] of Object.entries(oldCurrency)) {
            if (!rpg.currency[owner]) rpg.currency[owner] = {};
            for (const [name, val] of Object.entries(coins || {})) {
                if (rpg.currency[owner][name] === undefined) rpg.currency[owner][name] = val;
            }
        }

        // ── 回填用户设置的声望 ──
        const deletedRepCats = new Set(rpg.reputationConfig?._deletedCategories || []);
        const validRepCats = new Set((rpg.reputationConfig?.categories || []).map(c => c.name));
        for (const [owner, cats] of Object.entries(oldReputation)) {
            if (!rpg.reputation[owner]) rpg.reputation[owner] = {};
            for (const [catName, data] of Object.entries(cats)) {
                if (deletedRepCats.has(catName)) continue;
                if (validRepCats.size > 0 && !validRepCats.has(catName)) continue;
                if (!rpg.reputation[owner][catName]) {
                    rpg.reputation[owner][catName] = data;
                } else {
                    rpg.reputation[owner][catName].subItems = data.subItems || {};
                    if (data._userEdited) {
                        rpg.reputation[owner][catName].value = data.value;
                        rpg.reputation[owner][catName]._userEdited = true;
                    }
                }
            }
        }

        // ── 同步回 _rpgConfigs 权威存储 ──
        first.horae_meta._rpgConfigs = {
            reputationConfig: rpg.reputationConfig,
            equipmentConfig: rpg.equipmentConfig,
            currencyConfig: rpg.currencyConfig,
            _deletedSkills: rpg._deletedSkills,
            _deletedCurrencies: rpg._deletedCurrencies,
            strongholds: rpg.strongholds,
            _deletedStrongholds: rpg._deletedStrongholds,
        };
    }
}

export function createStateStore(manager) {
    return new StateStore(manager);
}
