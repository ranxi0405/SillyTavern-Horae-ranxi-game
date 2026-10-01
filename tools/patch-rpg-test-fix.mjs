#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'tools/test-rpg-state.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// 修正 1：断言只扫新增段（原断言扫全文件命中原有 Parser 2977/2988 行，误报）
const FIX1_OLD = `check('hm 未写回 rpg.cultivation', !hmSrc.includes('rpg.cultivation ='));`;
const FIX1_NEW = `// 只检查新增段（境界/修为/年龄/寿元）内不写回 rpg.cultivation
// horaeManager.js 原有 RPG Parser 有 rpg.cultivation = [cur, null/max]（历史逻辑），
// 全文件扫描会误报，故只截取新增段判断
{
    const _segStart = hmSrc.indexOf('// 境界 / 修为 / 年龄 / 寿元（RPG 状态事实源）');
    const _segEnd = hmSrc.indexOf('// RPG 状态使用规则', _segStart);
    const _segSlice = (_segStart >= 0 && _segEnd > _segStart) ? hmSrc.slice(_segStart, _segEnd) : '';
    check('hm 新增段截取非空', _segSlice.length > 0);
    check('hm 新增段未写回 rpg.cultivation', !_segSlice.includes('rpg.cultivation ='));
}`;

// 修正 2：150/1000 = 0.15 边界落入中期（算法 r<0.15 是严格小于）
const FIX2_OLD = `{
    const s = calcCultivationSegment(150, '炼气');
    check('150/1000 炼气 -> 初期', s.phase === '初期');
    check('150 炼气 segMax=150', s.segMax === 150);
}`;
const FIX2_NEW = `{
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
}`;

const PATCHES = [
    { id: 'fix1', desc: '修正 hm 未写回断言（只扫新增段）', match: FIX1_OLD, replace: FIX1_NEW },
    { id: 'fix2', desc: '修正 150/1000 边界期望为中期 + 补 149 对比', match: FIX2_OLD, replace: FIX2_NEW },
];

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== RPG Test Fix ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }
const src = fs.readFileSync(TARGET, 'utf8');
const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(src, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(6) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
console.log('target : ' + TARGET);
console.log('  delta: ' + (next.length - src.length) + ' bytes');
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
