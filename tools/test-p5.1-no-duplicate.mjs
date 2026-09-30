import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
console.log('=== P5.1 去重验证 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const hm = read('core/horaeManager.js');
const idx = read('index.js');
const view = read('core/memory/identityView.js');
check('hm 无 _generateIdentitySection 定义', !hm.includes('_generateIdentitySection()'));
check('hm 无 _generateIdentitySection 调用', !hm.includes('this._generateIdentitySection'));
check('hm 无 [角色固有设定] header', !hm.includes('[角色固有设定]'));
check('hm 无 import isIdentityEmpty', !hm.includes("import { isIdentityEmpty }"));
check('hm 无 import sanitizeHiddenKeywords', !hm.includes("import { sanitizeHiddenKeywords }"));
check('index 有 renderIdentityAiSection import', idx.includes('import { renderIdentityAiSection }'));
check('index 有 renderIdentityAiSection 调用', idx.includes('renderIdentityAiSection('));
check('view 有 renderIdentityAiSection 导出', view.includes('export function renderIdentityAiSection'));
check('view 有 _sectionHeader', view.includes('function _sectionHeader'));
check('index 仍 import sanitizeHiddenKeywords', idx.includes('sanitizeHiddenKeywords'));
console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
