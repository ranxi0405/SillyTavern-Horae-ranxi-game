#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/identity-value-display-design.md');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const AI_OLD = `### 4.2 AI（天道视角）

**主体**：剧情主持 AI。

**认知**：**对非 gmOnly entry 的全知视角**。

- AI View 对**非 \`gmOnly\`** entry 可读取 **canonical value**
- AI 同时读取 \`display\` 作为「世界公开认知」，用于描述 NPC 视角
- AI 是「天道 + 主持人」双重身份：
  - 天道：可读取所有非 \`gmOnly\` 的 canonical truth
  - 主持人：决定何时揭露
- **\`gmOnly\` entry 永不输出**（AI 也看不到）`;

const AI_NEW = `### 4.2 AI（天道视角）

**主体**：剧情主持 AI。

**认知**：**对非 gmOnly entry 的全知视角**。

- AI View 对**非 \`gmOnly\`** entry 可读取 **canonical value**
- AI 同时读取 \`display\` 作为「世界公开认知」，用于描述 NPC 视角
- AI 是「天道 + 主持人」双重身份：
  - 天道：可读取所有非 \`gmOnly\` 的 canonical truth
  - 主持人：决定何时揭露
- **\`gmOnly\` entry 永不输出**（AI 也看不到）

**与 P4.4 hiddenKeywords 的关系**：

- AI View **读取** canonical value，不代表最终 Prompt 中**原样出现**
- 最终注入 Prompt 前，value 会经过既有 \`sanitizeHiddenKeywords\` 脱敏层（P4.4）
- 两层职责独立：
  - **P6.5.1**：决定「输出 value 还是 display」，display 异于 value 时附注对外
  - **P4.4 hiddenKeywords**：决定「哪些敏感真值在最终 Prompt 中被替换」
- 因此若角色卡配了 \`hiddenKeywords: { '无界灵根': '[隐藏灵根]' }\`，
  AI 视角的最终输出会是：
  \`\`\`
  · 灵根 = [隐藏灵根]（对外：四系伪灵根）
  \`\`\`
  这是**两层机制叠加的正确结果**，不是 P6.5.1 的 bug
- 若某角色卡**未配** hiddenKeywords，则 AI 视角输出：
  \`\`\`
  · 灵根 = 无界灵根（对外：四系伪灵根）
  \`\`\`
  未脱敏的 canonical value 会直接进入 Prompt
- 角色卡作者**可自行选择**是否配置 hiddenKeywords`;

const PATCHES = [
    { id: 'ai-sanitize-note', desc: '§4.2 加与 hiddenKeywords 关系的说明', match: AI_OLD, replace: AI_NEW },
];

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.5c Doc Note ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(18) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
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
