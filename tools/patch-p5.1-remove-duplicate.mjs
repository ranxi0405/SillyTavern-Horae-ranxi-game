#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_HM = path.join(ROOT, 'core/horaeManager.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p5.1-no-duplicate.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const IMP_OLD = `import { StateStore } from './memory/stateStore.js';
import { isIdentityEmpty } from './memory/identityStore.js';
import { sanitizeHiddenKeywords } from './memory/hiddenKeywords.js';`;

const IMP_NEW = `import { StateStore } from './memory/stateStore.js';`;

const CALL_OLD = `        // 角色固有设定（Identity）
        const identitySection = this._generateIdentitySection();
        if (identitySection) lines.push(identitySection);

        // 已知事实（Facts）`;

const CALL_NEW = `        // 已知事实（Facts）`;

const FN_OLD = `    /** 生成"角色固有设定"段（从 chat[0].horae_meta.identity 读取，过 sanitize 过滤隐藏词） */
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

        pushField(L('性别', 'Gender'), id.gender);
        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);
        pushField(L('仙姿', 'Xian Zi'), id.xianZi);
        pushArray(L('天赋', 'Talents'), id.talents);
        pushField(L('血脉', 'Bloodline'), id.bloodline);
        pushField(L('出身', 'Background'), id.background);

        if (lines.length === 1) return '';
        return lines.join('\\n');
    }

`;

const FN_NEW = ``;

const PATCHES = [
    { id: 'imp',  desc: '删 import',    match: IMP_OLD,  replace: IMP_NEW },
    { id: 'call', desc: '删调用点',     match: CALL_OLD, replace: CALL_NEW },
    { id: 'fn',   desc: '删函数定义',   match: FN_OLD,   replace: FN_NEW },
];

const TEST_FILE_CONTENT = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
console.log('=== P5.1 去重验证 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const hm = read('core/horaeManager.js');
const idx = read('index.js');
const view = read('core/memory/identityView.js');
check('hm 无 _generateIdentitySection 定义', !hm.includes('_generateIdentitySection()'));
check('hm 无 _generateIdentitySection 调用', !hm.includes('this._generateIdentitySection'));
check('hm 无 [角色固有设定] header', !hm.includes('[角色固有设定]'));
check('hm 无 import isIdentityEmpty', !hm.includes("import { isIdentityEmpty }"));
check('hm 无 import sanitizeHiddenKeywords', !hm.includes("import { sanitizeHiddenKeywords }"));
check('index 有 renderIdentityAiSection import', idx.includes('import { renderIdentityAiSection }'));
check('index 有 renderIdentityAiSection 调用', idx.includes('renderIdentityAiSection('));
check('view 有 renderIdentityAiSection 导出', view.includes('export function renderIdentityAiSection'));
check('view 有 _sectionHeader', view.includes('function _sectionHeader'));
check('index 仍 import sanitizeHiddenKeywords', idx.includes('sanitizeHiddenKeywords'));
console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P5.1 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');
if (!fs.existsSync(TARGET_HM)) { console.error('XX target missing'); process.exit(1); }
const src = fs.readFileSync(TARGET_HM, 'utf8');
const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(src, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(5) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - src.length;
let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('target : ' + TARGET_HM);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE + ' exists=' + testExists);
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET_HM, next, 'utf8');
console.log('[write] ' + TARGET_HM);
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
