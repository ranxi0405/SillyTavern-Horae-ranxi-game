#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '.bak-before-s13j';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

const FILES = {
    hm: path.join(ROOT, 'core/horaeManager.js'),
    ss: path.join(ROOT, 'core/memory/stateStore.js'),
    ix: path.join(ROOT, 'index.js'),
    wb: path.join(ROOT, 'worldbook-v0.9.json'),
};

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.relative(ROOT, f)); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== S1.3j: 修为派生修正 + Prompt 简化 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

let changed = 0, failed = 0;

function checkSyntax(f) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) { console.error('  XX syntax in ' + path.basename(f) + ':\n' + r.stderr); return false; }
    return true;
}
function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }
function applyReplace(fileContent, name, before, after, appliedCheck) {
    if (appliedCheck && fileContent.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content: fileContent, status: 0 }; }
    const occ = fileContent.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content: fileContent, status: -1 }; }
    if (occ > 1) { console.error('  XX ' + name + ' anchor found ' + occ + ' times'); return { content: fileContent, status: -1 }; }
    console.log('  OK ' + name);
    return { content: fileContent.replace(before, after), status: 1 };
}

// ═══ Part 1: Prompt realmNote ═══
{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;
    const P1_OLD = `        const realmNote = isZh
            ? '\\n\\n【境界 / 修为 / 寿元——仅变化时输出】\\nrealm:大境界名（炼气/筑基/结晶/金丹/具灵/元婴/化神/悟道/羽化/登仙/飞升）\\nrealm_phase:阶段（初期/中期/后期/圆满；飞升为空）\\ncultivation:当前修为/上限（两个非负整数）\\nage:当前年龄（非负整数）\\nlifespan:当前寿元上限（非负整数，含境界基础 + 已有永久加成）\\n变化时才输出，无变化不输出。\\nrealm 和 realm_phase 的顺序可任意，两者一起才构成完整境界。\\nrealm 单独输出时 phase 为空（不继承旧阶段）。\\nrealm_phase 单独输出时更新已有境界的阶段。\\n突破时 lifespan 必须考虑已有永久加成：\\n  新寿元上限 = 新境界基础上限 + (旧寿元上限 - 旧境界基础上限)\\n境界名必须使用标准名称，不得使用其他写法。'
            : '\\n\\n[Realm / Cultivation / Lifespan — output only on change]\\nrealm:realm name (炼气/筑基/结晶/金丹/具灵/元婴/化神/悟道/羽化/登仙/飞升)\\nrealm_phase:phase (初期/中期/后期/圆满; empty for 飞升)\\ncultivation:current/max (two non-negative integers)\\nage:current age (non-negative integer)\\nlifespan:current lifespan cap (non-negative integer; includes realm base + permanent bonuses)\\nOutput only when changed.\\nrealm and realm_phase order is arbitrary; both together form the complete realm.\\nrealm alone means phase is null (do NOT inherit old phase).\\nrealm_phase alone updates the phase of the existing realm.\\nOn breakthrough, lifespan must account for existing permanent bonuses:\\n  new lifespan = new realm base + (old lifespan - old realm base)\\nRealm name MUST use canonical names only.';`;
    const P1_NEW = `        const realmNote = isZh
            ? '\\n\\n【境界 / 修为 / 寿元——仅变化时输出】\\nrealm:大境界名（炼气/筑基/结晶/金丹/具灵/元婴/化神/悟道/羽化/登仙/飞升）\\ncultivation:当前修为值（非负整数，仅 cur）\\nage:当前年龄（非负整数）\\nlifespan:当前寿元上限（非负整数，含境界基础 + 已有永久加成）\\n变化时才输出，无变化不输出。\\n小境界（初期/中期/后期/圆满）由系统根据 cultivation 自动判定，AI 不需输出 realm_phase。\\n如需表现小境界，请通过 cultivation 数值体现。\\n境界名必须使用标准名称，不得使用其他写法。'
            : '\\n\\n[Realm / Cultivation / Lifespan — output only on change]\\nrealm:realm name (炼气/筑基/结晶/金丹/具灵/元婴/化神/悟道/羽化/登仙/飞升)\\ncultivation:current cultivation value (non-negative integer, cur only)\\nage:current age (non-negative integer)\\nlifespan:current lifespan cap (non-negative integer; includes realm base + permanent bonuses)\\nOutput only when changed.\\nSub-stages (初期/中期/后期/圆满) are auto-determined by the system based on cultivation; AI need NOT output realm_phase.\\nTo express sub-stage, reflect it via the cultivation value.\\nRealm name MUST use canonical names only.';`;
    const r = applyReplace(content, 'P1 realmNote', P1_OLD, P1_NEW, 'AI 不需输出 realm_phase');
    if (r.status === 1) { content = r.content; changed++;
        if (!DRY_RUN) { backup(FILES.hm); writeNorm(FILES.hm, content, isCRLF); if (!checkSyntax(FILES.hm)) failed++; }
    } else if (r.status === -1) failed++;
}

// ═══ Part 2: StateStore calcCultivationSegment ═══
{
    const { isCRLF, content: raw } = readNorm(FILES.ss);
    let content = raw;
    let ssChanged = 0;
    const P2_OLD = `function calcCultivationSegment(cur, realmName) {
    if (!realmName || !(realmName in REALM_BASE_CULTIVATION)) return null;
    const max = REALM_BASE_CULTIVATION[realmName];
    if (max === Infinity || realmName === '飞升') {
        return { phase: null, segCur: cur, segMax: Infinity };
    }
    const curClamped = Math.max(0, Math.min(cur, max));
    const r = curClamped / max;
    let phase, segStart, segEnd;
    if (r < 0.15) { phase = '初期'; segStart = 0; segEnd = 0.15 * max; }
    else if (r < 0.35) { phase = '中期'; segStart = 0.15 * max; segEnd = 0.35 * max; }
    else if (r < 0.60) { phase = '后期'; segStart = 0.35 * max; segEnd = 0.60 * max; }
    else { phase = '圆满'; segStart = 0.60 * max; segEnd = max; }
    return { phase, segCur: Math.round(curClamped - segStart), segMax: Math.round(segEnd - segStart) };
}`;
    const P2_NEW = `function calcCultivationSegment(cur, realmName) {
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
}`;
    const r = applyReplace(content, 'P2 calcCultivationSegment', P2_OLD, P2_NEW, `if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };`);
    if (r.status === 1) { content = r.content; ssChanged++; } else if (r.status === -1) failed++;

    // Part 3: _deriveMaxFor +cur
    const P3_OLD = `function _deriveMaxFor(state, owner, type) {
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
}`;
    const P3_NEW = `function _deriveMaxFor(state, owner, type, cur) {
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
}`;
    const r3 = applyReplace(content, 'P3 _deriveMaxFor +cur', P3_OLD, P3_NEW, `if (typeof cur === 'number' && Number.isFinite(cur) && cur > derived) return cur;`);
    if (r3.status === 1) { content = r3.content; ssChanged++; } else if (r3.status === -1) failed++;

    // Part 3b: 调用传 cur
    const P3B_OLD = `            const newMax = _deriveMaxFor(state, owner, type);`;
    const P3B_NEW = `            const newMax = _deriveMaxFor(state, owner, type, val[0]);`;
    const r3b = applyReplace(content, 'P3b 传 cur', P3B_OLD, P3B_NEW, `_deriveMaxFor(state, owner, type, val[0])`);
    if (r3b.status === 1) { content = r3b.content; ssChanged++; } else if (r3b.status === -1) failed++;

    if (ssChanged > 0 && !DRY_RUN) { backup(FILES.ss); writeNorm(FILES.ss, content, isCRLF); if (!checkSyntax(FILES.ss)) failed++; }
    changed += ssChanged;
}

// ═══ Part 4: index.js _calcCultivationSegmentHud ═══
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let ixChanged = 0;
    const P4_OLD = `function _calcCultivationSegmentHud(cur, realmName) {
    if (!realmName || !(realmName in _HUD_REALM_BASE_CULTIVATION)) return null;
    const max = _HUD_REALM_BASE_CULTIVATION[realmName];
    if (max === Infinity || realmName === '飞升') {
        return { phase: null, segCur: cur, segMax: Infinity };
    }
    const curClamped = Math.max(0, Math.min(cur, max));
    const r = curClamped / max;
    let phase, segStart, segEnd;
    if (r < 0.15) { phase = '初期'; segStart = 0; segEnd = 0.15 * max; }
    else if (r < 0.35) { phase = '中期'; segStart = 0.15 * max; segEnd = 0.35 * max; }
    else if (r < 0.60) { phase = '后期'; segStart = 0.35 * max; segEnd = 0.60 * max; }
    else { phase = '圆满'; segStart = 0.60 * max; segEnd = max; }
    return { phase, segCur: Math.round(curClamped - segStart), segMax: Math.round(segEnd - segStart) };
}`;
    const P4_NEW = `function _calcCultivationSegmentHud(cur, realmName) {
    if (!realmName || !(realmName in _HUD_REALM_BASE_CULTIVATION)) return null;
    const max = _HUD_REALM_BASE_CULTIVATION[realmName];
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
    if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };
    }
    const curClamped = Math.min(curSafe, max);
    return { phase: '圆满', segCur: Math.round(curClamped - 0.60 * max), segMax: Math.round(0.40 * max) };
}`;
    const r = applyReplace(content, 'P4 _calcCultivationSegmentHud', P4_OLD, P4_NEW, `if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };
    }`);
    if (r.status === 1) { content = r.content; ixChanged++; } else if (r.status === -1) failed++;

    const P4B_OLD = `        if (_seg && _seg.phase) {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn + '·' + _seg.phase) + '（' + _seg.segCur + '/' + _seg.segMax + '）</span>');
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        }`;
    const P4B_NEW = `        if (_seg && _seg.phase) {
            const _segStr = (_seg.segMax === Infinity)
                ? '（' + _seg.segCur + '）'
                : '（' + _seg.segCur + '/' + _seg.segMax + '）';
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn + '·' + _seg.phase) + _segStr + '</span>');
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        }`;
    const r4b = applyReplace(content, 'P4b HUD Infinity 显示', P4B_OLD, P4B_NEW, `_seg.segMax === Infinity`);
    if (r4b.status === 1) { content = r4b.content; ixChanged++; } else if (r4b.status === -1) failed++;

    if (ixChanged > 0 && !DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); if (!checkSyntax(FILES.ix)) failed++; }
    changed += ixChanged;
}

// ═══ Part 5: Worldbook uid 2 ═══
{
    const data = JSON.parse(fs.readFileSync(FILES.wb, 'utf8'));
    let wbChanged = 0;
    const WB_ADV_OLD = '修为达到当前大境界上限后，方可尝试突破下一大境界。';
    const WB_ADV_NEW = '普通大境界修为达到上限后，方可尝试突破下一大境界。\n登仙达到 512000 后进入登仙圆满无上限状态，可继续累积修为。\n512000 是登仙进入圆满无上限状态的门槛，不是登仙圆满的绝对上限。';
    const WB_FLY_OLD = '飞升机制：\n登仙圆满（修为达 512000）后，修士面临飞升选择：\n- 主动发起飞升 → 触发判定\n- 判定依据：修为、道心、仙缘、天时、因果等\n- 可能结果：成功可结束游戏或继续（飞升者身份）；失败可能陨落、重伤、修为倒退、或保住一线生机\n- 可选择不飞升继续修行，修为累积作为仙力\n- 飞升与否、成败，全由玩家行动与判定决定';
    const WB_FLY_NEW = '飞升机制：\n飞升不因修为达到某固定数值自动触发，由独立机制、玩家行动与判定决定。\n达到登仙圆满后，修士可选择主动发起飞升 → 触发判定。\n判定依据：修为、道心、仙缘、天时、因果等。\n可能结果：成功可结束游戏或继续（飞升者身份）；失败可能陨落、重伤、修为倒退、或保住一线生机。\n可选择不飞升继续修行，修为累积作为仙力。\n飞升成功后 realm=飞升、phase=null，修为继续无上限。\n飞升与否、成败，全由玩家行动与判定决定。';

    for (const [uid, e] of Object.entries(data.entries || {})) {
        if (!e.comment || !e.comment.includes('修仙境界与寿元')) continue;

        if (e.content.includes(WB_ADV_NEW)) { console.log('  .. WB uid ' + uid + ' 修为突破 (already)'); }
        else if (e.content.includes(WB_ADV_OLD)) { e.content = e.content.replace(WB_ADV_OLD, WB_ADV_NEW); console.log('  OK WB uid ' + uid + ' 修为突破'); wbChanged++; }
        else { console.error('  XX WB uid ' + uid + ' 修为突破 anchor NOT FOUND'); failed++; }

        if (e.content.includes('飞升不因修为达到某固定数值自动触发')) { console.log('  .. WB uid ' + uid + ' 飞升 (already)'); }
        else if (e.content.includes(WB_FLY_OLD)) { e.content = e.content.replace(WB_FLY_OLD, WB_FLY_NEW); console.log('  OK WB uid ' + uid + ' 飞升机制'); wbChanged++; }
        else { console.error('  XX WB uid ' + uid + ' 飞升 anchor NOT FOUND'); failed++; }
    }

    if (wbChanged > 0 && !DRY_RUN) {
        backup(FILES.wb);
        fs.writeFileSync(FILES.wb, JSON.stringify(data, null, 2), 'utf8');
        try { JSON.parse(fs.readFileSync(FILES.wb, 'utf8')); console.log('  WB JSON OK'); }
        catch (ex) { console.error('  XX WB JSON: ' + ex.message); failed++; }
    }
    changed += wbChanged;
}

console.log('');
console.log('total: changed=' + changed + ', failed=' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) console.log('[dry-run] not written');
else console.log('=== S1.3j DONE ===');