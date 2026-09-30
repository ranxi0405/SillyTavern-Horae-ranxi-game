import fs from 'node:fs';
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

check('无重复项', (src.match(/REL_FILES = \[/g) || []).length === 1);

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
