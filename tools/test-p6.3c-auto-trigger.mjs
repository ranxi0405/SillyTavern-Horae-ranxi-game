import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== P6.3c 自动触发验证 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const idx = read('index.js');

check('index 顶部 import runDiscovery', idx.includes("import { runDiscovery } from './core/memory/identityDiscovery.js'"));
check('index import identityDiscovery 只出现一次', (idx.match(/from '.\/core\/memory\/identityDiscovery.js'/g) || []).length === 1);
check('index 调 runDiscovery(_identity, _state)', /runDiscovery\(_identity, _state\)/.test(idx));
check('index 用 getLatestState(0)', idx.includes('horaeManager.getLatestState(0)'));
check('index 读 chat[0].horae_meta.identity', idx.includes('chat?.[0]?.horae_meta?.identity'));
check('index 有 try-catch 包裹', /try \{[\s\S]*?runDiscovery[\s\S]*?\} catch \(e\)/.test(idx));
check('index 打印 applied', idx.includes("console.log('[Horae] identity discovery applied:'"));
check('index 出错不吞（有 warn）', idx.includes("console.warn('[Horae] identity discovery 评估失败:'"));

// 顺序断言：挂钩代码应在 saveChat 之前
const idxHook = idx.indexOf('runDiscovery(_identity, _state)');
const idxSave = idx.indexOf('await getContext().saveChat();', idxHook - 500);
check('discovery 钩在 saveChat 之前', idxHook > 0 && idxSave > idxHook);

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
