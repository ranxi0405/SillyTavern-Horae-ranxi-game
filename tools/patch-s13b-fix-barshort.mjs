#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s13b-fix';

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

console.log('=== S1.3b-fix: barShort 排除保留关键字 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
let changed = 0, failed = 0;

{
    const anchor = `        // 通用：检测行是否为无owner的userOnly格式（首段含=即正常格式，否则可能是UO格式）`;
    if (content.includes(anchor) && !content.includes('_NON_BAR_PREFIX')) {
        const insert = `        // 非 bar 协议行的保留关键字（spirit / currency / realm / craft 等有独立 Parser 分支）
        const _NON_BAR_PREFIX = /^(status|skill|spirit|realm|realm_phase|cultivation|age|lifespan|craft|shentong|currency|base|npc|item|affection|mood|agenda|costume|event|time|location|atmosphere|scene_desc|characters|attr)$/i;

`;
        const idx = content.indexOf(anchor);
        content = content.substring(0, idx) + insert + content.substring(idx);
        console.log('  OK _NON_BAR_PREFIX 常量');
        changed++;
    } else if (content.includes('_NON_BAR_PREFIX')) {
        console.log('  .. _NON_BAR_PREFIX (already)');
    } else {
        console.error('  XX _NON_BAR_PREFIX anchor NOT FOUND');
        failed++;
    }
}

{
    const before = `        if (barNormal && !/^(status|skill)$/i.test(barNormal[1])) {`;
    const after  = `        if (barNormal && !_NON_BAR_PREFIX.test(barNormal[1])) {`;
    const r = apply('barNormal 排除', before, after, `if (barNormal && !_NON_BAR_PREFIX.test(barNormal[1]))`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        if (barShort && !/^(status|skill)$/i.test(barShort[1])) {`;
    const after  = `        if (barShort && !_NON_BAR_PREFIX.test(barShort[1])) {`;
    const r = apply('barShort 排除', before, after, `if (barShort && !_NON_BAR_PREFIX.test(barShort[1]))`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        if (barUo && !/^(status|skill)$/i.test(barUo[1])) {`;
    const after  = `        if (barUo && !_NON_BAR_PREFIX.test(barUo[1])) {`;
    const r = apply('barUo 排除', before, after, `if (barUo && !_NON_BAR_PREFIX.test(barUo[1]))`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        if (barShortUo && !/^(status|skill)$/i.test(barShortUo[1])) {`;
    const after  = `        if (barShortUo && !_NON_BAR_PREFIX.test(barShortUo[1])) {`;
    const r = apply('barShortUo 排除', before, after, `if (barShortUo && !_NON_BAR_PREFIX.test(barShortUo[1]))`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('changed: ' + changed + ', failed: ' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up'); }

const out = isCRLF ? content.replace(/\n/g, '\r\n') : content;
fs.writeFileSync(FILE, out, 'utf8');
console.log('written ' + path.basename(FILE));

const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) { console.error('syntax error:\n' + r.stderr); process.exit(2); }
console.log('syntax OK');