#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/identity-value-display-design.md');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── 修正 1 · §3.1 value 语义 ──

const VALUE_OLD = `### 3.1 \`value\`

- **真相**（世界客观事实）
- 例：\`"无界灵根"\`
- 必填，永不为空（否则该 entry 被过滤）
- **唯一事实源**`;

const VALUE_NEW = `### 3.1 \`value\`

- **canonical truth**（世界客观事实）
- 例：\`"无界灵根"\`
- **唯一事实源**
- 空值 / 不可渲染 / 是否过滤由 View 层处理——本设计**不约束数据模型必填性**`;

// ── 修正 2 · §3.2 display 语义 + 三者关系 ──

const DISPLAY_OLD = `### 3.2 \`display\`

- **对外公开认知**（世界对这条 identity 的公开说法）
- 例：\`"四系伪灵根"\`
- 可选，可为 \`null\`
- **不是真值**，是「多数不知情者看到的版本」
- 语义：当某视角「不应知道真相」时，看到的版本
- **不构成 identity 的第二事实源**——它只是「对外版本」`;

const DISPLAY_NEW = `### 3.2 \`display\`

- **对外公开认知**（世界对这条 identity 的公开说法）
- 例：\`"四系伪灵根"\`
- 可选，可为 \`null\`
- **不是真值**，是「多数不知情者看到的版本」
- 语义：当某视角「不应知道真相」时，看到的版本
- **不构成 identity 的第二事实源**——它只是「对外版本」

**三者关系（严格不重叠）**：

- \`value\`：**canonical truth**（世界客观真相）
- \`display\`：**世界公开认知**（不知情者看到的版本）
- \`revealedAt\`：**canonical truth 是否已对外公开**
  - \`revealedAt == null\`：真相尚未公开，不知情者只知 \`display\`
  - \`revealedAt != null\`：真相已公开，Player / NPC 直接看 \`value\`（不再 display 优先）
- \`visibility\`（\`public / hidden / discoverable / gmOnly\`）：**设计者意图**，与 \`revealedAt\` **正交**
  - \`public\`：设计上即公开；此时 \`display\` 通常与 \`value\` 相同或为 \`null\`
  - \`hidden\`：设计上隐藏；\`revealedAt != null\` 表示剧情已揭示
  - \`discoverable\`：设计上允许被发现；\`revealedAt != null\` 表示已发现并公开

**禁止重叠**：\`public\` 不等于 \`revealedAt != null\`；\`display\` 不等于 \`value\` 的另一种表现形式。
P6.5b 文档后续章节严格按本节的语义展开。`;

// ── 修正 3 · §4.2 AI 措辞 ──

const AI_OLD = `### 4.2 AI（天道视角）

**主体**：剧情主持 AI。

**认知**：**天道全知**。

- AI 知道所有 entries 的真相（除 \`gmOnly\`）
- AI 同时知道「对外公开说法」（\`display\`），用于描述 NPC 视角
- AI 是「天道 + 主持人」双重身份：
  - 天道：知道一切
  - 主持人：决定何时揭露`;

const AI_NEW = `### 4.2 AI（天道视角）

**主体**：剧情主持 AI。

**认知**：**对非 gmOnly entry 的全知视角**。

- AI View 对**非 \`gmOnly\`** entry 可读取 **canonical value**
- AI 同时读取 \`display\` 作为「世界公开认知」，用于描述 NPC 视角
- AI 是「天道 + 主持人」双重身份：
  - 天道：可读取所有非 \`gmOnly\` 的 canonical truth
  - 主持人：决定何时揭露
- **\`gmOnly\` entry 永不输出**（AI 也看不到）`;

const PATCHES = [
    { id: 'value',   desc: '§3.1 value 语义',         match: VALUE_OLD,   replace: VALUE_NEW },
    { id: 'display', desc: '§3.2 display 三者关系',   match: DISPLAY_OLD, replace: DISPLAY_NEW },
    { id: 'ai',      desc: '§4.2 AI 措辞',            match: AI_OLD,      replace: AI_NEW },
];

// ── 修正 4 · §5.4 矩阵两行 ──

const NPC_MATRIX_OLD = `| \`hidden\` | 有 | — | \`display\` 优先，无则 \`value\` |
| \`discoverable\` | \`null\` | \`true\` | \`[隐藏{label}]\` |
| \`discoverable\` | \`null\` | \`false\` | \`display\` 优先，无则 **不输出** |
| \`discoverable\` | 有 | — | \`display\` 优先，无则 \`value\` |`;

const NPC_MATRIX_NEW = `| \`hidden\` | 有 | — | \`value\` |
| \`discoverable\` | \`null\` | \`true\` | \`[隐藏{label}]\` |
| \`discoverable\` | \`null\` | \`false\` | \`display\` 优先，无则 **不输出** |
| \`discoverable\` | 有 | — | \`value\` |`;

// ── 修正 5 · §5.4 说明段落（hidden + 未 known 精确化 + reveal 行为精确化） ──

const NPC_NOTES_OLD = `- \`hidden + known\`：NPC 已获真知，看 \`value\`（NPC 私知，不需要全局 reveal）
- \`hidden + 未 known\`：NPC 不知有隐藏，只知对外说法（display）或一无所知
- \`discoverable + known + 未 reveal\`：NPC **察觉到有隐藏**，但不知内容 → \`[隐藏{label}]\`
- \`discoverable + 未 known\`：NPC 完全不知有隐藏，只知对外说法
- \`revealedAt != null\`：全局已公开，所有 NPC 都看到真相（\`display\` 若有则优先）`;

const NPC_NOTES_NEW = `- \`hidden + known\`：NPC 已获真知，看 \`value\`（NPC 私知，不需要全局 reveal）
- \`hidden + 未 known\`：NPC **不知道真相存在**，只知对外说法
  - 这里的 \`display\` 是 **NPC 实际持有的公开认知**，不代表 NPC 察觉到有隐藏
  - 若 \`display\` 为 \`null\` → 不输出（NPC 对这条 entry 一无所知）
- \`discoverable + known + 未 reveal\`：NPC **察觉到有隐藏**，但不知内容 → \`[隐藏{label}]\`
- \`discoverable + 未 known\`：NPC 完全不知有隐藏，只知对外说法（display 优先，无则不输出）
- \`revealedAt != null\`：全局真相已公开，所有 NPC 直接看 \`value\`（**不再 display 优先**）`;

const PATCHES_2 = [
    { id: 'npc-matrix', desc: '§5.4 NPC 矩阵两行改 value',  match: NPC_MATRIX_OLD, replace: NPC_MATRIX_NEW },
    { id: 'npc-notes',  desc: '§5.4 NPC 说明段落精确化',    match: NPC_NOTES_OLD,  replace: NPC_NOTES_NEW },
];

const ALL_PATCHES = [...PATCHES, ...PATCHES_2];

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.5b Doc Fix ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }
const src = fs.readFileSync(TARGET, 'utf8');
const stats = []; let failed = null;
for (const p of ALL_PATCHES) {
    const count = countOccurrences(src, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(12) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    console.error('   aborting. no files written.');
    process.exit(1);
}
let next = src;
for (const p of ALL_PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - src.length;
console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
