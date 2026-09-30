import { getIdentityEntries, syncLegacyToEntries } from '../core/memory/identityStore.js';

console.log('=== P4.2 getIdentityEntries 懒迁移测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1: v0.1 输入 -> 调 getIdentityEntries 后应变成 v0.2
{
    const id = { gender: '女', spiritRoot: '无界灵根', talents: ['过目不忘', '气运加身'] };
    console.log('[case1 v0.1 -> 懒迁移]');
    check('before: _v undefined', id._v === undefined);
    check('before: entries undefined', id.entries === undefined);

    const list = getIdentityEntries(id);

    check('after: _v = v0.2', id._v === 'v0.2');
    check('after: entries 已写入', Array.isArray(id.entries));
    check('after: entries.len = 4', id.entries.length === 4);
    check('after: 返回列表 len = 4', list.length === 4);
    console.log('');
}

// case2: 幂等 - 二次调用走 v0.2 分支，不重复迁移
{
    const id = { gender: '男', talents: ['桃花运'] };
    const l1 = getIdentityEntries(id);
    const entriesRef1 = id.entries;
    const l2 = getIdentityEntries(id);
    const entriesRef2 = id.entries;

    console.log('[case2 幂等]');
    check('_v 仍 v0.2', id._v === 'v0.2');
    check('entries 引用未变', entriesRef1 === entriesRef2);
    check('两次返回长度一致', l1.length === l2.length);
    console.log('');
}

// case3: v0.2 输入 - 不触发迁移（走早分支）
{
    const existing = [{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }];
    const id = { _v: 'v0.2', entries: existing };
    const list = getIdentityEntries(id);
    console.log('[case3 已是 v0.2]');
    check('entries 引用未变', id.entries === existing);
    check('返回 len = 1', list.length === 1);
    console.log('');
}

// case4: null / 非对象
{
    check('null 返回 []', getIdentityEntries(null).length === 0);
    check('数字返回 []', getIdentityEntries(42).length === 0);
    check('字符串返回 []', getIdentityEntries('foo').length === 0);
    console.log('[case4 null/非对象] PASS if above all PASS');
    console.log('');
}

// case5: v0.2 但 entries 缺失 -> 走 lazy 分支恢复
{
    const id = { _v: 'v0.2', gender: '女', talents: ['过目不忘'] };
    const list = getIdentityEntries(id);
    console.log('[case5 v0.2 但无 entries]');
    check('entries 已恢复', Array.isArray(id.entries));
    check('返回 len = 2', list.length === 2);
    console.log('');
}

// case6: syncLegacyToEntries 仍是幂等
{
    const id = { gender: '女' };
    const r1 = syncLegacyToEntries(id);
    const r2 = syncLegacyToEntries(id);
    console.log('[case6 syncLegacyToEntries 幂等]');
    check('第一次 migratedCount = 1', r1.migratedCount === 1);
    check('第二次 migratedCount = 0', r2.migratedCount === 0);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
