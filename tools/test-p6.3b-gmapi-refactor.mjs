import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('=== P6.3b GM API 重构验证 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const gm = read('core/memory/identityGmApi.js');
const disc = read('core/memory/identityDiscovery.js');

// import 断言
check('gm 顶部 import applyDiscover', gm.includes("import { applyDiscover, applyReveal } from './identityDiscovery.js'"));
check('gm import identityDiscovery 只出现一次', (gm.match(/from '.\/identityDiscovery.js'/g) || []).length === 1);

// discover 薄包装断言
check('gm.discover 调用 applyDiscover', /discover\(entryId, opts = \{\}\)[\s\S]*?applyDiscover\(entry, opts\)/.test(gm));
check('gm.discover 不再内联创建 entry.discovery', !/discover\(entryId[\s\S]*?entry\.discovery = \{/.test(gm));

// reveal 薄包装断言
check('gm.reveal 调用 applyReveal', /reveal\(entryId, opts = \{\}\)[\s\S]*?applyReveal\(entry, opts\)/.test(gm));
check('gm.reveal 不再内联写 entry.revealedAt', !/reveal\(entryId[\s\S]*?entry\.revealedAt = \{/.test(gm));

// 唯一入口断言
check('identityDiscovery 导出 applyDiscover', disc.includes('export function applyDiscover'));
check('identityDiscovery 导出 applyReveal', disc.includes('export function applyReveal'));

// 未动 help
check('gm.help 仍含 discover 行', gm.includes("discover(id, opts)"));
check('gm.help 仍含 reveal 行', gm.includes("reveal(id, opts)"));

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
