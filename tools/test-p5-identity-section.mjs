import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: null / undefined / 空
{
    console.log('[case1 null / 空]');
    check('null -> ""', renderIdentityAiSection(null) === '');
    check('undefined -> ""', renderIdentityAiSection(undefined) === '');
    check('空 entries -> ""', renderIdentityAiSection(mkId([])) === '');
    console.log('');
}

// case2: public -> 出现 value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case2 public]');
    check('含 header', s.includes('[角色固有设定]'));
    check('含 label 性别', s.includes('性别'));
    check('含 value 女', s.includes('女'));
    console.log('');
}

// case3: hidden -> 占位，不泄露 value / display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden]');
    check('不泄漏 value', !s.includes('TEST_SECRET_A'));
    check('不泄漏 display', !s.includes('TEST_DISPLAY_A'));
    check('含占位', s.includes('[隐藏'));
    console.log('');
}

// case4: discoverable 未揭示 -> 占位
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_B', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 discoverable 未揭示]');
    check('不泄漏', !s.includes('TEST_SECRET_B'));
    check('含占位', s.includes('[隐藏'));
    console.log('');
}

// case5: discoverable 已揭示 -> 输出 value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_C', visibility: 'discoverable', revealedAt: { iso: '2026-01-01' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 discoverable 已揭示]');
    check('含 value', s.includes('TEST_SECRET_C'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case6: gmOnly -> 完全为空
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'TEST_GM_X', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 gmOnly]');
    check('返回 ""', s === '');
    check('不泄漏', !s.includes('TEST_GM_X'));
    console.log('');
}

// case7: lang=en header
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case7 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
    console.log('');
}

// case8: lang=en + hidden -> [Hidden: ...]
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SECRET_EN', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case8 lang=en hidden]');
    check('不泄漏', !s.includes('SECRET_EN'));
    check('含 [Hidden:', s.includes('[Hidden:'));
    console.log('');
}

// case9: lang=ja header
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'ja' });
    console.log('[case9 lang=ja]');
    check('含 キャラクター固有設定', s.includes('キャラクター固有設定'));
    console.log('');
}

// case10: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_MIX_HIDDEN', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'TEST_MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case10 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden 不泄漏', !s.includes('TEST_MIX_HIDDEN'));
    check('gmOnly 不出现', !s.includes('TEST_MIX_GM'));
    check('含 header', s.includes('[角色固有设定]'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
