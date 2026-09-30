#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/identityGmApi.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p6.2-gm-discover.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const HELP_OLD = `                '    reveal(id)                   - 揭示（设置 revealedAt）',`;

const HELP_NEW = `                '    discover(id, opts)           - 发现（设置 discovery.discoveredAt，AI 视角不变）',
                '    reveal(id, opts)             - 揭示（设置 revealedAt，AI 切换到 value）',`;

const REVEAL_OLD = `        reveal(entryId) {
            if (!entryId) return _log('reveal', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            entry.revealedAt = { iso: now, story: null };
            entry.updatedAt = now;
            return _log('reveal', entry);
        },`;

const REVEAL_NEW = `        discover(entryId, opts = {}) {
            if (!entryId) return _log('discover', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            if (!entry.discovery || typeof entry.discovery !== 'object') {
                entry.discovery = {
                    type: 'manual',
                    trigger: null,
                    requirement: null,
                    progress: 0,
                    discoveredAt: null,
                    meta: {},
                };
            }
            if (entry.discovery.discoveredAt == null) {
                entry.discovery.discoveredAt = {
                    iso: now,
                    story: (opts && opts.story) || null,
                };
            }
            entry.updatedAt = now;
            return _log('discover', entry);
        },

        reveal(entryId, opts = {}) {
            if (!entryId) return _log('reveal', null);
            const id = _getOrThrow();
            if (!id) return null;
            const entry = _findEntry(id, entryId);
            if (!entry) { _warn('未找到 entry: ' + entryId); return null; }
            const now = new Date().toISOString();
            const story = (opts && opts.story) || null;
            if (!entry.revealedAt) {
                entry.revealedAt = { iso: now, story };
            } else {
                if (story) entry.revealedAt.story = story;
            }
            entry.updatedAt = now;
            return _log('reveal', entry);
        },`;

const PATCHES = [
    { id: 'help',   desc: 'help() 新增 discover / reveal 行', match: HELP_OLD,   replace: HELP_NEW },
    { id: 'reveal', desc: '新增 discover() + 升级 reveal()',    match: REVEAL_OLD, replace: REVEAL_NEW },
];

const TEST_FILE_CONTENT = `import { createIdentityGmApi } from '../core/memory/identityGmApi.js';

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log = () => {};
console.warn = () => {};

let pass = 0, fail = 0;
function check(label, cond) {
    _origLog((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

let fakeId = null;
const ctx = {
    getIdentity: () => fakeId,
    setIdentity: (id) => { fakeId = id; },
    saveCard: async () => true,
};
const gm = createIdentityGmApi(ctx);

function mkEntry(id, kind, value, extra = {}) {
    return Object.assign({
        id, kind, value,
        visibility: 'discoverable',
        revealedAt: null,
        discovery: null,
    }, extra);
}

_origLog('=== P6.2 GM discover / reveal 测试 ===');
_origLog('');

// case1: discover 首次写 discoveredAt
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.discover('e1', { story: '342年12月24日' });
    const d = fakeId.entries[0].discovery;
    check('discovery 对象已创建', d && typeof d === 'object');
    check('type=manual', d.type === 'manual');
    check('discoveredAt.iso 存在', typeof d.discoveredAt?.iso === 'string');
    check('discoveredAt.story = 342年12月24日', d.discoveredAt.story === '342年12月24日');
    check('revealedAt 未变', fakeId.entries[0].revealedAt === null);
    _origLog('');
}

// case2: discover 二次幂等
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.discover('e1', { story: 'first' });
    const iso1 = fakeId.entries[0].discovery.discoveredAt.iso;
    const story1 = fakeId.entries[0].discovery.discoveredAt.story;
    await new Promise(r => setTimeout(r, 15));
    gm.discover('e1', { story: 'second' });
    const iso2 = fakeId.entries[0].discovery.discoveredAt.iso;
    const story2 = fakeId.entries[0].discovery.discoveredAt.story;
    check('iso 保留首次', iso1 === iso2);
    check('story 不被二次覆盖', story1 === story2);
    _origLog('');
}

// case3: discover 时 discovery 已有结构化对象 -> 保留 type/trigger
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X', {
        discovery: { type: 'condition', trigger: 'spiritual_sense', discoveredAt: null, progress: 0 }
    })] };
    gm.discover('e1');
    const d = fakeId.entries[0].discovery;
    check('type 保持 condition', d.type === 'condition');
    check('trigger 保持 spiritual_sense', d.trigger === 'spiritual_sense');
    check('discoveredAt 被写入', !!d.discoveredAt?.iso);
    _origLog('');
}

// case4: reveal 首次写 revealedAt
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: '342年12月25日' });
    const r = fakeId.entries[0].revealedAt;
    check('revealedAt.iso 存在', typeof r?.iso === 'string');
    check('revealedAt.story = 342年12月25日', r.story === '342年12月25日');
    _origLog('');
}

// case5: reveal 不传 opts
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1');
    check('revealedAt.story = null', fakeId.entries[0].revealedAt.story === null);
    _origLog('');
}

// case6: reveal 二次幂等：iso 保留，story 覆盖
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: 'first' });
    const iso1 = fakeId.entries[0].revealedAt.iso;
    await new Promise(r => setTimeout(r, 15));
    gm.reveal('e1', { story: 'second' });
    const iso2 = fakeId.entries[0].revealedAt.iso;
    const story2 = fakeId.entries[0].revealedAt.story;
    check('iso 保留首次', iso1 === iso2);
    check('story 被覆盖为 second', story2 === 'second');
    _origLog('');
}

// case7: reveal 二次不传 story -> story 不被覆盖
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: 'first' });
    gm.reveal('e1');
    check('story 保留 first', fakeId.entries[0].revealedAt.story === 'first');
    _origLog('');
}

// case8: help 包含 discover 与 reveal
{
    const helpText = gm.help();
    check('help 含 discover', helpText.includes('discover'));
    check('help 含 reveal', helpText.includes('reveal'));
    _origLog('');
}

// case9: 非法 entryId
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    const r1 = gm.discover('missing');
    const r2 = gm.reveal('missing');
    check('discover 不存在 entry 返回 null', r1 === null);
    check('reveal 不存在 entry 返回 null', r2 === null);
    _origLog('');
}

// case10: identity 不存在
{
    fakeId = null;
    const r1 = gm.discover('e1');
    const r2 = gm.reveal('e1');
    check('identity null 时 discover 返回 null', r1 === null);
    check('identity null 时 reveal 返回 null', r2 === null);
    _origLog('');
}

console.log = _origLog;
console.warn = _origWarn;

_origLog('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.2 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');
if (!fs.existsSync(TARGET)) { console.error('XX target missing'); process.exit(1); }
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(7) + ' ' + s.desc);
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
