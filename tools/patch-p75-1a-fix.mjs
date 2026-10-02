#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, 'core/memory/identityNpcPrompt.js');
const TEST   = path.join(ROOT, 'tools/test-p75-npc-knowledge-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── P1: identityNpcPrompt.js 加 filteredIdentity（浅复制，只替换 entries） ──
const P1_OLD = [
    "    if (allowedEntryIds.size === 0) return '';",
    "",
    "    // 第三/四层：单 NPC 渲染 + 单 NPC 100 字符裁剪",
    "    const rendered = [];",
].join("\n");
const P1_NEW = [
    "    if (allowedEntryIds.size === 0) return '';",
    "",
    "    // 浅复制 identity，只替换 entries（不重构 Identity 对象，不动 getIdentityEntries）",
    "    // 目的：避免 renderIdentityNpcRows 遍历完整 identity.entries 时对 public entry 无条件输出",
    "    const filteredEntries = entries.filter(e => e.id && allowedEntryIds.has(e.id));",
    "    const filteredIdentity = { ...identity, entries: filteredEntries };",
    "",
    "    // 第三/四层：单 NPC 渲染 + 单 NPC 100 字符裁剪",
    "    const rendered = [];",
].join("\n");

// ── P2: identityNpcPrompt.js 改用 filteredIdentity ──
const P2_OLD = "        const rows = renderIdentityNpcRows(identity, npcId, filtered, { lang });";
const P2_NEW = "        const rows = renderIdentityNpcRows(filteredIdentity, npcId, filtered, { lang });";

// ── P3: test T6 断言修正 ──
const P3_OLD = [
    "    check('T6 单行存在', !!line);",
    "    check('T6 单 NPC 行 ≤ 100', line.length <= 100);",
    "    check('T6 单 NPC 行 = 100（截断上限）', line.length === 100);",
    "    check('T6 末尾 …', line.endsWith('…'));",
    "    check('T6 总段 ≤ 400', out.length <= 400);",
].join("\n");
const P3_NEW = [
    "    check('T6 单行存在', !!line);",
    "    check('T6 单 NPC 行 ≤ 100', line.length <= 100);",
    "    check('T6 单 NPC 行 ≥ 50（接近上限）', line.length >= 50);",
    "    check('T6 末尾 …', line.endsWith('…'));",
    "    check('T6 总段 ≤ 400', out.length <= 400);",
].join("\n");

// ── P4: test 新增 T3b（public entry 存在 identity.entries 但不在 knowledge） ──
const P4_OLD = [
    "    check('T3 长度 ≤ 400', out.length <= 400);",
    "}",
    "",
    "// T4 单 NPC 超限",
].join("\n");
const P4_NEW = [
    "    check('T3 长度 ≤ 400', out.length <= 400);",
    "}",
    "",
    "// T3b：public entry 存在 identity.entries，但完全不在 knowledge 里",
    "// 验证 filteredIdentity 生效：renderer 即使遍历 identity.entries，也只输出 allowed entries",
    "{",
    "    const identity = mkIdentity([",
    "        mkEntry('e1', 'spiritRoot', '无界灵根', 'hidden'),",
    "        mkEntry('e2', 'gender', '女', 'public'),         // public entry 存在",
    "    ]);",
    "    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });",
    "    const knowledge = mkKnown('016', ['e1']);             // knowledge 只含 hidden",
    "    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });",
    "    check('T3b 含段头', out.startsWith('[NPC 认知]'));",
    "    check('T3b 含 hidden 灵根', out.includes('无界灵根'));",
    "    check('T3b 不含 public gender', !out.includes('= 女'));",
    "    check('T3b 非空（filteredIdentity 生效）', out.length > '[NPC 认知]'.length);",
    "}",
    "",
    "// T4 单 NPC 超限",
].join("\n");

const PATCHES = [
    { file: 'module', id: 'P1',  desc: 'identityNpcPrompt.js 加 filteredIdentity',   match: P1_OLD, replace: P1_NEW },
    { file: 'module', id: 'P2',  desc: 'identityNpcPrompt.js 改用 filteredIdentity', match: P2_OLD, replace: P2_NEW },
    { file: 'test',   id: 'P3',  desc: 'test T6 断言改为 ≤ 100 + ≥ 50',             match: P3_OLD, replace: P3_NEW },
    { file: 'test',   id: 'P4',  desc: 'test 新增 T3b（filteredIdentity 验证）',     match: P4_OLD, replace: P4_NEW },
];

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.5.1a Fix ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [MODULE, TEST]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
}

const contents = {
    module: fs.readFileSync(MODULE, 'utf8'),
    test:   fs.readFileSync(TEST, 'utf8'),
};

const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(contents[p.file], p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(12) + '] ' + s.id.padEnd(4) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX abort: ' + failed.id + ' count=' + failed.count);
    console.error('   若 P1/P2 已 apply 过，match 会失败——请确认只跑一次。');
    process.exit(1);
}

const next = { ...contents };
for (const p of PATCHES) next[p.file] = next[p.file].replace(p.match, p.replace);

console.log('targets:');
console.log('  ' + MODULE + '  delta=' + (next.module.length - contents.module.length));
console.log('  ' + TEST   + '  delta=' + (next.test.length - contents.test.length));
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(MODULE, next.module, 'utf8');
console.log('[write] ' + MODULE);
fs.writeFileSync(TEST, next.test, 'utf8');
console.log('[write] ' + TEST);
console.log('');
console.log('done.');
