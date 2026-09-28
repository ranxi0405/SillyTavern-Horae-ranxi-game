#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix: path.join(ROOT, 'index.js'),
    drawer: path.join(ROOT, 'assets/templates/drawer.html'),
    zh: path.join(ROOT, 'locales/zh-CN.json'),
    en: path.join(ROOT, 'locales/en.json'),
};
const SUFFIX = '.bak-before-b3c2';
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

console.log('=== B3c-2: RPG UI 只读渲染 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

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

// ───────────────────────────────────────────
// drawer.html: 插入 identity 区块
// ───────────────────────────────────────────
{
    const { isCRLF, content: raw } = readNorm(FILES.drawer);
    let content = raw;
    let c = 0, f = 0;

    {
        const before = `                <!-- 角色卡片区（角色卡折叠模式） -->
                <div id="horae-rpg-char-cards"></div>
                <!-- 角色属性手动编辑 -->`;
        const after  = `                <!-- 角色卡片区（角色卡折叠模式） -->
                <div id="horae-rpg-char-cards"></div>
                <!-- 角色固有设定（身份） -->
                <div class="horae-rpg-identity-area" id="horae-rpg-identity-area" style="display:none;">
                    <div class="horae-rpg-section-head">
                        <span data-i18n="rpg.identity">角色固有设定</span>
                    </div>
                    <div id="horae-rpg-identity-section"></div>
                </div>
                <!-- 角色属性手动编辑 -->`;
        const appliedCheck = `id="horae-rpg-identity-area"`;
        const r = applyPatch(content, 'B3c2-P1 drawer.html identity 区块', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (DRY_RUN) {
        // 不落盘
    } else if (f === 0) {
        backup(FILES.drawer);
        writeNorm(FILES.drawer, content, isCRLF);
        console.log('  APPLIED: drawer.html');
    } else {
        console.error('  ABORT drawer.html');
        process.exit(1);
    }
}

// ───────────────────────────────────────────
// index.js: 新增 renderIdentityPanel + 调用
// ───────────────────────────────────────────
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    // P2: 新增函数（插在 updateRpgDisplay 之前）
    {
        const FN = `/** 渲染 RPG tab 里的"角色固有设定"面板（只读） */
function renderIdentityPanel() {
    const container = document.getElementById('horae-rpg-identity-area');
    const section = document.getElementById('horae-rpg-identity-section');
    if (!container || !section) return;

    const chat = horaeManager.getChat();
    const id = chat?.[0]?.horae_meta?.identity;

    if (!id || isIdentityEmpty(id)) {
        container.style.display = 'none';
        section.innerHTML = '';
        return;
    }

    container.style.display = '';

    const rows = [];
    if (id.spiritRoot) rows.push([t('rpg.identitySpiritRoot'), id.spiritRoot]);
    if (id.constitution) rows.push([t('rpg.identityConstitution'), id.constitution]);
    if (Array.isArray(id.talents) && id.talents.length > 0) rows.push([t('rpg.identityTalents'), id.talents.join(' / ')]);
    if (id.bloodline) rows.push([t('rpg.identityBloodline'), id.bloodline]);
    if (Array.isArray(id.arts) && id.arts.length > 0) rows.push([t('rpg.identityArts'), id.arts.join(' / ')]);
    if (id.background) rows.push([t('rpg.identityBackground'), id.background]);

    if (rows.length === 0) {
        container.style.display = 'none';
        section.innerHTML = '';
        return;
    }

    let html = '<div class="horae-rpg-identity-list">';
    for (const [label, val] of rows) {
        html += '<div class="horae-rpg-identity-row">'
             + '<span class="horae-rpg-identity-label">' + escapeHtml(label) + '</span>'
             + '<span class="horae-rpg-identity-value">' + escapeHtml(String(val)) + '</span>'
             + '</div>';
    }
    html += '</div>';
    section.innerHTML = html;
}

`;
        const before = `function updateRpgDisplay() {`;
        const after  = FN + `function updateRpgDisplay() {`;
        const appliedCheck = `function renderIdentityPanel() {`;
        const r = applyPatch(content, 'B3c2-P2 renderIdentityPanel 函数', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P3: 调用点
    {
        const before = `    const barsSection = document.getElementById('horae-rpg-bars-section');
    const charCardsSection = document.getElementById('horae-rpg-char-cards');
    if (!barsSection || !charCardsSection) return;`;
        const after  = `    const barsSection = document.getElementById('horae-rpg-bars-section');
    const charCardsSection = document.getElementById('horae-rpg-char-cards');
    if (!barsSection || !charCardsSection) return;

    renderIdentityPanel();`;
        const appliedCheck = `    if (!barsSection || !charCardsSection) return;\n\n    renderIdentityPanel();`;
        const r = applyPatch(content, 'B3c2-P3 updateRpgDisplay 调用点', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (DRY_RUN) {
        // 不落盘
    } else if (f === 0) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        console.log('  APPLIED: index.js');
    } else {
        console.error('  ABORT index.js');
        process.exit(1);
    }
}

// ───────────────────────────────────────────
// locales: zh-CN.json + en.json 新增 key
// ───────────────────────────────────────────
function patchLocale(file, anchor, newKeys, label) {
    const { isCRLF, content: raw } = readNorm(file);
    let content = raw;
    let f = 0;
    const appliedCheck = `"identity": "` + (label === 'zh' ? '角色固有设定' : 'Character Identity') + `"`;
    const before = anchor;
    const after  = anchor + '\n' + newKeys;
    const r = applyPatch(content, 'B3c2-' + label + ' i18n', before, after, appliedCheck, 1);
    if (r.status === -1) f++;
    if (DRY_RUN) return { status: r.status };
    if (f === 0 && r.status !== 0) {
        backup(file);
        writeNorm(file, r.content, isCRLF);
        console.log('  APPLIED: ' + path.basename(file));
    } else if (r.status === 0) {
        console.log('  skip: ' + path.basename(file));
    }
    return { status: r.status };
}

{
    const zhKeys = `        "identity": "角色固有设定",
        "identitySpiritRoot": "灵根",
        "identityConstitution": "体质",
        "identityTalents": "天赋",
        "identityBloodline": "血脉",
        "identityArts": "初始功法",
        "identityBackground": "出身",`;
    patchLocale(FILES.zh, `        "skills": "技能列表",`, zhKeys, 'zh');
}

{
    const enKeys = `        "identity": "Character Identity",
        "identitySpiritRoot": "Spirit Root",
        "identityConstitution": "Constitution",
        "identityTalents": "Talents",
        "identityBloodline": "Bloodline",
        "identityArts": "Innate Arts",
        "identityBackground": "Background",`;
    patchLocale(FILES.en, `        "skills": "Skill List",`, enKeys, 'en');
}

if (DRY_RUN) {
    console.log('');
    console.log('DRY-RUN done, nothing written.');
}

console.log('done.');
