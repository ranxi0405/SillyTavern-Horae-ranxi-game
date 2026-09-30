#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/identity-npc-knowledge-design.md');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const PATCHES = [
    {
        id: 'known-schema',
        desc: '§3.2 known 字段说明',
        match: `| \`known\` | boolean | NPC 是否知道「该设定存在」 |`,
        replace: `| \`known\` | boolean | NPC 是否已获得该 entry 的认知记录（具体看到"存在"还是真实 value，由 visibility / revealedAt / View 规则决定） |`,
    },
    {
        id: 'npcid-normalize',
        desc: '§3.3 npcId normalize 补充',
        match: `- 存储时统一为**不带 \`N\` 前缀的裸数字字符串** \`'016'\`，展示时加 \`N\` 前缀
- 若 NPC 无 \`_id\`（尚未分配）→ 该 NPC 的认知**不写入**，等分配后再写`,
        replace: `- 存储时统一为**不带 \`N\` 前缀的裸数字字符串** \`'016'\`，展示时加 \`N\` 前缀
- 传入 \`N016\` / \`016\` 时统一 normalize 为 \`'016'\` 再存储，避免 \`016\` / \`N016\` 两套格式
- 若 NPC 无 \`_id\`（尚未分配）→ 该 NPC 的认知**不写入**，等分配后再写`,
    },
    {
        id: 'entryid-orphan',
        desc: '§3.3 entryId 永不复用 + View 忽略',
        match: `- 若 entry 被 \`gm.remove()\` 删除，对应的 \`npcKnowledge[*][entryId]\` **保留为历史记录**（不主动清理）`,
        replace: `- 若 entry 被 \`gm.remove()\` 删除，对应的 \`npcKnowledge[*][entryId]\` **保留为历史记录**（不主动清理）
- entryId 永不复用（\`gm.remove()\` 后新加 entry 会分配新 id）
- View 遇到 identity 中不存在的 entryId 时**直接忽略**，不报错`,
    },
    {
        id: 'store-wording',
        desc: '§4.3 identityStore 措辞',
        match: `- **identityStore** 不可写`,
        replace: `- **identityStore** 不负责修改 \`npcKnowledge\`（它管 identity 本体）`,
    },
    {
        id: 'known-semantics',
        desc: '§6 known 语义段落',
        match: `    known
      = NPC 知道「有一个隐藏设定存在」
      ≠ NPC 知道真实 value`,
        replace: `    known
      = NPC 已获得该 entry 的认知记录
      = 已建立"某 NPC 知道某 identity entry"的记录
      → 具体看到"存在"还是真实 value，
        由 visibility / revealedAt / identityView 规则决定
      ≠ known = true 就等于知道真实 value`,
    },
];

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.1b Doc Fix ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(16) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - src.length;
console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
