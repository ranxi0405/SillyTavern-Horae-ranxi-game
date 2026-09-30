#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'index.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p6.3c-auto-trigger.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── A. import 加 runDiscovery ──

const IMP_OLD = `import { renderIdentityAiSection } from './core/memory/identityView.js';`;

const IMP_NEW = `import { renderIdentityAiSection } from './core/memory/identityView.js';
import { runDiscovery } from './core/memory/identityDiscovery.js';`;

// ── B. onMessageReceived 里挂钩 ──

const CALL_OLD = `        if (!_summaryInProgress) {
            await getContext().saveChat();
        }
    } catch (err) {
        console.error(\`[Horae] onMessageReceived 处理消息 #\${messageId} 失败:\`, err);
    }`;

const CALL_NEW = `        // P6.3c: AI 回复完成后评估 identity discovery 条件
        // state 已结算完成，只改内存，依赖下方常规 saveChat 落盘
        try {
            const _identity = chat?.[0]?.horae_meta?.identity;
            if (_identity) {
                const _state = horaeManager.getLatestState(0);
                const _r = runDiscovery(_identity, _state);
                if (_r.applied.length > 0) {
                    console.log('[Horae] identity discovery applied:', _r.applied);
                }
            }
        } catch (e) {
            console.warn('[Horae] identity discovery 评估失败:', e);
        }

        if (!_summaryInProgress) {
            await getContext().saveChat();
        }
    } catch (err) {
        console.error(\`[Horae] onMessageReceived 处理消息 #\${messageId} 失败:\`, err);
    }`;

const PATCHES = [
    { id: 'imp',  desc: 'import 加 runDiscovery',           match: IMP_OLD,  replace: IMP_NEW },
    { id: 'call', desc: 'onMessageReceived 挂钩 discovery',  match: CALL_OLD, replace: CALL_NEW },
];

const TEST_FILE_CONTENT = `import fs from 'node:fs';
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
check('index import identityDiscovery 只出现一次', (idx.match(/from '.\\/core\\/memory\\/identityDiscovery.js'/g) || []).length === 1);
check('index 调 runDiscovery(_identity, _state)', /runDiscovery\\(_identity, _state\\)/.test(idx));
check('index 用 getLatestState(0)', idx.includes('horaeManager.getLatestState(0)'));
check('index 读 chat[0].horae_meta.identity', idx.includes('chat?.[0]?.horae_meta?.identity'));
check('index 有 try-catch 包裹', /try \\{[\\s\\S]*?runDiscovery[\\s\\S]*?\\} catch \\(e\\)/.test(idx));
check('index 打印 applied', idx.includes("console.log('[Horae] identity discovery applied:'"));
check('index 出错不吞（有 warn）', idx.includes("console.warn('[Horae] identity discovery 评估失败:'"));

// 顺序断言：挂钩代码应在 saveChat 之前
const idxHook = idx.indexOf('runDiscovery(_identity, _state)');
const idxSave = idx.indexOf('await getContext().saveChat();', idxHook - 500);
check('discovery 钩在 saveChat 之前', idxHook > 0 && idxSave > idxHook);

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.3c Patch ===');
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(5) + ' ' + s.desc);
}
console.log('');
if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}
let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);
const delta = next.length - src.length;
let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('target : ' + TARGET);
console.log('  delta: ' + (delta >= 0 ? '+' : '') + delta + ' bytes');
console.log('test   : ' + TEST_FILE + ' exists=' + testExists);
console.log('');
if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }
fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
