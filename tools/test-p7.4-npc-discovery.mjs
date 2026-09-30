import { evaluateEntry, runDiscovery } from '../core/memory/identityDiscovery.js';

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
