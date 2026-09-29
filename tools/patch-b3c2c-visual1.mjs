#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix:  path.join(ROOT, 'index.js'),
    css: path.join(ROOT, 'assets/styles/style.css'),
};
const SUFFIX = '.bak-before-b3c2c-visual1';
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
    console.log('rolled back ' + n); process.exit(0);
}

console.log('=== B3c-2c-visual-1: RPG tab 卡片化 + 图标 ===');
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
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' occ=' + occ + ' expect=' + expectedOcc); return { content, status: -1 }; }
    console.log('  OK ' + name);
    return { content: content.split(before).join(after), status: 1 };
}

let failed = 0;

// ══════════════════════════════════════════════
// P1: _buildOverviewHtml — 修为行 + 属性行
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    // P1a: 修为 section
    {
        const before = `html += \`<div class="horae-rpg-overview-section"><div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewCultivation')}</span><span class="horae-rpg-overview-val">\${cur}/\${max}</span></div></div>\`;`;
        const after  = `html += \`<div class="horae-rpg-card"><div class="horae-rpg-field-row"><i class="fa-solid fa-droplet horae-rpg-field-icon"></i><span class="horae-rpg-field-label">\${t('ui.rpgOverviewCultivation')}</span><span class="horae-rpg-field-val">\${cur}/\${max}</span></div></div>\`;`;
        const appliedCheck = `<i class="fa-solid fa-droplet horae-rpg-field-icon"></i>`;
        const r = applyPatch(content, 'V1-P1a 修为 section', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P1b: 属性 section（加图标映射）
    {
        const before = `        if (attrCfg.length > 0) {
            let attrHtml = '';
            for (const a of attrCfg) {
                const v = attrs[a.key];
                const vStr = (v === undefined || v === null) ? '?' : String(v);
                attrHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${escapeHtml(a.name)}</span><span class="horae-rpg-overview-val">\${escapeHtml(vStr)}</span></div>\`;
            }
            html += \`<div class="horae-rpg-overview-section">\${attrHtml}</div>\`;
        }`;
        const after = `        if (attrCfg.length > 0) {
            const _ATTR_ICON_MAP = {
                'zizhi':    'fa-medal',
                'wuxing':   'fa-spa',
                'shenlin':  'fa-fist-raised',
                'daoxin':   'fa-yin-yang',
                'xianyuan': 'fa-feather',
            };
            let attrHtml = '';
            for (const a of attrCfg) {
                const v = attrs[a.key];
                const vStr = (v === undefined || v === null) ? '?' : String(v);
                const _icon = _ATTR_ICON_MAP[a.key] || 'fa-circle-dot';
                attrHtml += \`<div class="horae-rpg-field-row"><i class="fa-solid \${_icon} horae-rpg-field-icon"></i><span class="horae-rpg-field-label">\${escapeHtml(a.name)}</span><span class="horae-rpg-field-val">\${escapeHtml(vStr)}</span></div>\`;
            }
            html += \`<div class="horae-rpg-card">\${attrHtml}</div>\`;
        }`;
        const appliedCheck = `'zizhi':    'fa-medal',`;
        const r = applyPatch(content, 'V1-P1b 属性 section + 图标', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js (overview)'); }
}

// ══════════════════════════════════════════════
// P2: _buildArtsHtml — 图标 + 进度条 + 段位
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    // P2a: 主循环 CANONICAL_ARTS 加 icon + 新 HTML
    {
        const before = `        const CANONICAL_ARTS = [
            { stateKey: '炼丹', i18nKey: 'ui.rpgArtsAlchemy' },
            { stateKey: '炼器', i18nKey: 'ui.rpgArtsSmithing' },
            { stateKey: '符箓', i18nKey: 'ui.rpgArtsTalisman' },
            { stateKey: '阵法', i18nKey: 'ui.rpgArtsFormation' },
            { stateKey: '御兽', i18nKey: 'ui.rpgArtsBeast' },
            { stateKey: '灵植', i18nKey: 'ui.rpgArtsHerb' },
        ];`;
        const after = `        const CANONICAL_ARTS = [
            { stateKey: '炼丹', i18nKey: 'ui.rpgArtsAlchemy',   icon: 'fa-flask' },
            { stateKey: '炼器', i18nKey: 'ui.rpgArtsSmithing',  icon: 'fa-hammer' },
            { stateKey: '符箓', i18nKey: 'ui.rpgArtsTalisman',  icon: 'fa-scroll' },
            { stateKey: '阵法', i18nKey: 'ui.rpgArtsFormation', icon: 'fa-shapes' },
            { stateKey: '御兽', i18nKey: 'ui.rpgArtsBeast',     icon: 'fa-paw' },
            { stateKey: '灵植', i18nKey: 'ui.rpgArtsHerb',      icon: 'fa-seedling' },
        ];
        const _buildArtsRow = (icon, label, data) => {
            if (!data) {
                return \`<div class="horae-rpg-arts-row">\`
                     + \`<i class="fa-solid \${icon} horae-rpg-arts-icon"></i>\`
                     + \`<span class="horae-rpg-arts-label">\${escapeHtml(label)}</span>\`
                     + \`<div class="horae-rpg-arts-bar"></div>\`
                     + \`<span class="horae-rpg-arts-tier">\${escapeHtml(untrained)}</span>\`
                     + \`<span class="horae-rpg-arts-val">——</span>\`
                     + \`</div>\`;
            }
            let seg = null;
            for (let gi = 0; gi < _ART_GRADE_RANGES.length; gi++) {
                const g = _ART_GRADE_RANGES[gi];
                if (typeof data.xp === 'number' && data.xp >= g.min && data.xp <= g.max) { seg = g; break; }
            }
            let pct = 0;
            let valStr = '';
            if (seg && seg.max === Infinity) {
                pct = 100;
                valStr = data.xp + '+';
            } else if (seg && typeof data.xp === 'number') {
                pct = Math.min(100, Math.round(data.xp / seg.max * 100));
                valStr = data.xp + '/' + seg.max;
            } else if (typeof data.xp === 'number') {
                valStr = String(data.xp);
            } else {
                valStr = '';
            }
            return \`<div class="horae-rpg-arts-row">\`
                 + \`<i class="fa-solid \${icon} horae-rpg-arts-icon"></i>\`
                 + \`<span class="horae-rpg-arts-label">\${escapeHtml(label)}</span>\`
                 + \`<div class="horae-rpg-arts-bar"><div class="horae-rpg-arts-bar-fill" style="width:\${pct}%"></div></div>\`
                 + \`<span class="horae-rpg-arts-tier horae-rpg-arts-tier--trained">\${escapeHtml(data.tier || '')}</span>\`
                 + \`<span class="horae-rpg-arts-val">\${escapeHtml(valStr)}</span>\`
                 + \`</div>\`;
        };`;
        const appliedCheck = `const _buildArtsRow = (icon, label, data) => {`;
        const r = applyPatch(content, 'V1-P2a CANONICAL_ARTS + _buildArtsRow', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P2b: 主渲染循环
    {
        const before = `        for (const art of CANONICAL_ARTS) {
            const data = artsMap[art.stateKey];
            html += \`<div class="horae-rpg-arts-row"><span class="horae-rpg-arts-label">\${escapeHtml(t(art.i18nKey))}</span><span class="horae-rpg-arts-val">\${escapeHtml(_renderVal(data))}</span></div>\`;
        }

        const canonicalSet = new Set(CANONICAL_ARTS.map(a => a.stateKey));
        for (const [k, v] of Object.entries(artsMap)) {
            if (canonicalSet.has(k)) continue;
            html += \`<div class="horae-rpg-arts-row"><span class="horae-rpg-arts-label">\${escapeHtml(k)}</span><span class="horae-rpg-arts-val">\${escapeHtml(_renderVal(v))}</span></div>\`;
        }`;
        const after = `        for (const art of CANONICAL_ARTS) {
            const data = artsMap[art.stateKey];
            html += _buildArtsRow(art.icon, t(art.i18nKey), data);
        }

        const canonicalSet = new Set(CANONICAL_ARTS.map(a => a.stateKey));
        for (const [k, v] of Object.entries(artsMap)) {
            if (canonicalSet.has(k)) continue;
            html += _buildArtsRow('fa-circle-dot', k, v);
        }`;
        const appliedCheck = `html += _buildArtsRow(art.icon, t(art.i18nKey), data);`;
        const r = applyPatch(content, 'V1-P2b 主渲染循环', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js (arts)'); }
}

// ══════════════════════════════════════════════
// P3: renderIdentityPanel — 图标 + grid
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    // P3a: rows 定义加 icon
    {
        const before = `    const rows = [];
    const _sr = id.spiritRootDisplay || id.spiritRoot;
    if (_sr) rows.push([t('rpg.identitySpiritRoot'), _sr]);
    const _cs = id.constitutionDisplay || id.constitution;
    if (_cs) rows.push([t('rpg.identityConstitution'), _cs]);
    if (id.xianZi) rows.push([t('rpg.identityXianZi'), id.xianZi]);
    if (Array.isArray(id.talents) && id.talents.length > 0) rows.push([t('rpg.identityTalents'), id.talents.join(' / ')]);
    if (id.bloodline) rows.push([t('rpg.identityBloodline'), id.bloodline]);
    if (id.background) rows.push([t('rpg.identityBackground'), id.background]);`;
        const after = `    const rows = [];
    const _sr = id.spiritRootDisplay || id.spiritRoot;
    if (_sr) rows.push(['fa-seedling', t('rpg.identitySpiritRoot'), _sr, '']);
    const _cs = id.constitutionDisplay || id.constitution;
    if (_cs) rows.push(['fa-shield', t('rpg.identityConstitution'), _cs, '']);
    if (id.xianZi) rows.push(['fa-gem', t('rpg.identityXianZi'), id.xianZi, '']);
    if (Array.isArray(id.talents) && id.talents.length > 0) rows.push(['fa-star', t('rpg.identityTalents'), id.talents.join(' / '), '']);
    if (id.bloodline) rows.push(['fa-dna', t('rpg.identityBloodline'), id.bloodline, 'horae-rpg-field-icon--bloodline']);
    if (id.background) rows.push(['fa-house', t('rpg.identityBackground'), id.background, '']);`;
        const appliedCheck = `rows.push(['fa-seedling', t('rpg.identitySpiritRoot'), _sr, '']);`;
        const r = applyPatch(content, 'V1-P3a rows 定义 + 图标', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P3b: 渲染循环
    {
        const before = `    let html = '<div class="horae-rpg-identity-list">';
    for (const [label, val] of rows) {
        html += '<div class="horae-rpg-identity-row">'
             + '<span class="horae-rpg-identity-label">' + escapeHtml(label) + '</span>'
             + '<span class="horae-rpg-identity-value">' + escapeHtml(String(val)) + '</span>'
             + '</div>';
    }
    html += '</div>';`;
        const after = `    let html = '<div class="horae-rpg-card"><div class="horae-rpg-identity-list">';
    for (const [icon, label, val, extraCls] of rows) {
        html += '<div class="horae-rpg-field-row">'
             + '<i class="fa-solid ' + icon + ' horae-rpg-field-icon ' + escapeHtml(extraCls) + '"></i>'
             + '<span class="horae-rpg-field-label">' + escapeHtml(label) + '</span>'
             + '<span class="horae-rpg-field-val">' + escapeHtml(String(val)) + '</span>'
             + '</div>';
    }
    html += '</div></div>';`;
        const appliedCheck = `for (const [icon, label, val, extraCls] of rows) {`;
        const r = applyPatch(content, 'V1-P3b 渲染循环', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js (identity panel)'); }
}

// ══════════════════════════════════════════════
// P4: CSS
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.css);
    const before = `.horae-rpg-hud-identity-chip--xianZi { /* B3c-2c-visual: 仙姿 */ }`;
    const after = before + `

/* ══════════════════════════════════════════════════════════════
 * B3c-2c-visual-1: RPG tab 卡片化 + 图标 + 六艺进度条
 * ══════════════════════════════════════════════════════════════ */
.horae-rpg-card {
    background: var(--horae-bg-secondary);
    border: 1px solid var(--horae-border);
    border-radius: var(--horae-radius);
    padding: 10px 14px;
    margin-bottom: 10px;
}
.horae-rpg-field-row {
    display: grid;
    grid-template-columns: 20px 56px 1fr;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    font-size: 13px;
}
.horae-rpg-field-row + .horae-rpg-field-row {
    border-top: 1px dashed rgba(255, 255, 255, 0.05);
}
.horae-rpg-field-icon {
    text-align: center;
    color: var(--horae-text-muted);
    font-size: 12px;
}
.horae-rpg-field-icon--bloodline {
    color: var(--horae-danger);
}
.horae-rpg-field-label {
    color: var(--horae-text-muted);
}
.horae-rpg-field-val {
    color: var(--horae-text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
}

/* 六艺 tab */
.horae-rpg-arts {
    display: flex;
    flex-direction: column;
}
.horae-rpg-arts-row {
    display: grid;
    grid-template-columns: 20px 44px 1fr 60px 76px;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 13px;
}
.horae-rpg-arts-row + .horae-rpg-arts-row {
    border-top: 1px dashed rgba(255, 255, 255, 0.05);
}
.horae-rpg-arts-icon {
    text-align: center;
    color: var(--horae-text-muted);
    font-size: 12px;
}
.horae-rpg-arts-label {
    color: var(--horae-text);
}
.horae-rpg-arts-bar {
    height: 6px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: hidden;
}
.horae-rpg-arts-bar-fill {
    height: 100%;
    background: var(--horae-primary);
    border-radius: 3px;
    transition: width 0.3s ease;
}
.horae-rpg-arts-tier {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--horae-text-muted);
    text-align: center;
    white-space: nowrap;
}
.horae-rpg-arts-tier--trained {
    background: rgba(124, 58, 237, 0.18);
    color: var(--horae-primary-light);
}
.horae-rpg-arts-val {
    color: var(--horae-text-muted);
    font-size: 12px;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* 身份面板容器（外层已用 .horae-rpg-card 包裹） */
.horae-rpg-identity-list {
    display: flex;
    flex-direction: column;
}

/* 浅色主题下虚线分隔降级 */
@media (prefers-color-scheme: light) {
    .horae-rpg-field-row + .horae-rpg-field-row {
        border-top-color: rgba(0, 0, 0, 0.06);
    }
    .horae-rpg-arts-row + .horae-rpg-arts-row {
        border-top-color: rgba(0, 0, 0, 0.06);
    }
}`;
    const r = applyPatch(raw, 'V1-P4 CSS 卡片化 + 六艺 + 图标', before, after, `.horae-rpg-field-row {`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.css); writeNorm(FILES.css, r.content, isCRLF); console.log('  APPLIED: style.css'); }
    else if (r.status === -1) failed++;
}

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, nothing written.'); process.exit(0); }
console.log('ALL APPLIED.');
