import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试（P6.5.1 更新） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: 空
{
    console.log('[case1 null / 空]');
    check('null -> ""', renderIdentityAiSection(null) === '');
    check('undefined -> ""', renderIdentityAiSection(undefined) === '');
    check('空 entries -> ""', renderIdentityAiSection(mkId([])) === '');
    console.log('');
}

// case2: public 无 display
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case2 public]');
    check('含 header', s.includes('[角色固有设定]'));
    check('含 label 性别', s.includes('性别'));
    check('含 value 女', s.includes('女'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case3: hidden + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_A', display: 'TEST_DISPLAY_A', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden + display ≠ value]');
    check('含 value', s.includes('TEST_SECRET_A'));
    check('含 display', s.includes('TEST_DISPLAY_A'));
    check('含「对外」', s.includes('对外'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case4: display == value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'SAME_P5', display: 'SAME_P5', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 display == value]');
    check('SAME_P5 一次', (s.match(/SAME_P5/g) || []).length === 1);
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case5: display == null
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'NULL_P5', display: null, visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 display == null]');
    check('含 value', s.includes('NULL_P5'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case6: discoverable 未揭示
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_B', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 discoverable 未揭示]');
    check('含 value', s.includes('TEST_SECRET_B'));
    check('无占位', !s.includes('[隐藏'));
    console.log('');
}

// case7: discoverable 已揭示
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'TEST_SECRET_C', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case7 discoverable 已揭示]');
    check('含 value', s.includes('TEST_SECRET_C'));
    console.log('');
}

// case8: gmOnly
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_P5', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case8 gmOnly]');
    check('返回 ""', s === '');
    check('无泄漏', !s.includes('GM_P5'));
    console.log('');
}

// case9: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case9 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
    console.log('');
}

// case10: lang=en + hidden + display != value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'EN_V2', display: 'EN_D2', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case10 lang=en 双层]');
    check('含 value', s.includes('EN_V2'));
    check('含 display', s.includes('EN_D2'));
    check('含「对外」', s.includes('对外'));
    console.log('');
}

// case11: lang=ja
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'ja' });
    console.log('[case11 lang=ja]');
    check('含 キャラクター固有設定', s.includes('キャラクター固有設定'));
    console.log('');
}

// case12: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'TEST_MIX_HIDDEN', display: 'MIX_DISP', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'TEST_MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case12 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden TEST_MIX_HIDDEN 出现', s.includes('TEST_MIX_HIDDEN'));
    check('display MIX_DISP 出现', s.includes('MIX_DISP'));
    check('gmOnly TEST_MIX_GM 不出现', !s.includes('TEST_MIX_GM'));
    check('含 header', s.includes('[角色固有设定]'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
