#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = path.join(ROOT, 'core/memory/identityView.js');
const T4_3 = path.join(ROOT, 'tools/test-identityView-visibility.mjs');
const T5 = path.join(ROOT, 'tools/test-p5-identity-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const AI_OLD = `export function renderIdentityAiEntries(id, opts = {}) {
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

const AI_NEW = `export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    return sorted.map(e => {
        const label = _label(e, lang, true);
        // P6.5: AI 天道视角读 canonical value；
        // display 若非空且异于 value，附注「对外：<display>」供描述 NPC 视角。
        // gmOnly 由 isAiVisible 过滤。
        const safeValue = sanitizeHiddenKeywords(String(e.value));
        const rawDisplay = e.display != null ? String(e.display) : null;
        const safeDisplay = rawDisplay ? sanitizeHiddenKeywords(rawDisplay) : null;
        if (safeDisplay && safeDisplay !== safeValue) {
            return '· ' + label + ' = ' + safeValue + '（对外：' + safeDisplay + '）';
        }
        return '· ' + label + ' = ' + safeValue;
    });
}`;

const T4_3_CONTENT = `import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView AI 双层输出测试（P6.5.1 更新） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public + 无 display -> 只 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case1 public 无 display]');
    check('含 value 女', joined.includes('女'));
    check('无「对外」', !joined.includes('对外'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case2: display != value -> 双层
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_HIDDEN_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case2 display != value 双层]');
    check('含 value', joined.includes('TEST_HIDDEN_A'));
    check('含 display', joined.includes('TEST_DISPLAY_A'));
    check('含「对外」', joined.includes('对外'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case3: display == value -> 只一次，无「对外」
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SAME_V', display: 'SAME_V', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case3 display == value]');
    check('含 SAME_V', joined.includes('SAME_V'));
    check('SAME_V 只一次', (joined.match(/SAME_V/g) || []).length === 1);
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

// case4: display == null -> 只 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'NULL_DISP_V', display: null, visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case4 display == null]');
    check('含 value', joined.includes('NULL_DISP_V'));
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

// case5: discoverable 未揭示 -> value（AI 全知）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_A', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case5 discoverable 未揭示]');
    check('含 value', joined.includes('TEST_DISC_A'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case6: discoverable 已揭示 + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case6 discoverable 已揭示]');
    check('含 value', joined.includes('V6'));
    check('含 display', joined.includes('D6'));
    check('含「对外」', joined.includes('对外'));
    console.log('');
}

// case7: gmOnly
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case7 gmOnly]');
    check('rows 空', rows.length === 0);
    check('无泄漏', !rows.join('\\n').includes('GM_X'));
    console.log('');
}

// case8: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_HIDDEN_B', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'TEST_DISC_C', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'bloodline', value: '凡人血脉', visibility: 'discoverable', revealedAt: { iso: 'x' } },
        { id: 'e5', kind: 'goldenFinger', value: 'GM_Y', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case8 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden TEST_HIDDEN_B 存在（AI 全知）', joined.includes('TEST_HIDDEN_B'));
    check('discoverable 未揭示 TEST_DISC_C 存在', joined.includes('TEST_DISC_C'));
    check('discoverable 已揭示 凡人血脉 存在', joined.includes('凡人血脉'));
    check('gmOnly GM_Y 不出现', !joined.includes('GM_Y'));
    console.log('');
}

// case9: lang=en + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'EN_V', display: 'EN_D', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id, { lang: 'en' }).join('\\n');
    console.log('[case9 lang=en 双层]');
    check('含 value', joined.includes('EN_V'));
    check('含 display', joined.includes('EN_D'));
    check('含「对外」', joined.includes('对外'));
    console.log('');
}

// case10: value=null 被过滤
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'OK_V', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case10 value=null]');
    check('rows len = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('OK_V'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

const T5_CONTENT = `import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试（P6.5.1 更新） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: 空
{
    console.log('[case1 null / 空]');
    check('null -> ""', renderIdentityAiSection(null) === '');
    check('undefined -> ""', renderIdentityAiSection(undefined) === '');
    check('空 entries -> ""', renderIdentityAiSection(mkId([])) === '');
    console.log('');
}

// case2: public 无 display
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case2 public]');
    check('含 header', s.includes('[角色固有设定]'));
    check('含 label 性别', s.includes('性别'));
    check('含 value 女', s.includes('女'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case3: hidden + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden + display ≠ value]');
    check('含 value', s.includes('TEST_SECRET_A'));
    check('含 display', s.includes('TEST_DISPLAY_A'));
    check('含「对外」', s.includes('对外'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case4: display == value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SAME_P5', display: 'SAME_P5', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 display == value]');
    check('SAME_P5 一次', (s.match(/SAME_P5/g) || []).length === 1);
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case5: display == null
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'NULL_P5', display: null, visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 display == null]');
    check('含 value', s.includes('NULL_P5'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case6: discoverable 未揭示
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_B', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 discoverable 未揭示]');
    check('含 value', s.includes('TEST_SECRET_B'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case7: discoverable 已揭示
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_C', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case7 discoverable 已揭示]');
    check('含 value', s.includes('TEST_SECRET_C'));
    console.log('');
}

// case8: gmOnly
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_P5', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case8 gmOnly]');
    check('返回 ""', s === '');
    check('无泄漏', !s.includes('GM_P5'));
    console.log('');
}

// case9: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case9 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
    console.log('');
}

// case10: lang=en + hidden + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'EN_V2', display: 'EN_D2', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case10 lang=en 双层]');
    check('含 value', s.includes('EN_V2'));
    check('含 display', s.includes('EN_D2'));
    check('含「对外」', s.includes('对外'));
    console.log('');
}

// case11: lang=ja
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'ja' });
    console.log('[case11 lang=ja]');
    check('含 キャラクター固有設定', s.includes('キャラクター固有設定'));
    console.log('');
}

// case12: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_MIX_HIDDEN', display: 'MIX_DISP', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'TEST_MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case12 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden TEST_MIX_HIDDEN 出现', s.includes('TEST_MIX_HIDDEN'));
    check('display MIX_DISP 出现', s.includes('MIX_DISP'));
    check('gmOnly TEST_MIX_GM 不出现', !s.includes('TEST_MIX_GM'));
    check('含 header', s.includes('[角色固有设定]'));
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

console.log('=== P6.5.1 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(VIEW)) { console.error('XX view missing'); process.exit(1); }
const src = fs.readFileSync(VIEW, 'utf8');
const cnt = countOccurrences(src, AI_OLD);
const ok = cnt === 1;
console.log('patch plan:');
console.log('  [' + (ok ? 'OK' : 'XX count=' + cnt).padEnd(10) + '] ai-render    renderIdentityAiEntries 改双层输出');
console.log('  [NEW]      t4-3         test-identityView-visibility.mjs 整文件重写');
console.log('  [NEW]      t5           test-p5-identity-section.mjs 整文件重写');
console.log('');
if (!ok) {
    console.error('XX AI_OLD match failed: count=' + cnt);
    process.exit(1);
}
console.log('view delta: ' + (src.replace(AI_OLD, AI_NEW).length - src.length) + ' bytes');
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(VIEW, src.replace(AI_OLD, AI_NEW), 'utf8');
console.log('[write] ' + VIEW);
fs.writeFileSync(T4_3, T4_3_CONTENT, 'utf8');
console.log('[write] ' + T4_3);
fs.writeFileSync(T5, T5_CONTENT, 'utf8');
console.log('[write] ' + T5);
console.log('');
console.log('done.');
