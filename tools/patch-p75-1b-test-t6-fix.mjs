#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST = path.join(ROOT, 'tools/test-p75-npc-knowledge-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── P1: 在 fixtures 后追加 extractNpcBody 辅助函数 ──
const P1_OLD = [
    "function mkKnown(npcId, entryIds) {",
    "    const bucket = {};",
    "    for (const eid of entryIds) {",
    "        bucket[eid] = { known: true, source: 'test', at: { iso: 't', story: null }, note: null };",
    "    }",
    "    return { [String(npcId).padStart(3, '0')]: bucket };",
    "}",
].join("\n");

const P1_NEW = [
    "function mkKnown(npcId, entryIds) {",
    "    const bucket = {};",
    "    for (const eid of entryIds) {",
    "        bucket[eid] = { known: true, source: 'test', at: { iso: 't', story: null }, note: null };",
    "    }",
    "    return { [String(npcId).padStart(3, '0')]: bucket };",
    "}",
    "",
    "// 从 [NPC 认知] 输出中提取单个 NPC 的完整 body（可能多行）",
    "// 边界：从 npcPrefix 开始，到下一个 \"N\\d{3} \" 开头行之前",
    "// （当前 fixture 只有 1 个 NPC，但保持语义清晰，避免以后 fixture 扩展时误改）",
    "function extractNpcBody(out, npcPrefix) {",
    "    const start = out.indexOf(npcPrefix);",
    "    if (start < 0) return '';",
    "    const rest = out.slice(start);",
    "    const next = rest.slice(npcPrefix.length).match(/\\nN\\d{3} /);",
    "    return next ? rest.slice(0, npcPrefix.length + next.index) : rest;",
    "}",
].join("\n");

// ── P2: T6 断言改用 extractNpcBody ──
const P2_OLD = [
    "    const line = out.split('\\n').filter(l => l.startsWith('N016'))[0];",
    "    check('T6 单行存在', !!line);",
    "    check('T6 单 NPC 行 ≤ 100', line.length <= 100);",
    "    check('T6 单 NPC 行 ≥ 50（接近上限）', line.length >= 50);",
    "    check('T6 末尾 …', line.endsWith('…'));",
    "    check('T6 总段 ≤ 400', out.length <= 400);",
].join("\n");

const P2_NEW = [
    "    const body = extractNpcBody(out, 'N016');",
    "    check('T6 单 NPC 存在', !!body);",
    "    check('T6 单 NPC 总长 ≤ 100', body.length > 0 && body.length <= 100);",
    "    check('T6 单 NPC 总长 ≥ 50（接近上限）', body.length >= 50);",
    "    check('T6 末尾 …', body.endsWith('…'));",
    "    check('T6 总段 ≤ 400', out.length <= 400);",
].join("\n");

const PATCHES = [
    { id: 't6-helper', desc: '加 extractNpcBody 辅助函数（语义收紧）', match: P1_OLD, replace: P1_NEW },
    { id: 't6-fix',    desc: 'T6 改用 extractNpcBody',                 match: P2_OLD, replace: P2_NEW },
];

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.5.1b T6 Test Fix ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TEST)) { console.error('XX target missing: ' + TEST); process.exit(1); }
const src = fs.readFileSync(TEST, 'utf8');

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
    console.log('  [' + tag.padEnd(12) + '] ' + s.id.padEnd(10) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX abort: ' + failed.id + ' count=' + failed.count);
    process.exit(1);
}

let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);

console.log('target : ' + TEST);
console.log('  delta: ' + (next.length - src.length) + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TEST, next, 'utf8');
console.log('[write] ' + TEST);
console.log('');
console.log('done.');
