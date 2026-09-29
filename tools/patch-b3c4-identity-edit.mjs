#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix:     path.join(ROOT, 'index.js'),
    drawer: path.join(ROOT, 'assets/templates/drawer.html'),
    zh:     path.join(ROOT, 'locales/zh-CN.json'),
    en:     path.join(ROOT, 'locales/en.json'),
};
const SUFFIX = '.bak-before-b3c4';
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

console.log('=== B3c-4: identity 编辑入口（modal）===');
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
// P1: drawer.html 加编辑按钮
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.drawer);
    const before = `<span data-i18n="rpg.identity">角色固有设定</span>`;
    const after  = `<span data-i18n="rpg.identity">角色固有设定</span>
                        <button id="horae-rpg-identity-edit" class="horae-rpg-btn-sm" data-i18n-title="ui.edit" title=""><i class="fa-solid fa-pen"></i></button>`;
    const r = applyPatch(raw, 'B3c4-P1 drawer.html 编辑按钮', before, after, `id="horae-rpg-identity-edit"`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.drawer); writeNorm(FILES.drawer, r.content, isCRLF); console.log('  APPLIED: drawer.html'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P2: index.js 新增 openIdentityEditModal
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    const before = `function renderIdentityPanel() {`;
    const NEW_FN = `/** 打开 identity 编辑 modal（角色固有设定） */
function openIdentityEditModal() {
    closeEditModal();
    const chat = horaeManager.getChat();
    const id = chat?.[0]?.horae_meta?.identity || {};

    const _esc = (v) => escapeHtml(String(v || ''));
    const _row = (fid, label, val, ph) =>
        '<div class="horae-edit-field">'
      + '<label>' + escapeHtml(label) + '</label>'
      + '<input id="' + fid + '" type="text" value="' + _esc(val) + '" placeholder="' + _esc(ph) + '" />'
      + '</div>';

    const _talentsStr = Array.isArray(id.talents) ? id.talents.join(' / ') : '';
    const _bodyHtml =
        _row('horae-identity-sr-real',     t('rpg.identitySpiritRoot') + ' · ' + t('rpg.identityReal'),     id.spiritRoot, '')
      + _row('horae-identity-sr-display', t('rpg.identitySpiritRoot') + ' · ' + t('rpg.identityDisplay'), id.spiritRootDisplay, '')
      + _row('horae-identity-cs-real',     t('rpg.identityConstitution') + ' · ' + t('rpg.identityReal'),     id.constitution, '')
      + _row('horae-identity-cs-display',  t('rpg.identityConstitution') + ' · ' + t('rpg.identityDisplay'), id.constitutionDisplay, '')
      + _row('horae-identity-xianzi',      t('rpg.identityXianZi'), id.xianZi, '')
      + _row('horae-identity-talents',     t('rpg.identityTalents'), _talentsStr, t('rpg.identityTalentsPlaceholder'))
      + _row('horae-identity-bloodline',   t('rpg.identityBloodline'), id.bloodline, '')
      + _row('horae-identity-background',  t('rpg.identityBackground'), id.background, '');

    const _modalHtml =
        '<div id="horae-edit-modal" class="horae-modal' + (isLightMode() ? ' horae-light' : '') + '">'
      + '<div class="horae-modal-content">'
      + '<div class="horae-modal-header"><i class="fa-solid fa-pen"></i> ' + escapeHtml(t('rpg.identityEditTitle')) + '</div>'
      + '<div class="horae-modal-body horae-edit-modal-body">' + _bodyHtml + '</div>'
      + '<div class="horae-modal-footer">'
      + '<button id="horae-identity-edit-save" class="horae-btn primary"><i class="fa-solid fa-check"></i> ' + escapeHtml(t('common.save')) + '</button>'
      + '<button id="horae-identity-edit-cancel" class="horae-btn"><i class="fa-solid fa-xmark"></i> ' + escapeHtml(t('common.cancel')) + '</button>'
      + '</div></div></div>';

    document.body.insertAdjacentHTML('beforeend', _modalHtml);
    preventModalBubble();

    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });

    document.getElementById('horae-identity-edit-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const _parse = (v) => { const s = (v || '').trim(); return s || null; };
        const _get = (fid) => document.getElementById(fid).value;
        const _talents = _get('horae-identity-talents').replace(/[，,]/g, '/').split('/').map(s => s.trim()).filter(Boolean);
        const _newId = {
            _v: 'v0.1',
            spiritRoot: _parse(_get('horae-identity-sr-real')),
            spiritRootDisplay: _parse(_get('horae-identity-sr-display')),
            constitution: _parse(_get('horae-identity-cs-real')),
            constitutionDisplay: _parse(_get('horae-identity-cs-display')),
            xianZi: _parse(_get('horae-identity-xianzi')),
            talents: _talents,
            bloodline: _parse(_get('horae-identity-bloodline')),
            background: _parse(_get('horae-identity-background')),
            hidden: id.hidden === true,
            arts: Array.isArray(id.arts) ? id.arts : [],
        };
        const _ok = await _writeCardIdentity(_newId);
        if (!_ok) { showToast(t('rpg.identitySaveFailed'), 'error'); return; }
        closeEditModal();
        renderIdentityPanel();
        updateRpgDisplay();
        showToast(t('toast.saveSuccess'), 'success');
    });

    document.getElementById('horae-identity-edit-cancel').addEventListener('click', () => closeEditModal());
}

function renderIdentityPanel() {`;
    const r = applyPatch(raw, 'B3c4-P2 openIdentityEditModal 函数', before, NEW_FN, `function openIdentityEditModal() {`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, r.content, isCRLF); console.log('  APPLIED: index.js (function)'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P3: index.js renderIdentityPanel 空 identity 也显示面板
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    const before = `    if (!id || isIdentityEmpty(id)) {
        container.style.display = 'none';
        section.innerHTML = '';
        return;
    }

    container.style.display = '';`;
    const after = `    // 空 identity 也显示面板（含编辑按钮），内容区显示占位
    if (!id || isIdentityEmpty(id)) {
        container.style.display = '';
        section.innerHTML = '<div class="horae-rpg-card"><div class="horae-rpg-field-row"><span class="horae-rpg-field-label">' + escapeHtml(t('rpg.identityNotSet')) + '</span></div></div>';
        return;
    }

    container.style.display = '';`;
    const r = applyPatch(raw, 'B3c4-P3 renderIdentityPanel 空值占位', before, after, `t('rpg.identityNotSet')`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, r.content, isCRLF); console.log('  APPLIED: index.js (empty)'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P4: index.js 事件绑定
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    const before = `    // RPG 技能增删
    $('#horae-rpg-add-skill').on('click', () => {`;
    const after = `    // identity 编辑入口
    $(document).on('click', '#horae-rpg-identity-edit', openIdentityEditModal);

    // RPG 技能增删
    $('#horae-rpg-add-skill').on('click', () => {`;
    const r = applyPatch(raw, 'B3c4-P4 事件绑定', before, after, `$(document).on('click', '#horae-rpg-identity-edit', openIdentityEditModal);`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.ix); writeNorm(FILES.ix, r.content, isCRLF); console.log('  APPLIED: index.js (bind)'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P5: zh-CN.json i18n
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.zh);
    const before = `        "identityXianZi": "仙姿",`;
    const after = `        "identityXianZi": "仙姿",
        "identityEditTitle": "编辑角色固有设定",
        "identityReal": "真实",
        "identityDisplay": "显示",
        "identityTalentsPlaceholder": "多个用 / 分隔",
        "identityNotSet": "未设置（点击右上角编辑）",
        "identitySaveFailed": "保存失败",`;
    const r = applyPatch(raw, 'B3c4-P5 zh-CN i18n', before, after, `"identityEditTitle": "编辑角色固有设定",`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.zh); writeNorm(FILES.zh, r.content, isCRLF); console.log('  APPLIED: zh-CN.json'); }
    else if (r.status === -1) failed++;
}

// ══════════════════════════════════════════════
// P6: en.json i18n
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.en);
    const before = `        "identityXianZi": "Xian Zi",`;
    const after = `        "identityXianZi": "Xian Zi",
        "identityEditTitle": "Edit Character Identity",
        "identityReal": "Real",
        "identityDisplay": "Display",
        "identityTalentsPlaceholder": "Separate with /",
        "identityNotSet": "Not set (click top-right to edit)",
        "identitySaveFailed": "Save failed",`;
    const r = applyPatch(raw, 'B3c4-P6 en i18n', before, after, `"identityEditTitle": "Edit Character Identity",`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.en); writeNorm(FILES.en, r.content, isCRLF); console.log('  APPLIED: en.json'); }
    else if (r.status === -1) failed++;
}

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, nothing written.'); process.exit(0); }
console.log('ALL APPLIED.');
