#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix:  path.join(ROOT, 'index.js'),
    css: path.join(ROOT, 'assets/styles/style.css'),
};
const SUFFIX = '.bak-before-b3c2c-visual2';
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

console.log('=== B3c-2c-visual-2: 六艺段位色阶 + 新数值表 + 六品上限 ===');
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
// P1: index.js — 数值表 + helper + _buildArtsRow 改造
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    // P1a: _ART_GRADE_RANGES 新数值表 + 两个 helper
    {
        const before = `    const _ART_GRADE_RANGES = [
        { min: 0, max: 20 },
        { min: 21, max: 100 },
        { min: 101, max: 500 },
        { min: 501, max: 3000 },
        { min: 3001, max: 8000 },
        { min: 8001, max: 30000 },
        { min: 30001, max: Infinity },
    ];
    function _buildArtsHtml(name, rpg) {`;
        const after = `    const _ART_GRADE_RANGES = [
        { min: 0, max: 100 },
        { min: 101, max: 500 },
        { min: 501, max: 2000 },
        { min: 2001, max: 6000 },
        { min: 6001, max: 12000 },
        { min: 12001, max: 22000 },
        { min: 22001, max: 36000 },
    ];
    /** 六品封顶值（达到后不再显示上限数值，进度视为圆满） */
    const _ART_GRADE_CAP = 36000;
    /** tier 容错规范化 */
    function _normalizeTier(tier) {
        if (!tier || typeof tier !== 'string') return null;
        const t = tier.trim();
        if (!t) return null;
        if (/丹道[·•\\-_.\\s]?天成/.test(t)) return '丹道·天成';
        if (/丹道[·•\\-_.\\s]?化境/.test(t)) return '丹道·化境';
        if (/丹道[·•\\-_.\\s]?无极/.test(t)) return '丹道·无极';
        if (t === '学徒' || t === '未入门') return t;
        if (/^[一二三四五六]品$/.test(t)) return t;
        return t;
    }
    /** tier → CSS class 后缀（用于色阶） */
    function _resolveTierClass(tierNorm) {
        if (!tierNorm) return 'default';
        if (tierNorm === '未入门') return 'untrained';
        if (tierNorm === '学徒') return 'apprentice';
        if (tierNorm === '一品') return 'tier1';
        if (tierNorm === '二品') return 'tier2';
        if (tierNorm === '三品') return 'tier3';
        if (tierNorm === '四品') return 'tier4';
        if (tierNorm === '五品') return 'tier5';
        if (tierNorm === '六品') return 'tier6';
        if (tierNorm === '丹道·天成') return 'dao-tian';
        if (tierNorm === '丹道·化境') return 'dao-hua';
        if (tierNorm === '丹道·无极') return 'dao-wuji';
        return 'default';
    }
    function _buildArtsHtml(name, rpg) {`;
        const appliedCheck = `const _ART_GRADE_CAP = 36000;`;
        const r = applyPatch(content, 'V2-P1a 数值表 + helper', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    // P1b: _buildArtsRow 改造
    {
        const beforeRow = `        const _buildArtsRow = (icon, label, data) => {
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

        const afterRow = `        const _buildArtsRow = (icon, label, data) => {
            if (!data) {
                return \`<div class="horae-rpg-arts-row">\`
                     + \`<i class="fa-solid \${icon} horae-rpg-arts-icon"></i>\`
                     + \`<span class="horae-rpg-arts-label">\${escapeHtml(label)}</span>\`
                     + \`<div class="horae-rpg-arts-bar"></div>\`
                     + \`<span class="horae-rpg-arts-tier horae-rpg-arts-tier--untrained">\${escapeHtml(untrained)}</span>\`
                     + \`<span class="horae-rpg-arts-val">——</span>\`
                     + \`</div>\`;
            }
            const _tierNorm = _normalizeTier(data.tier);
            const _tierClass = _resolveTierClass(_tierNorm);
            const _isDao = _tierClass.indexOf('dao-') === 0;
            const _xp = (typeof data.xp === 'number') ? data.xp : null;

            let pct = 0;
            let valStr = '';
            if (_isDao) {
                pct = 100;
                valStr = (_xp != null) ? String(_xp) : '—';
            } else if (_xp == null) {
                valStr = '';
            } else if (_xp >= _ART_GRADE_CAP) {
                // 达到六品封顶后：满条 + 不显示上限数值
                pct = 100;
                valStr = String(_xp);
            } else {
                let seg = null;
                for (let gi = 0; gi < _ART_GRADE_RANGES.length; gi++) {
                    const g = _ART_GRADE_RANGES[gi];
                    if (_xp >= g.min && _xp <= g.max) { seg = g; break; }
                }
                if (seg) {
                    pct = Math.min(100, Math.round(_xp / seg.max * 100));
                    valStr = _xp + '/' + seg.max;
                } else {
                    valStr = String(_xp);
                }
            }
            const _tierShow = _tierNorm || data.tier || '';
            return \`<div class="horae-rpg-arts-row">\`
                 + \`<i class="fa-solid \${icon} horae-rpg-arts-icon"></i>\`
                 + \`<span class="horae-rpg-arts-label">\${escapeHtml(label)}</span>\`
                 + \`<div class="horae-rpg-arts-bar"><div class="horae-rpg-arts-bar-fill horae-rpg-arts-bar-fill--\${_tierClass}" style="width:\${pct}%"></div></div>\`
                 + \`<span class="horae-rpg-arts-tier horae-rpg-arts-tier--\${_tierClass}">\${escapeHtml(_tierShow)}</span>\`
                 + \`<span class="horae-rpg-arts-val">\${escapeHtml(valStr)}</span>\`
                 + \`</div>\`;
        };`;

        const appliedCheck = `horae-rpg-arts-bar-fill--\${_tierClass}`;
        const r = applyPatch(content, 'V2-P1b _buildArtsRow 改造', beforeRow, afterRow, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) { backup(FILES.ix); writeNorm(FILES.ix, content, isCRLF); console.log('  APPLIED: index.js'); }
}

// ══════════════════════════════════════════════
// P2: CSS 色阶
// ══════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.css);
    const before = `.horae-rpg-arts-tier--trained {
    background: rgba(124, 58, 237, 0.18);
    color: var(--horae-primary-light);
}`;
    const after = before + `

/* B3c-2c-visual-2: 六艺段位色阶 + 丹道三阶 */
.horae-rpg-arts-bar-fill--untrained  { background: #6b7280; }
.horae-rpg-arts-bar-fill--apprentice { background: #94a3b8; }
.horae-rpg-arts-bar-fill--tier1  { background: #10b981; }
.horae-rpg-arts-bar-fill--tier2  { background: #3b82f6; }
.horae-rpg-arts-bar-fill--tier3  { background: #7c3aed; }
.horae-rpg-arts-bar-fill--tier4  { background: #f59e0b; }
.horae-rpg-arts-bar-fill--tier5  { background: #f97316; }
.horae-rpg-arts-bar-fill--tier6  { background: #ef4444; }
.horae-rpg-arts-bar-fill--dao-tian { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.horae-rpg-arts-bar-fill--dao-hua  { background: linear-gradient(90deg, #7c3aed, #f59e0b); }
.horae-rpg-arts-bar-fill--dao-wuji { background: linear-gradient(90deg, #fbbf24, #e5e7eb, #a78bfa); }
.horae-rpg-arts-bar-fill--default { background: var(--horae-primary); }

.horae-rpg-arts-tier--untrained  { background: rgba(107, 114, 128, 0.15); color: #94a3b8; }
.horae-rpg-arts-tier--apprentice { background: rgba(148, 163, 184, 0.18); color: #cbd5e1; }
.horae-rpg-arts-tier--tier1 { background: rgba(16, 185, 129, 0.18); color: #34d399; }
.horae-rpg-arts-tier--tier2 { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
.horae-rpg-arts-tier--tier3 { background: rgba(124, 58, 237, 0.18); color: #a78bfa; }
.horae-rpg-arts-tier--tier4 { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.horae-rpg-arts-tier--tier5 { background: rgba(249, 115, 22, 0.18); color: #fb923c; }
.horae-rpg-arts-tier--tier6 { background: rgba(239, 68, 68, 0.18); color: #f87171; }
.horae-rpg-arts-tier--dao-tian { background: rgba(245, 158, 11, 0.25); color: #fbbf24; font-weight: 700; }
.horae-rpg-arts-tier--dao-hua  { background: linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(245, 158, 11, 0.25)); color: #fbbf24; font-weight: 700; }
.horae-rpg-arts-tier--dao-wuji { background: linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(167, 139, 250, 0.25)); color: #e5e7eb; font-weight: 700; letter-spacing: 0.5px; }
.horae-rpg-arts-tier--default { background: rgba(255, 255, 255, 0.06); color: var(--horae-text-muted); }`;

    const r = applyPatch(raw, 'V2-P2 CSS 段位色阶 + 丹道', before, after, `.horae-rpg-arts-bar-fill--dao-wuji {`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.css); writeNorm(FILES.css, r.content, isCRLF); console.log('  APPLIED: style.css'); }
    else if (r.status === -1) failed++;
}

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, nothing written.'); process.exit(0); }
console.log('ALL APPLIED.');
