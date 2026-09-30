#!/usr/bin/env node
/**
 * P5 Patch - identity AI section 注入 Prompt
 *
 * 目标文件：
 *   - core/memory/identityView.js  (新增 renderIdentityAiSection + _sectionHeader)
 *   - index.js                     (import + onPromptReady 拼接)
 * 新增文件：
 *   - tools/test-p5-identity-section.mjs
 *
 * 设计：
 *   - identity 段放 dataPrompt 之前（固有设定稳定，缓存友好）
 *   - 空 identity 返回 ''，不产生空段落
 *   - 走 renderIdentityAiEntries，AI 天道视角，hidden 只占位不泄露
 *
 * 用法：
 *   node tools/patch-p5-prompt.mjs --dry-run
 *   node tools/patch-p5-prompt.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_VIEW  = path.join(ROOT, 'core/memory/identityView.js');
const TARGET_INDEX = path.join(ROOT, 'index.js');
const TEST_FILE    = path.join(ROOT, 'tools/test-p5-identity-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── A. identityView.js 新增函数 ──

const VIEW_OLD = `        } else {
            displayValue = sanitizeHiddenKeywords(String(e.value));
        }

        return '· ' + label + ' = ' + displayValue;
    });
}`;

const VIEW_NEW = `        } else {
            displayValue = sanitizeHiddenKeywords(String(e.value));
        }

        return '· ' + label + ' = ' + displayValue;
    });
}

/**
 * 生成 AI Prompt 的 identity 段（含 header）
 * 与 renderIdentityAiEntries 的区别：本函数返回可直接注入 Prompt 的完整字符串，
 * 空 identity / 无可见条目时返回 ''，由调用方决定是否拼接。
 * @param {object} id
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @returns {string}
 */
export function renderIdentityAiSection(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const rows = renderIdentityAiEntries(id, { lang });
    if (!Array.isArray(rows) || rows.length === 0) return '';
    return _sectionHeader(lang) + '\\n' + rows.join('\\n');
}

/**
 * identity section 的 header（多语言）
 * @param {string} lang
 * @returns {string}
 */
function _sectionHeader(lang) {
    if (lang === 'en') return '[Character Identity]';
    if (lang === 'ja') return '[キャラクター固有設定]';
    if (lang === 'ko') return '[캐릭터 고유 설정]';
    if (lang === 'ru') return '[Идентичность персонажа]';
    if (lang === 'zh-TW') return '[角色固有設定]';
    return '[角色固有设定]';
}`;

// ── B. index.js import ──

const INDEX_IMPORT_OLD = `import { sanitizeHiddenKeywords, setActiveHiddenMap } from './core/memory/hiddenKeywords.js';`;

const INDEX_IMPORT_NEW = `import { sanitizeHiddenKeywords, setActiveHiddenMap } from './core/memory/hiddenKeywords.js';
import { renderIdentityAiSection } from './core/memory/identityView.js';`;

// ── C. index.js dataPrompt 区 ──

const INDEX_DATAPROMPT_OLD = `        const dataPrompt = sanitizeHiddenKeywords(_rawSplit.mainPrompt);
        const timelinePrompt = sanitizeHiddenKeywords(_rawSplit.timelinePrompt);

        let recallPrompt = '';`;

const INDEX_DATAPROMPT_NEW = `        const dataPrompt = sanitizeHiddenKeywords(_rawSplit.mainPrompt);
        const timelinePrompt = sanitizeHiddenKeywords(_rawSplit.timelinePrompt);

        // P5: AI 天道视角 identity 段（角色固有设定，稳定内容，放在 dataPrompt 前）
        const _identityAiSection = renderIdentityAiSection(
            chat?.[0]?.horae_meta?.identity,
            { lang: horaeManager._getAiOutputLang() }
        );
        const dataPromptWithIdentity = _identityAiSection
            ? \`\${_identityAiSection}\\n\\n\${dataPrompt}\`
            : dataPrompt;

        let recallPrompt = '';`;

// ── D. index.js dynamicPrompt 构造 ──

const INDEX_DYNAMIC_OLD = `const dynamicPrompt = recallPrompt
    ? \`\${dataPrompt}\\n\${recallPrompt}\`
    : dataPrompt;`;

const INDEX_DYNAMIC_NEW = `const dynamicPrompt = recallPrompt
    ? \`\${dataPromptWithIdentity}\\n\${recallPrompt}\`
    : dataPromptWithIdentity;`;

const PATCHES = [
    { id: 'view-fn',     desc: 'identityView.js 新增 renderIdentityAiSection', match: VIEW_OLD,             replace: VIEW_NEW },
    { id: 'index-imp',   desc: 'index.js import 加 renderIdentityAiSection',   match: INDEX_IMPORT_OLD,     replace: INDEX_IMPORT_NEW },
    { id: 'index-data',  desc: 'index.js dataPrompt 后拼 identity 段',         match: INDEX_DATAPROMPT_OLD, replace: INDEX_DATAPROMPT_NEW },
    { id: 'index-dyn',   desc: 'index.js dynamicPrompt 用 dataPromptWithIdentity', match: INDEX_DYNAMIC_OLD, replace: INDEX_DYNAMIC_NEW },
];

// ── E. 测试文件 ──

const TEST_FILE_CONTENT = `import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: null / undefined / 空
{
    console.log('[case1 null / 空]');
    check('null -> ""', renderIdentityAiSection(null) === '');
    check('undefined -> ""', renderIdentityAiSection(undefined) === '');
    check('空 entries -> ""', renderIdentityAiSection(mkId([])) === '');
    console.log('');
}

// case2: public -> 出现 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case2 public]');
    check('含 header', s.includes('[角色固有设定]'));
    check('含 label 性别', s.includes('性别'));
    check('含 value 女', s.includes('女'));
    console.log('');
}

// case3: hidden -> 占位，不泄露 value / display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden]');
    check('不泄漏 value', !s.includes('TEST_SECRET_A'));
    check('不泄漏 display', !s.includes('TEST_DISPLAY_A'));
    check('含占位', s.includes('[隐藏'));
    console.log('');
}

// case4: discoverable 未揭示 -> 占位
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_B', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 discoverable 未揭示]');
    check('不泄漏', !s.includes('TEST_SECRET_B'));
    check('含占位', s.includes('[隐藏'));
    console.log('');
}

// case5: discoverable 已揭示 -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_C', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 discoverable 已揭示]');
    check('含 value', s.includes('TEST_SECRET_C'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case6: gmOnly -> 完全为空
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'TEST_GM_X', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 gmOnly]');
    check('返回 ""', s === '');
    check('不泄漏', !s.includes('TEST_GM_X'));
    console.log('');
}

// case7: lang=en header
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case7 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
    console.log('');
}

// case8: lang=en + hidden -> [Hidden: ...]
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SECRET_EN', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case8 lang=en hidden]');
    check('不泄漏', !s.includes('SECRET_EN'));
    check('含 [Hidden:', s.includes('[Hidden:'));
    console.log('');
}

// case9: lang=ja header
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'ja' });
    console.log('[case9 lang=ja]');
    check('含 キャラクター固有設定', s.includes('キャラクター固有設定'));
    console.log('');
}

// case10: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_MIX_HIDDEN', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'TEST_MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case10 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden 不泄漏', !s.includes('TEST_MIX_HIDDEN'));
    check('gmOnly 不出现', !s.includes('TEST_MIX_GM'));
    check('含 header', s.includes('[角色固有设定]'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(haystack, needle) {
    let n = 0, i = 0;
    while (true) {
        const j = haystack.indexOf(needle, i);
        if (j === -1) break;
        n++; i = j + needle.length;
    }
    return n;
}

console.log('=== P5 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [TARGET_VIEW, TARGET_INDEX]) {
    if (!fs.existsSync(f)) { console.error('XX target missing: ' + f); process.exit(1); }
}

const viewSrc  = fs.readFileSync(TARGET_VIEW, 'utf8');
const indexSrc = fs.readFileSync(TARGET_INDEX, 'utf8');

const stats = [];
let failed = null;

// view 文件检查
{
    const p = PATCHES[0];
    const count = countOccurrences(viewSrc, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
// index 文件检查
for (let i = 1; i < PATCHES.length; i++) {
    const p = PATCHES[i];
    const count = countOccurrences(indexSrc, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(12) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" match failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}

let nextView = viewSrc.replace(PATCHES[0].match, PATCHES[0].replace);
let nextIndex = indexSrc;
for (let i = 1; i < PATCHES.length; i++) {
    nextIndex = nextIndex.replace(PATCHES[i].match, PATCHES[i].replace);
}

console.log('targets:');
console.log('  ' + TARGET_VIEW);
console.log('    delta: ' + (nextView.length - viewSrc.length) + ' bytes');
console.log('  ' + TARGET_INDEX);
console.log('    delta: ' + (nextIndex.length - indexSrc.length) + ' bytes');
console.log('  test : ' + TEST_FILE);

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('    exists: ' + testExists + (testSame ? ' (identical, will skip)' : ''));
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET_VIEW, nextView, 'utf8');
console.log('[write] ' + TARGET_VIEW);

fs.writeFileSync(TARGET_INDEX, nextIndex, 'utf8');
console.log('[write] ' + TARGET_INDEX);

if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE + (testExists ? ' (overwritten)' : ' (created)'));
} else {
    console.log('[skip]  ' + TEST_FILE + ' (identical)');
}

console.log('');
console.log('done.');
