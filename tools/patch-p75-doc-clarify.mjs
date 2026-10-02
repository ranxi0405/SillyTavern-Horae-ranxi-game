#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/identity-npc-prompt-injection-design.md');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const OLD = `### 第二层 · entry 候选筛选

对每个候选 NPC，遍历其 \`npcKnowledge[npcId]\` 中的所有 entryId，**仅当同时满足**才保留：

1. \`npcKnowledge[npcId][entryId].known === true\`
2. \`entry.visibility !== 'public'\`（天道视角已有，重复冗余）
3. \`entry.visibility !== 'gmOnly'\`（永不输出，P6.5.3 已定）
4. \`isNpcPerceivable(entry, npcId)\` 返回 true（**本版恒定 true**，见 §9）

**第 2 条是关键**：排除 \`public\` 后，NPC 认知段只包含"**这个 NPC 特别知道的**"，不重复 \`[角色固有设定]\` 已有的内容。`;

const NEW = `### 第二层 · entry 候选筛选

对每个候选 NPC，遍历其 \`npcKnowledge[npcId]\` 中的所有 entryId，**仅当同时满足**才保留：

1. \`npcKnowledge[npcId][entryId].known === true\`
2. \`entry.visibility !== 'public'\`（**Prompt 去重优化**，见下方说明）
3. \`entry.visibility !== 'gmOnly'\`（永不输出，P6.5.3 已定）
4. \`isNpcPerceivable(entry, npcId)\` 返回 true（**本版恒定 true**，见 §9）

**第 2 条是关键**：排除 \`public\` 后，NPC 认知段只包含"**这个 NPC 特别知道的**"，不重复 \`[角色固有设定]\` 已有的内容。

#### 第 2 条说明（重要）

**这不是安全边界，而是 Prompt 去重优化。**

- visibility 语义（\`hidden\` / \`discoverable\` / \`gmOnly\` 的显示规则、placeholder 逻辑、display/value 选择）**由 \`identityView._resolveNpcEntry\` 统一处理**
- P7.5 **不重复实现** visibility 判断、placeholder 逻辑、display/value 选择
- 此过滤的**目的**：\`public\` entry 已经出现在 \`[角色固有设定]\` 段（由 \`renderIdentityAiEntries\` 输出），NPC 认知段不再重复发送
- \`public\` entry **不代表 NPC 不允许知道**，而是"NPC 知道的信息不需要重复告知 AI"

**职责边界**：

    _generateNpcKnowledgeSection  →  哪些 entry 进入 NPC 认知段（筛选）
    renderIdentityNpcRows         →  entry 具体怎么显示（visibility + knowledge 语义）

两处严格分工。P7.5.1 只做上面一条，不动下面一条。`;

const PATCHES = [
    { id: 's6-2', desc: '§6.2 补去重优化说明 + 职责边界', match: OLD, replace: NEW },
];

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.5 Doc Clarify ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(6) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
console.log('target : ' + TARGET);
console.log('  delta: ' + (next.length - src.length) + ' bytes');
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
