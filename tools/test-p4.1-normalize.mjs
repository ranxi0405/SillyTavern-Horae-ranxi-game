import { normalizeIdentity } from '../core/memory/identityStore.js';

console.log('=== P4.1 normalizeIdentity 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1: v0.2 + entries 应被保留
{
    const raw = {
        _v: 'v0.2',
        entries: [
            { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
            { id: 'e2', kind: 'talent', value: '过目不忘', visibility: 'public' },
        ],
        gender: '女',
        talents: ['过目不忘'],
    };
    const n = normalizeIdentity(raw);
    console.log('[case1 v0.2 + entries]');
    check('_v preserved', n._v === 'v0.2');
    check('entries preserved len=2', Array.isArray(n.entries) && n.entries.length === 2);
    check('legacy gender', n.gender === '女');
    check('legacy talents len=1', Array.isArray(n.talents) && n.talents.length === 1);
    console.log('');
}

// case2: v0.2 但 entries 缺失 -> _v 保留，entries undefined
{
    const raw = { _v: 'v0.2', gender: '男' };
    const n = normalizeIdentity(raw);
    console.log('[case2 v0.2 无 entries]');
    check('_v preserved', n._v === 'v0.2');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case3: 无 _v -> 回退到 v0.1（emptyIdentity 默认）
{
    const raw = { gender: '女' };
    const n = normalizeIdentity(raw);
    console.log('[case3 无 _v]');
    check('_v defaults to v0.1', n._v === 'v0.1');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case4: null 输入
{
    const n = normalizeIdentity(null);
    console.log('[case4 null]');
    check('_v defaults to v0.1', n._v === 'v0.1');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

// case5: entries 深拷贝验证（修改 normalized 不应影响 raw）
{
    const raw = {
        _v: 'v0.2',
        entries: [{ id: 'e1', kind: 'gender', value: '女', meta: { tag: 'a' } }],
        gender: '女',
    };
    const n = normalizeIdentity(raw);
    n.entries[0].value = 'MUTATED';
    n.entries[0].meta.tag = 'MUTATED';
    console.log('[case5 deep clone]');
    check('raw entry value unchanged', raw.entries[0].value === '女');
    check('raw entry meta unchanged', raw.entries[0].meta.tag === 'a');
    console.log('');
}

// case6: entries 非数组时应忽略
{
    const raw = { _v: 'v0.2', entries: 'not-an-array', gender: '女' };
    const n = normalizeIdentity(raw);
    console.log('[case6 entries 非数组]');
    check('_v preserved', n._v === 'v0.2');
    check('entries undefined', n.entries === undefined);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
