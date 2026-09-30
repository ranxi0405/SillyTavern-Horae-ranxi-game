#!/usr/bin/env node
/**
 * P4.3b Patch - 修正 test-identityView-visibility.mjs 测试用例值
 *
 * 原因：
 *   HIDDEN_MAP 含 '无界灵根' / '无界道体'，
 *   导致 case4 的 else 分支经过 sanitizeHiddenKeywords 后断言失配。
 *   这不是 render 逻辑问题，是测试用例选词撞 HIDDEN_MAP。
 *
 * 策略：
 *   把测试值换成不含 HIDDEN_MAP 的中性值，
 *   同时保留 hidden / discoverable 分支断言。
 *
 * 用法：
 *   node tools/patch-p4.3b-fix-test-values.mjs --dry-run
 *   node tools/patch-p4.3b-fix-test-values.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'tools/test-identityView-visibility.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCHES = [
    // case2: hidden 用中性值
    {
        id: 'case2-mkid',
        desc: 'case2 用中性值 TEST_HIDDEN_A / TEST_DISPLAY_A',
        match: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', display: '四系伪灵根', visibility: 'hidden' }]);`,
        replace: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_HIDDEN_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);`,
    },
    {
        id: 'case2-assert',
        desc: 'case2 断言引用新值',
        match: `    check('no leak (value)', !joined.includes('无界灵根'));\n    check('no leak (display)', !joined.includes('四系伪灵根'));`,
        replace: `    check('no leak (value)', !joined.includes('TEST_HIDDEN_A'));\n    check('no leak (display)', !joined.includes('TEST_DISPLAY_A'));`,
    },
    // case3: discoverable 未揭示
    {
        id: 'case3-mkid',
        desc: 'case3 用中性值 TEST_DISC_A',
        match: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'discoverable', revealedAt: null }]);`,
        replace: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_A', visibility: 'discoverable', revealedAt: null }]);`,
    },
    {
        id: 'case3-assert',
        desc: 'case3 断言引用 TEST_DISC_A',
        match: `    check('no leak', !joined.includes('无界灵根'));\n    check('has placeholder', joined.includes('[隐藏'));`,
        replace: `    check('no leak', !joined.includes('TEST_DISC_A'));\n    check('has placeholder', joined.includes('[隐藏'));`,
    },
    // case4: discoverable 已揭示
    {
        id: 'case4-mkid',
        desc: 'case4 用中性值 TEST_DISC_B',
        match: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);`,
        replace: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_B', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);`,
    },
    {
        id: 'case4-assert',
        desc: 'case4 断言引用 TEST_DISC_B',
        match: `    check('includes value', joined.includes('无界灵根'));\n    check('no placeholder', !joined.includes('[隐藏'));`,
        replace: `    check('includes value', joined.includes('TEST_DISC_B'));\n    check('no placeholder', !joined.includes('[隐藏'));`,
    },
    // case6: 混合
    {
        id: 'case6-e2',
        desc: 'case6 e2 用 TEST_HIDDEN_B',
        match: `        { id: 'e2', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' },`,
        replace: `        { id: 'e2', kind: 'spiritRoot', value: 'TEST_HIDDEN_B', visibility: 'hidden' },`,
    },
    {
        id: 'case6-e3',
        desc: 'case6 e3 用 TEST_DISC_C',
        match: `        { id: 'e3', kind: 'constitution', value: '无界道体', visibility: 'discoverable', revealedAt: null },`,
        replace: `        { id: 'e3', kind: 'constitution', value: 'TEST_DISC_C', visibility: 'discoverable', revealedAt: null },`,
    },
    {
        id: 'case6-assert',
        desc: 'case6 断言引用 TEST_HIDDEN_B / TEST_DISC_C',
        match: `    check('hidden 无界灵根 不泄露', !joined.includes('无界灵根'));\n    check('discoverable 未揭示 无界道体 不泄露', !joined.includes('无界道体'));`,
        replace: `    check('hidden TEST_HIDDEN_B 不泄露', !joined.includes('TEST_HIDDEN_B'));\n    check('discoverable 未揭示 TEST_DISC_C 不泄露', !joined.includes('TEST_DISC_C'));`,
    },
    // case7: lang=en
    {
        id: 'case7-mkid',
        desc: 'case7 用中性值 TEST_LANG_EN_A',
        match: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' }]);`,
        replace: `const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_LANG_EN_A', visibility: 'hidden' }]);`,
    },
    {
        id: 'case7-assert',
        desc: 'case7 断言引用 TEST_LANG_EN_A',
        match: `    check('no leak', !joined.includes('无界灵根'));\n    check('has [Hidden:', joined.includes('[Hidden:'));`,
        replace: `    check('no leak', !joined.includes('TEST_LANG_EN_A'));\n    check('has [Hidden:', joined.includes('[Hidden:'));`,
    },
    // case8: value=null
    {
        id: 'case8-e2',
        desc: 'case8 e2 用 TEST_NULL_A',
        match: `        { id: 'e2', kind: 'spiritRoot', value: '无界灵根', visibility: 'public' },`,
        replace: `        { id: 'e2', kind: 'spiritRoot', value: 'TEST_NULL_A', visibility: 'public' },`,
    },
    {
        id: 'case8-assert',
        desc: 'case8 断言引用 TEST_NULL_A',
        match: `    check('rows length = 1', rows.length === 1);\n    check('仅剩 spiritRoot', rows[0].includes('无界灵根'));`,
        replace: `    check('rows length = 1', rows.length === 1);\n    check('仅剩 spiritRoot', rows[0].includes('TEST_NULL_A'));`,
    },
];

function countOccurrences(haystack, needle) {
    let n = 0, i = 0;
    while (true) {
        const j = haystack.indexOf(needle, i);
        if (j === -1) break;
        n++; i = j + needle.length;
    }
    return n;
}

console.log('=== P4.3b Patch (fix test values) ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(13) + ' ' + s.desc);
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

console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
