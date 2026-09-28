#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.js');
const BACKUP = FILE + '.bak-before-s13k';
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
    if (occ > 1) { console.error('  XX ' + name + ' anchor found ' + occ + ' times'); return -1; }
    content = content.replace(before, after);
    console.log('  OK ' + name);
    return 1;
}

console.log('=== S1.3k: RPG 卡片 header 加胶囊 + 总览 tab 删胶囊 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

// ─── Part 1: 卡片 header 加胶囊（char-name 之后）───
{
    const before = `                barsHtml += '<div class="horae-rpg-bar-card-header">';
                barsHtml += \`<span class="horae-rpg-char-name">\${escapeHtml(name)}</span>\`;
                for (const e of effects) {`;
    const after = `                barsHtml += '<div class="horae-rpg-bar-card-header">';
                barsHtml += \`<span class="horae-rpg-char-name">\${escapeHtml(name)}</span>\`;
                barsHtml += _buildCapsulesHtml(rpg);
                for (const e of effects) {`;
    const r = applyReplace('P1 卡片 header 加胶囊', before, after, `barsHtml += _buildCapsulesHtml(rpg);`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ─── Part 2: 总览 tab 删胶囊块 ───
{
    const before = `        // ── 胶囊行（与 HUD 共用 _buildCapsulesHtml）──
        {
            const _capsHtml = _buildCapsulesHtml(rpg);
            if (_capsHtml) {
                html += '<div class="horae-rpg-overview-capsules">' + _capsHtml + '</div>';
            }
        }

`;
    const after = '';
    const r = applyReplace('P2 总览 tab 删胶囊', before, after, `// ── 胶囊行已删除（移到卡片 header）`);
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