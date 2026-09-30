#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_NPC = path.join(ROOT, 'docs/identity-npc-knowledge-design.md');
const DOC_DISC = path.join(ROOT, 'docs/identity-discovery-state-machine.md');
const DEPLOY = path.join(ROOT, 'tools/deploy-p3-mount.mjs');
const TEST_FILE = path.join(ROOT, 'tools/test-p7.4b-sync.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── A. P7.1 文档 §8 流程图修正 ──

const NPC_FLOW_OLD = `P7.4 将实现该类型。触发流程：

    1. discovery 评估（evaluateEntry）
       ↓
    2. 满足 requirement（如 affinityMin）
       ↓
    3. 调 applyDiscover(entry)         // P6.3 已实现
       ↓
    4. 调 applyNpcKnow(entryId, npcId) // P7.4 新增
       ↓
    5. 写 npcKnowledge[npcId][entryId].known = true

**注意**：

- \`applyDiscover\`（P6.3）写 \`entry.discovery.discoveredAt\`
- \`applyNpcKnow\`（P7.4）写 \`npcKnowledge[npcId][entryId]\`
- 两者是**独立写入**，职责不同
- \`applyDiscover\` 是 entry 级（全局），\`applyNpcKnow\` 是 npc 级（针对特定 NPC）`;

const NPC_FLOW_NEW = `P7.4 已实现该类型。触发流程：

    1. discovery 评估（evaluateEntry）
       ↓
    2. 满足 requirement（如 affinityMin）
       ↓
    3. 调 applyNpcKnow(entryId, npcId)  // P7.4 唯一写入
       ↓
    4. 写 npcKnowledge[npcId][entryId].known = true

**注意**：

- \`type: 'npc'\` 满足后**只写 \`npcKnowledge\`**，**不写** \`entry.discovery.discoveredAt\`
- 这与 \`type: 'condition'\` 的全局发现路径**正交**：
  - \`condition\` 满足 → 写 \`entry.discovery.discoveredAt\`（全局）
  - \`npc\` 满足 → 写 \`npcKnowledge[npcId][entryId]\`（针对特定 NPC）
- 若某 entry 需要同时触发"全局发现 + NPC 私知"，应显式配置为两条独立规则
- 两者都走 \`core/memory/npcKnowledge.js\` 的 \`applyNpcKnow\`（唯一状态修改入口）`;

// ── B. P6.1 文档 §10 唯一入口措辞修正 ──

const DISC_ENTRY_OLD = `applyDiscover / applyReveal（唯一状态修改入口）`;

const DISC_ENTRY_NEW = `applyDiscover / applyReveal / applyNpcKnow（唯一状态修改入口）`;

// ── C. P6.1 文档 §13 加 type:'npc' 说明 ──

const DISC_BOUNDARY_OLD = `### 暂缓类型（schema 保留）

- \`event\`：需 AI 输出结构化 eventId，牵动 Prompt / 解析
- \`item\`：需 item 事件钩子
- \`npc\`：依赖 P7 NPC 认知系统`;

const DISC_BOUNDARY_NEW = `### 已实现类型（P7 补充）

- \`npc\`：P7.4 已实现（依赖 P7.2 npcKnowledge 模块）
  - 满足 requirement 后只写 \`npcKnowledge[npcId][entryId]\`
  - **不写** \`entry.discovery.discoveredAt\`（与 \`condition\` 正交）
  - 与 P6.1 §4.2 预留 schema 一致

### 暂缓类型（schema 保留）

- \`event\`：需 AI 输出结构化 eventId，牵动 Prompt / 解析
- \`item\`：需 item 事件钩子`;

// ── D. deploy REL_FILES 加 npcKnowledge.js ──

const DEPLOY_OLD = `    'core/memory/identityDiscovery.js',
    'core/memory/identitySchemaVersion.js',`;

const DEPLOY_NEW = `    'core/memory/identityDiscovery.js',
    'core/memory/npcKnowledge.js',
    'core/memory/identitySchemaVersion.js',`;

const PATCHES = [
    { file: DOC_NPC,  id: 'npc-flow',     desc: 'P7.1 §8 流程图修正',          match: NPC_FLOW_OLD,     replace: NPC_FLOW_NEW },
    { file: DOC_DISC, id: 'disc-entry',   desc: 'P6.1 §10 唯一入口加 applyNpcKnow', match: DISC_ENTRY_OLD, replace: DISC_ENTRY_NEW },
    { file: DOC_DISC, id: 'disc-boundary', desc: 'P6.1 §13 加 type:npc 已实现',   match: DISC_BOUNDARY_OLD, replace: DISC_BOUNDARY_NEW },
    { file: DEPLOY,   id: 'deploy-rel',   desc: 'REL_FILES 加 npcKnowledge.js',  match: DEPLOY_OLD,       replace: DEPLOY_NEW },
];

const TEST_FILE_CONTENT = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== P7.4b 文档同步 + REL_FILES 验证 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const npcDoc = read('docs/identity-npc-knowledge-design.md');
const discDoc = read('docs/identity-discovery-state-machine.md');
const deploy = read('tools/deploy-p3-mount.mjs');

// P7.1 文档：旧的 applyDiscover + applyNpcKnow 两步流程已删
check('P7.1 不再写"调 applyDiscover(entry) // P6.3 已实现"', !npcDoc.includes('调 applyDiscover(entry)         // P6.3 已实现'));
check('P7.1 新流程写"只写 npcKnowledge"', npcDoc.includes('只写'));
check('P7.1 说明与 condition 正交', npcDoc.includes('正交'));
check('P7.1 保留 type:npc schema 示例', npcDoc.includes("type: 'npc'"));

// P6.1 文档：唯一入口更新
check('P6.1 §10 唯一入口含 applyNpcKnow', discDoc.includes('applyDiscover / applyReveal / applyNpcKnow'));
check('P6.1 §13 加了 type:npc 已实现', discDoc.includes('P7.4 已实现'));

// deploy REL_FILES 断言
check('REL_FILES 含 npcKnowledge.js', deploy.includes("'core/memory/npcKnowledge.js'"));
check('npcKnowledge.js 只出现一次', (deploy.match(/'core\\/memory\\/npcKnowledge.js'/g) || []).length === 1);
check('REL_FILES 定义只出现一次', (deploy.match(/REL_FILES = \\[/g) || []).length === 1);

// 回归：P6.1 schema 示例保留
check('P6.1 §4.2 仍保留 type:npc 示例', discDoc.includes("type: 'npc'") && discDoc.includes("npcId: 'N016'"));

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.4b Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

const fileContents = {};
for (const f of [DOC_NPC, DOC_DISC, DEPLOY]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
    fileContents[f] = fs.readFileSync(f, 'utf8');
}

const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(fileContents[p.file], p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}
console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(14) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}

const next = { ...fileContents };
for (const p of PATCHES) next[p.file] = next[p.file].replace(p.match, p.replace);

console.log('files:');
for (const f of [DOC_NPC, DOC_DISC, DEPLOY]) {
    const delta = next[f].length - fileContents[f].length;
    console.log('  ' + f + ' delta=' + (delta >= 0 ? '+' : '') + delta);
}
console.log('  test: ' + TEST_FILE);

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

for (const f of [DOC_NPC, DOC_DISC, DEPLOY]) {
    fs.writeFileSync(f, next[f], 'utf8');
    console.log('[write] ' + f);
}
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
