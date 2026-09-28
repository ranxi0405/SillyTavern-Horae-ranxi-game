#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.js');
const BACKUP = FILE + '.bak-before-s13i';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, FILE); fs.unlinkSync(BACKUP);
    console.log('rolled back'); process.exit(0);
}

console.log('=== S1.3i 六艺显示上限 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const raw = fs.readFileSync(FILE, 'utf8');
const isCRLF = raw.includes('\r\n');
let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;
let changed = 0, failed = 0;

function apply(name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return 0; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return -1; }
    if (occ > 1) { console.error('  XX ' + name + ' anchor found ' + occ + ' times'); return -1; }
    content = content.replace(before, after);
    console.log('  OK ' + name);
    return 1;
}

// Patch 1: 加六艺品阶区间常量（插在 _buildArtsHtml 之前）
{
    const before = `    function _buildArtsHtml(name, rpg) {`;
    const after = `    const _ART_GRADE_RANGES = [
        { min: 0, max: 19 },
        { min: 20, max: 99 },
        { min: 100, max: 499 },
        { min: 500, max: 2999 },
        { min: 3000, max: 7999 },
        { min: 8000, max: 29999 },
        { min: 30000, max: Infinity },
    ];
    function _buildArtsHtml(name, rpg) {`;
    const r = apply('P1 六艺区间常量', before, after, '_ART_GRADE_RANGES');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 2: _renderVal 改显示段内
{
    const before = `        const _renderVal = (data) => {
            if (!data) return untrained;
            const parts = [];
            if (data.tier) parts.push(data.tier);
            if (typeof data.xp === 'number') parts.push(\`\${xpLabel} \${data.xp}\`);
            return parts.length > 0 ? parts.join(' · ') : untrained;
        };`;
    const after = `        const _renderVal = (data) => {
            if (!data) return untrained;
            const parts = [];
            if (data.tier) parts.push(data.tier);
            if (typeof data.xp === 'number') {
                let seg = null;
                for (let gi = 0; gi < _ART_GRADE_RANGES.length; gi++) {
                    const g = _ART_GRADE_RANGES[gi];
                    if (data.xp >= g.min && data.xp <= g.max) { seg = g; break; }
                }
                if (seg && seg.max === Infinity) {
                    parts.push('（' + data.xp + '+）');
                } else if (seg) {
                    parts.push('（' + data.xp + '/' + seg.max + '）');
                } else {
                    parts.push(\`\${xpLabel} \${data.xp}\`);
                }
            }
            return parts.length > 0 ? parts.join('') : untrained;
        };`;
    const r = apply('P2 六艺段内显示', before, after, '（\' + data.xp + \'/\' + seg.max + \'）');
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
