import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView AI 双层输出测试（P6.5.1 更新） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public + 无 display -> 只 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case1 public 无 display]');
    check('含 value 女', joined.includes('女'));
    check('无「对外」', !joined.includes('对外'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case2: display != value -> 双层
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_HIDDEN_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case2 display != value 双层]');
    check('含 value', joined.includes('TEST_HIDDEN_A'));
    check('含 display', joined.includes('TEST_DISPLAY_A'));
    check('含「对外」', joined.includes('对外'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case3: display == value -> 只一次，无「对外」
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SAME_V', display: 'SAME_V', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case3 display == value]');
    check('含 SAME_V', joined.includes('SAME_V'));
    check('SAME_V 只一次', (joined.match(/SAME_V/g) || []).length === 1);
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

// case4: display == null -> 只 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'NULL_DISP_V', display: null, visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case4 display == null]');
    check('含 value', joined.includes('NULL_DISP_V'));
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

// case5: discoverable 未揭示 -> value（AI 全知）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_DISC_A', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case5 discoverable 未揭示]');
    check('含 value', joined.includes('TEST_DISC_A'));
    check('无占位', !joined.includes('[隐藏'));
    console.log('');
}

// case6: discoverable 已揭示 + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case6 discoverable 已揭示]');
    check('含 value', joined.includes('V6'));
    check('含 display', joined.includes('D6'));
    check('含「对外」', joined.includes('对外'));
    console.log('');
}

// case7: gmOnly
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case7 gmOnly]');
    check('rows 空', rows.length === 0);
    check('无泄漏', !rows.join('\n').includes('GM_X'));
    console.log('');
}

// case8: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_HIDDEN_B', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'TEST_DISC_C', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'bloodline', value: '凡人血脉', visibility: 'discoverable', revealedAt: { iso: 'x' } },
        { id: 'e5', kind: 'goldenFinger', value: 'GM_Y', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case8 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden TEST_HIDDEN_B 存在（AI 全知）', joined.includes('TEST_HIDDEN_B'));
    check('discoverable 未揭示 TEST_DISC_C 存在', joined.includes('TEST_DISC_C'));
    check('discoverable 已揭示 凡人血脉 存在', joined.includes('凡人血脉'));
    check('gmOnly GM_Y 不出现', !joined.includes('GM_Y'));
    console.log('');
}

// case9: lang=en + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'EN_V', display: 'EN_D', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id, { lang: 'en' }).join('\n');
    console.log('[case9 lang=en 双层]');
    check('含 value', joined.includes('EN_V'));
    check('含 display', joined.includes('EN_D'));
    check('含「对外」', joined.includes('对外'));
    console.log('');
}

// case10: value=null 被过滤
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'OK_V', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case10 value=null]');
    check('rows len = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('OK_V'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
