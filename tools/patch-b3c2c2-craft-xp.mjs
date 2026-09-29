#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'core/horaeManager.js');
const SUFFIX = '.bak-before-b3c2c2';
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

console.log('=== B3c-2c-2: _extractCraftXp 兼容裸数字 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

const OLD = `            const _extractCraftXp = (desc) => {
                if (!desc || typeof desc !== 'string') return null;
                const m = desc.match(/熟练度[:：\\s]*(\\d+)/);
                if (!m) return null;
                const n = Number(m[1]);
                return Number.isSafeInteger(n) ? n : null;
            };`;

const NEW = `            const _extractCraftXp = (desc) => {
                if (desc == null) return null;
                const s = String(desc).trim();
                if (!s) return null;
                const m = s.match(/熟练度[:：\\s]*(\\d+)/);
                if (m) {
                    const n = Number(m[1]);
                    return Number.isSafeInteger(n) ? n : null;
                }
                if (/^\\d+$/.test(s)) {
                    const n = Number(s);
                    return Number.isSafeInteger(n) ? n : null;
                }
                return null;
            };`;

if (raw.includes('if (/^\\d+$/.test(s)) {')) {
    console.log('  .. already applied');
    process.exit(0);
}
const occ = raw.split(OLD).length - 1;
if (occ !== 1) { console.error('  XX anchor occ=' + occ); process.exit(1); }
console.log('  OK anchor (1 处)');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? raw.split(OLD).join(NEW).replace(/\n/g, '\r\n') : raw.split(OLD).join(NEW), 'utf8');
console.log('  APPLIED');
console.log('done.');
