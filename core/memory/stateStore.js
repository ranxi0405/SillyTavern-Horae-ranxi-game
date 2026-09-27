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

const EMPTY_SNAPSHOT = () => ({
    bars: {}, status: {}, skills: {}, attributes: {},
    reputation: {}, equipment: {}, levels: {}, xp: {},
    currency: {}, strongholds: [],
});

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
        const userLevels = rpgMeta.levels || {};
        const userXp = rpgMeta.xp || {};
        const userCurrency = rpgMeta.currency || {};

        const _eqCfg = _cfgs.equipmentConfig || rpgMeta.equipmentConfig || { locked: false, perChar: {} };
        const _eqPerChar = _eqCfg.perChar || {};

        const _resolve = (raw) => this.manager._resolveRpgOwner(raw);
        const _isCurDel = (name, list, idx) => this.manager._isCurrencyDeletedAt(name, list, idx);

        for (let i = 0; i < end; i++) {
            const changes = chat[i]?.horae_meta?._rpgChanges;
            if (!changes) continue;

            for (const [raw, barData] of Object.entries(changes.bars || {})) {
                const owner = _resolve(raw);
                if (!snapshot.bars[owner]) snapshot.bars[owner] = {};
                Object.assign(snapshot.bars[owner], barData);
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
                } else {
                    snapshot.skills[owner].push({ name: sk.name, level: sk.level, desc: sk.desc });
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
            for (const [raw, val] of Object.entries(changes.levels || {})) {
                snapshot.levels[_resolve(raw)] = val;
            }
            for (const [raw, val] of Object.entries(changes.xp || {})) {
                snapshot.xp[_resolve(raw)] = val;
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
        // 回填手动等级/经验/货币；已有回放值优先
        for (const [owner, val] of Object.entries(userLevels)) {
            if (snapshot.levels[owner] === undefined) snapshot.levels[owner] = val;
        }
        for (const [owner, val] of Object.entries(userXp)) {
            if (snapshot.xp[owner] === undefined) snapshot.xp[owner] = val;
        }
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
}

export function createStateStore(manager) {
    return new StateStore(manager);
}
