import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView AI 视角测试（P6.5.1b 世界当前认知） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public + 无 display -> value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case1 public 无 display]');
    check('含 女', joined.includes('女'));
    check('无占位', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case2: public + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case2 public + display]');
    check('含 display D', joined.includes('D'));
    check('不含 value V（独立）', !/[^A-Z]V[^A-Z]/.test(joined) || !joined.includes('= V'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case3: public + revealed -> value（reveal 优先）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V3', display: 'D3', visibility: 'public', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case3 public + revealed]');
    check('含 value V3', joined.includes('V3'));
    check('不含 display D3', !joined.includes('D3'));
    console.log('');
}

// case4: hidden + display -> display（关键：不再 [隐藏] 占位）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V4', display: 'DISP_V4', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case4 hidden + display]');
    check('含 display DISP_V4', joined.includes('DISP_V4'));
    check('不含 value HIDDEN_V4（关键）', !joined.includes('HIDDEN_V4'));
    check('无 [隐藏] 占位（关键）', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case5: hidden + 无 display -> 不输出（关键：不再 [隐藏] 占位）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V5', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case5 hidden + 无 display]');
    check('rows 空（关键）', rows.length === 0);
    check('无 [隐藏] 占位', !rows.join('\n').includes('[隐藏'));
    console.log('');
}

// case6: hidden + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case6 hidden + revealed]');
    check('含 value V6', joined.includes('V6'));
    check('不含 display D6', !joined.includes('D6'));
    console.log('');
}

// case7: discoverable + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V7', display: 'D7', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case7 discoverable + display]');
    check('含 display D7', joined.includes('D7'));
    check('不含 value V7', !joined.includes('V7'));
    check('无 [隐藏] 占位', !joined.includes('[隐藏'));
    console.log('');
}

// case8: discoverable + 无 display -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V8', visibility: 'discoverable', revealedAt: null }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case8 discoverable + 无 display]');
    check('rows 空', rows.length === 0);
    console.log('');
}

// case9: discoverable + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V9', display: 'D9', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case9 discoverable + revealed]');
    check('含 value V9', joined.includes('V9'));
    check('不含 display D9', !joined.includes('D9'));
    console.log('');
}

// case10: gmOnly -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case10 gmOnly]');
    check('rows 空', rows.length === 0);
    check('无泄漏', !rows.join('\n').includes('GM_X'));
    console.log('');
}

// case11: value=null -> 不输出
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'OK', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case11 value=null]');
    check('rows len = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('OK'));
    console.log('');
}

// case12: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', display: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'HID_V', display: 'HID_D', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'CON_V', display: null, visibility: 'hidden' },
        { id: 'e4', kind: 'bloodline', value: 'BLD_V', display: 'BLD_D', visibility: 'discoverable', revealedAt: { iso: 'x' } },
        { id: 'e5', kind: 'goldenFinger', value: 'GM_Z', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case12 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden display HID_D 存在', joined.includes('HID_D'));
    check('hidden value HID_V 不出现', !joined.includes('HID_V'));
    check('hidden 无 display CON_V 不出现', !joined.includes('CON_V'));
    check('discoverable revealed BLD_V 存在', joined.includes('BLD_V'));
    check('gmOnly GM_Z 不出现', !joined.includes('GM_Z'));
    check('无 [隐藏] 占位', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case13: display = '' -> 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V13', display: '', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log("[case13 display='']");
    check('rows 空（视为无 display）', rows.length === 0);
    console.log('');
}

// case14: display = '   ' -> 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V14', display: '   ', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log("[case14 display='   ']");
    check('rows 空', rows.length === 0);
    console.log('');
}

// case15: 全局验证无 [隐藏] 与「对外」
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'V15', display: 'D15', visibility: 'hidden' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\n');
    console.log('[case15 全局验证]');
    check('无 [隐藏]', !joined.includes('[隐藏'));
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
