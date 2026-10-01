import { isPlayerVisible, renderIdentityPlayerRows } from '../core/memory/identityView.js';

console.log('=== P6.5.2 Player View 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

console.log('--- Part 1 isPlayerVisible ---');
{
    check('IV-1 public -> true', isPlayerVisible({ value: 'X', visibility: 'public' }) === true);
    check('IV-2 hidden + display -> true', isPlayerVisible({ value: 'X', visibility: 'hidden', display: 'Y' }) === true);
    check('IV-3 hidden + revealed -> true', isPlayerVisible({ value: 'X', visibility: 'hidden', revealedAt: { iso: 'x' } }) === true);
    check('IV-4 discoverable + display -> true', isPlayerVisible({ value: 'X', visibility: 'discoverable', display: 'Y' }) === true);
    check('IV-5 discoverable + revealed -> true', isPlayerVisible({ value: 'X', visibility: 'discoverable', revealedAt: { iso: 'x' } }) === true);
    check('IV-6 gmOnly -> false', isPlayerVisible({ value: 'X', visibility: 'gmOnly' }) === false);
    check('IV-7 value == null -> false', isPlayerVisible({ value: null, visibility: 'public' }) === false);
    console.log('');
}

console.log('--- Part 2 renderIdentityPlayerRows 矩阵 ---');
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check('P-1 public + display -> display', r.length === 1 && r[0].value === 'D');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: null, visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check('P-2 public + 无 display -> value', r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public', revealedAt: { iso: 'x' } }]);
    const r = renderIdentityPlayerRows(id);
    check('P-3 public + revealed -> value（优先）', r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'hidden', revealedAt: null }]);
    const r = renderIdentityPlayerRows(id);
    check('P-4 hidden + null + display -> display', r.length === 1 && r[0].value === 'D');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: null, visibility: 'hidden', revealedAt: null }]);
    const r = renderIdentityPlayerRows(id);
    check('P-5 hidden + null + 无 display -> 不输出', r.length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const r = renderIdentityPlayerRows(id);
    check('P-6 hidden + revealed -> value', r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'discoverable', revealedAt: null }]);
    const r = renderIdentityPlayerRows(id);
    check('P-7 discoverable + null + display -> display', r.length === 1 && r[0].value === 'D');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: null, visibility: 'discoverable', revealedAt: null }]);
    const r = renderIdentityPlayerRows(id);
    check('P-8 discoverable + null + 无 display -> 不输出', r.length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const r = renderIdentityPlayerRows(id);
    check('P-9 discoverable + revealed -> value', r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM', visibility: 'gmOnly' }]);
    const r = renderIdentityPlayerRows(id);
    check('P-10 gmOnly -> 不输出', r.length === 0);
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: null, visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check('P-11 value==null -> 不输出', r.length === 0);
}
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', display: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'hidden', revealedAt: null },
        { id: 'e3', kind: 'constitution', value: 'V2', display: null, visibility: 'hidden', revealedAt: null },
        { id: 'e4', kind: 'bloodline', value: 'V3', display: 'D3', visibility: 'discoverable', revealedAt: { iso: 'x' } },
        { id: 'e5', kind: 'goldenFinger', value: 'GM', visibility: 'gmOnly' },
    ]);
    const r = renderIdentityPlayerRows(id);
    const joined = JSON.stringify(r);
    check('P-12 rows len = 3', r.length === 3);
    check('P-12 无 GM', !joined.includes('GM'));
    check('P-12 无 e3（hidden 无 display）', !joined.includes('V2'));
    console.log('');
}

console.log('--- Part 3 display 空值处理 ---');
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '', visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check("E-1 display='' -> 视为无 -> value", r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '   ', visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check("E-2 display='   ' -> 视为无 -> value", r.length === 1 && r[0].value === 'V');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '四系伪灵根', visibility: 'public' }]);
    const r = renderIdentityPlayerRows(id);
    check("E-3 display='四系伪灵根' -> 有 -> display", r.length === 1 && r[0].value === '四系伪灵根');
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '', visibility: 'hidden', revealedAt: null }]);
    const r = renderIdentityPlayerRows(id);
    check("E-4 hidden + display='' -> 视为无 -> 不输出", r.length === 0);
    console.log('');
}

console.log('--- Part 4 行对象结构 ---');
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public' }]);
    const row = renderIdentityPlayerRows(id)[0];
    check('S-1 含 icon/label/value/extraCls', row && 'icon' in row && 'label' in row && 'value' in row && 'extraCls' in row);
}
{
    const id = mkId([{ id: 'e1', kind: 'bloodline', value: 'V', display: 'D', visibility: 'public' }]);
    const row = renderIdentityPlayerRows(id)[0];
    check('S-2 bloodline extraCls', row && row.extraCls === 'horae-rpg-field-icon--bloodline');
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
