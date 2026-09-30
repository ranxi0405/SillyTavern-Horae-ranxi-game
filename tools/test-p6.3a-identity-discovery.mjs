import {
    applyDiscover, applyReveal,
    evaluateEntry, evaluateAll, runDiscovery,
} from '../core/memory/identityDiscovery.js';

console.log('=== P6.3a identityDiscovery 测试 ===');
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

// case1: applyDiscover 创建骨架
{
    const e = mkEntry();
    applyDiscover(e);
    check('discovery 对象创建', e.discovery && typeof e.discovery === 'object');
    check('type=manual', e.discovery.type === 'manual');
    check('discoveredAt.iso', typeof e.discovery.discoveredAt?.iso === 'string');
    console.log('');
}

// case2: applyDiscover 幂等
{
    const e = mkEntry();
    applyDiscover(e, { story: 'first' });
    const iso = e.discovery.discoveredAt.iso;
    applyDiscover(e, { story: 'second' });
    check('iso 保留首次', e.discovery.discoveredAt.iso === iso);
    check('story 保留首次', e.discovery.discoveredAt.story === 'first');
    console.log('');
}

// case3: applyReveal 幂等
{
    const e = mkEntry();
    applyReveal(e, { story: 'first' });
    const iso = e.revealedAt.iso;
    applyReveal(e, { story: 'second' });
    check('iso 保留首次', e.revealedAt.iso === iso);
    check('story 被覆盖', e.revealedAt.story === 'second');
    console.log('');
}

// case4: evaluateEntry - senseRealm 满足 discoverAt
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '凝照' } } });
    check('返回 discover action', a && a.action === 'discover');
    console.log('');
}

// case5: evaluateEntry - senseRealm 不满足
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '洞玄' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '清明' } } });
    check('返回 null', a === null);
    console.log('');
}

// case6: evaluateEntry - realm 相等
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { realm: '筑基' } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { rpg: { realm: { name: '筑基' } } });
    const a2 = evaluateEntry(e, { rpg: { realm: { name: '炼气' } } });
    check('相等匹配', a1 && a1.action === 'discover');
    check('不相等 null', a2 === null);
    console.log('');
}

// case7: evaluateEntry - affinityMin
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { affinityMin: { npc: 'N016', min: 60 } } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { affection: { N016: 70 } });
    const a2 = evaluateEntry(e, { affection: { N016: 50 } });
    check('高于阈值匹配', a1 && a1.action === 'discover');
    check('低于阈值 null', a2 === null);
    console.log('');
}

// case8: evaluateEntry - itemHeld
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { itemHeld: '天机镜' } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { items: { '天机镜': { holder: '冉汐' } } });
    const a2 = evaluateEntry(e, { items: {} });
    check('有物品匹配', a1 && a1.action === 'discover');
    check('无物品 null', a2 === null);
    console.log('');
}

// case9: evaluateEntry - 非 discoverable 跳过
{
    const e = mkEntry({ visibility: 'hidden', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('hidden 不评估', a === null);
    console.log('');
}

// case10: evaluateEntry - 非 condition 类型跳过
{
    const e = mkEntry({ discovery: { type: 'event', eventId: 'x', discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('非 condition 不评估', a === null);
    console.log('');
}

// case11: evaluateEntry - revealAt 优先
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: {
        discoverAt: { senseRealm: '清明' },
        revealAt: { senseRealm: '凝照' },
    }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '凝照' } } });
    check('优先返回 reveal', a && a.action === 'reveal');
    console.log('');
}

// case12: evaluateEntry - 已 revealed 不再返回
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { revealAt: { senseRealm: '清明' } }, discoveredAt: null }, revealedAt: { iso: 'x' } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('已 reveal 返回 null', a === null);
    console.log('');
}

// case13: runDiscovery 全链路
{
    const id = { _v: 'v0.2', entries: [
        mkEntry({ id: 'e1', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } }),
        mkEntry({ id: 'e2', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '太虚' } }, discoveredAt: null } }),
    ]};
    const r = runDiscovery(id, { rpg: { spirit: { tier: '清明' } } });
    check('actions len = 1', r.actions.length === 1);
    check('e1 discoveredAt 写入', id.entries[0].discovery.discoveredAt?.iso != null);
    check('e2 保持 null', id.entries[1].discovery.discoveredAt == null);
    console.log('');
}

// case14: runDiscovery 无匹配
{
    const id = { _v: 'v0.2', entries: [mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '太虚' } }, discoveredAt: null } })] };
    const r = runDiscovery(id, { rpg: { spirit: { tier: '清明' } } });
    check('actions 空', r.actions.length === 0);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
