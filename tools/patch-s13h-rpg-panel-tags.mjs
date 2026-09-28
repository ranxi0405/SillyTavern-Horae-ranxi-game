#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.js');
const BACKUP = FILE + '.bak-before-s13h';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, FILE); fs.unlinkSync(BACKUP);
    console.log('rolled back'); process.exit(0);
}

console.log('=== S1.3h RPG 面板胶囊 ===');
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

// Patch 1: 抽 _buildCapsulesHtml 函数（插在 _HUD_REALM_BASE_CULTIVATION 之后、_calcCultivationSegmentHud 之前）
{
    const before = `function _calcCultivationSegmentHud(cur, realmName) {`;
    const after = `function _buildCapsulesHtml(rpg) {
    if (!rpg.realm || typeof rpg.realm !== 'object' || typeof rpg.realm.name !== 'string' || rpg.realm.name.length === 0) {
        return '';
    }
    const _tags = [];
    if (typeof rpg.age === 'number' && typeof rpg.lifespan === 'number') {
        _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(t('ui.rpgHudAge')) + rpg.age + '/' + rpg.lifespan + '</span>');
    }
    const _rn = rpg.realm.name;
    if (_rn === '飞升') {
        _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
    } else if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
        const _cur = rpg.cultivation[0];
        const _seg = _calcCultivationSegmentHud(_cur, _rn);
        if (_seg && _seg.phase) {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn + '·' + _seg.phase) + '（' + _seg.segCur + '/' + _seg.segMax + '）</span>');
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        }
    } else {
        _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
    }
    const _sp = rpg.spirit;
    if (_sp && typeof _sp === 'object' && typeof _sp.tier === 'string' && _sp.tier.length > 0) {
        const _spLabel = t('ui.rpgOverviewSpirit');
        const _spTh = { '蒙昧': 1000, '清明': 3000, '凝照': 6000, '洞玄': 10000, '明心': 15000, '太虚': Infinity }[_sp.tier];
        if (_sp.tier === '太虚' && typeof _sp.xp === 'number') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');
        } else if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '/' + _spTh + '）</span>');
        } else if (typeof _sp.xp === 'number') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '</span>');
        }
    }
    return _tags.length > 0 ? '<span class="horae-rpg-hud-tags">' + _tags.join('') + '</span>' : '';
}

function _calcCultivationSegmentHud(cur, realmName) {`;
    const r = apply('P1 抽 _buildCapsulesHtml', before, after, 'function _buildCapsulesHtml(rpg) {');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 2: HUD 内联改为调用函数
{
    const before = `    html += '<div class="horae-rpg-hud-header">';
    let _hudTagsHtml = '';
    if (rpg.realm && typeof rpg.realm === 'object' && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {
        const _tags = [];
        if (typeof rpg.age === 'number' && typeof rpg.lifespan === 'number') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(t('ui.rpgHudAge')) + rpg.age + '/' + rpg.lifespan + '</span>');
        }
        const _rn = rpg.realm.name;
        if (_rn === '飞升') {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        } else if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
            const _cur = rpg.cultivation[0];
            const _seg = _calcCultivationSegmentHud(_cur, _rn);
            if (_seg && _seg.phase) {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn + '·' + _seg.phase) + '（' + _seg.segCur + '/' + _seg.segMax + '）</span>');
            } else {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
            }
        } else {
            _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_rn) + '</span>');
        }
        const _sp = rpg.spirit;
        if (_sp && typeof _sp === 'object' && typeof _sp.tier === 'string' && _sp.tier.length > 0) {
            const _spLabel = t('ui.rpgOverviewSpirit');
            const _spTh = { '蒙昧': 1000, '清明': 3000, '凝照': 6000, '洞玄': 10000, '明心': 15000, '太虚': Infinity }[_sp.tier];
            if (_sp.tier === '太虚' && typeof _sp.xp === 'number') {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');
            } else if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '/' + _spTh + '）</span>');
            } else if (typeof _sp.xp === 'number') {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');
            } else {
                _tags.push('<span class="horae-rpg-hud-tag">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '</span>');
            }
        }
        if (_tags.length > 0) _hudTagsHtml = '<span class="horae-rpg-hud-tags">' + _tags.join('') + '</span>';
    }
    html += \`<span class="horae-rpg-hud-name">\${escapeHtml(name)}</span>\`;
    html += _hudTagsHtml;`;

    const after = `    html += '<div class="horae-rpg-hud-header">';
    html += \`<span class="horae-rpg-hud-name">\${escapeHtml(name)}</span>\`;
    html += _buildCapsulesHtml(rpg);`;

    const r = apply('P2 HUD 改用 _buildCapsulesHtml', before, after, 'html += _buildCapsulesHtml(rpg);');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 3: RPG 面板总览添加胶囊
{
    const before = `        // ── 境界 / 修为 / 寿元（仅在 rpg.realm.name 存在时显示）──
        if (rpg.realm && typeof rpg.realm === 'object'
            && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {`;

    const after = `        // ── 胶囊行（与 HUD 共用 _buildCapsulesHtml）──
        {
            const _capsHtml = _buildCapsulesHtml(rpg);
            if (_capsHtml) {
                html += '<div class="horae-rpg-overview-capsules">' + _capsHtml + '</div>';
            }
        }

        // ── 境界 / 修为 / 寿元（仅在 rpg.realm.name 存在时显示）──
        if (rpg.realm && typeof rpg.realm === 'object'
            && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {`;

    const r = apply('P3 RPG 面板加胶囊', before, after, 'horae-rpg-overview-capsules');
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
