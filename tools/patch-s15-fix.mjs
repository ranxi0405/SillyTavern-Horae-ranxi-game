#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { ix: path.join(ROOT, 'index.js') };
const SUFFIX = '.bak-before-s15-fix';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) {
            fs.copyFileSync(b, f);
            fs.unlinkSync(b);
            n++;
            console.log('restored ' + path.basename(f));
        }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== S1.5-fix: source 溯源 + 处境 predicate 移除 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }

function applyPatch(content, name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) {
        console.log('  .. ' + name + ' (already applied)');
        return { content, status: 0 };
    }
    const occ = content.split(before).length - 1;
    if (occ === 0) {
        console.error('  XX ' + name + ' anchor NOT FOUND');
        return { content, status: -1 };
    }
    if (occ > 1) {
        console.error('  XX ' + name + ' (' + occ + ' matches)');
        return { content, status: -1 };
    }
    console.log('  OK ' + name);
    return { content: content.replace(before, after), status: 1 };
}

{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    {
        const before       = '        source: f.source || sourceTag,';
        const after        = '        source: sourceTag,';
        const appliedCheck = '        source: sourceTag,\n    }));';
        const r = applyPatch(content, 'S1.5-fix-P1 source 字段', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; }
        else if (r.status === -1) f++;
    }

    {
        const before       = '   位置、住处、天赋、外貌、特征、能力、技艺、关系、目标、处境';
        const after        = '   位置、住处、天赋、外貌、特征、能力、技艺、关系、目标';
        const appliedCheck = '   位置、住处、天赋、外貌、特征、能力、技艺、关系、目标\n';
        const r = applyPatch(content, 'S1.5-fix-P2 处境 predicate', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; }
        else if (r.status === -1) f++;
    }

    if (DRY_RUN) {
        console.log('DRY-RUN: ' + c + ' patch(es) 待应用, ' + f + ' 处锚点失败');
    } else if (f === 0) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        console.log('APPLIED: ' + c + ' patch(es) 写入 ' + path.basename(FILES.ix));
    } else {
        console.error('APPLY ABORTED: ' + f + ' 处锚点失败，未写入');
        process.exit(1);
    }
}

console.log('done.');
