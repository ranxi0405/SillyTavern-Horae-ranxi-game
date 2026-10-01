import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试（P6.5.1b 世界当前认知） ===');
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
    check('含 女', s.includes('女'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case3: hidden + display -> display（关键）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V3', display: 'DISP_V3', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden + display]');
    check('含 display DISP_V3', s.includes('DISP_V3'));
    check('不含 value HIDDEN_V3（关键）', !s.includes('HIDDEN_V3'));
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    check('无双层', !s.includes('对外'));
    console.log('');
}

// case4: hidden + 无 display -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V4', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 hidden + 无 display]');
    check('返回 ""', s === '');
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    console.log('');
}

// case5: hidden + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V5', display: 'D5', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 hidden + revealed]');
    check('含 value V5', s.includes('V5'));
    check('不含 display D5', !s.includes('D5'));
    console.log('');
}

// case6: discoverable + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 discoverable + display]');
    check('含 display D6', s.includes('D6'));
    check('不含 value V6', !s.includes('V6'));
    console.log('');
}

// case7: discoverable + 无 display -> 空
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V7', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case7 discoverable + 无 display]');
    check('返回 ""', s === '');
    console.log('');
}

// case8: discoverable + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V8', display: 'D8', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case8 discoverable + revealed]');
    check('含 value V8', s.includes('V8'));
    check('不含 display D8', !s.includes('D8'));
    console.log('');
}

// case9: gmOnly -> 空
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_P5', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case9 gmOnly]');
    check('返回 ""', s === '');
    check('无泄漏', !s.includes('GM_P5'));
    console.log('');
}

// case10: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case10 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
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
        { id: 'e2', kind: 'spiritRoot', value: 'MIX_V', display: 'MIX_D', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case12 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden display MIX_D 出现', s.includes('MIX_D'));
    check('hidden value MIX_V 不出现', !s.includes('MIX_V'));
    check('gmOnly MIX_GM 不出现', !s.includes('MIX_GM'));
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    check('无双层', !s.includes('对外'));
    check('含 header', s.includes('[角色固有设定]'));
    console.log('');
}

// case13: display = '' 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V13', display: '', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log("[case13 display='']");
    check('返回 ""', s === '');
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
