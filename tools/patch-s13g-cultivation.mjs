#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;
const SUFFIX = '.bak-before-s13g';

const FILES = {
    wb: path.join(ROOT, 'worldbook-v0.9.json'),
    hm: path.join(ROOT, 'core/horaeManager.js'),
    ss: path.join(ROOT, 'core/memory/stateStore.js'),
    ix: path.join(ROOT, 'index.js'),
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

console.log('=== S1.3g 修为派生 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

function checkSyntax(f) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) { console.error('syntax error in ' + path.basename(f) + ':\n' + r.stderr); process.exit(2); }
}

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) {
    const b = f + SUFFIX;
    if (!fs.existsSync(b)) fs.copyFileSync(f, b);
}

let totalChanged = 0, totalFailed = 0;

// ═══════════════════════════════════════════════
// Part 1: Worldbook — uid 2 追加修为表 + 飞升判定
// ═══════════════════════════════════════════════
{
    const data = JSON.parse(fs.readFileSync(FILES.wb, 'utf8'));
    const APPEND = '\n\n各境界修为上限（大境界内累计）：\n炼气 1000\n筑基 2000\n结晶 4000\n金丹 8000\n具灵 16000\n元婴 32000\n化神 64000\n悟道 128000\n羽化 256000\n登仙 512000\n\n小境界分段（初期/中期/后期/圆满）：\n按大境界上限的 15% / 20% / 25% / 40% 划分。\n修为达到当前大境界上限后，方可尝试突破下一大境界。\n小境界由累计修为自动判定。\n\n飞升机制：\n登仙圆满（修为达 512000）后，修士面临飞升选择：\n- 主动发起飞升 → 触发判定\n- 判定依据：修为、道心、仙缘、天时、因果等\n- 可能结果：成功可结束游戏或继续（飞升者身份）；失败可能陨落、重伤、修为倒退、或保住一线生机\n- 可选择不飞升继续修行，修为累积作为仙力\n- 飞升与否、成败，全由玩家行动与判定决定';

    let changed = 0;
    for (const [uid, e] of Object.entries(data.entries || {})) {
        if (e.comment && e.comment.includes('修仙境界与寿元')) {
            if (e.content.includes('各境界修为上限')) {
                console.log('  .. WB uid ' + uid + ' (already)');
            } else {
                e.content = e.content + APPEND;
                changed++; console.log('  OK WB uid ' + uid + ' 追加修为表');
            }
        }
    }
    if (changed > 0 && !DRY_RUN) {
        backup(FILES.wb);
        fs.writeFileSync(FILES.wb, JSON.stringify(data, null, 2), 'utf8');
        JSON.parse(fs.readFileSync(FILES.wb, 'utf8'));
    }
    totalChanged += changed;
}

// ═══════════════════════════════════════════════
// Part 2: Parser — cultivation 支持短格式
// ═══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;

    const BEFORE = `        // cultivation:当前修为/上限
        if (line.startsWith('cultivation:')) {
            const str = line.substring(12).trim();
            const m = str.match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);
            if (m) {
                const cur = Number(m[1]);
                const max = Number(m[2]);
                if (Number.isSafeInteger(cur) && Number.isSafeInteger(max)) {
                    rpg.cultivation = [cur, max];
                    if (cur > max) console.warn('[Horae][cultivation] cur > max，保留:', cur, max);
                } else {
                    console.warn('[Horae][cultivation] 数值超出安全整数，忽略:', str);
                }
            } else {
                console.warn('[Horae][cultivation] 非法格式，忽略:', str);
            }
            return;
        }`;

    const AFTER = `        // cultivation:当前修为（新短格式 cur）或 当前修为/上限（旧格式兼容）
        if (line.startsWith('cultivation:')) {
            const str = line.substring(12).trim();
            const mShort = str.match(/^(\\d+)$/);
            if (mShort) {
                const cur = Number(mShort[1]);
                if (Number.isSafeInteger(cur) && cur >= 0) {
                    rpg.cultivation = [cur, null];
                } else {
                    console.warn('[Horae][cultivation] 数值超出安全整数，忽略:', str);
                }
                return;
            }
            const m = str.match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);
            if (m) {
                const cur = Number(m[1]);
                const max = Number(m[2]);
                if (Number.isSafeInteger(cur) && Number.isSafeInteger(max)) {
                    rpg.cultivation = [cur, max];
                } else {
                    console.warn('[Horae][cultivation] 数值超出安全整数，忽略:', str);
                }
            } else {
                console.warn('[Horae][cultivation] 非法格式，忽略:', str);
            }
            return;
        }`;

    if (content.includes(AFTER)) {
        console.log('  .. Parser cultivation (already)');
    } else if (content.includes(BEFORE)) {
        content = content.replace(BEFORE, AFTER);
        if (!DRY_RUN) { backup(FILES.hm); writeNorm(FILES.hm, content, isCRLF); checkSyntax(FILES.hm); }
        console.log('  OK Parser cultivation');
        totalChanged++;
    } else {
        console.error('  XX Parser cultivation NOT FOUND');
        totalFailed++;
    }
}

// ═══════════════════════════════════════════════
// Part 3: StateStore — 常量 + 派生 + epoch
// ═══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ss);
    let content = raw;
    let ssChanged = 0;

    // 3a. 常量表 + 辅助函数
    const A_B = `export const SPIRIT_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];`;
    const A_A = `export const SPIRIT_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];

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
    const curClamped = Math.max(0, Math.min(cur, max));
    const r = curClamped / max;
    let phase, segStart, segEnd;
    if (r < 0.15) { phase = '初期'; segStart = 0; segEnd = 0.15 * max; }
    else if (r < 0.35) { phase = '中期'; segStart = 0.15 * max; segEnd = 0.35 * max; }
    else if (r < 0.60) { phase = '后期'; segStart = 0.35 * max; segEnd = 0.60 * max; }
    else { phase = '圆满'; segStart = 0.60 * max; segEnd = max; }
    return { phase, segCur: Math.round(curClamped - segStart), segMax: Math.round(segEnd - segStart) };
}

export { deriveCultivationMax, calcCultivationSegment };`;

    if (content.includes('REALM_BASE_CULTIVATION')) { console.log('  .. SS 常量表 (already)'); }
    else if (content.includes(A_B)) { content = content.replace(A_B, A_A); ssChanged++; console.log('  OK SS 常量表 + 派生函数'); }
    else { console.error('  XX SS 常量表 anchor NOT FOUND'); totalFailed++; }

    // 3b. applyChanges 里 cultivation
    const B_B = `        // cultivation 合并
        if (Array.isArray(changes.cultivation) && changes.cultivation.length >= 2) {
            const cur = changes.cultivation[0];
            const max = changes.cultivation[1];
            if (Number.isSafeInteger(cur) && cur >= 0 && Number.isSafeInteger(max) && max >= 0) {
                rpg.cultivation = [cur, max];
                if (cur > max) console.warn('[Horae][cultivation] cur > max，保留:', cur, max);
            } else {
                console.warn('[Horae][cultivation] 非法值，忽略:', changes.cultivation);
            }
        }`;

    const B_A = `        // cultivation 合并（epoch 门控 + max 从境界派生）
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
        }`;

    if (content.includes(B_A)) { console.log('  .. SS cultivation apply (already)'); }
    else if (content.includes(B_B)) { content = content.replace(B_B, B_A); ssChanged++; console.log('  OK SS cultivation apply'); }
    else { console.error('  XX SS cultivation apply NOT FOUND'); totalFailed++; }

    // 3c. replay 里 cultivation
    const C_B = `            // cultivation 回放
            if (Array.isArray(changes.cultivation) && changes.cultivation.length >= 2) {
                const cur = changes.cultivation[0];
                const max = changes.cultivation[1];
                if (Number.isSafeInteger(cur) && cur >= 0 && Number.isSafeInteger(max) && max >= 0) {
                    snapshot.cultivation = [cur, max];
                }
            }`;

    const C_A = `            // cultivation 回放（epoch 门控 + max 从境界派生）
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
            }`;

    if (content.includes(C_A)) { console.log('  .. SS cultivation replay (already)'); }
    else if (content.includes(C_B)) { content = content.replace(C_B, C_A); ssChanged++; console.log('  OK SS cultivation replay'); }
    else { console.error('  XX SS cultivation replay NOT FOUND'); totalFailed++; }

    if (ssChanged > 0 && !DRY_RUN) { backup(FILES.ss); writeNorm(FILES.ss, content, isCRLF); checkSyntax(FILES.ss); console.log('  SS syntax OK'); }
    totalChanged += ssChanged;
}

// ═══════════════════════════════════════════════
// Part 4: HUD — 境界胶囊改段内显示
// ═══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let ixChanged = 0;

    const A_B = `function _buildCharHudHtml(name, rpg) {`;
    const A_A = `const _HUD_REALM_BASE_CULTIVATION = {
    '炼气': 1000, '筑基': 2000, '结晶': 4000, '金丹': 8000, '具灵': 16000,
    '元婴': 32000, '化神': 64000, '悟道': 128000, '羽化': 256000, '登仙': 512000,
    '飞升': Infinity,
};

function _calcCultivationSegmentHud(cur, realmName) {
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
}

function _buildCharHudHtml(name, rpg) {`;

    if (content.includes('_HUD_REALM_BASE_CULTIVATION')) { console.log('  .. HUD 常量 (already)'); }
    else if (content.includes(A_B)) { content = content.replace(A_B, A_A); ixChanged++; console.log('  OK HUD 常量 + 段内函数'); }
    else { console.error('  XX HUD 常量 anchor NOT FOUND'); totalFailed++; }

    const B_B = `        const _rn = rpg.realm.name;
        const _rp = rpg.realm.phase;
        const _rd = (_rn === '飞升' || !_rp) ? _rn : (_rn + '·' + _rp);
        if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rd) + '（' + rpg.cultivation[0] + '/' + rpg.cultivation[1] + '）</span>');
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rd) + '</span>');
        }`;

    const B_A = `        const _rn = rpg.realm.name;
        if (_rn === '飞升') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        } else if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
            const _cur = rpg.cultivation[0];
            const _seg = _calcCultivationSegmentHud(_cur, _rn);
            if (_seg && _seg.phase) {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn + '·' + _seg.phase) + '（' + _seg.segCur + '/' + _seg.segMax + '）</span>');
            } else {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
            }
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        }`;

    if (content.includes(B_A)) { console.log('  .. HUD 段内 (already)'); }
    else if (content.includes(B_B)) { content = content.replace(B_B, B_A); ixChanged++; console.log('  OK HUD 境界胶囊段内显示'); }
    else { console.error('  XX HUD 段内 anchor NOT FOUND'); totalFailed++; }

    if (ixChanged > 0 && !DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); checkSyntax(FILES.ix); console.log('  IX syntax OK'); }
    totalChanged += ixChanged;
}

console.log('');
console.log('total: changed=' + totalChanged + ', failed=' + totalFailed);
if (totalFailed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) console.log('[dry-run] not written');
else console.log('=== S1.3g DONE ===');
