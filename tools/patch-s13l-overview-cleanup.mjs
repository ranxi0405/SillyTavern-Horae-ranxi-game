#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.js');
const BACKUP = FILE + '.bak-before-s13l';
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

console.log('=== S1.3l: 总览 tab 清理（保留修为 + 五维） ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

// 整个 _buildOverviewHtml 函数替换
const BEFORE = `    function _buildOverviewHtml(name, rpg) {
        const bars = rpg.bars?.[name] || {};
        const attrs = rpg.attributes?.[name] || {};
        const attrCfg = settings.rpgAttributeConfig || [];

        let html = '<div class="horae-rpg-overview">';

        // ── 状态条（固定 hp / mp / sp，不遍历 barCfg）──
        const OVERVIEW_BAR_KEYS = ['hp', 'mp', 'sp'];
        let barsHtml = '';
        for (const key of OVERVIEW_BAR_KEYS) {
            const val = bars[key];
            if (!Array.isArray(val) || val.length < 2) continue;
            const label = getRpgBarName(key, val[2]);
            barsHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${escapeHtml(label)}</span><span class="horae-rpg-overview-val">\${val[0]}/\${val[1]}</span></div>\`;
        }
        if (barsHtml) {
            html += \`<div class="horae-rpg-overview-section">\${barsHtml}</div>\`;
        }

        // ── 境界 / 修为 / 寿元（仅在 rpg.realm.name 存在时显示）──
        if (rpg.realm && typeof rpg.realm === 'object'
            && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {

            const realmName = rpg.realm.name;
            const realmPhase = rpg.realm.phase;
            let realmHtml = '';

            // 境界显示：X·Y 或 X（飞升 / 无 phase）
            const realmDisplay = (realmName === '飞升' || !realmPhase)
                ? realmName
                : \`\${realmName}·\${realmPhase}\`;
            realmHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewRealm')}</span><span class="horae-rpg-overview-val">\${escapeHtml(realmDisplay)}</span></div>\`;

            // 修为：cur / max
            if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
                const cur = rpg.cultivation[0];
                const max = rpg.cultivation[1];
                if (Number.isSafeInteger(cur) && Number.isSafeInteger(max)) {
                    realmHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewCultivation')}</span><span class="horae-rpg-overview-val">\${cur}/\${max}</span></div>\`;
                }
            }

            // 寿元 / 年龄
            const age = rpg.age;
            const lifespan = rpg.lifespan;
            const hasAge = typeof age === 'number' && Number.isSafeInteger(age) && age >= 0;
            const hasLifespan = typeof lifespan === 'number' && Number.isSafeInteger(lifespan) && lifespan >= 0;
            if (hasAge && hasLifespan) {
                realmHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewLifespan')}</span><span class="horae-rpg-overview-val">\${age}/\${lifespan}</span></div>\`;
            } else if (hasAge) {
                realmHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewAge')}</span><span class="horae-rpg-overview-val">\${age}</span></div>\`;
            } else if (hasLifespan) {
                realmHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewLifespanMax')}</span><span class="horae-rpg-overview-val">\${lifespan}</span></div>\`;
            }

            if (realmHtml) {
                html += \`<div class="horae-rpg-overview-section">\${realmHtml}</div>\`;
            }
        }

        // ── 神识（独立于神念，仅在 rpg.spirit 有效时显示）──
        const spirit = rpg.spirit;
        if (spirit && typeof spirit === 'object') {
            const tierRaw = spirit.tier;
            const xpRaw = spirit.xp;
            const hasTier = typeof tierRaw === 'string' && tierRaw.length > 0;
            const hasXp = typeof xpRaw === 'number' && Number.isSafeInteger(xpRaw) && xpRaw >= 0;

            if (hasTier || hasXp) {
                let valStr;
                if (hasTier && hasXp) {
                    valStr = \`\${tierRaw} · \${t('ui.rpgOverviewSpiritXp')} \${xpRaw}\`;
                } else if (hasTier) {
                    valStr = tierRaw;
                } else {
                    valStr = \`\${t('ui.rpgOverviewSpiritXp')} \${xpRaw}\`;
                }
                html += \`<div class="horae-rpg-overview-section"><div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewSpirit')}</span><span class="horae-rpg-overview-val">\${escapeHtml(valStr)}</span></div></div>\`;
            }
        }

        // ── 五维属性（缺失值显示 ?）──
        if (attrCfg.length > 0) {
            let attrHtml = '';
            for (const a of attrCfg) {
                const v = attrs[a.key];
                const vStr = (v === undefined || v === null) ? '?' : String(v);
                attrHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${escapeHtml(a.name)}</span><span class="horae-rpg-overview-val">\${escapeHtml(vStr)}</span></div>\`;
            }
            html += \`<div class="horae-rpg-overview-section">\${attrHtml}</div>\`;
        }

        html += '</div>';
        return html;
    }`;

const AFTER = `    function _buildOverviewHtml(name, rpg) {
        const attrs = rpg.attributes?.[name] || {};
        const attrCfg = settings.rpgAttributeConfig || [];

        let html = '<div class="horae-rpg-overview">';

        // ── 修为（仅在 rpg.realm.name 存在时显示；其余信息由卡片 header 胶囊承担）──
        if (rpg.realm && typeof rpg.realm === 'object'
            && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {
            if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
                const cur = rpg.cultivation[0];
                const max = rpg.cultivation[1];
                if (Number.isSafeInteger(cur) && Number.isSafeInteger(max)) {
                    html += \`<div class="horae-rpg-overview-section"><div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${t('ui.rpgOverviewCultivation')}</span><span class="horae-rpg-overview-val">\${cur}/\${max}</span></div></div>\`;
                }
            }
        }

        // ── 五维属性（缺失值显示 ?）──
        if (attrCfg.length > 0) {
            let attrHtml = '';
            for (const a of attrCfg) {
                const v = attrs[a.key];
                const vStr = (v === undefined || v === null) ? '?' : String(v);
                attrHtml += \`<div class="horae-rpg-overview-row"><span class="horae-rpg-overview-label">\${escapeHtml(a.name)}</span><span class="horae-rpg-overview-val">\${escapeHtml(vStr)}</span></div>\`;
            }
            html += \`<div class="horae-rpg-overview-section">\${attrHtml}</div>\`;
        }

        html += '</div>';
        return html;
    }`;

const r = applyReplace('P1 _buildOverviewHtml 精简', BEFORE, AFTER, `// ── 修为（仅在 rpg.realm.name 存在时显示；其余信息由卡片 header 胶囊承担）──`);
if (r === 1) changed++; else if (r === -1) failed++;

console.log('');
console.log('changed: ' + changed + ', failed: ' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up'); }

fs.writeFileSync(FILE, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('written ' + path.basename(FILE));

const r2 = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r2.status !== 0) { console.error('syntax error:\n' + r2.stderr); process.exit(2); }
console.log('syntax OK');