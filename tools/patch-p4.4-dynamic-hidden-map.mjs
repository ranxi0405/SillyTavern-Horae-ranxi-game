#!/usr/bin/env node
/**
 * P4.4 Patch - HIDDEN_MAP 动态化
 *
 * 目标文件：
 *   - core/memory/hiddenKeywords.js  (整文件重写)
 *   - index.js                       (import + _loadIdentityFromCard 两处)
 * 新增文件：
 *   - tools/test-p4.4-hidden-map.mjs
 *
 * 用法：
 *   node tools/patch-p4.4-dynamic-hidden-map.mjs --dry-run
 *   node tools/patch-p4.4-dynamic-hidden-map.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_HIDDEN = path.join(ROOT, 'core/memory/hiddenKeywords.js');
const TARGET_INDEX  = path.join(ROOT, 'index.js');
const TEST_FILE     = path.join(ROOT, 'tools/test-p4.4-hidden-map.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const HIDDEN_OLD = `/**
 * Horae HiddenKeywords v0.1
 *
 * 职责：
 *   - 集中管理"仅天道知晓"的隐藏设定关键词
 *   - 提供 sanitize 函数：把隐藏词替换为占位符
 *   - 用于注入 Prompt 前的过滤（不修改存储层）
 *
 * 设计原则：
 *   - 存储层保持原文（玩家 UI 可看完整）
 *   - 注入层替换（AI 看不到具体名称）
 *   - 未来新增隐藏设定：只在 HIDDEN_MAP 里加一条
 */

export const HIDDEN_MAP = {
    '无界灵根': '[隐藏灵根]',
    '无界道体': '[隐藏体质]',
};

/**
 * 把文本中的隐藏关键词替换为占位符
 * @param {string} text
 * @returns {string}
 */
export function sanitizeHiddenKeywords(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    for (const [kw, rep] of Object.entries(HIDDEN_MAP)) {
        if (out.includes(kw)) {
            out = out.split(kw).join(rep);
        }
    }
    return out;
}

/**
 * 检测文本是否包含隐藏关键词
 * @param {string} text
 * @returns {boolean}
 */
export function containsHiddenKeywords(text) {
    if (!text || typeof text !== 'string') return false;
    return Object.keys(HIDDEN_MAP).some(kw => text.includes(kw));
}`;

const HIDDEN_NEW = `/**
 * Horae HiddenKeywords v0.2
 *
 * 职责：
 *   - 提供 sanitize 函数：把隐藏词替换为占位符
 *   - 隐藏词由当前角色卡提供（extensions.horae.hiddenKeywords）
 *
 * 设计原则：
 *   - 通用系统不硬编码任何具体角色秘密
 *   - 通过 setActiveHiddenMap 在 CHAT_CHANGED / 卡加载时刷新
 */

// 默认空 map（历史兼容保留）
export const HIDDEN_MAP = {};

// 模块级 active map
let _activeMap = {};

function _normalizeMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    for (const [kw, rep] of Object.entries(map)) {
        if (typeof kw !== 'string' || !kw.trim()) continue;
        if (typeof rep !== 'string' || !rep) continue;
        out[kw] = rep;
    }
    return out;
}

export function setActiveHiddenMap(map) {
    _activeMap = _normalizeMap(map);
}

export function getActiveHiddenMap() {
    return { ..._activeMap };
}

export function sanitizeHiddenKeywords(text, mapOverride) {
    if (!text || typeof text !== 'string') return text;
    const map = (mapOverride && typeof mapOverride === 'object' && !Array.isArray(mapOverride))
        ? _normalizeMap(mapOverride)
        : _activeMap;
    let out = text;
    for (const [kw, rep] of Object.entries(map)) {
        if (out.includes(kw)) {
            out = out.split(kw).join(rep);
        }
    }
    return out;
}

export function containsHiddenKeywords(text, mapOverride) {
    if (!text || typeof text !== 'string') return false;
    const map = (mapOverride && typeof mapOverride === 'object' && !Array.isArray(mapOverride))
        ? _normalizeMap(mapOverride)
        : _activeMap;
    return Object.keys(map).some(kw => text.includes(kw));
}`;

const INDEX_IMPORT_OLD = `import { sanitizeHiddenKeywords } from './core/memory/hiddenKeywords.js';`;
const INDEX_IMPORT_NEW = `import { sanitizeHiddenKeywords, setActiveHiddenMap } from './core/memory/hiddenKeywords.js';`;

const INDEX_LOAD_OLD = `function _loadIdentityFromCard() {
    const r = _readCardIdentity();
    if (!r.ok) {
        _cacheIdentityToChat(null);
        console.log('[Horae][B3a] identity 读取失败:', r.reason);
        return r;
    }
    _cacheIdentityToChat(r.identity);
    console.log('[Horae][B3a] identity 已缓存:', r.identity);
    return r;
}`;

const INDEX_LOAD_NEW = `function _loadIdentityFromCard() {
    const r = _readCardIdentity();
    if (!r.ok) {
        _cacheIdentityToChat(null);
        console.log('[Horae][B3a] identity 读取失败:', r.reason);
        _loadHiddenKeywordsFromCard();
        return r;
    }
    _cacheIdentityToChat(r.identity);
    _loadHiddenKeywordsFromCard();
    console.log('[Horae][B3a] identity 已缓存:', r.identity);
    return r;
}

function _loadHiddenKeywordsFromCard() {
    try {
        const ctx = getContext();
        const charId = ctx?.characterId;
        if (charId == null) {
            setActiveHiddenMap({});
            return;
        }
        const char = ctx.characters?.[charId];
        const map = char?.data?.extensions?.horae?.hiddenKeywords;
        setActiveHiddenMap(map || {});
    } catch (e) {
        console.warn('[Horae] 加载 hiddenKeywords 失败:', e);
        setActiveHiddenMap({});
    }
}`;

const TEST_FILE_CONTENT = `import {
    HIDDEN_MAP,
    setActiveHiddenMap,
    getActiveHiddenMap,
    sanitizeHiddenKeywords,
    containsHiddenKeywords,
} from '../core/memory/hiddenKeywords.js';

console.log('=== P4.4 hiddenKeywords 动态 map 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1
{
    console.log('[case1 HIDDEN_MAP 默认空]');
    check('HIDDEN_MAP 是空对象', Object.keys(HIDDEN_MAP).length === 0);
    console.log('');
}

// case2
{
    setActiveHiddenMap({});
    const input = '无界灵根';
    const out = sanitizeHiddenKeywords(input);
    console.log('[case2 默认空 map]');
    check('文本未替换', out === input);
    console.log('');
}

// case3
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const out = sanitizeHiddenKeywords('我的灵根是 无界灵根');
    console.log('[case3 setActiveHiddenMap 后替换]');
    check('无界灵根 被替换', out.includes('[隐藏灵根]'));
    check('原词不再出现', !out.includes('无界灵根'));
    console.log('');
}

// case4
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    setActiveHiddenMap({});
    const out = sanitizeHiddenKeywords('无界灵根');
    console.log('[case4 清空]');
    check('无界灵根 不再被替换', out === '无界灵根');
    console.log('');
}

// case5
{
    setActiveHiddenMap({ 'x': 'y' });
    setActiveHiddenMap(null);
    const out = sanitizeHiddenKeywords('x');
    console.log('[case5 null 清空]');
    check('x 不再被替换', out === 'x');
    console.log('');
}

// case6
{
    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap(42);
    const out = sanitizeHiddenKeywords('a');
    console.log('[case6 非法输入]');
    check('42 不报错且清空', out === 'a');

    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap('string');
    const out2 = sanitizeHiddenKeywords('a');
    check('string 不报错且清空', out2 === 'a');

    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap([1, 2, 3]);
    const out3 = sanitizeHiddenKeywords('a');
    check('array 不报错且清空', out3 === 'a');
    console.log('');
}

// case7
{
    setActiveHiddenMap({ '': 'x', 'a': 42, 'b': 'ok' });
    const got = getActiveHiddenMap();
    console.log('[case7 过滤非法条目]');
    check('只保留 b', Object.keys(got).length === 1 && got.b === 'ok');
    console.log('');
}

// case8
{
    setActiveHiddenMap({ 'a': 'A' });
    const out = sanitizeHiddenKeywords('a b', { 'b': 'B' });
    console.log('[case8 mapOverride]');
    check('使用 override', out === 'a B');
    console.log('');
}

// case9
{
    setActiveHiddenMap({ 'secret': '[X]' });
    console.log('[case9 containsHiddenKeywords]');
    check('包含返回 true', containsHiddenKeywords('has secret') === true);
    check('不包含返回 false', containsHiddenKeywords('nothing') === false);
    setActiveHiddenMap({});
    check('清空后返回 false', containsHiddenKeywords('has secret') === false);
    console.log('');
}

// case10
{
    setActiveHiddenMap({
        '无界灵根': '[隐藏灵根]',
        '无界道体': '[隐藏体质]',
    });
    const out = sanitizeHiddenKeywords('灵根=无界灵根，体质=无界道体');
    console.log('[case10 多关键词]');
    check('两个都替换', out.includes('[隐藏灵根]') && out.includes('[隐藏体质]'));
    console.log('');
}

setActiveHiddenMap({});

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

console.log('=== P4.4 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [TARGET_HIDDEN, TARGET_INDEX]) {
    if (!fs.existsSync(f)) { console.error('XX target missing: ' + f); process.exit(1); }
}

const hiddenSrc = fs.readFileSync(TARGET_HIDDEN, 'utf8');
const indexSrc  = fs.readFileSync(TARGET_INDEX, 'utf8');

const stats = [];
let failed = null;

{
    const count = countOccurrences(hiddenSrc, HIDDEN_OLD);
    const ok = count === 1;
    stats.push({ id: 'hidden-file', desc: 'hiddenKeywords.js 整文件重写', count, ok });
    if (!ok && !failed) failed = { id: 'hidden-file', desc: 'hiddenKeywords.js 整文件重写', count };
}
{
    const count = countOccurrences(indexSrc, INDEX_IMPORT_OLD);
    const ok = count === 1;
    stats.push({ id: 'index-import', desc: 'index.js import 加 setActiveHiddenMap', count, ok });
    if (!ok && !failed) failed = { id: 'index-import', desc: 'index.js import 加 setActiveHiddenMap', count };
}
{
    const count = countOccurrences(indexSrc, INDEX_LOAD_OLD);
    const ok = count === 1;
    stats.push({ id: 'index-load', desc: 'index.js _loadIdentityFromCard 挂 hiddenKeywords', count, ok });
    if (!ok && !failed) failed = { id: 'index-load', desc: 'index.js _loadIdentityFromCard 挂 hiddenKeywords', count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(13) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" match failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}

const nextHidden = hiddenSrc.replace(HIDDEN_OLD, HIDDEN_NEW);
let nextIndex = indexSrc.replace(INDEX_IMPORT_OLD, INDEX_IMPORT_NEW);
nextIndex = nextIndex.replace(INDEX_LOAD_OLD, INDEX_LOAD_NEW);

console.log('targets:');
console.log('  ' + TARGET_HIDDEN);
console.log('    delta: ' + (nextHidden.length - hiddenSrc.length) + ' bytes');
console.log('  ' + TARGET_INDEX);
console.log('    delta: ' + (nextIndex.length - indexSrc.length) + ' bytes');
console.log('  test : ' + TEST_FILE);

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('    exists: ' + testExists + (testSame ? ' (identical, will skip)' : ''));
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET_HIDDEN, nextHidden, 'utf8');
console.log('[write] ' + TARGET_HIDDEN);

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
