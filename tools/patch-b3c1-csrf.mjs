#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { ix: path.join(ROOT, 'index.js') };
const SUFFIX = '.bak-before-b3c1';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.basename(f)); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== B3c-1: merge-attributes CSRF 修复 ===');
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

function applyPatch(content, name, before, after, appliedCheck, expectedOcc = 1) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' expected ' + expectedOcc + ' matches, got ' + occ); return { content, status: -1 }; }
    console.log('  OK ' + name + ' (' + occ + ' 处)');
    return { content: content.split(before).join(after), status: 1 };
}

{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    // P1: import 加 getRequestHeaders
    {
        const before = `import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types, doNewChat } from '/script.js';`;
        const after  = `import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types, doNewChat, getRequestHeaders } from '/script.js';`;
        const appliedCheck = `getRequestHeaders } from '/script.js';`;
        const r = applyPatch(content, 'B3c1-P1 import getRequestHeaders', before, after, appliedCheck, 1);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P2: 5 处 headers 统一替换
    {
        const before = `headers: { 'Content-Type': 'application/json' },`;
        const after  = `headers: getRequestHeaders(),`;
        const appliedCheck = `headers: getRequestHeaders(),\n            body: JSON.stringify({\n                avatar: char.avatar,\n                data: { extensions: { horae: { identity: normalized } } },`;
        const r = applyPatch(content, 'B3c1-P2 merge-attributes headers', before, after, appliedCheck, 5);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
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
