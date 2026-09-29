#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    hm: path.join(ROOT, 'core/horaeManager.js'),
    ix: path.join(ROOT, 'index.js'),
};
const SUFFIX = '.bak-before-b3c2c';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.basename(f)); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== B3c-2c: skill 里混入六艺修复（L1 parser + L2 render） ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }
function applyPatch(content, name, before, after, appliedCheck, expectedOcc = 1) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' expected ' + expectedOcc + ', got ' + occ); return { content, status: -1 }; }
    console.log('  OK ' + name + ' (' + occ + ' 处)');
    return { content: content.split(before).join(after), status: 1 };
}

let failed = 0;

// ══════════════════════════════════════════
// horaeManager.js — L1
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;
    let fileChanged = false;

    // P1: 定义 _CRAFT_NAMES + _isCraftName
    {
        const before = `            const VALID_CATEGORIES = ['main', 'attack', 'movement', 'body', 'spirit', 'secret', 'other'];
            const normCategory = (c) => (c && VALID_CATEGORIES.includes(c)) ? c : 'other';
            const _isCraftCat = (c) => (c === 'craft' || c === '六艺' || c === '六藝');
            const _extractCraftXp = (desc) => {`;
        const after = `            const VALID_CATEGORIES = ['main', 'attack', 'movement', 'body', 'spirit', 'secret', 'other'];
            const normCategory = (c) => (c && VALID_CATEGORIES.includes(c)) ? c : 'other';
            const _isCraftCat = (c) => (c === 'craft' || c === '六艺' || c === '六藝');
            const _CRAFT_NAMES = new Set(['炼丹', '炼器', '符箓', '阵法', '御兽', '灵植']);
            const _isCraftName = (n) => _CRAFT_NAMES.has(n);
            const _extractCraftXp = (desc) => {`;
        const appliedCheck = `const _CRAFT_NAMES = new Set(['炼丹', '炼器', '符箓', '阵法', '御兽', '灵植']);`;
        const r = applyPatch(content, 'B3c2c-P1 _CRAFT_NAMES 定义', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; fileChanged = true; } else if (r.status === -1) failed++;
    }

    // P2: owner-first 分支加 _isCraftName 检查（锚点带 else if 后缀）
    {
        const before = `                const sk = { owner, name, level: tier, desc: descRaw };
                if (catRaw) sk.category = normCategory(catRaw);
                rpg.skills.push(sk);
            } else if (parts.length >= 2) {`;
        const after = `                if (_isCraftName(name)) {
                    if (owner && name && tier) {
                        if (!rpg.arts) rpg.arts = [];
                        const art = { owner, name, tier };
                        const xp = _extractCraftXp(descRaw);
                        if (xp != null) art.xp = xp;
                        rpg.arts.push(art);
                    }
                    return;
                }
                const sk = { owner, name, level: tier, desc: descRaw };
                if (catRaw) sk.category = normCategory(catRaw);
                rpg.skills.push(sk);
            } else if (parts.length >= 2) {`;
        const appliedCheck = `                if (_isCraftName(name)) {\n                    if (owner && name && tier) {\n                        if (!rpg.arts) rpg.arts = [];\n                        const art = { owner, name, tier };\n                        const xp = _extractCraftXp(descRaw);\n                        if (xp != null) art.xp = xp;\n                        rpg.arts.push(art);\n                    }\n                    return;\n                }\n                const sk = { owner, name, level: tier, desc: descRaw };\n                if (catRaw) sk.category = normCategory(catRaw);\n                rpg.skills.push(sk);\n            } else if (parts.length >= 2) {`;
        const r = applyPatch(content, 'B3c2c-P2 owner-first 分支', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; fileChanged = true; } else if (r.status === -1) failed++;
    }

    // P3: parts-first 分支加 _isCraftName 检查
    {
        const before = `                const sk = { owner, name, level: tier, desc: descRaw };
                if (catRaw) sk.category = normCategory(catRaw);
                rpg.skills.push(sk);
            }
            return;
        }
        // skill-`;
        const after = `                if (_isCraftName(name)) {
                    if (owner && name && tier) {
                        if (!rpg.arts) rpg.arts = [];
                        const art = { owner, name, tier };
                        const xp = _extractCraftXp(descRaw);
                        if (xp != null) art.xp = xp;
                        rpg.arts.push(art);
                    }
                    return;
                }
                const sk = { owner, name, level: tier, desc: descRaw };
                if (catRaw) sk.category = normCategory(catRaw);
                rpg.skills.push(sk);
            }
            return;
        }
        // skill-`;
        const appliedCheck = `                if (_isCraftName(name)) {\n                    if (owner && name && tier) {\n                        if (!rpg.arts) rpg.arts = [];\n                        const art = { owner, name, tier };\n                        const xp = _extractCraftXp(descRaw);\n                        if (xp != null) art.xp = xp;\n                        rpg.arts.push(art);\n                    }\n                    return;\n                }\n                const sk = { owner, name, level: tier, desc: descRaw };\n                if (catRaw) sk.category = normCategory(catRaw);\n                rpg.skills.push(sk);\n            }\n            return;\n        }\n        // skill-`;
        const r = applyPatch(content, 'B3c2c-P3 parts-first 分支', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; fileChanged = true; } else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0 && fileChanged) {
        backup(FILES.hm);
        writeNorm(FILES.hm, content, isCRLF);
        console.log('  APPLIED: horaeManager.js');
    }
}

// ══════════════════════════════════════════
// index.js — L2
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    {
        const before = `    function _groupSkillsByCategory(skills) {
        const valid = ['main', 'attack', 'movement', 'body', 'spirit', 'secret', 'other'];
        const groups = { main: [], attack: [], movement: [], body: [], spirit: [], secret: [], other: [] };
        for (const sk of (skills || [])) {
            const cat = (sk.category && valid.includes(sk.category)) ? sk.category : 'other';
            groups[cat].push(sk);
        }
        return groups;
    }`;
        const after = `    function _groupSkillsByCategory(skills) {
        const valid = ['main', 'attack', 'movement', 'body', 'spirit', 'secret', 'other'];
        const groups = { main: [], attack: [], movement: [], body: [], spirit: [], secret: [], other: [] };
        const _CRAFT_NAMES_LOCAL = new Set(['炼丹', '炼器', '符箓', '阵法', '御兽', '灵植']);
        for (const sk of (skills || [])) {
            if (_CRAFT_NAMES_LOCAL.has(sk.name)) continue;
            const cat = (sk.category && valid.includes(sk.category)) ? sk.category : 'other';
            groups[cat].push(sk);
        }
        return groups;
    }`;
        const appliedCheck = `        const _CRAFT_NAMES_LOCAL = new Set(['炼丹', '炼器', '符箓', '阵法', '御兽', '灵植']);`;
        const r = applyPatch(content, 'B3c2c-P4 _groupSkillsByCategory 过滤', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; if (!DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js'); } } else if (r.status === -1) failed++;
    }
}

console.log('');
if (DRY_RUN) {
    console.log('DRY-RUN done, nothing written.');
} else if (failed > 0) {
    console.error('APPLY ABORTED: ' + failed + ' 处失败');
    process.exit(1);
} else {
    console.log('ALL APPLIED.');
}
console.log('done.');
