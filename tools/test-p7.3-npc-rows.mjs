import { renderIdentityNpcRows } from '../core/memory/identityView.js';
import { setActiveHiddenMap } from '../core/memory/hiddenKeywords.js';

console.log('=== P7.3 + P6.5.3 renderIdentityNpcRows 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

console.log('--- Part 1 基础行为（P7.3 保留） ---');
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-1 public 无 display -> value', rows.join('\n').includes('女'));
    check('B-1 无占位', !rows.join('\n').includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_A', visibility: 'hidden' }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-2 hidden 未 known 无 display -> 空', rows.length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_B', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    check('B-3 hidden + known -> value', rows.join('\n').includes('S_B'));
    check('B-3 无占位', !rows.join('\n').includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_C', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-4 hidden + revealed -> value', rows.join('\n').includes('S_C'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_D', visibility: 'discoverable', revealedAt: null }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-5 discoverable 未 known 无 display -> 空', rows.length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_E', visibility: 'discoverable', revealedAt: null }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    check('B-6 discoverable + known 未 reveal -> 占位', rows.join('\n').includes('[隐藏'));
    check('B-6 无泄漏', !rows.join('\n').includes('S_E'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_F', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-7 discoverable + revealed -> value', rows.join('\n').includes('S_F'));
}
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    check('B-8 gmOnly + known -> 空', rows.length === 0);
    check('B-8 无泄漏', !rows.join('\n').includes('GM_X'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_G', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    check('B-9 016', renderIdentityNpcRows(id, '016', k).join('\n').includes('S_G'));
    check('B-9 N016', renderIdentityNpcRows(id, 'N016', k).join('\n').includes('S_G'));
    check('B-9 16', renderIdentityNpcRows(id, 16, k).join('\n').includes('S_G'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_H', visibility: 'hidden' }]);
    const k = { '017': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    check('B-10 NPC 隔离', rows.length === 0);
}
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'S_I', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'S_J', visibility: 'discoverable', revealedAt: null },
        { id: 'e4', kind: 'goldenFinger', value: 'GM_Y', visibility: 'gmOnly' },
    ]);
    const k = { '016': { e2: { known: true }, e3: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\n');
    check('B-11 含 女', joined.includes('女'));
    check('B-11 含 S_I', joined.includes('S_I'));
    check('B-11 不含 S_J', !joined.includes('S_J'));
    check('B-11 含占位', joined.includes('[隐藏'));
    check('B-11 不含 GM_Y', !joined.includes('GM_Y'));
}
{
    check('B-12 id null -> []', renderIdentityNpcRows(null, 'N016', {}).length === 0);
    check('B-12 knowledge null 不崩', renderIdentityNpcRows(mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]), 'N016', null).length === 1);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_K', visibility: 'discoverable', revealedAt: null }]);
    const k = { '016': { e1: { known: true } } };
    check('B-13 lang=en 占位 [Hidden:', renderIdentityNpcRows(id, 'N016', k, { lang: 'en' }).join('\n').includes('[Hidden:'));
}
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'S_L', visibility: 'public' },
    ]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-14 value=null 过滤', rows.length === 1 && rows[0].includes('S_L'));
}
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const r1 = renderIdentityNpcRows(id, 'N016', {});
    const r2 = renderIdentityNpcRows(id, 'N016', {}, { valueMode: 'public' });
    check('B-15 valueMode 占位不影响', r1.join('\n') === r2.join('\n'));
}
console.log('');

console.log('--- Part 2 P6.5.3 display 优先 ---');
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public' }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('N-1 public + display -> display', rows.length === 1 && rows[0].includes('D') && !rows[0].includes('= V'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HID_V', display: 'HID_D', visibility: 'hidden' }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\n');
    check('N-2 hidden 未 known + display -> display（关键）', joined.includes('HID_D'));
    check('N-2 不含 value HID_V', !joined.includes('HID_V'));
    check('N-2 无 [隐藏] 占位', !joined.includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'DISC_V', display: 'DISC_D', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\n');
    check('N-3 discoverable 未 known + display -> display（关键）', joined.includes('DISC_D'));
    check('N-3 不含 value DISC_V', !joined.includes('DISC_V'));
    check('N-3 无 [隐藏] 占位', !joined.includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HID_V2', display: 'HID_D2', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\n');
    check('N-4 hidden + known + display -> value（不是 display）', joined.includes('HID_V2'));
    check('N-4 不含 display HID_D2', !joined.includes('HID_D2'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'PUB_V', display: 'PUB_D', visibility: 'public', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\n');
    check('N-5 public + revealed + display -> value', joined.includes('PUB_V'));
    check('N-5 不含 display PUB_D', !joined.includes('PUB_D'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '', visibility: 'hidden' }]);
    check("N-6 hidden + display='' -> 空", renderIdentityNpcRows(id, 'N016', {}).length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '   ', visibility: 'discoverable', revealedAt: null }]);
    check("N-7 discoverable + display='   ' -> 空", renderIdentityNpcRows(id, 'N016', {}).length === 0);
}
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'HID_V3', display: 'HID_D3', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'CON_V', display: 'CON_D', visibility: 'hidden' },
        { id: 'e4', kind: 'goldenFinger', value: 'GM_Z', visibility: 'gmOnly' },
    ]);
    const k = { '016': { e2: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\n');
    check('N-8 混合：public 女', joined.includes('女'));
    check('N-8 混合：hidden known -> HID_V3', joined.includes('HID_V3'));
    check('N-8 混合：hidden 未 known -> CON_D', joined.includes('CON_D'));
    check('N-8 混合：无 GM_Z', !joined.includes('GM_Z'));
    check('N-8 混合：无 [隐藏] 占位', !joined.includes('[隐藏'));
}
console.log('');

console.log('--- Part 3 sanitize 层 ---');
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '无界灵根', visibility: 'hidden' }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\n');
    check('S-1 display 含隐藏词被 sanitize', !joined.includes('无界灵根'));
    check('S-1 含占位 [隐藏灵根]', joined.includes('[隐藏灵根]'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '四系伪灵根', visibility: 'hidden' }]);
    check('S-2 display 安全词不误伤', renderIdentityNpcRows(id, 'N016', {}).join('\n').includes('四系伪灵根'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\n');
    check('S-3 known value 含隐藏词被 sanitize', !joined.includes('无界灵根'));
    check('S-3 含占位 [隐藏灵根]', joined.includes('[隐藏灵根]'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '对外：四系伪灵根', visibility: 'hidden' }]);
    check('S-4 普通文本前缀不误伤', renderIdentityNpcRows(id, 'N016', {}).join('\n').includes('对外：四系伪灵根'));
    setActiveHiddenMap({});
}
console.log('');

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
