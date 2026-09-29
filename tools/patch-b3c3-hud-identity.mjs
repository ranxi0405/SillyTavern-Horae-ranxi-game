#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix:  path.join(ROOT, 'index.js'),
    css: path.join(ROOT, 'assets/styles/style.css'),
    zh:  path.join(ROOT, 'locales/zh-CN.json'),
    en:  path.join(ROOT, 'locales/en.json'),
};
const SUFFIX = '.bak-before-b3c3';
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

console.log('=== B3c-3: HUD identity chip ===');
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
// P1: index.js — 新增 helper + 重构 _buildCapsulesHtml
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    const OLD_FN =
`function _buildCapsulesHtml(rpg) {
    if (!rpg.realm || typeof rpg.realm !== 'object' || typeof rpg.realm.name !== 'string' || rpg.realm.name.length === 0) {
        return '';
    }
    const _tags = [];`;

    const NEW_FN =
`/** 取指定角色的 identity（仅主角有效，非主角返回 null） */
function _getIdentityForCharacter(name) {
    const mc = getContext()?.name1 || '';
    if (!name || name !== mc) return null;
    const chat = horaeManager.getChat();
    return chat?.[0]?.horae_meta?.identity || null;
}

function _buildCapsulesHtml(rpg, options = {}) {
    const _tags = [];
    const _hasRealm = rpg.realm && typeof rpg.realm === 'object'
        && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0;
    if (_hasRealm) {`;

    {
        const appliedCheck = `function _getIdentityForCharacter(name) {`;
        const r = applyPatch(content, 'B3c3-P1a helper + 函数签名', OLD_FN, NEW_FN, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // 关闭 if (_hasRealm) 块 + 追加 identity 容器
    const OLD_RET =
`    }
    return _tags.length > 0 ? '<span class="horae-rpg-hud-tags">' + _tags.join('') + '</span>' : '';
}`;

    const NEW_RET =
`    }
    }

    let _out = '';
    if (_tags.length > 0) {
        _out += '<span class="horae-rpg-hud-tags">' + _tags.join('') + '</span>';
    }

    if (options.showIdentity && options.identity) {
        const id = options.identity;
        const _chips = [];
        const _sr = id.spiritRootDisplay || id.spiritRoot;
        if (_sr) {
            _chips.push('<span class="horae-rpg-hud-identity-chip horae-rpg-hud-identity-chip--spiritRoot">'
                + escapeHtml(t('ui.rpgHudIdentitySpiritRoot')) + '·' + escapeHtml(_sr) + '</span>');
        }
        const _cs = id.constitutionDisplay || id.constitution;
        if (_cs) {
            _chips.push('<span class="horae-rpg-hud-identity-chip horae-rpg-hud-identity-chip--constitution">'
                + escapeHtml(t('ui.rpgHudIdentityConstitution')) + '·' + escapeHtml(_cs) + '</span>');
        }
        if (id.xianZi) {
            _chips.push('<span class="horae-rpg-hud-identity-chip horae-rpg-hud-identity-chip--xianZi">'
                + escapeHtml(t('ui.rpgHudIdentityXianZi')) + '·' + escapeHtml(id.xianZi) + '</span>');
        }
        if (_chips.length > 0) {
            _out += '<span class="horae-rpg-hud-identity-tags">' + _chips.join('') + '</span>';
        }
    }

    return _out;
}`;

    {
        const appliedCheck = `if (options.showIdentity && options.identity) {`;
        const r = applyPatch(content, 'B3c3-P1b 关闭 realm 块 + identity 容器', OLD_RET, NEW_RET, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P2: caller 7976 (RPG tab 卡片头部)
    {
        const before = `                barsHtml += _buildCapsulesHtml(rpg);`;
        const after  = `                const _identity = _getIdentityForCharacter(name);\n                barsHtml += _buildCapsulesHtml(rpg, { showIdentity: !!_identity, identity: _identity });`;
        const appliedCheck = `                const _identity = _getIdentityForCharacter(name);\n                barsHtml += _buildCapsulesHtml(rpg, { showIdentity: !!_identity, identity: _identity });`;
        const r = applyPatch(content, 'B3c3-P2 caller 7976 (RPG tab 卡片头部)', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P3: caller 9799 (HUD 行 header)
    {
        const before = `    html += _buildCapsulesHtml(rpg);`;
        const after  = `    const _identity = _getIdentityForCharacter(name);\n    html += _buildCapsulesHtml(rpg, { showIdentity: !!_identity, identity: _identity });`;
        const appliedCheck = `    const _identity = _getIdentityForCharacter(name);\n    html += _buildCapsulesHtml(rpg, { showIdentity: !!_identity, identity: _identity });`;
        const r = applyPatch(content, 'B3c3-P3 caller 9799 (HUD 行 header)', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js'); }
}

// ══════════════════════════════════════════════
// P4: assets/styles/style.css
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.css);
    const before =
`.horae-rpg-hud-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0c0;
    white-space: nowrap;
}`;
    const after = before +
`

/* B3c-3: HUD identity chips (角色固有设定) - 独立于 state tags，颜色/稀有度留 B3c-2c-visual */
.horae-rpg-hud-identity-tags {
    display: inline-flex;
    gap: 4px;
    margin-left: 6px;
    vertical-align: middle;
}
.horae-rpg-hud-identity-chip {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0c0;
    white-space: nowrap;
    font-style: italic;
    letter-spacing: 0.2px;
}
.horae-rpg-hud-identity-chip--spiritRoot { /* B3c-2c-visual: 五行颜色 */ }
.horae-rpg-hud-identity-chip--constitution { /* B3c-2c-visual: 体质稀有度 */ }
.horae-rpg-hud-identity-chip--xianZi { /* B3c-2c-visual: 仙姿 */ }`;
    const r = applyPatch(raw, 'B3c3-P4 CSS', before, after, '.horae-rpg-hud-identity-chip {', 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.css); writeNorm(FILES.css, r.content, isCRLF); console.log('  APPLIED: style.css'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P5: locales/zh-CN.json
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.zh);
    const before = `        "rpgHudAge": "年龄",`;
    const after  = `        "rpgHudAge": "年龄",
        "rpgHudIdentitySpiritRoot": "灵根",
        "rpgHudIdentityConstitution": "体质",
        "rpgHudIdentityXianZi": "仙姿",`;
    const r = applyPatch(raw, 'B3c3-P5 zh-CN i18n', before, after, `"rpgHudIdentitySpiritRoot": "灵根",`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.zh); writeNorm(FILES.zh, r.content, isCRLF); console.log('  APPLIED: zh-CN.json'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P6: locales/en.json
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.en);
    // 用正则找 "rpgHudAge" 行（值未知）
    const re = /("rpgHudAge"\s*:\s*"[^"]*",)/;
    if (!re.test(raw)) {
        console.error('  XX B3c3-P6 en i18n anchor NOT FOUND (rpgHudAge 不存在)');
        failed++;
    } else if (raw.includes('"rpgHudIdentitySpiritRoot"')) {
        console.log('  .. B3c3-P6 en i18n (already)');
    } else {
        const newContent = raw.replace(re, (m) => m +
`\n        "rpgHudIdentitySpiritRoot": "Spirit Root",
        "rpgHudIdentityConstitution": "Constitution",
        "rpgHudIdentityXianZi": "Xian Zi",`);
        console.log('  OK B3c3-P6 en i18n');
        if (!DRY_RUN) { backup(FILES.en); writeNorm(FILES.en, newContent, isCRLF); console.log('  APPLIED: en.json'); }
    }
}

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, nothing written.'); process.exit(0); }
console.log('ALL APPLIED.');
