#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'docs/identity-npc-prompt-injection-design.md');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── P1 · §4.3 顶部说明 ──
const P1_OLD = "在 `core/horaeManager.js` 的 `generateCompactPrompt` 内，`[当前场景NPC]` 段 push 之后：";
const P1_NEW = [
    "**实现位置**：`index.js` 的 `onPromptReady` 内，**与 P5 的 `renderIdentityAiSection` 同层**。",
    "",
    "**核心原则**（P7.5 硬约束）：Identity View 属于 **Prompt 视图层**，由 `index.js` 负责组合；`horaeManager.js` **不直接消费** `identityView`。",
    "",
    "**理由**：P5 的 `renderIdentityAiSection` 已在 `index.js` 调用；`horaeManager.js` 目前不 import `identityView.js`（保持\"世界状态管理器\"职责）；若强行引入会改变依赖图并可能触发循环。",
    "",
    "伪代码（`index.js` 内，见 §4.4）：",
].join("\n");

// ── P2 · §4.3 代码块替换（修正：空行含 8 空格）──
const P2_OLD = [
    "    if (sendCharacters) {",
    "        // ... 现有 [当前场景NPC] 段渲染 ...",
    "        ",
    "        const npcKnowledgeSection = this._generateNpcKnowledgeSection(state);",
    "        if (npcKnowledgeSection) {",
    "            lines.push(`\\n[${L('NPC 认知', ...)}]`);",
    "            lines.push(npcKnowledgeSection);",
    "        }",
    "    }",
].join("\n");
const P2_NEW = [
    "    // index.js · onPromptReady（与 P5 的 renderIdentityAiSection 同层）",
    "    const dataPrompt = sanitizeHiddenKeywords(_rawSplit.mainPrompt);",
    "    const identitySection = renderIdentityAiSection(chat?.[0]?.horae_meta?.identity, { lang: horaeManager._getAiOutputLang() });",
    "    const npcKnowledgeSection = _generateNpcKnowledgeSection(",
    "        chat?.[0]?.horae_meta?.identity,",
    "        chat?.[0]?.horae_meta?.npcKnowledge,",
    "        horaeManager.getLatestState(0),",
    "        { lang: horaeManager._getAiOutputLang() }",
    "    );",
    "    const dataPromptWithIdentity = identitySection ? `${identitySection}\\n\\n${dataPrompt}` : dataPrompt;",
    "    const dataPromptWithBoth = npcKnowledgeSection ? `${dataPromptWithIdentity}\\n\\n${npcKnowledgeSection}` : dataPromptWithIdentity;",
].join("\n");

// ── P3 · §4.3 bullets + §4.4 ──
const P3_OLD = [
    "- **不新增开关**：与 `sendCharacters` 共用",
    "- **不新增段头到 stable prompt**：保持动态段与现有缓存策略一致",
    "- **不新增函数到 `identityView.js`**：P7.5 新增 `_generateNpcKnowledgeSection` 属 `horaeManager` 内部（Prompt 层）",
].join("\n");
const P3_NEW = [
    "- **不新增开关**：与 `sendCharacters` 语义对齐（无 NPC 或无知识 → 整段不输出）",
    "- **不新增段头到 stable prompt**：保持动态段与现有缓存策略一致",
    "- **不修改 `identityView.js`**：`_generateNpcKnowledgeSection` 是 **`index.js` 内部函数**，只调用 `renderIdentityNpcRows`，不重复实现 View 逻辑",
    "- **不修改 `horaeManager.js`**：不引入 `identityView` 依赖，保持\"世界状态管理器\"职责",
    "",
    "### 4.4 段内顺序（Q3 决策）",
    "",
    "StableRulesPrompt → [角色固有设定] → [当前状态快照] → **[NPC 认知]** → recallPrompt → combinedPrompt",
    "",
    "**语义顺序**：稳定规则 → 世界/状态数据 → Identity AI View（天道已知） → NPC Knowledge View（NPC 已知） → Recall → 当前对话。",
    "",
    "**理由**：天道视角先提供完整事实，NPC 视角随后限制角色认知，两者相邻，AI 更容易理解区别。",
].join("\n");

// ── P4 · §10.1 位置 ──
const P4_OLD = "- 位置：`horaeManager.js` 内部（非导出）";
const P4_NEW = "- 位置：`index.js` 内部（非导出）";

// ── P5 · §11 P7.5.1 行 ──
const P5_OLD = "| **P7.5.1** | `generateCompactPrompt` 加 `[NPC 认知]` 段（不含 scope） | 本文档定稿 |";
const P5_NEW = "| **P7.5.1** | `index.js` 加 `[NPC 认知]` 段（不含 scope） | 本文档定稿 |";

// ── P6 · §13 关系图末尾 ──
const P6_OLD = [
    "         ↓",
    "    generateCompactPrompt 内 [NPC 认知] 段",
    "         ↓",
    "    dataPrompt（与其他动态段并列）",
].join("\n");
const P6_NEW = [
    "         ↓",
    "    index.js onPromptReady 内 [NPC 认知] 段",
    "         ↓",
    "    dataPromptWithIdentity（与 identity AI section 相邻）",
].join("\n");

const PATCHES = [
    { id: "P1-s43-top",     desc: "§4.3 顶部说明改 index.js",         match: P1_OLD, replace: P1_NEW },
    { id: "P2-s43-code",    desc: "§4.3 代码块改 index.js 版本",       match: P2_OLD, replace: P2_NEW },
    { id: "P3-s43-bullets", desc: "§4.3 bullets 更新 + §4.4 段内顺序", match: P3_OLD, replace: P3_NEW },
    { id: "P4-s101-loc",    desc: "§10.1 预留位置改 index.js",         match: P4_OLD, replace: P4_NEW },
    { id: "P5-s11-p751",    desc: "§11 P7.5.1 行明确 index.js",        match: P5_OLD, replace: P5_NEW },
    { id: "P6-s13-diagram", desc: "§13 关系图末尾改 index.js",         match: P6_OLD, replace: P6_NEW },
];

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.5.1b Doc Fix ===');
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
    console.log('  [' + tag.padEnd(12) + '] ' + s.id.padEnd(16) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX abort: ' + failed.id + ' count=' + failed.count);
    console.error('   检查文档原文是否与预期一致（尤其 §4.3 代码块缩进 / 反引号）。');
    process.exit(1);
}

let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);

console.log('target : ' + TARGET);
console.log('  delta: ' + (next.length - src.length) + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
console.log('');
console.log('done.');
