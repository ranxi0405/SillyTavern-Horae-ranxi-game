#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s14b';
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
let changed = 0, failed = 0;

function applyReplace(name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return 0; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return -1; }
    if (occ > 1) { console.error('  XX ' + name + ' (' + occ + ' matches)'); return -1; }
    content = content.replace(before, after);
    console.log('  OK ' + name);
    return 1;
}

console.log('=== S1.4b: section headings bars 清理 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

{
    const before = `            bars: '【属性条——每回合必写，缺少=不合格！】',`;
    const after  = `            bars: '【属性条——仅变化时写】',`;
    const r = applyReplace('zh heading', before, after, `bars: '【属性条——仅变化时写】'`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `                bars: '[Status Bars — required every turn, missing = fail!]',`;
    const after  = `                bars: '[Status Bars — write only on change]',`;
    const r = applyReplace('en heading', before, after, `bars: '[Status Bars — write only on change]'`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `                bars: '【ステータスバー——毎ターン必須、欠落＝不合格！】',`;
    const after  = `                bars: '【ステータスバー——変化時のみ記載】',`;
    const r = applyReplace('ja heading', before, after, `bars: '【ステータスバー——変化時のみ記載】'`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `                bars: '【스테이터스 바 — 매 턴 필수, 누락 = 불합격!】',`;
    const after  = `                bars: '【스테이터스 바 — 변화 시에만 기재】',`;
    const r = applyReplace('ko heading', before, after, `bars: '【스테이터스 바 — 변화 시에만 기재】'`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `                bars: '[Шкалы статуса — обязательны каждый ход, пропуск = провал!]',`;
    const after  = `                bars: '[Шкалы статуса — только при изменении]',`;
    const r = applyReplace('ru heading', before, after, `bars: '[Шкалы статуса — только при изменении]'`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('');
console.log('changed: ' + changed + ', failed: ' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up'); }

fs.writeFileSync(FILE, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('written ' + path.basename(FILE));

const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) { console.error('syntax error:\n' + r.stderr); process.exit(2); }
console.log('syntax OK');