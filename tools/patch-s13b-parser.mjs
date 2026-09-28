#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s13b';

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

console.log('=== S1.3b Parser + Prompt ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('file: ' + FILE);
let changed = 0, failed = 0;

{
    const before = `        const spiritNote = isZh
            ? '\\n\\n【神识数据——仅变化时输出】\\nspirit:tier=段位名（蒙昧/清明/凝照/洞玄/明心/太虚）\\nspirit:xp=累计总值（不是增量）\\n仅当本回合剧情明确导致神识段位或累计值发生变化时输出对应行。\\n没有变化时不要输出 spirit 行。\\n神识段位没有定义自动晋升阈值，不要自行计算或晋升。'
            : '\\n\\n[Spirit Data — output only on change]\\nspirit:tier=tier name\\nspirit:xp=cumulative total (not delta)\\nOutput only when this turn changes spirit tier or xp.\\nDo NOT output spirit lines when nothing changes.\\nNo auto-promotion thresholds; do NOT compute or promote tiers yourself.';`;
    const after = `        const spiritNote = isZh
            ? '\\n\\n【神识数据——仅变化时输出】\\nspirit:tier=段位名（蒙昧/清明/凝照/洞玄/明心/太虚）\\nspirit:xp=当前段位内的累计值（不是终身累计，不是增量）\\n段内阈值：蒙昧1000 / 清明3000 / 凝照6000 / 洞玄10000 / 明心15000 / 太虚无上限\\n晋升规则：当前段位 xp 达到阈值后，可声明 spirit:tier=下一段位。只能相邻 +1 晋升。\\n仅当本回合剧情明确导致神识段位或段内值发生变化时输出对应行。\\n没有变化时不要输出 spirit 行。'
            : '\\n\\n[Spirit Data — output only on change]\\nspirit:tier=tier name (蒙昧/清明/凝照/洞玄/明心/太虚)\\nspirit:xp=current tier cumulative (not lifetime total, not delta)\\nTier thresholds: 蒙昧1000 / 清明3000 / 凝照6000 / 洞玄10000 / 明心15000 / 太虚 no cap\\nPromotion: when current tier xp reaches threshold, declare spirit:tier=next tier. Only adjacent +1 promotion allowed.\\nOutput only when this turn changes spirit tier or tier-internal xp.\\nDo NOT output spirit lines when nothing changes.';

        const bonusNote = isZh
            ? '\\n\\n【永久上限加成——仅突破反哺/永久丹药/传承/宝物等永久效果时输出】\\nbonus:hp:归属=+N\\nbonus:mp:归属=+N\\nbonus:sp:归属=+N\\n只允许正向加成，永久生效。普通临时 buff 不要写这里。\\n没有永久加成时不要输出 bonus 行。'
            : '\\n\\n[Permanent Cap Bonus — only on breakthrough feedback / permanent pill / inheritance / treasure]\\nbonus:hp:owner=+N\\nbonus:mp:owner=+N\\nbonus:sp:owner=+N\\nPositive only, permanent. Do NOT write temporary buffs here.\\nDo NOT output bonus lines when nothing permanent changes.';`;
    const r = apply('spiritNote+bonusNote', before, after, `const bonusNote = isZh`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        return '\\n' + base + spiritNote + craftNote + shenTongNote + skillCategoryNote + realmNote;`;
    const after = `        return '\\n' + base + spiritNote + bonusNote + craftNote + shenTongNote + skillCategoryNote + realmNote;`;
    const r = apply('return+bonusNote', before, after, `spiritNote + bonusNote + craftNote`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        const barNormal = line.match(/^([a-zA-Z]\\w*):(.+?)=(\\d+)\\s*\\/\\s*(\\d+)(?:\\((.+?)\\))?$/i);
        const barUo = _uoB ? line.match(/^([a-zA-Z]\\w*):(\\d+)\\s*\\/\\s*(\\d+)(?:\\((.+?)\\))?$/i) : null;`;
    const after = `        const barNormal = line.match(/^([a-zA-Z]\\w*):(.+?)=(\\d+)\\s*\\/\\s*(\\d+)(?:\\((.+?)\\))?$/i);
        const barUo = _uoB ? line.match(/^([a-zA-Z]\\w*):(\\d+)\\s*\\/\\s*(\\d+)(?:\\((.+?)\\))?$/i) : null;
        const barShort = line.match(/^([a-zA-Z]\\w*):(.+?)=(\\d+)(?:\\((.+?)\\))?$/i);
        const barShortUo = _uoB ? line.match(/^([a-zA-Z]\\w*):(\\d+)(?:\\((.+?)\\))?$/i) : null;`;
    const r = apply('barShort regex decl', before, after, `const barShort = line.match`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        if (barUo && !/^(status|skill)$/i.test(barUo[1])) {
            const type = barUo[1].toLowerCase();
            const current = parseInt(barUo[2]);
            let max = parseInt(barUo[3]);
            if (current > max) max = current;
            const label = barUo[4]?.trim() || null;
            if (!rpg.bars[_uoName]) rpg.bars[_uoName] = {};
            rpg.bars[_uoName][type] = label ? [current, max, label] : [current, max];
            return;
        }`;
    const after = `        if (barUo && !/^(status|skill)$/i.test(barUo[1])) {
            const type = barUo[1].toLowerCase();
            const current = parseInt(barUo[2]);
            const max = parseInt(barUo[3]);
            const label = barUo[4]?.trim() || null;
            if (!rpg.bars[_uoName]) rpg.bars[_uoName] = {};
            rpg.bars[_uoName][type] = label ? [current, max, label] : [current, max];
            return;
        }
        if (barShort && !/^(status|skill)$/i.test(barShort[1])) {
            const type = barShort[1].toLowerCase();
            const owner = _uoB ? _uoName : barShort[2].trim();
            const current = parseInt(barShort[3]);
            const label = barShort[4]?.trim() || null;
            if (!rpg.bars[owner]) rpg.bars[owner] = {};
            rpg.bars[owner][type] = label ? [current, null, label] : [current, null];
            return;
        }
        if (barShortUo && !/^(status|skill)$/i.test(barShortUo[1])) {
            const type = barShortUo[1].toLowerCase();
            const current = parseInt(barShortUo[2]);
            const label = barShortUo[3]?.trim() || null;
            if (!rpg.bars[_uoName]) rpg.bars[_uoName] = {};
            rpg.bars[_uoName][type] = label ? [current, null, label] : [current, null];
            return;
        }`;
    const r = apply('barShort handlers', before, after, `if (barShortUo && !/^(status|skill)$/i.test(barShortUo[1]))`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const anchor = `        // realm:大境界名（炼气/筑基/.../登仙/飞升）`;
    if (content.includes(anchor) && !content.includes(`if (line.startsWith('bonus:'))`)) {
        const insert = `        // bonus:永久上限加成（bonus:hp:owner=+50 或 userOnly bonus:hp=+50）
        if (line.startsWith('bonus:')) {
            const m = line.match(/^bonus:([a-z]+):(.+?)=\\+(\\d+)$/i);
            const mUo = _uoB ? line.match(/^bonus:([a-z]+)=\\+(\\d+)$/i) : null;
            const type = m ? m[1].toLowerCase() : (mUo ? mUo[1].toLowerCase() : null);
            const owner = m ? m[2].trim() : (_uoB ? _uoName : null);
            const delta = m ? parseInt(m[3]) : (mUo ? parseInt(mUo[2]) : null);
            if (type && owner && delta != null && (type === 'hp' || type === 'mp' || type === 'sp')) {
                if (!rpg.barBonusChanges) rpg.barBonusChanges = [];
                rpg.barBonusChanges.push({ owner, type, delta });
            } else {
                console.warn('[Horae][bonus] 非法行，忽略:', line);
            }
            return;
        }
`;
        const idx = content.indexOf(anchor);
        content = content.substring(0, idx) + insert + content.substring(idx);
        console.log('  OK bonusParserBranch');
        changed++;
    } else if (content.includes(`if (line.startsWith('bonus:'))`)) {
        console.log('  .. bonusParserBranch (already)');
    } else {
        console.error('  XX bonusParserBranch anchor NOT FOUND');
        failed++;
    }
}

{
    const before = `                || (r.spirit && (r.spirit.tier || typeof r.spirit.xp === 'number'))
                || (r.realm && (r.realm.name || r.realm.phase))`;
    const after = `                || (r.spirit && (r.spirit.tier || typeof r.spirit.xp === 'number'))
                || (r.barBonusChanges || []).length > 0
                || (r.realm && (r.realm.name || r.realm.phase))`;
    const r = apply('hasContent+bonus', before, after, `|| (r.barBonusChanges || []).length > 0`);
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('changed: ' + changed + ', failed: ' + failed);

if (failed > 0) { console.error('some patches not found, abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up: ' + path.basename(BACKUP)); }

const out = isCRLF ? content.replace(/\n/g, '\r\n') : content;
fs.writeFileSync(FILE, out, 'utf8');
console.log('written ' + path.basename(FILE));

const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) { console.error('syntax error:\n' + r.stderr); process.exit(2); }
console.log('syntax OK');
