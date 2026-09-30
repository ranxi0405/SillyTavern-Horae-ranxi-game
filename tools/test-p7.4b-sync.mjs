import fs from 'node:fs';
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
check('npcKnowledge.js 只出现一次', (deploy.match(/'core\/memory\/npcKnowledge.js'/g) || []).length === 1);
check('REL_FILES 定义只出现一次', (deploy.match(/REL_FILES = \[/g) || []).length === 1);

// 回归：P6.1 schema 示例保留
check('P6.1 §4.2 仍保留 type:npc 示例', discDoc.includes("type: 'npc'") && discDoc.includes("npcId: 'N016'"));

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
