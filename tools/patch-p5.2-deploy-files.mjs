#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'tools/deploy-p3-mount.mjs');
const TEST_FILE = path.join(ROOT, 'tools/test-p5.2-deploy-files.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const REL_OLD = `const REL_FILES = [
    'index.js',
    'core/memory/identityKindRegistry.js',
    'core/memory/identityStore.js',
    'core/memory/identityView.js',
    'core/memory/identitySchemaVersion.js',
    'core/memory/identityGmApi.js',
];`;

const REL_NEW = `const REL_FILES = [
    'index.js',
    'core/horaeManager.js',
    'core/memory/hiddenKeywords.js',
    'core/memory/identityKindRegistry.js',
    'core/memory/identityStore.js',
    'core/memory/identityView.js',
    'core/memory/identitySchemaVersion.js',
    'core/memory/identityGmApi.js',
];`;

const PATCHES = [
    { id: 'rel', desc: 'REL_FILES 补 horaeManager + hiddenKeywords', match: REL_OLD, replace: REL_NEW },
];

const TEST_FILE_CONTENT = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'tools/deploy-p3-mount.mjs'), 'utf8');

console.log('=== P5.2 REL_FILES 验证 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const required = [
    'index.js',
    'core/horaeManager.js',
    'core/memory/hiddenKeywords.js',
    'core/memory/identityKindRegistry.js',
    'core/memory/identityStore.js',
    'core/memory/identityView.js',
    'core/memory/identitySchemaVersion.js',
    'core/memory/identityGmApi.js',
];

for (const rel of required) {
    check('REL_FILES 含 ' + rel, src.includes("'" + rel + "'"));
}

check('无重复项', (src.match(/REL_FILES = \\[/g) || []).length === 1);

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P5.2 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');
if (!fs.existsSync(TARGET)) { console.error('XX target missing'); process.exit(1); }
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
