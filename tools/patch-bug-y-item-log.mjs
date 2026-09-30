#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'core/horaeManager.js');
const SUFFIX = '.bak-before-bug-y';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    const b = F + SUFFIX;
    if (fs.existsSync(b)) { fs.copyFileSync(b, F); fs.unlinkSync(b); console.log('restored'); }
    else console.log('no backup');
    process.exit(0);
}

console.log('=== Bug Y: getLatestState 中 2 条 console.log 移除 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

let content = raw;
let failed = 0;
let changed = 0;

function deleteLine(name, target, appliedCheck) {
    // 幂等：目标不存在，且 appliedCheck 也不存在 → 已删除
    if (!content.includes(target) && appliedCheck && !content.includes(appliedCheck)) {
        console.log('  .. ' + name + ' (already removed)');
        return;
    }
    const occ = content.split(target).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); failed++; return; }
    if (occ !== 1) { console.error('  XX ' + name + ' occ=' + occ + ' expect=1'); failed++; return; }
    console.log('  OK ' + name);
    content = content.replace(target, '');
    changed++;
}

// 第 1 处：物品数量归零
deleteLine(
    'Y-P1 删"物品数量归零自动删除" console.log',
    '                                console.log(`[Horae] 物品数量归零自动删除: ${itemName}`);\n',
    '物品数量归零自动删除'
);

// 第 2 处：物品已消耗
deleteLine(
    'Y-P2 删"物品已消耗自动删除" console.log',
    '                                console.log(`[Horae] 物品已消耗自动删除: ${itemName}`);\n',
    '物品已消耗自动删除'
);

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, ' + changed + ' 处待删除.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('APPLIED: ' + path.basename(F) + ' (' + changed + ' 行删除)');
console.log('done.');
