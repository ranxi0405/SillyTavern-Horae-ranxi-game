#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'index.js');
const SUFFIX = '.bak-before-b3c2c-visual1b';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    const b = F + SUFFIX;
    if (fs.existsSync(b)) { fs.copyFileSync(b, F); fs.unlinkSync(b); console.log('restored'); }
    else console.log('no backup');
    process.exit(0);
}

console.log('=== B3c-2c-visual-1b: 六艺段位区间改为整数上限 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

const OLD = `    const _ART_GRADE_RANGES = [
        { min: 0, max: 19 },
        { min: 20, max: 99 },
        { min: 100, max: 499 },
        { min: 500, max: 2999 },
        { min: 3000, max: 7999 },
        { min: 8000, max: 29999 },
        { min: 30000, max: Infinity },
    ];`;

const NEW = `    const _ART_GRADE_RANGES = [
        { min: 0, max: 20 },
        { min: 21, max: 100 },
        { min: 101, max: 500 },
        { min: 501, max: 3000 },
        { min: 3001, max: 8000 },
        { min: 8001, max: 30000 },
        { min: 30001, max: Infinity },
    ];`;

if (raw.includes('{ min: 30001, max: Infinity }')) {
    console.log('  .. already applied');
    process.exit(0);
}
const occ = raw.split(OLD).length - 1;
if (occ !== 1) { console.error('  XX anchor occ=' + occ + ' expect=1'); process.exit(1); }
console.log('  OK anchor (1 处)');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? raw.split(OLD).join(NEW).replace(/\n/g, '\r\n') : raw.split(OLD).join(NEW), 'utf8');
console.log('  APPLIED');
console.log('done.');
