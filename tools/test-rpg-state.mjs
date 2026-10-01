import fs from 'node:fs';
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
    // r = 150/1000 = 0.15，落入 [0.15, 0.35) => 中期（r<0.15 是严格小于）
    const s = calcCultivationSegment(150, '炼气');
    check('150/1000 炼气 -> 中期（r=0.15 边界）', s.phase === '中期');
    check('150 炼气 segCur=0', s.segCur === 0);
    check('150 炼气 segMax=200', s.segMax === 200);
}
{
    // 对比：149/1000 < 0.15 => 初期
    const s = calcCultivationSegment(149, '炼气');
    check('149/1000 炼气 -> 初期（r<0.15）', s.phase === '初期');
    check('149 炼气 segCur=149', s.segCur === 149);
    check('149 炼气 segMax=150', s.segMax === 150);
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
// 只检查新增段（境界/修为/年龄/寿元）内不写回 rpg.cultivation
// horaeManager.js 原有 RPG Parser 有 rpg.cultivation = [cur, null/max]（历史逻辑），
// 全文件扫描会误报，故只截取新增段判断
{
    const _segStart = hmSrc.indexOf('// 境界 / 修为 / 年龄 / 寿元（RPG 状态事实源）');
    const _segEnd = hmSrc.indexOf('// RPG 状态使用规则', _segStart);
    const _segSlice = (_segStart >= 0 && _segEnd > _segStart) ? hmSrc.slice(_segStart, _segEnd) : '';
    check('hm 新增段截取非空', _segSlice.length > 0);
    check('hm 新增段未写回 rpg.cultivation', !_segSlice.includes('rpg.cultivation ='));
}
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
