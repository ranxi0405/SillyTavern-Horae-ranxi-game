#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityView.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p7.3-npc-rows.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const IMP_OLD = `import { sanitizeHiddenKeywords } from './hiddenKeywords.js';`;

const IMP_NEW = `import { sanitizeHiddenKeywords } from './hiddenKeywords.js';
import { hasKnown } from './npcKnowledge.js';`;

const APPEND_OLD = `function _sectionHeader(lang) {
    if (lang === 'en') return '[Character Identity]';
    if (lang === 'ja') return '[キャラクター固有設定]';
    if (lang === 'ko') return '[캐릭터 고유 설정]';
    if (lang === 'ru') return '[Идентичность персонажа]';
    if (lang === 'zh-TW') return '[角色固有設定]';
    return '[角色固有设定]';
}`;

const APPEND_NEW = `function _sectionHeader(lang) {
    if (lang === 'en') return '[Character Identity]';
    if (lang === 'ja') return '[キャラクター固有設定]';
    if (lang === 'ko') return '[캐릭터 고유 설정]';
    if (lang === 'ru') return '[Идентичность персонажа]';
    if (lang === 'zh-TW') return '[角色固有設定]';
    return '[角色固有设定]';
}

/**
 * 渲染 NPC 视角 rows（按 npcKnowledge 过滤）
 *
 * 与 renderIdentityAiEntries 的区别：
 *   - AI 是天道视角：hidden 一律占位
 *   - NPC 只有 known 才看得到；hidden + known → value
 *   - discoverable + known + 未 reveal → 占位（知道存在，不知内容）
 *
 * @param {object} id - identity 对象
 * @param {string} npcId - NPC 的 _id（'016' / 'N016' 均可，内部 normalize）
 * @param {object} knowledge - chat[0].horae_meta.npcKnowledge
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @param {'ai'|'public'} [opts.valueMode] - 占位，P7 未实现，P6.5 定案后使用
 * @returns {string[]} 每行 '· label = value'
 */
export function renderIdentityNpcRows(id, npcId, knowledge, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const sorted = _sortEntries(entries, { hiddenLast: true });
    const out = [];
    for (const e of sorted) {
        const r = _resolveNpcEntry(e, knowledge, npcId, lang);
        if (r) out.push('· ' + r.label + ' = ' + r.value);
    }
    return out;
}

/**
 * 单条 entry 的 NPC 视角解析
 * @param {object} entry
 * @param {object} knowledge
 * @param {string} npcId
 * @param {string} lang
 * @returns {{label:string, value:string}|null}
 */
function _resolveNpcEntry(entry, knowledge, npcId, lang) {
    if (!entry || entry.value == null) return null;
    const vis = entry.visibility || 'public';
    if (vis === 'gmOnly') return null;
    const label = _label(entry, lang, true);

    // public：始终输出
    if (vis === 'public') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // revealedAt 有：真相已公开（hidden / discoverable 都适用）
    if (entry.revealedAt) {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // 未 reveal + hidden/discoverable：需 known
    if (!hasKnown(knowledge, npcId, entry.id)) return null;
    // hidden + known → NPC 已获真知
    if (vis === 'hidden') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // discoverable + known + 未 reveal → 知道存在，不知内容
    return { label, value: _hiddenPlaceholder(label, lang) };
}`;

const PATCHES = [
    { id: 'imp',    desc: 'import hasKnown',            match: IMP_OLD,    replace: IMP_NEW },
    { id: 'append', desc: '追加 renderIdentityNpcRows',  match: APPEND_OLD, replace: APPEND_NEW },
];

const TEST_FILE_CONTENT = `import { renderIdentityNpcRows } from '../core/memory/identityView.js';

console.log('=== P7.3 renderIdentityNpcRows 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public -> 输出 value（不需 known）
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case1 public]');
    check('含 女', rows.join('\\n').includes('女'));
    check('无占位', !rows.join('\\n').includes('[隐藏'));
    console.log('');
}

// case2: hidden + 未 known -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_A', visibility: 'hidden' }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case2 hidden 未 known]');
    check('rows 空', rows.length === 0);
    console.log('');
}

// case3: hidden + known -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_B', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    console.log('[case3 hidden + known]');
    check('含 S_B', rows.join('\\n').includes('S_B'));
    check('无占位', !rows.join('\\n').includes('[隐藏'));
    console.log('');
}

// case4: hidden + revealedAt -> 输出 value（无需 known）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_C', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case4 hidden + revealed]');
    check('含 S_C', rows.join('\\n').includes('S_C'));
    console.log('');
}

// case5: discoverable + 未 known + 未 reveal -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_D', visibility: 'discoverable', revealedAt: null }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case5 discoverable 未 known]');
    check('rows 空', rows.length === 0);
    console.log('');
}

// case6: discoverable + known + 未 reveal -> 占位，不泄漏
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_E', visibility: 'discoverable', revealedAt: null }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    console.log('[case6 discoverable + known 未 reveal]');
    check('无泄漏', !rows.join('\\n').includes('S_E'));
    check('含占位', rows.join('\\n').includes('[隐藏'));
    console.log('');
}

// case7: discoverable + revealed -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_F', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case7 discoverable + revealed]');
    check('含 S_F', rows.join('\\n').includes('S_F'));
    console.log('');
}

// case8: gmOnly -> 不输出（即使 known）
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    console.log('[case8 gmOnly]');
    check('rows 空', rows.length === 0);
    check('无泄漏', !rows.join('\\n').includes('GM_X'));
    console.log('');
}

// case9: npcId 前缀归一化
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_G', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const r1 = renderIdentityNpcRows(id, '016', k);
    const r2 = renderIdentityNpcRows(id, 'N016', k);
    const r3 = renderIdentityNpcRows(id, 16, k);
    console.log('[case9 npcId 归一化]');
    check("'016' 命中", r1.join('\\n').includes('S_G'));
    check("'N016' 命中", r2.join('\\n').includes('S_G'));
    check('16 命中', r3.join('\\n').includes('S_G'));
    console.log('');
}

// case10: 多 NPC 隔离
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_H', visibility: 'hidden' }]);
    const k = { '017': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    console.log('[case10 NPC 隔离]');
    check('其他 NPC 的 known 不影响', rows.length === 0);
    console.log('');
}

// case11: 混合条目
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'S_I', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'S_J', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'goldenFinger', value: 'GM_Y', visibility: 'gmOnly' },
    ]);
    const k = { '016': { e2: { known: true }, e3: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    const joined = rows.join('\\n');
    console.log('[case11 混合]');
    check('含 女', joined.includes('女'));
    check('含 S_I（hidden known）', joined.includes('S_I'));
    check('不含 S_J（discoverable known 未 reveal）', !joined.includes('S_J'));
    check('含占位（discoverable 占位）', joined.includes('[隐藏'));
    check('不含 GM_Y', !joined.includes('GM_Y'));
    console.log('');
}

// case12: null / undefined
{
    console.log('[case12 null]');
    check('id null -> []', renderIdentityNpcRows(null, 'N016', {}).length === 0);
    check('knowledge null 不崩', renderIdentityNpcRows(mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]), 'N016', null).length === 1);
    console.log('');
}

// case13: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_K', visibility: 'discoverable', revealedAt: null }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k, { lang: 'en' });
    console.log('[case13 lang=en]');
    check('含 [Hidden:', rows.join('\\n').includes('[Hidden:'));
    console.log('');
}

// case14: value=null 被过滤
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'S_L', visibility: 'public' },
    ]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    console.log('[case14 value=null]');
    check('rows len = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('S_L'));
    console.log('');
}

// case15: valueMode 占位（不影响行为）
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const r1 = renderIdentityNpcRows(id, 'N016', {});
    const r2 = renderIdentityNpcRows(id, 'N016', {}, { valueMode: 'public' });
    console.log('[case15 valueMode 占位]');
    check('valueMode 不影响输出（P7 未实现）', r1.join('\\n') === r2.join('\\n'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.3 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');
if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }
const src = fs.readFileSync(TARGET, 'utf8');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(8) + ' ' + s.desc);
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
console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE + ' exists=' + testExists);
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
