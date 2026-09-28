#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/memory/stateStore.js');
const BACKUP = FILE + '.bak-before-s13c';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, FILE); fs.unlinkSync(BACKUP);
    console.log('rolled back'); process.exit(0);
}

const raw = fs.readFileSync(FILE, 'utf8');
const isCRLF = raw.includes('\r\n');
let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;

function apply(name, before, after, appliedAnchor) {
    const idx = content.indexOf(before);
    if (idx !== -1) {
        content = content.substring(0, idx) + after + content.substring(idx + before.length);
        console.log('  OK ' + name);
        return 1;
    }
    if (after && after.length > 0 && content.includes(after)) { console.log('  .. ' + name + ' (already)'); return 0; }
    if (appliedAnchor && content.includes(appliedAnchor)) { console.log('  .. ' + name + ' (already)'); return 0; }
    console.error('  XX ' + name + ' NOT FOUND');
    return -1;
}

console.log('=== S1.3c StateStore ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('file: ' + FILE);
let changed = 0, failed = 0;

// ── Patch 1: 常量表（EMPTY_SNAPSHOT 之前）──
{
    const before = `const EMPTY_SNAPSHOT = () => ({`;
    const after = `// ⚠ 数值权威来自 Worldbook「〖核心数据〗修仙境界与寿元」/「〖核心数据〗神识与神念」
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

const EMPTY_SNAPSHOT = () => ({`;
    const r = apply('P1 常量表', before, after, `export const SPIRIT_ORDER`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 2: EMPTY_SNAPSHOT 加 barBonuses ──
{
    const before = `    realm: null, cultivation: null, age: null, lifespan: null,
});`;
    const after = `    realm: null, cultivation: null, age: null, lifespan: null,
    barBonuses: {},
});`;
    const r = apply('P2 EMPTY_SNAPSHOT+barBonuses', before, after, `    barBonuses: {},\n});`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 3: 辅助函数（EMPTY_SNAPSHOT 之后）──
{
    const before = `    barBonuses: {},
});`;
    const after = `    barBonuses: {},
});

// ── 数值派生辅助函数 ──

function _deriveMaxFor(state, owner, type) {
    const bonus = (state.barBonuses?.[owner]?.[type]) || 0;
    if (type === 'hp') {
        const name = state.realm?.name;
        if (!name || !(name in REALM_BASE_HP)) return null;
        const base = REALM_BASE_HP[name];
        return base === Infinity ? Infinity : base + bonus;
    }
    if (type === 'mp') {
        const name = state.realm?.name;
        if (!name || !(name in REALM_BASE_MP)) return null;
        const base = REALM_BASE_MP[name];
        return base === Infinity ? Infinity : base + bonus;
    }
    if (type === 'sp') {
        const tier = state.spirit?.tier;
        if (!tier || !(tier in SPIRIT_BASE_SP)) return null;
        const base = SPIRIT_BASE_SP[tier];
        if (base === Infinity) return Infinity;
        const xp = state.spirit?.xp || 0;
        return base + Math.floor(xp / 100) + bonus;
    }
    return null;
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
            const newMax = _deriveMaxFor(state, owner, type);
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
}`;
    const r = apply('P3 辅助函数', before, after, `function _applyBarBonusChanges`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('part 1: changed=' + changed + ', failed=' + failed);

// ── Patch 4: applyChanges 里 spirit 块替换 ──
{
    const before = `        // spirit 合并
        if (changes.spirit && typeof changes.spirit === 'object') {
            const VALID_TIERS = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];
            const hasValidTier = typeof changes.spirit.tier === 'string' && VALID_TIERS.includes(changes.spirit.tier);
            const hasValidXp = typeof changes.spirit.xp === 'number' && Number.isSafeInteger(changes.spirit.xp) && changes.spirit.xp >= 0;
            if (hasValidTier || hasValidXp) {
                if (!rpg.spirit) rpg.spirit = {};
                if (hasValidTier) rpg.spirit.tier = changes.spirit.tier;
                if (hasValidXp) rpg.spirit.xp = changes.spirit.xp;
            }
        }`;
    const after = `        // spirit 合并（含晋升校验 + totalXp 结算，非法整条拒绝）
        if (changes.spirit && typeof changes.spirit === 'object') {
            _applySpiritChange(rpg, changes.spirit);
        }`;
    const r = apply('P4 applyChanges spirit', before, after, `_applySpiritChange(rpg, changes.spirit)`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 5: applyChanges lifespan 之后加 barBonus + derive（含 xp 变化 + 首次初始化）──
{
    const before = `        // lifespan 合并
        if (typeof changes.lifespan === 'number') {
            if (Number.isSafeInteger(changes.lifespan) && changes.lifespan >= 0) {
                rpg.lifespan = changes.lifespan;
            } else {
                console.warn('[Horae][lifespan] 非法值，忽略:', changes.lifespan);
            }
        }

        for (const [raw, effects] of Object.entries(changes.status || {})) {`;
    const after = `        // lifespan 合并
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

        for (const [raw, effects] of Object.entries(changes.status || {})) {`;
    const r = apply('P5 applyChanges barBonus+derive', before, after, `_barsNeedMaxInit(rpg)`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 6: replay 里 spirit 块替换 ──
{
    const before = `            // spirit 回放
            if (changes.spirit && typeof changes.spirit === 'object') {
                const VALID_TIERS = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];
                const hasValidTier = typeof changes.spirit.tier === 'string' && VALID_TIERS.includes(changes.spirit.tier);
                const hasValidXp = typeof changes.spirit.xp === 'number' && Number.isSafeInteger(changes.spirit.xp) && changes.spirit.xp >= 0;
                if (hasValidTier || hasValidXp) {
                    if (!snapshot.spirit) snapshot.spirit = {};
                    if (hasValidTier) snapshot.spirit.tier = changes.spirit.tier;
                    if (hasValidXp) snapshot.spirit.xp = changes.spirit.xp;
                }
            }`;
    const after = `            // spirit 回放（含晋升校验 + totalXp 结算，非法整条拒绝）
            if (changes.spirit && typeof changes.spirit === 'object') {
                _applySpiritChange(snapshot, changes.spirit);
            }`;
    const r = apply('P6 replay spirit', before, after, `_applySpiritChange(snapshot, changes.spirit)`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 7a: replay 循环前加 epoch 变量 ──
{
    const before = `        const _resolve = (raw) => this.manager._resolveRpgOwner(raw);
        const _isCurDel = (name, list, idx) => this.manager._isCurrencyDeletedAt(name, list, idx);

        for (let i = 0; i < end; i++) {`;
    const after = `        const _resolve = (raw) => this.manager._resolveRpgOwner(raw);
        const _isCurDel = (name, list, idx) => this.manager._isCurrencyDeletedAt(name, list, idx);

        const _epochRaw = first?.horae_meta?.rpg?._deriveEpoch;
        const _epoch = (_epochRaw !== undefined && _epochRaw !== null) ? _epochRaw : chat.length;

        for (let i = 0; i < end; i++) {`;
    const r = apply('P7a replay epoch var', before, after, `const _epoch = (_epochRaw !== undefined && _epochRaw !== null) ? _epochRaw : chat.length;`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 7b: replay 循环末尾加 barBonus + derive（含 xp 变化 + 首次初始化）──
{
    const before = `                    if (blocked || !targetNode) continue;
                    if (bc.field === 'level') targetNode.level = typeof bc.value === 'number' ? bc.value : parseInt(bc.value);
                    else if (bc.field === 'desc') targetNode.desc = String(bc.value);
                }
            }
        }`;
    const after = `                    if (blocked || !targetNode) continue;
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
        }`;
    const r = apply('P7b replay loop tail', before, after, `_needInit && `);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Patch 8: rebuild 重置段加 barBonuses ──
{
    const before = `        rpg.realm = null;
        rpg.cultivation = null;
        rpg.age = null;
        rpg.lifespan = null;`;
    const after = `        rpg.realm = null;
        rpg.cultivation = null;
        rpg.age = null;
        rpg.lifespan = null;
        rpg.barBonuses = {};`;
    const r = apply('P8 rebuild barBonuses reset', before, after, `rpg.barBonuses = {};`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('all patches: changed=' + changed + ', failed=' + failed);
if (failed > 0) { console.error('some patches not found, abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up: ' + path.basename(BACKUP)); }

const out = isCRLF ? content.replace(/\n/g, '\r\n') : content;
fs.writeFileSync(FILE, out, 'utf8');
console.log('written ' + path.basename(FILE));

const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) { console.error('syntax error:\n' + r.stderr); process.exit(2); }
console.log('syntax OK');
