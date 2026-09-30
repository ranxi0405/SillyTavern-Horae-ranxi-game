import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView visibility 语义测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case1 public]');
    check('includes value 女', joined.includes('女'));
    check('no placeholder', !joined.includes('[隐藏'));
    console.log('');
}

// case2: hidden -> 占位，不泄露 value/display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_HIDDEN_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case2 hidden]');
    check('no leak (value)', !joined.includes('TEST_HIDDEN_A'));
    check('no leak (display)', !joined.includes('TEST_DISPLAY_A'));
    check('has placeholder', joined.includes('[隐藏'));
    console.log('');
}

// case3: discoverable 未揭示 -> 占位
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_A', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case3 discoverable 未揭示]');
    check('no leak', !joined.includes('TEST_DISC_A'));
    check('has placeholder', joined.includes('[隐藏'));
    console.log('');
}

// case4: discoverable 已揭示 -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_B', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case4 discoverable 已揭示]');
    check('includes value', joined.includes('TEST_DISC_B'));
    check('no placeholder', !joined.includes('[隐藏'));
    console.log('');
}

// case5: gmOnly -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: '逆天改命', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case5 gmOnly]');
    check('rows length = 0', rows.length === 0);
    check('no leak', !rows.join('\n').includes('逆天改命'));
    console.log('');
}

// case6: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_HIDDEN_B', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'TEST_DISC_C', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'bloodline', value: '凡人血脉', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } },
        { id: 'e5', kind: 'goldenFinger', value: '逆天改命', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case6 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden TEST_HIDDEN_B 不泄露', !joined.includes('TEST_HIDDEN_B'));
    check('discoverable 未揭示 TEST_DISC_C 不泄露', !joined.includes('TEST_DISC_C'));
    check('discoverable 已揭示 凡人血脉 存在', joined.includes('凡人血脉'));
    check('gmOnly 逆天改命 不出现', !joined.includes('逆天改命'));
    console.log('');
}

// case7: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_LANG_EN_A', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id, { lang: 'en' }).join('\n');
    console.log('[case7 lang=en]');
    check('no leak', !joined.includes('TEST_LANG_EN_A'));
    check('has [Hidden:', joined.includes('[Hidden:'));
    console.log('');
}

// case8: value=null -> 被 isAiVisible 过滤
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_NULL_A', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case8 value=null]');
    check('rows length = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('TEST_NULL_A'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
