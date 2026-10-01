#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RPG_UTILS = path.join(ROOT, 'core/rpgUtils.js');
const INDEX = path.join(ROOT, 'index.js');
const HM = path.join(ROOT, 'core/horaeManager.js');
const TEST = path.join(ROOT, 'tools/test-rpg-state.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const RPG_UTILS_CONTENT = `/**
 * Horae RpgUtils v0.1
 *
 * 职责：
 *   - RPG State 纯计算工具（无副作用，无 I/O）
 *   - 从 index.js 抽出，HUD 与 Prompt 共用同一套 phase 算法
 *
 * 边界：
 *   - 不写数据
 *   - 不改 StateStore 结构
 *   - 阶段规则与 index.js 原 _calcCultivationSegmentHud 逐字等价
 */

/**
 * 大境界修为基准（每个大境界的修为总上限）
 * 从 index.js 原 _HUD_REALM_BASE_CULTIVATION 逐字迁入，不改值
 */
export const REALM_BASE_CULTIVATION = {
    '炼气': 1000, '筑基': 2000, '结晶': 4000, '金丹': 8000, '具灵': 16000,
    '元婴': 32000, '化神': 64000, '悟道': 128000, '羽化': 256000, '登仙': 512000,
    '飞升': Infinity,
};

/**
 * 根据修为当前值与大境界名，计算当前小境界阶段
 *
 * 算法（与 index.js 原 _calcCultivationSegmentHud 逐字等价）：
 *   r = cur / max
 *   r < 0.15       -> 初期,  segCur = cur,                segMax = 0.15 * max
 *   r < 0.35       -> 中期,  segCur = cur - 0.15*max,     segMax = 0.20 * max
 *   r < 0.60       -> 后期,  segCur = cur - 0.35*max,     segMax = 0.25 * max
 *   else           -> 圆满,  segCur = cur - 0.60*max,     segMax = 0.40 * max
 *
 *   飞升 / Infinity:  { phase: null, segCur: cur, segMax: Infinity }
 *   登仙圆满:         { phase: '圆满', segCur: cur - 0.60*max, segMax: Infinity }
 *
 * 语义说明（重要）：
 *   - 入参 cur 是 StateStore 原始当前修为（例如 120）
 *   - max 是大境界总上限（例如 筑基 = 2000）
 *   - 返回的 segCur/segMax 代表「当前小境界阶段进度」（例如 120/300）
 *   - segMax 不等于 max：300 是「筑基·初期」阶段上限，2000 是筑基总上限
 *   - 调用方不应把 segMax 当成整个大境界上限
 *   - 本函数不写回 StateStore，[120,2000] 保持原始值
 *
 * @param {number} cur - 当前修为值（StateStore 原始值）
 * @param {string} realmName - 大境界名（筑基 / 金丹 / ...）
 * @returns {{phase: string|null, segCur: number, segMax: number}|null}
 *          null 表示 realmName 未知 / 不在基准表内
 */
export function calcCultivationSegment(cur, realmName) {
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
    if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };
    }
    const curClamped = Math.min(curSafe, max);
    return { phase: '圆满', segCur: Math.round(curClamped - 0.60 * max), segMax: Math.round(0.40 * max) };
}
`;

const INDEX_IMPORT_OLD = `import { renderIdentityAiSection } from './core/memory/identityView.js';`;
const INDEX_IMPORT_NEW = `import { renderIdentityAiSection } from './core/memory/identityView.js';
import { calcCultivationSegment } from './core/rpgUtils.js';`;

const INDEX_HUD_CONST_OLD = `const _HUD_REALM_BASE_CULTIVATION = {
    '炼气': 1000, '筑基': 2000, '结晶': 4000, '金丹': 8000, '具灵': 16000,
    '元婴': 32000, '化神': 64000, '悟道': 128000, '羽化': 256000, '登仙': 512000,
    '飞升': Infinity,
};

`;

const INDEX_HUD_FN_OLD = `function _calcCultivationSegmentHud(cur, realmName) {
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
}

`;

const HM_IMPORT_OLD = `import { getPromptDefaultSync } from './promptDefaults.js';`;
const HM_IMPORT_NEW = `import { getPromptDefaultSync } from './promptDefaults.js';
import { calcCultivationSegment } from './rpgUtils.js';`;

const HM_RPG_INSERT_OLD = `            // 神识段位显示（spirit.tier + spirit.xp）
            const spirit = rpg.spirit;
            if (spirit && (spirit.tier || typeof spirit.xp === 'number')) {
                if (!filterRpg || rpgAllowed.has(userName)) {
                    const tierLabel = L('神识', 'Spirit', '神识', '신식', 'Дух');
                    const xpLabel = L('累积', 'xp', '累積', '누적', 'накопл.');
                    const tierVal = spirit.tier || '—';
                    const xpVal = (typeof spirit.xp === 'number') ? spirit.xp : 0;
                    lines.push(\`\${_ctxPre(userName, _cUoB)}\${tierLabel}：\${tierVal} · \${xpLabel} \${xpVal}\`);
                }
            }

            if (sendSkills && Object.keys(rpg.skills).length > 0) {`;

const HM_RPG_INSERT_NEW = `            // 神识段位显示（spirit.tier + spirit.xp）
            const spirit = rpg.spirit;
            if (spirit && (spirit.tier || typeof spirit.xp === 'number')) {
                if (!filterRpg || rpgAllowed.has(userName)) {
                    const tierLabel = L('神识', 'Spirit', '神识', '신식', 'Дух');
                    const xpLabel = L('累积', 'xp', '累積', '누적', 'накопл.');
                    const tierVal = spirit.tier || '—';
                    const xpVal = (typeof spirit.xp === 'number') ? spirit.xp : 0;
                    lines.push(\`\${_ctxPre(userName, _cUoB)}\${tierLabel}：\${tierVal} · \${xpLabel} \${xpVal}\`);
                }
            }

            // 境界 / 修为 / 年龄 / 寿元（RPG 状态事实源）
            // 修为 segment 语义：cur/max 为「当前小境界阶段进度」，非大境界总上限
            // StateStore 原始 [cur, max] 保持不变，本段只读不写
            if (rpg.realm && typeof rpg.realm.name === 'string' && rpg.realm.name) {
                const _realmParts = [];
                const _realmName = rpg.realm.name;
                let _phase = null;
                let _segCur = null;
                let _segMax = null;
                if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
                    const _cur = rpg.cultivation[0];
                    const _seg = calcCultivationSegment(_cur, _realmName);
                    if (_seg) {
                        _phase = _seg.phase;
                        _segCur = _seg.segCur;
                        _segMax = _seg.segMax;
                    }
                }
                const _realmStr = _phase ? \`\${_realmName}·\${_phase}\` : _realmName;
                _realmParts.push(\`\${L('境界','Realm','境界','경지','Царство')} \${_realmStr}\`);
                if (_segCur != null && _segMax != null && _segMax !== Infinity) {
                    _realmParts.push(\`\${L('修为','Cultivation','修為','수련','Культив.')} \${_segCur}/\${_segMax}（\${L('当前阶段','current stage','現段階','현 단계','текущая стадия')}）\`);
                }
                if (typeof rpg.age === 'number' && typeof rpg.lifespan === 'number') {
                    _realmParts.push(\`\${L('年龄','Age','年齢','나이','Возраст')} \${rpg.age}/\${rpg.lifespan}\`);
                }
                if (_realmParts.length > 0 && (!filterRpg || rpgAllowed.has(userName))) {
                    lines.push(\`\${_ctxPre(userName, _cUoB)}\${_realmParts.join(' | ')}\`);
                }
            }

            // RPG 状态使用规则（结构化事实源约束）
            lines.push(\`\\n[\${L('RPG状态使用规则','RPG State Usage Rules','RPG状態使用ルール','RPG 상태 사용 규칙','Правила использования RPG-состояния')}]\`);
            lines.push(L(
                '以上为当前结构化 RPG 事实：描述角色的境界、修为、年龄、寿元、气血、灵力、神念、神识时以本段为准；不得使用其他上下文旧数值覆盖；小境界以本段系统阶段为准，不得自行重判；不得虚构、修改或补写本段未提供的 RPG 数值；未提供的派生值（如剩余寿元）不得自行计算后当作系统事实；不得生成与本段数据冲突的角色状态面板。',
                'The above is the current structured RPG facts: when describing a character realm, cultivation, age, lifespan, HP, MP, spirit, or spiritual sense, use this section as the source of truth; do not override with old values from other contexts; sub-stages use the system-provided stage, do not re-determine; do not fabricate, modify, or fill in RPG values not provided here; derived values not provided (e.g. remaining lifespan) must not be calculated and presented as system facts; do not generate a character status panel that conflicts with this section.',
                'The above is the current structured RPG facts. Use this section as the source of truth. Do not override with old values. Do not re-determine sub-stages. Do not fabricate RPG values not provided here.',
                'The above is the current structured RPG facts. Use this section as the source of truth.',
                'The above is the current structured RPG facts. Use this section as the source of truth.'
            ));

            if (sendSkills && Object.keys(rpg.skills).length > 0) {`;

const TEST_CONTENT = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcCultivationSegment, REALM_BASE_CULTIVATION } from '../core/rpgUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== P-RPG rpgUtils 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

console.log('--- Part 1 纯函数 ---');
check('筑基 = 2000', REALM_BASE_CULTIVATION['筑基'] === 2000);
check('飞升 = Infinity', REALM_BASE_CULTIVATION['飞升'] === Infinity);
check('炼气 = 1000', REALM_BASE_CULTIVATION['炼气'] === 1000);
check('null realm -> null', calcCultivationSegment(0, null) === null);
check('空 realm -> null', calcCultivationSegment(0, '') === null);
check('未知 realm -> null', calcCultivationSegment(0, '未知境界') === null);
{
    const s = calcCultivationSegment(0, '筑基');
    check('0 -> 初期', s.phase === '初期');
    check('0 segCur=0', s.segCur === 0);
    check('0 segMax=300', s.segMax === 300);
}
{
    const s = calcCultivationSegment(299, '筑基');
    check('299 -> 初期', s.phase === '初期');
    check('299 segCur=299', s.segCur === 299);
    check('299 segMax=300', s.segMax === 300);
}
{
    const s = calcCultivationSegment(300, '筑基');
    check('300 -> 中期', s.phase === '中期');
    check('300 segCur=0', s.segCur === 0);
    check('300 segMax=400', s.segMax === 400);
}
{
    const s = calcCultivationSegment(699, '筑基');
    check('699 -> 中期', s.phase === '中期');
    check('699 segCur=399', s.segCur === 399);
    check('699 segMax=400', s.segMax === 400);
}
{
    const s = calcCultivationSegment(700, '筑基');
    check('700 -> 后期', s.phase === '后期');
    check('700 segCur=0', s.segCur === 0);
    check('700 segMax=500', s.segMax === 500);
}
{
    const s = calcCultivationSegment(1199, '筑基');
    check('1199 -> 后期', s.phase === '后期');
    check('1199 segCur=499', s.segCur === 499);
    check('1199 segMax=500', s.segMax === 500);
}
{
    const s = calcCultivationSegment(1200, '筑基');
    check('1200 -> 圆满', s.phase === '圆满');
    check('1200 segCur=0', s.segCur === 0);
    check('1200 segMax=800', s.segMax === 800);
}
{
    const s = calcCultivationSegment(1999, '筑基');
    check('1999 -> 圆满', s.phase === '圆满');
    check('1999 segCur=799', s.segCur === 799);
    check('1999 segMax=800', s.segMax === 800);
}
{
    const s = calcCultivationSegment(2000, '筑基');
    check('2000 -> 圆满', s.phase === '圆满');
    check('2000 segCur=800', s.segCur === 800);
    check('2000 segMax=800', s.segMax === 800);
}
{
    const s = calcCultivationSegment(120, '筑基');
    check('HUD 等价 120 -> 初期', s.phase === '初期');
    check('HUD 等价 120 segCur=120', s.segCur === 120);
    check('HUD 等价 120 segMax=300', s.segMax === 300);
}
{
    const s = calcCultivationSegment(511000, '登仙');
    check('511000 登仙 -> 圆满', s.phase === '圆满');
    check('511000 登仙 segMax=Infinity', s.segMax === Infinity);
}
{
    const s = calcCultivationSegment(100, '登仙');
    check('100 登仙 -> 初期', s.phase === '初期');
    check('100 登仙 segMax=76800', s.segMax === 76800);
}
{
    const s = calcCultivationSegment(0, '飞升');
    check('0 飞升 phase=null', s.phase === null);
    check('0 飞升 segCur=0', s.segCur === 0);
    check('0 飞升 segMax=Infinity', s.segMax === Infinity);
}
{
    const s = calcCultivationSegment(-10, '筑基');
    check('-10 -> 初期（clamp）', s.phase === '初期');
    check('-10 segCur=0', s.segCur === 0);
}
{
    const s = calcCultivationSegment(150, '炼气');
    check('150/1000 炼气 -> 初期', s.phase === '初期');
    check('150 炼气 segMax=150', s.segMax === 150);
}
console.log('');

console.log('--- Part 2 horaeManager.js 结构断言 ---');
const hmSrc = read('core/horaeManager.js');
const indexSrc = read('index.js');

check('hm 顶部 import calcCultivationSegment', hmSrc.includes("import { calcCultivationSegment } from './rpgUtils.js'"));
check('hm 含 calcCultivationSegment(_cur, _realmName) 调用', hmSrc.includes('calcCultivationSegment(_cur, _realmName)'));
check('hm 含 _segMax !== Infinity 判断', hmSrc.includes('_segMax !== Infinity'));
check('hm 含 境界 标签', hmSrc.includes("L('境界','Realm'"));
check('hm 含 修为 标签', hmSrc.includes("L('修为','Cultivation'"));
check('hm 含 年龄 标签', hmSrc.includes("L('年龄','Age'"));
check('hm 含 age/lifespan 数值检查', hmSrc.includes("typeof rpg.age === 'number' && typeof rpg.lifespan === 'number'"));
check('hm 含 RPG状态使用规则 header', hmSrc.includes("L('RPG状态使用规则','RPG State Usage Rules'"));
check('hm 含 filterRpg 新行过滤', hmSrc.includes('(!filterRpg || rpgAllowed.has(userName))'));
check('hm 未写回 rpg.cultivation', !hmSrc.includes('rpg.cultivation ='));
check('hm 未新增 sendRpgRealm 开关', !hmSrc.includes('sendRpgRealm'));
check('hm 未新增 sendRpgCultivation 开关', !hmSrc.includes('sendRpgCultivation'));
check('hm 未新增 sendRpgAge 开关', !hmSrc.includes('sendRpgAge'));
check('hm 未含 _cUoB 恒真条件', !hmSrc.includes('(!_cUoB || userName === userName)'));
console.log('');

console.log('--- Part 3 rpgMode 块范围断言 ---');
const rpgModeIdx = hmSrc.indexOf('if (this.settings?.rpgMode) {');
const sendTimelineIdx = hmSrc.indexOf('if (sendTimeline) {', rpgModeIdx);
const realmLineIdx = hmSrc.indexOf("L('境界','Realm'");
const ageCheckIdx = hmSrc.indexOf("typeof rpg.age === 'number' && typeof rpg.lifespan === 'number'");
const ruleIdx = hmSrc.indexOf("L('RPG状态使用规则','RPG State Usage Rules'");

check('rpgMode 锚点存在', rpgModeIdx > -1);
check('rpgMode 后有 sendTimeline 锚点', sendTimelineIdx > rpgModeIdx);
check('境界代码位于 rpgMode 块内', realmLineIdx > rpgModeIdx && realmLineIdx < sendTimelineIdx);
check('年龄/寿元检查位于 rpgMode 块内', ageCheckIdx > rpgModeIdx && ageCheckIdx < sendTimelineIdx);
check('RPG 使用规则位于 rpgMode 块内', ruleIdx > rpgModeIdx && ruleIdx < sendTimelineIdx);
console.log('');

console.log('--- Part 4 index.js 结构断言 ---');
check('index 顶部 import calcCultivationSegment', indexSrc.includes("import { calcCultivationSegment } from './core/rpgUtils.js'"));
check('index 删除 _HUD_REALM_BASE_CULTIVATION 定义', !indexSrc.includes('const _HUD_REALM_BASE_CULTIVATION'));
check('index 删除 _calcCultivationSegmentHud 定义', !indexSrc.includes('function _calcCultivationSegmentHud'));
check('index 调用 calcCultivationSegment(_cur, _rn)', indexSrc.includes('calcCultivationSegment(_cur, _rn)'));
check('index 无 _calcCultivationSegmentHud 残留', !indexSrc.includes('_calcCultivationSegmentHud'));

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== RPG State Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [INDEX, HM]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
}

const indexSrc = fs.readFileSync(INDEX, 'utf8');
const hmSrc = fs.readFileSync(HM, 'utf8');

const checkPoints = [
    { id: 'index-import',    count: countOccurrences(indexSrc, INDEX_IMPORT_OLD),    expect: 1, desc: 'index.js import 锚点' },
    { id: 'index-hud-const', count: countOccurrences(indexSrc, INDEX_HUD_CONST_OLD), expect: 1, desc: 'index.js _HUD_REALM_BASE_CULTIVATION 定义' },
    { id: 'index-hud-fn',    count: countOccurrences(indexSrc, INDEX_HUD_FN_OLD),    expect: 1, desc: 'index.js _calcCultivationSegmentHud 函数体' },
    { id: 'hm-import',       count: countOccurrences(hmSrc, HM_IMPORT_OLD),          expect: 1, desc: 'horaeManager.js import 锚点' },
    { id: 'hm-rpg-insert',   count: countOccurrences(hmSrc, HM_RPG_INSERT_OLD),      expect: 1, desc: 'horaeManager.js RPG 段插入锚点' },
];

console.log('patch plan:');
let failed = null;
for (const p of checkPoints) {
    const ok = p.count === p.expect;
    console.log('  [' + (ok ? 'OK' : 'XX count=' + p.count).padEnd(14) + '] ' + p.id.padEnd(16) + ' ' + p.desc);
    if (!ok && !failed) failed = p;
}

console.log('');
const callMatches = [];
let _i = 0;
while (true) {
    const j = indexSrc.indexOf('_calcCultivationSegmentHud', _i);
    if (j === -1) break;
    const lineNo = indexSrc.slice(0, j).split('\n').length;
    const lineEnd = indexSrc.indexOf('\n', j);
    const line = indexSrc.slice(j, lineEnd === -1 ? j + 120 : lineEnd);
    callMatches.push({ lineNo, line: line.trim() });
    _i = j + 1;
}
console.log('  原文件 _calcCultivationSegmentHud 出现次数:', callMatches.length, '(期望 2: 1定义+1调用)');
for (const m of callMatches) {
    console.log('    L' + m.lineNo + ': ' + m.line.slice(0, 100));
}
console.log('');

if (failed) {
    console.error('XX anchor check failed: ' + failed.id + ' (count=' + failed.count + ', expect=' + failed.expect + ')');
    console.error('   aborting. no files written.');
    process.exit(1);
}

const nextIndex0 = indexSrc
    .replace(INDEX_IMPORT_OLD, INDEX_IMPORT_NEW)
    .replace(INDEX_HUD_CONST_OLD, '')
    .replace(INDEX_HUD_FN_OLD, '');
const nextIndex = nextIndex0.replace(/_calcCultivationSegmentHud\(/g, 'calcCultivationSegment(');
const nextHm = hmSrc
    .replace(HM_IMPORT_OLD, HM_IMPORT_NEW)
    .replace(HM_RPG_INSERT_OLD, HM_RPG_INSERT_NEW);

const nextIndexHudResidual = countOccurrences(nextIndex, '_calcCultivationSegmentHud');
const nextIndexNewCall = countOccurrences(nextIndex, 'calcCultivationSegment(');
const nextHmHasCall = nextHm.includes('calcCultivationSegment(_cur, _realmName)');

console.log('post-check:');
console.log('  nextIndex 残留 _calcCultivationSegmentHud:', nextIndexHudResidual, '(期望 0)');
console.log('  nextIndex calcCultivationSegment( 调用:', nextIndexNewCall, '(期望 >= 1)');
console.log('  nextHm 含 calcCultivationSegment(_cur, _realmName):', nextHmHasCall, '(期望 true)');
console.log('');

if (nextIndexHudResidual !== 0) {
    console.error('XX nextIndex 仍有 _calcCultivationSegmentHud 残留');
    process.exit(1);
}
if (nextIndexNewCall < 1) {
    console.error('XX nextIndex 未找到 calcCultivationSegment( 调用');
    process.exit(1);
}
if (!nextHmHasCall) {
    console.error('XX nextHm 缺少 calcCultivationSegment(_cur, _realmName) 调用');
    process.exit(1);
}

console.log('files:');
console.log('  ' + RPG_UTILS + '  (new, ' + RPG_UTILS_CONTENT.length + ' bytes)');
console.log('  ' + INDEX + '  delta=' + (nextIndex.length - indexSrc.length) + ' bytes');
console.log('  ' + HM + '  delta=' + (nextHm.length - hmSrc.length) + ' bytes');
console.log('  ' + TEST + '  (new, ' + TEST_CONTENT.length + ' bytes)');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(RPG_UTILS, RPG_UTILS_CONTENT, 'utf8');
console.log('[write] ' + RPG_UTILS);
fs.writeFileSync(INDEX, nextIndex, 'utf8');
console.log('[write] ' + INDEX);
fs.writeFileSync(HM, nextHm, 'utf8');
console.log('[write] ' + HM);
fs.writeFileSync(TEST, TEST_CONTENT, 'utf8');
console.log('[write] ' + TEST);
console.log('');
console.log('done.');
