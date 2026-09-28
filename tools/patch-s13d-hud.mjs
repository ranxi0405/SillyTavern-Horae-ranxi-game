#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '.bak-before-s13d';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

const ALL_FILES = [
    path.join(ROOT, 'index.js'),
    path.join(ROOT, 'assets/styles/style.css'),
    path.join(ROOT, 'locales/zh-CN.json'),
    path.join(ROOT, 'locales/zh-TW.json'),
    path.join(ROOT, 'locales/en.json'),
    path.join(ROOT, 'locales/ja.json'),
    path.join(ROOT, 'locales/ko.json'),
    path.join(ROOT, 'locales/ru.json'),
];

if (ROLLBACK) {
    let n = 0;
    for (const f of ALL_FILES) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.relative(ROOT, f)); }
    }
    console.log('rolled back ' + n + ' files');
    process.exit(0);
}

console.log('=== S1.3d HUD + i18n ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

let changed = 0, failed = 0;

function patchFile(filepath, patchName, beforeAnchor, afterAnchor, appliedCheck) {
    const raw = fs.readFileSync(filepath, 'utf8');
    const isCRLF = raw.includes('\r\n');
    let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;
    if (appliedCheck && content.includes(appliedCheck)) {
        console.log('  .. ' + patchName + ' (already)');
        return 0;
    }
    const occ = content.split(beforeAnchor).length - 1;
    if (occ === 0) { console.error('  XX ' + patchName + ' anchor NOT FOUND'); return -1; }
    if (occ > 1) { console.error('  XX ' + patchName + ' anchor appeared ' + occ + ' times'); return -1; }
    content = content.replace(beforeAnchor, afterAnchor);
    if (DRY_RUN) { console.log('  OK ' + patchName); return 1; }
    const b = filepath + SUFFIX;
    if (!fs.existsSync(b)) fs.copyFileSync(filepath, b);
    fs.writeFileSync(filepath, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
    console.log('  OK ' + patchName + ' (written)');
    return 1;
}

// ── Part A1: index.js — 加 _hudTagsHtml 初始化块 ──
{
    const FILE = path.join(ROOT, 'index.js');
    const A_BEFORE = "    html += '<div class=\"horae-rpg-hud-header\">';\n";
    const A_AFTER_LINES = [
        "    html += '<div class=\"horae-rpg-hud-header\">';",
        "    let _hudTagsHtml = '';",
        "    if (rpg.realm && typeof rpg.realm === 'object' && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {",
        "        const _tags = [];",
        "        if (typeof rpg.age === 'number' && typeof rpg.lifespan === 'number') {",
        "            _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(t('ui.rpgHudAge')) + rpg.age + '/' + rpg.lifespan + '</span>');",
        "        }",
        "        const _rn = rpg.realm.name;",
        "        const _rp = rpg.realm.phase;",
        "        const _rd = (_rn === '飞升' || !_rp) ? _rn : (_rn + '·' + _rp);",
        "        if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {",
        "            _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_rd) + '（' + rpg.cultivation[0] + '/' + rpg.cultivation[1] + '）</span>');",
        "        } else {",
        "            _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_rd) + '</span>');",
        "        }",
        "        const _sp = rpg.spirit;",
        "        if (_sp && typeof _sp === 'object' && typeof _sp.tier === 'string' && _sp.tier.length > 0) {",
        "            const _spLabel = t('ui.rpgOverviewSpirit');",
        "            const _spTh = { '蒙昧': 1000, '清明': 3000, '凝照': 6000, '洞玄': 10000, '明心': 15000, '太虚': Infinity }[_sp.tier];",
        "            if (_sp.tier === '太虚' && typeof _sp.xp === 'number') {",
        "                _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');",
        "            } else if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {",
        "                _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '/' + _spTh + '）</span>');",
        "            } else if (typeof _sp.xp === 'number') {",
        "                _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');",
        "            } else {",
        "                _tags.push('<span class=\"horae-rpg-hud-tag\">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '</span>');",
        "            }",
        "        }",
        "        if (_tags.length > 0) _hudTagsHtml = '<span class=\"horae-rpg-hud-tags\">' + _tags.join('') + '</span>';",
        "    }",
    ];
    const A_AFTER = A_AFTER_LINES.join('\n') + '\n';
    const r = patchFile(FILE, 'A1 index.js hudTagsInit', A_BEFORE, A_AFTER, '_hudTagsHtml');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ── Part A2: index.js — 在 if (mostSevere) 之前输出 ──
{
    const FILE = path.join(ROOT, 'index.js');
    const A2_BEFORE = "    if (mostSevere) {\n        const summaryTitle = effectCount > 1";
    const A2_AFTER = "    html += _hudTagsHtml;\n    if (mostSevere) {\n        const summaryTitle = effectCount > 1";
    const r = patchFile(FILE, 'A2 index.js hudTagsOutput', A2_BEFORE, A2_AFTER, "    html += _hudTagsHtml;\n    if (mostSevere)");
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('part 1: changed=' + changed + ', failed=' + failed);

// ── Part B: assets/styles/style.css — append CSS ──
{
    const FILE = path.join(ROOT, 'assets/styles/style.css');
    const raw = fs.readFileSync(FILE, 'utf8');
    const isCRLF = raw.includes('\r\n');
    let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;
    if (content.includes('.horae-rpg-hud-tag ')) {
        console.log('  .. B style.css (already)');
    } else {
        const B_APPEND = "\n\n/* S1.3d: HUD cultivation tags */\n.horae-rpg-hud-tags {\n    display: inline-flex;\n    gap: 4px;\n    margin-left: 6px;\n    vertical-align: middle;\n}\n.horae-rpg-hud-tag {\n    font-size: 10px;\n    padding: 1px 6px;\n    border-radius: 8px;\n    background: rgba(255, 255, 255, 0.08);\n    color: #c0c0c0;\n    white-space: nowrap;\n}\n";
        content = content + B_APPEND;
        if (DRY_RUN) {
            console.log('  OK B style.css');
        } else {
            const b = FILE + SUFFIX;
            if (!fs.existsSync(b)) fs.copyFileSync(FILE, b);
            fs.writeFileSync(FILE, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
            console.log('  OK B style.css (written)');
        }
        changed++;
    }
}

// ── Part C: locales × 6 ──
const LOCALE_AGE = {
    "zh-CN.json": "年龄",
    "zh-TW.json": "年齡",
    "en.json": "Age",
    "ja.json": "年齢",
    "ko.json": "나이",
    "ru.json": "Возраст",
};

for (const [fname, ageVal] of Object.entries(LOCALE_AGE)) {
    const FILE = path.join(ROOT, 'locales', fname);
    const raw = fs.readFileSync(FILE, 'utf8');
    const isCRLF = raw.includes('\r\n');
    let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;
    if (content.includes('"rpgHudAge"')) {
        console.log('  .. C ' + fname + ' (already)');
        continue;
    }
    const re = /^([ \t]*)"rpgOverviewAge":[ \t]*"[^"]*",[ \t]*$/m;
    const m = content.match(re);
    if (!m) {
        console.error('  XX C ' + fname + ' anchor NOT FOUND');
        failed++;
        continue;
    }
    const insert = m[0] + '\n' + m[1] + '"rpgHudAge": "' + ageVal + '",';
    content = content.replace(m[0], insert);
    if (DRY_RUN) {
        console.log('  OK C ' + fname);
        changed++;
    } else {
        const b = FILE + SUFFIX;
        if (!fs.existsSync(b)) fs.copyFileSync(FILE, b);
        fs.writeFileSync(FILE, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
        try {
            JSON.parse(fs.readFileSync(FILE, 'utf8'));
            console.log('  OK C ' + fname + ' (written)');
            changed++;
        } catch (e) {
            console.error('  XX C ' + fname + ' JSON error: ' + e.message);
            failed++;
        }
    }
}

console.log('');
console.log('changed: ' + changed + ', failed: ' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

console.log('=== syntax check ===');
const idxR = spawnSync(process.execPath, ['--check', path.join(ROOT, 'index.js')], { encoding: 'utf8' });
if (idxR.status !== 0) { console.error('index.js syntax error:\n' + idxR.stderr); process.exit(2); }
console.log('index.js OK');
for (const fname of Object.keys(LOCALE_AGE)) {
    try { JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', fname), 'utf8')); }
    catch (e) { console.error(fname + ' JSON error'); process.exit(3); }
}
console.log('locales OK');
console.log('ALL OK');
