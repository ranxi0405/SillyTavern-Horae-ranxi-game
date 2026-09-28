#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { hm: path.join(ROOT, 'core/horaeManager.js') };
const SUFFIX = '.bak-before-b3b';
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

console.log('=== B3b: identity Prompt 注入 ===');
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

function applyPatch(content, name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ > 1) { console.error('  XX ' + name + ' (' + occ + ' matches)'); return { content, status: -1 }; }
    console.log('  OK ' + name);
    return { content: content.replace(before, after), status: 1 };
}

const NEW_METHOD = `    /** 生成"角色固有设定"段（从 chat[0].horae_meta.identity 读取，过 sanitize 过滤隐藏词） */
    _generateIdentitySection() {
        const id = this.getChat()?.[0]?.horae_meta?.identity;
        if (!id || isIdentityEmpty(id)) return '';

        const lang = this._getAiOutputLang();
        const isZh = lang === 'zh-CN' || lang === 'zh-TW';
        const L = (zh, en) => isZh ? zh : en;

        const lines = [];
        lines.push(isZh ? '\\n[角色固有设定]' : '\\n[Character Identity]');

        const pushField = (label, val) => {
            if (val === null || val === undefined) return;
            const safe = sanitizeHiddenKeywords(String(val));
            if (!safe || !safe.trim()) return;
            lines.push('· ' + label + ' = ' + safe);
        };
        const pushArray = (label, arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return;
            const safe = arr
                .map(x => sanitizeHiddenKeywords(String(x)))
                .filter(x => x && x.trim())
                .join(' / ');
            if (!safe) return;
            lines.push('· ' + label + ' = ' + safe);
        };

        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);
        pushArray(L('天赋', 'Talents'), id.talents);
        pushField(L('血脉', 'Bloodline'), id.bloodline);
        pushArray(L('初始功法', 'Innate Arts'), id.arts);
        pushField(L('出身', 'Background'), id.background);

        if (lines.length === 1) return '';
        return lines.join('\\n');
    }

`;

{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;
    let c = 0, f = 0;

    // P1: import
    {
        const before = `import { StateStore } from './memory/stateStore.js';\n`;
        const after  = `import { StateStore } from './memory/stateStore.js';\nimport { isIdentityEmpty } from './memory/identityStore.js';\nimport { sanitizeHiddenKeywords } from './memory/hiddenKeywords.js';\n`;
        const appliedCheck = `import { isIdentityEmpty } from './memory/identityStore.js';`;
        const r = applyPatch(content, 'B3b-P1 import', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P2: 新增方法插到 _generateFactsSection 之前
    {
        const before = `    /** 生成"已知事实"段（从 chat[0].horae_meta.facts 读取 active 条目） */\n    _generateFactsSection(relevantActors = null) {`;
        const after  = NEW_METHOD + `    /** 生成"已知事实"段（从 chat[0].horae_meta.facts 读取 active 条目） */\n    _generateFactsSection(relevantActors = null) {`;
        const appliedCheck = `_generateIdentitySection() {`;
        const r = applyPatch(content, 'B3b-P2 _generateIdentitySection 方法', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P3: 调用点插入
    {
        const before = `        // 已知事实（Facts）\n        const relevantActors = this._collectRelevantActors(state, userQuery);\n        const factsSection = this._generateFactsSection(relevantActors);`;
        const after  = `        // 角色固有设定（Identity）\n        const identitySection = this._generateIdentitySection();\n        if (identitySection) lines.push(identitySection);\n\n        // 已知事实（Facts）\n        const relevantActors = this._collectRelevantActors(state, userQuery);\n        const factsSection = this._generateFactsSection(relevantActors);`;
        const appliedCheck = `const identitySection = this._generateIdentitySection();`;
        const r = applyPatch(content, 'B3b-P3 Prompt 调用点', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (DRY_RUN) {
        console.log('DRY-RUN: ' + c + ' patch(es) 待应用, ' + f + ' 处锚点失败');
    } else if (f === 0) {
        backup(FILES.hm);
        writeNorm(FILES.hm, content, isCRLF);
        console.log('APPLIED: ' + c + ' patch(es) 写入 ' + path.basename(FILES.hm));
    } else {
        console.error('APPLY ABORTED: ' + f + ' 处锚点失败，未写入');
        process.exit(1);
    }
}

console.log('done.');
