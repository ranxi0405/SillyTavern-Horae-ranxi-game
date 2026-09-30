import {
    normalizeNpcId,
    applyNpcKnow,
    applyNpcForget,
    getNpcKnowledge,
    hasKnown,
    listNpcKnowledge,
    listEntryKnowers,
} from '../core/memory/npcKnowledge.js';

console.log('=== P7.2 npcKnowledge 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1: normalizeNpcId
{
    console.log('[case1 normalizeNpcId]');
    check("'N016' -> '016'", normalizeNpcId('N016') === '016');
    check("'n016' -> '016'", normalizeNpcId('n016') === '016');
    check("'016' -> '016'", normalizeNpcId('016') === '016');
    check("'16' -> '016'", normalizeNpcId('16') === '016');
    check('16 -> 016', normalizeNpcId(16) === '016');
    check('null -> null', normalizeNpcId(null) === null);
    check('空 -> null', normalizeNpcId('') === null);
    check("'abc' -> null", normalizeNpcId('abc') === null);
    check("'Nabc' -> null", normalizeNpcId('Nabc') === null);
    console.log('');
}

// case2: applyNpcKnow 首次写入
{
    const k = {};
    const rec = applyNpcKnow(k, 'e1', 'N016', { source: 'gm_manual', story: '342/12/24' });
    console.log('[case2 首次写入]');
    check('返回记录', rec && rec.known === true);
    check('source', rec.source === 'gm_manual');
    check('at.iso', typeof rec.at?.iso === 'string');
    check('at.story', rec.at.story === '342/12/24');
    check('note 默认 null', rec.note === null);
    check('key 已 normalize', k['016'] && k['016'].e1 === rec);
    console.log('');
}

// case3: applyNpcKnow 幂等
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016', { source: 'gm_manual', story: 'first' });
    const iso1 = k['016'].e1.at.iso;
    const src1 = k['016'].e1.source;
    applyNpcKnow(k, 'e1', 'N016', { source: 'npc_detected', story: 'second' });
    console.log('[case3 幂等]');
    check('at.iso 保留首次', k['016'].e1.at.iso === iso1);
    check('source 保留首次', k['016'].e1.source === src1);
    check('story 保留首次', k['016'].e1.at.story === 'first');
    console.log('');
}

// case4: applyNpcKnow 幂等时补 note
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcKnow(k, 'e1', 'N016', { note: '后来补的' });
    console.log('[case4 幂等时补 note]');
    check('note 被补上', k['016'].e1.note === '后来补的');
    console.log('');
}

// case5: applyNpcKnow 各种无效输入
{
    const k = {};
    console.log('[case5 无效输入]');
    check('knowledge null -> null', applyNpcKnow(null, 'e1', 'N016') === null);
    check('entryId null -> null', applyNpcKnow(k, null, 'N016') === null);
    check('entryId 非 string -> null', applyNpcKnow(k, 123, 'N016') === null);
    check('npcId 无效 -> null', applyNpcKnow(k, 'e1', 'abc') === null);
    check('npcId null -> null', applyNpcKnow(k, 'e1', null) === null);
    console.log('');
}

// case6: applyNpcKnow 不覆盖已有未知记录（known=false）
{
    const k = { '016': { 'e1': { known: false, source: 'x', at: { iso: 'old' } } } };
    const rec = applyNpcKnow(k, 'e1', 'N016');
    console.log('[case6 已有 known=false 记录]');
    check('返回新记录 known=true', rec.known === true);
    check('覆盖旧记录', k['016'].e1 === rec);
    console.log('');
}

// case7: applyNpcForget
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcKnow(k, 'e2', 'N016');
    const r1 = applyNpcForget(k, 'e1', 'N016');
    console.log('[case7 forget]');
    check('返回 true', r1 === true);
    check('e1 已删', !k['016'].e1);
    check('e2 保留', !!k['016'].e2);
    console.log('');
}

// case8: forget 清理空 bucket
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcForget(k, 'e1', 'N016');
    console.log('[case8 forget 清空 bucket]');
    check('016 键被删', !k['016']);
    console.log('');
}

// case9: forget 不存在
{
    const k = {};
    console.log('[case9 forget 不存在]');
    check('返回 false', applyNpcForget(k, 'e1', 'N016') === false);
    check('knowledge null -> false', applyNpcForget(null, 'e1', 'N016') === false);
    console.log('');
}

// case10: getNpcKnowledge / hasKnown
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    console.log('[case10 get / hasKnown]');
    check('get 命中', getNpcKnowledge(k, 'N016', 'e1')?.known === true);
    check('get N 前缀等价', getNpcKnowledge(k, '016', 'e1')?.known === true);
    check('get 未命中 null', getNpcKnowledge(k, 'N016', 'e2') === null);
    check('hasKnown true', hasKnown(k, 'N016', 'e1') === true);
    check('hasKnown false', hasKnown(k, 'N016', 'e2') === false);
    console.log('');
}

// case11: listNpcKnowledge
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcKnow(k, 'e2', 'N016');
    applyNpcKnow(k, 'e1', 'N017');
    const list = listNpcKnowledge(k, 'N016');
    console.log('[case11 listNpcKnowledge]');
    check('len = 2', list.length === 2);
    check('含 entryId e1', list.some(x => x.entryId === 'e1'));
    check('含 entryId e2', list.some(x => x.entryId === 'e2'));
    check('无关 NPC 不混入', list.every(x => x.entryId !== 'e3'));
    console.log('');
}

// case12: listNpcKnowledge 空 / null
{
    console.log('[case12 list 空]');
    check('knowledge null -> []', listNpcKnowledge(null, 'N016').length === 0);
    check('npcId null -> []', listNpcKnowledge({}, null).length === 0);
    check('NPC 不存在 -> []', listNpcKnowledge({}, 'N099').length === 0);
    console.log('');
}

// case13: listEntryKnowers
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcKnow(k, 'e1', 'N017');
    applyNpcKnow(k, 'e2', 'N016');
    const knowers = listEntryKnowers(k, 'e1');
    console.log('[case13 listEntryKnowers]');
    check('len = 2', knowers.length === 2);
    check('含 016', knowers.includes('016'));
    check('含 017', knowers.includes('017'));
    check('无 018', !knowers.includes('018'));
    console.log('');
}

// case14: listEntryKnowers 无效
{
    console.log('[case14 listEntryKnowers 无效]');
    check('knowledge null -> []', listEntryKnowers(null, 'e1').length === 0);
    check('entryId null -> []', listEntryKnowers({}, null).length === 0);
    console.log('');
}

// case15: 多 NPC 多 entry 独立
{
    const k = {};
    applyNpcKnow(k, 'e1', 'N016');
    applyNpcKnow(k, 'e2', 'N017');
    console.log('[case15 独立]');
    check('016 只有 e1', hasKnown(k, 'N016', 'e1') && !hasKnown(k, 'N016', 'e2'));
    check('017 只有 e2', hasKnown(k, 'N017', 'e2') && !hasKnown(k, 'N017', 'e1'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
