#!/usr/bin/env node
/**
 * P4.3 Patch - identityView 补全 AI 视角 visibility 语义
 *
 * 目标文件：core/memory/identityView.js
 * 新增文件：tools/test-identityView-visibility.mjs
 *
 * 改动：
 *   - 新增内部函数 _hiddenPlaceholder(label, lang)
 *   - renderIdentityAiEntries 按 visibility 决定输出：
 *       public       -> value
 *       hidden       -> [隐藏{label}]
 *       discoverable -> revealedAt == null 时 [隐藏{label}]，否则 value
 *       gmOnly       -> isAiVisible 已过滤
 *
 * 用法：
 *   node tools/patch-p4.3-view-visibility.mjs --dry-run
 *   node tools/patch-p4.3-view-visibility.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityView.js');
const TEST_FILE = path.join(ROOT, 'tools/test-identityView-visibility.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCH_LABEL_OLD = `function _label(entry, lang, forAI = false) {
    if (isCoreKind(entry.kind)) {
        return forAI ? getKindAiLabel(entry.kind, lang) : getKindLabel(entry.kind, lang);
    }
    return getExtendedKindLabel(entry.kind, entry, lang, forAI);
}

/**
 * 解析 icon
 * @param {object} entry
 * @returns {string}
 */
function _icon(entry) {`;

const PATCH_LABEL_NEW = `function _label(entry, lang, forAI = false) {
    if (isCoreKind(entry.kind)) {
        return forAI ? getKindAiLabel(entry.kind, lang) : getKindLabel(entry.kind, lang);
    }
    return getExtendedKindLabel(entry.kind, entry, lang, forAI);
}

/**
 * 生成隐藏占位符（AI 视角）
 * 用于 visibility=hidden 或 discoverable 未揭示的条目。
 * 避免真值泄露，同时告知 AI 该字段存在但不可见。
 * @param {string} label
 * @param {string} lang
 * @returns {string}
 */
function _hiddenPlaceholder(label, lang) {
    if (lang === 'en') return '[Hidden: ' + label + ']';
    if (lang === 'ja') return '[非公開: ' + label + ']';
    if (lang === 'ko') return '[숨김: ' + label + ']';
    if (lang === 'ru') return '[Скрыто: ' + label + ']';
    if (lang === 'zh-TW') return '[隱藏' + label + ']';
    return '[隐藏' + label + ']';
}

/**
 * 解析 icon
 * @param {object} entry
 * @returns {string}
 */
function _icon(entry) {`;

const PATCH_AI_OLD = `export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    return sorted.map(e => {
        const label = _label(e, lang, true);
        const safe = sanitizeHiddenKeywords(String(e.value));
        return '· ' + label + ' = ' + safe;
    });
}`;

const PATCH_AI_NEW = `export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    return sorted.map(e => {
        const label = _label(e, lang, true);
        const visibility = e.visibility || 'public';

        // visibility 语义：
        //   public       -> 输出 value
        //   hidden       -> 占位，不泄露真值
        //   discoverable -> revealedAt == null 时占位，已揭示输出 value
        //   gmOnly       -> isAiVisible 已过滤，此处不会命中
        let displayValue;
        if (visibility === 'hidden') {
            displayValue = _hiddenPlaceholder(label, lang);
        } else if (visibility === 'discoverable' && e.revealedAt == null) {
            displayValue = _hiddenPlaceholder(label, lang);
        } else {
            displayValue = sanitizeHiddenKeywords(String(e.value));
        }

        return '· ' + label + ' = ' + displayValue;
    });
}`;

const PATCHES = [
    { id: 'label',    desc: '插入 _hiddenPlaceholder 辅助函数', match: PATCH_LABEL_OLD, replace: PATCH_LABEL_NEW },
    { id: 'aiRender', desc: 'renderIdentityAiEntries 补全 visibility 语义', match: PATCH_AI_OLD, replace: PATCH_AI_NEW },
];

const TEST_FILE_CONTENT = `import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView visibility 语义测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case1 public]');
    check('includes value 女', joined.includes('女'));
    check('no placeholder', !joined.includes('[隐藏'));
    console.log('');
}

// case2: hidden -> 占位，不泄露 value/display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', display: '四系伪灵根', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case2 hidden]');
    check('no leak (value)', !joined.includes('无界灵根'));
    check('no leak (display)', !joined.includes('四系伪灵根'));
    check('has placeholder', joined.includes('[隐藏'));
    console.log('');
}

// case3: discoverable 未揭示 -> 占位
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case3 discoverable 未揭示]');
    check('no leak', !joined.includes('无界灵根'));
    check('has placeholder', joined.includes('[隐藏'));
    console.log('');
}

// case4: discoverable 已揭示 -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case4 discoverable 已揭示]');
    check('includes value', joined.includes('无界灵根'));
    check('no placeholder', !joined.includes('[隐藏'));
    console.log('');
}

// case5: gmOnly -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: '逆天改命', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case5 gmOnly]');
    check('rows length = 0', rows.length === 0);
    check('no leak', !rows.join('\\n').includes('逆天改命'));
    console.log('');
}

// case6: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: '无界道体', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'bloodline', value: '凡人血脉', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } },
        { id: 'e5', kind: 'goldenFinger', value: '逆天改命', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case6 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden 无界灵根 不泄露', !joined.includes('无界灵根'));
    check('discoverable 未揭示 无界道体 不泄露', !joined.includes('无界道体'));
    check('discoverable 已揭示 凡人血脉 存在', joined.includes('凡人血脉'));
    check('gmOnly 逆天改命 不出现', !joined.includes('逆天改命'));
    console.log('');
}

// case7: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id, { lang: 'en' }).join('\\n');
    console.log('[case7 lang=en]');
    check('no leak', !joined.includes('无界灵根'));
    check('has [Hidden:', joined.includes('[Hidden:'));
    console.log('');
}

// case8: value=null -> 被 isAiVisible 过滤
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: '无界灵根', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case8 value=null]');
    check('rows length = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('无界灵根'));
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

console.log('=== P4.3 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }

const content = fs.readFileSync(TARGET, 'utf8');
const stats = [];
let failed = null;

for (const p of PATCHES) {
    const count = countOccurrences(content, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(9) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" match failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}

let next = content;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - content.length;

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;

console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE);
console.log('  exists: ' + testExists + (testSame ? ' (identical, will skip)' : ''));
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);

if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE + (testExists ? ' (overwritten)' : ' (created)'));
} else {
    console.log('[skip]  ' + TEST_FILE + ' (identical)');
}

console.log('');
console.log('done.');
