import {
    HIDDEN_MAP,
    setActiveHiddenMap,
    getActiveHiddenMap,
    sanitizeHiddenKeywords,
    containsHiddenKeywords,
} from '../core/memory/hiddenKeywords.js';

console.log('=== P4.4 hiddenKeywords 动态 map 测试 ===');
console.log('');

let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

// case1
{
    console.log('[case1 HIDDEN_MAP 默认空]');
    check('HIDDEN_MAP 是空对象', Object.keys(HIDDEN_MAP).length === 0);
    console.log('');
}

// case2
{
    setActiveHiddenMap({});
    const input = '无界灵根';
    const out = sanitizeHiddenKeywords(input);
    console.log('[case2 默认空 map]');
    check('文本未替换', out === input);
    console.log('');
}

// case3
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const out = sanitizeHiddenKeywords('我的灵根是 无界灵根');
    console.log('[case3 setActiveHiddenMap 后替换]');
    check('无界灵根 被替换', out.includes('[隐藏灵根]'));
    check('原词不再出现', !out.includes('无界灵根'));
    console.log('');
}

// case4
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    setActiveHiddenMap({});
    const out = sanitizeHiddenKeywords('无界灵根');
    console.log('[case4 清空]');
    check('无界灵根 不再被替换', out === '无界灵根');
    console.log('');
}

// case5
{
    setActiveHiddenMap({ 'x': 'y' });
    setActiveHiddenMap(null);
    const out = sanitizeHiddenKeywords('x');
    console.log('[case5 null 清空]');
    check('x 不再被替换', out === 'x');
    console.log('');
}

// case6
{
    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap(42);
    const out = sanitizeHiddenKeywords('a');
    console.log('[case6 非法输入]');
    check('42 不报错且清空', out === 'a');

    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap('string');
    const out2 = sanitizeHiddenKeywords('a');
    check('string 不报错且清空', out2 === 'a');

    setActiveHiddenMap({ 'a': 'b' });
    setActiveHiddenMap([1, 2, 3]);
    const out3 = sanitizeHiddenKeywords('a');
    check('array 不报错且清空', out3 === 'a');
    console.log('');
}

// case7
{
    setActiveHiddenMap({ '': 'x', 'a': 42, 'b': 'ok' });
    const got = getActiveHiddenMap();
    console.log('[case7 过滤非法条目]');
    check('只保留 b', Object.keys(got).length === 1 && got.b === 'ok');
    console.log('');
}

// case8
{
    setActiveHiddenMap({ 'a': 'A' });
    const out = sanitizeHiddenKeywords('a b', { 'b': 'B' });
    console.log('[case8 mapOverride]');
    check('使用 override', out === 'a B');
    console.log('');
}

// case9
{
    setActiveHiddenMap({ 'secret': '[X]' });
    console.log('[case9 containsHiddenKeywords]');
    check('包含返回 true', containsHiddenKeywords('has secret') === true);
    check('不包含返回 false', containsHiddenKeywords('nothing') === false);
    setActiveHiddenMap({});
    check('清空后返回 false', containsHiddenKeywords('has secret') === false);
    console.log('');
}

// case10
{
    setActiveHiddenMap({
        '无界灵根': '[隐藏灵根]',
        '无界道体': '[隐藏体质]',
    });
    const out = sanitizeHiddenKeywords('灵根=无界灵根，体质=无界道体');
    console.log('[case10 多关键词]');
    check('两个都替换', out.includes('[隐藏灵根]') && out.includes('[隐藏体质]'));
    console.log('');
}

setActiveHiddenMap({});

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
