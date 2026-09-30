#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DISC = path.join(ROOT, 'core/memory/identityDiscovery.js');
const GMAPI = path.join(ROOT, 'core/memory/identityGmApi.js');
const INDEX = path.join(ROOT, 'index.js');
const TEST_FILE = path.join(ROOT, 'tools/test-p7.4-npc-discovery.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ── A. identityDiscovery.js：import + evaluateEntry + runDiscovery ──

const DISC_IMP_OLD = `const SENSE_TIER_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];`;

const DISC_IMP_NEW = `import { applyNpcKnow, hasKnown } from './npcKnowledge.js';

const SENSE_TIER_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];`;

const DISC_EVAL_OLD = `export function evaluateEntry(entry, state) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.visibility !== 'discoverable') return null;
    const d = entry.discovery;
    if (!d || typeof d !== 'object') return null;
    if (d.type !== 'condition') return null;
    const req = d.requirement;
    if (!req || typeof req !== 'object') return null;

    // reveal 优先（若条件都满足）
    if (req.revealAt && _matchAll(req.revealAt, state)) {
        if (!entry.revealedAt) {
            return { entryId: entry.id, action: 'reveal', reason: 'revealAt matched' };
        }
    }
    if (req.discoverAt && _matchAll(req.discoverAt, state)) {
        if (!d.discoveredAt) {
            return { entryId: entry.id, action: 'discover', reason: 'discoverAt matched' };
        }
    }
    return null;
}`;

const DISC_EVAL_NEW = `export function evaluateEntry(entry, state) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.visibility !== 'discoverable') return null;
    const d = entry.discovery;
    if (!d || typeof d !== 'object') return null;

    if (d.type === 'condition') {
        const req = d.requirement;
        if (!req || typeof req !== 'object') return null;
        // reveal 优先（若条件都满足）
        if (req.revealAt && _matchAll(req.revealAt, state)) {
            if (!entry.revealedAt) {
                return { entryId: entry.id, action: 'reveal', reason: 'revealAt matched' };
            }
        }
        if (req.discoverAt && _matchAll(req.discoverAt, state)) {
            if (!d.discoveredAt) {
                return { entryId: entry.id, action: 'discover', reason: 'discoverAt matched' };
            }
        }
        return null;
    }

    if (d.type === 'npc') {
        if (!d.npcId) return null;
        const req = d.requirement;
        if (!req || typeof req !== 'object') return null;
        if (_matchAll(req, state)) {
            return { entryId: entry.id, action: 'npcKnow', npcId: d.npcId, reason: 'npc requirement matched' };
        }
        return null;
    }

    return null;
}`;

const DISC_RUN_OLD = `export function runDiscovery(identity, state, opts = {}) {
    const actions = evaluateAll(identity, state);
    if (actions.length === 0) return { actions: [], applied: [] };
    const applied = [];
    for (const a of actions) {
        const entry = identity.entries.find(e => e && e.id === a.entryId);
        if (!entry) continue;
        if (a.action === 'discover') {
            applyDiscover(entry, opts);
        } else if (a.action === 'reveal') {
            applyReveal(entry, opts);
        }
        applied.push(a);
    }
    return { actions, applied };
}`;

const DISC_RUN_NEW = `export function runDiscovery(identity, state, opts = {}) {
    const actions = evaluateAll(identity, state);
    if (actions.length === 0) return { actions: [], applied: [] };
    const knowledge = (opts && opts.knowledge) || null;
    const applied = [];
    for (const a of actions) {
        if (a.action === 'npcKnow') {
            if (!knowledge) continue;
            if (hasKnown(knowledge, a.npcId, a.entryId)) continue;
            applyNpcKnow(knowledge, a.entryId, a.npcId, {
                source: 'npc_detected',
                story: (opts && opts.story) || null,
            });
            applied.push(a);
            continue;
        }
        const entry = identity.entries.find(e => e && e.id === a.entryId);
        if (!entry) continue;
        if (a.action === 'discover') {
            applyDiscover(entry, opts);
        } else if (a.action === 'reveal') {
            applyReveal(entry, opts);
        }
        applied.push(a);
    }
    return { actions, applied };
}`;

// ── B. identityGmApi.js：import + ctx + help + npcKnow/npcForget ──

const GM_IMP_OLD = `import { applyDiscover, applyReveal } from './identityDiscovery.js';`;

const GM_IMP_NEW = `import { applyDiscover, applyReveal } from './identityDiscovery.js';
import { applyNpcKnow, applyNpcForget } from './npcKnowledge.js';`;

const GM_CTX_OLD = `    const { getIdentity, setIdentity, saveCard } = ctx;`;

const GM_CTX_NEW = `    const { getIdentity, setIdentity, saveCard, getNpcKnowledgeMap } = ctx;`;

const GM_HELP_OLD = `                '    hide(id)                     - 隐藏（visibility=hidden）',
                '    generate(id)                 - 触发随机生成（占位）',`;

const GM_HELP_NEW = `                '    hide(id)                     - 隐藏（visibility=hidden）',
                '    npcKnow(npcId, entryId, opts) - 记录 NPC 对 entry 的认知',
                '    npcForget(npcId, entryId)    - 删除 NPC 对 entry 的认知',
                '    generate(id)                 - 触发随机生成（占位）',`;

const GM_METHOD_OLD = `        generate(entryId) {
            // 阶段 3 占位：随机生成逻辑留给后续阶段
            const id = _getOrThrow();`;

const GM_METHOD_NEW = `        npcKnow(npcId, entryId, opts = {}) {
            if (!npcId || !entryId) return _log('npcKnow', null);
            if (typeof getNpcKnowledgeMap !== 'function') { _warn('ctx.getNpcKnowledgeMap 未注入'); return null; }
            const knowledge = getNpcKnowledgeMap();
            if (!knowledge) return _log('npcKnow', null);
            const rec = applyNpcKnow(knowledge, entryId, npcId, opts);
            return _log('npcKnow', rec);
        },

        npcForget(npcId, entryId) {
            if (!npcId || !entryId) return _log('npcForget', false);
            if (typeof getNpcKnowledgeMap !== 'function') { _warn('ctx.getNpcKnowledgeMap 未注入'); return false; }
            const knowledge = getNpcKnowledgeMap();
            if (!knowledge) return _log('npcForget', false);
            const ok = applyNpcForget(knowledge, entryId, npcId);
            return _log('npcForget', ok);
        },

        generate(entryId) {
            // 阶段 3 占位：随机生成逻辑留给后续阶段
            const id = _getOrThrow();`;

// ── C. index.js：ctx 扩 getNpcKnowledgeMap + onMessageReceived 传 knowledge ──

const IDX_CTX_OLD = `        saveCard: async (id) => {
            try { return await _writeCardIdentity(id); } catch (_) { return false; }
        },
    });`;

const IDX_CTX_NEW = `        saveCard: async (id) => {
            try { return await _writeCardIdentity(id); } catch (_) { return false; }
        },
        getNpcKnowledgeMap: () => {
            const meta = horaeManager.getChat()?.[0]?.horae_meta;
            if (!meta) return null;
            if (!meta.npcKnowledge || typeof meta.npcKnowledge !== 'object') {
                meta.npcKnowledge = {};
            }
            return meta.npcKnowledge;
        },
    });`;

const IDX_CALL_OLD = `        try {
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
        }`;

const IDX_CALL_NEW = `        try {
            const _meta = chat?.[0]?.horae_meta;
            const _identity = _meta?.identity;
            if (_identity) {
                const _state = horaeManager.getLatestState(0);
                if (!_meta.npcKnowledge || typeof _meta.npcKnowledge !== 'object') {
                    _meta.npcKnowledge = {};
                }
                const _r = runDiscovery(_identity, _state, { knowledge: _meta.npcKnowledge });
                if (_r.applied.length > 0) {
                    console.log('[Horae] identity discovery applied:', _r.applied);
                }
            }
        } catch (e) {
            console.warn('[Horae] identity discovery 评估失败:', e);
        }`;

const TEST_FILE_CONTENT = `import { evaluateEntry, runDiscovery } from '../core/memory/identityDiscovery.js';

console.log('=== P7.4 npc discovery 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkEntry = (extra = {}) => Object.assign({
    id: 'e1', kind: 'spiritRoot', value: 'X',
    visibility: 'discoverable',
    discovery: null, revealedAt: null,
}, extra);

// case1: type:'npc' 满足 -> 返回 npcKnow action
{
    const e = mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }});
    const a = evaluateEntry(e, { affection: { N016: 70 } });
    console.log('[case1 npc 满足]');
    check('返回 action', a && a.action === 'npcKnow');
    check('npcId 传递', a.npcId === 'N016');
    console.log('');
}

// case2: type:'npc' 不满足 -> null
{
    const e = mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }});
    const a = evaluateEntry(e, { affection: { N016: 50 } });
    console.log('[case2 npc 不满足]');
    check('返回 null', a === null);
    console.log('');
}

// case3: type:'npc' 无 npcId -> null
{
    const e = mkEntry({ discovery: {
        type: 'npc',
        npcId: null,
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }});
    const a = evaluateEntry(e, { affection: { N016: 70 } });
    console.log('[case3 无 npcId]');
    check('返回 null', a === null);
    console.log('');
}

// case4: type:'condition' 行为不变
{
    const e = mkEntry({ discovery: {
        type: 'condition',
        requirement: { discoverAt: { senseRealm: '清明' } },
        discoveredAt: null,
    }});
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '凝照' } } });
    console.log('[case4 condition 未变]');
    check('返回 discover', a && a.action === 'discover');
    console.log('');
}

// case5: runDiscovery 处理 npcKnow action（无 knowledge 时跳过）
{
    const id = { _v: 'v0.2', entries: [mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }})] };
    const r = runDiscovery(id, { affection: { N016: 70 } });
    console.log('[case5 无 knowledge]');
    check('actions len = 1', r.actions.length === 1);
    check('applied len = 0', r.applied.length === 0);
    console.log('');
}

// case6: runDiscovery 写 knowledge
{
    const id = { _v: 'v0.2', entries: [mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }})] };
    const k = {};
    const r = runDiscovery(id, { affection: { N016: 70 } }, { knowledge: k });
    console.log('[case6 写入 knowledge]');
    check('applied len = 1', r.applied.length === 1);
    check('k[016][e1].known = true', k['016']?.e1?.known === true);
    check('source = npc_detected', k['016']?.e1?.source === 'npc_detected');
    console.log('');
}

// case7: runDiscovery 幂等（已 know 不重复写）
{
    const id = { _v: 'v0.2', entries: [mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }})] };
    const k = { '016': { e1: { known: true, source: 'old', at: { iso: 'x' } } } };
    const before = JSON.stringify(k);
    const r = runDiscovery(id, { affection: { N016: 70 } }, { knowledge: k });
    console.log('[case7 幂等]');
    check('applied len = 0', r.applied.length === 0);
    check('knowledge 未变', JSON.stringify(k) === before);
    console.log('');
}

// case8: 混合 condition + npc
{
    const id = { _v: 'v0.2', entries: [
        mkEntry({ id: 'e1', discovery: {
            type: 'condition',
            requirement: { discoverAt: { senseRealm: '清明' } },
            discoveredAt: null,
        }}),
        mkEntry({ id: 'e2', discovery: {
            type: 'npc',
            npcId: 'N016',
            requirement: { affinityMin: { npc: 'N016', min: 60 } },
        }}),
    ] };
    const k = {};
    const r = runDiscovery(id, {
        rpg: { spirit: { tier: '凝照' } },
        affection: { N016: 70 },
    }, { knowledge: k });
    console.log('[case8 混合]');
    check('actions len = 2', r.actions.length === 2);
    check('applied len = 2', r.applied.length === 2);
    check('e1.discovery.discoveredAt 写入', id.entries[0].discovery.discoveredAt?.iso != null);
    check('k[016][e2].known = true', k['016']?.e2?.known === true);
    console.log('');
}

// case9: type:'npc' 但 visibility='hidden' -> 不评估
{
    const e = mkEntry({ visibility: 'hidden', discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: { npc: 'N016', min: 60 } },
    }});
    const a = evaluateEntry(e, { affection: { N016: 70 } });
    console.log('[case9 hidden 不评估]');
    check('返回 null', a === null);
    console.log('');
}

// case10: type:'npc' + 无 requirement -> null
{
    const e = mkEntry({ discovery: { type: 'npc', npcId: 'N016', requirement: null } });
    const a = evaluateEntry(e, { affection: { N016: 70 } });
    console.log('[case10 无 requirement]');
    check('返回 null', a === null);
    console.log('');
}

// case11: type:'npc' + itemHeld requirement（复用 _matchAll）
{
    const e = mkEntry({ discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { itemHeld: '天机镜' },
    }});
    const a1 = evaluateEntry(e, { items: { '天机镜': {} } });
    const a2 = evaluateEntry(e, { items: {} });
    console.log('[case11 itemHeld requirement]');
    check('有物品命中', a1 && a1.action === 'npcKnow');
    check('无物品 null', a2 === null);
    console.log('');
}

// case12: type:'npc' + 未知 type -> null
{
    const e = mkEntry({ discovery: { type: 'item', itemId: 'x', requirement: {} } });
    const a = evaluateEntry(e, { items: {} });
    console.log('[case12 未知 type]');
    check('返回 null', a === null);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

const PATCHES = [
    { file: DISC,  id: 'disc-imp',  desc: 'identityDiscovery.js import npcKnowledge',  match: DISC_IMP_OLD,  replace: DISC_IMP_NEW },
    { file: DISC,  id: 'disc-eval', desc: 'identityDiscovery.js evaluateEntry 支持 npc', match: DISC_EVAL_OLD, replace: DISC_EVAL_NEW },
    { file: DISC,  id: 'disc-run',  desc: 'identityDiscovery.js runDiscovery 处理 npcKnow', match: DISC_RUN_OLD, replace: DISC_RUN_NEW },
    { file: GMAPI, id: 'gm-imp',    desc: 'identityGmApi.js import npcKnowledge',      match: GM_IMP_OLD,    replace: GM_IMP_NEW },
    { file: GMAPI, id: 'gm-ctx',    desc: 'identityGmApi.js ctx 加 getNpcKnowledgeMap', match: GM_CTX_OLD,    replace: GM_CTX_NEW },
    { file: GMAPI, id: 'gm-help',   desc: 'identityGmApi.js help 加 npcKnow/npcForget', match: GM_HELP_OLD,   replace: GM_HELP_NEW },
    { file: GMAPI, id: 'gm-method', desc: 'identityGmApi.js 加 npcKnow/npcForget',     match: GM_METHOD_OLD, replace: GM_METHOD_NEW },
    { file: INDEX, id: 'idx-ctx',   desc: 'index.js ctx 加 getNpcKnowledgeMap',        match: IDX_CTX_OLD,   replace: IDX_CTX_NEW },
    { file: INDEX, id: 'idx-call',  desc: 'index.js runDiscovery 传 knowledge',        match: IDX_CALL_OLD,  replace: IDX_CALL_NEW },
];

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.4 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

const fileContents = {};
for (const f of [DISC, GMAPI, INDEX]) {
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
    console.log('  [' + tag.padEnd(10) + '] ' + s.id.padEnd(10) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX patch "' + failed.id + '" failed: count=' + failed.count);
    process.exit(1);
}

// 按文件分组应用
const next = { ...fileContents };
for (const p of PATCHES) next[p.file] = next[p.file].replace(p.match, p.replace);

console.log('files:');
for (const f of [DISC, GMAPI, INDEX]) {
    const delta = next[f].length - fileContents[f].length;
    console.log('  ' + f + ' delta=' + (delta >= 0 ? '+' : '') + delta);
}
console.log('  test: ' + TEST_FILE);

let testExists = fs.existsSync(TEST_FILE);
let testSame = false;
if (testExists) testSame = fs.readFileSync(TEST_FILE, 'utf8') === TEST_FILE_CONTENT;
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

for (const f of [DISC, GMAPI, INDEX]) {
    fs.writeFileSync(f, next[f], 'utf8');
    console.log('[write] ' + f);
}
if (!testSame) {
    fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
    console.log('[write] ' + TEST_FILE);
}
console.log('');
console.log('done.');
