#!/usr/bin/env node
/**
 * P4.2b Patch - 修正 test-p4.2-lazy-migrate.mjs case1 预期值
 * 从 3 → 4（gender 1 + spiritRoot 1 + talents 2 = 4）
 *
 * 目标文件：tools/test-p4.2-lazy-migrate.mjs
 *
 * 用法：
 *   node tools/patch-p4.2b-fix-test.mjs --dry-run
 *   node tools/patch-p4.2b-fix-test.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'tools/test-p4.2-lazy-migrate.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCHES = [
    {
        id: 'case1-entries',
        desc: 'entries.len 3 -> 4',
        match: `    check('after: entries.len = 3', id.entries.length === 3);`,
        replace: `    check('after: entries.len = 4', id.entries.length === 4);`,
    },
    {
        id: 'case1-list',
        desc: '返回列表 len 3 -> 4',
        match: `    check('after: 返回列表 len = 3', list.length === 3);`,
        replace: `    check('after: 返回列表 len = 4', list.length === 4);`,
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

console.log('=== P4.2b Patch (fix test) ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(14) + ' ' + s.desc);
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
