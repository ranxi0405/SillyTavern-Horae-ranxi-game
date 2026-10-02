import { DirectorStore } from '../core/memory/directorStore.js';

console.log('=== DirectorStore 污染防护测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

function createMockManager() {
    const chat = [{ horae_meta: {} }];
    return { getChat: () => chat, _chat: chat };
}

{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('游戏节奏不要太琐碎');
    check('T1 短正常备注 → pacing', !!(r && r.category === 'pacing'));
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('控制一下节奏');
    check('T2 短控制节奏 → pacing', !!(r && r.category === 'pacing'));
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('请做出你的行动。' + 'x'.repeat(600));
    check('T3 超长文本 → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('请看 <horae>time:xxx</horae> 这个格式');
    check('T4 含 <horae> → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('console.log("hello") 怎么没用');
    check('T5 含 console.log → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const text = 'time:342年11月18日\nlocation:藏经阁\nitem:青玉镯=冉汐@左手腕';
    const r = store.detect(text);
    check('T6 time+location+item 三字段 → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.detect('【修正】item:青玉镯=冉汐@左手腕 这个写法不对，帮我改一下');
    check('T7 单行 item: 不误伤', !!(r && r.category === 'correction'));
}
{
    const store = new DirectorStore(createMockManager());
    let threw = false;
    try { store.commit({ category: 'pacing', text: 'x'.repeat(600) }); }
    catch (e) { threw = true; }
    check('T8 commit 超长 → throw', threw === true);
}
{
    const store = new DirectorStore(createMockManager());
    const r = store.commit({ category: 'pacing', text: '不要太琐碎' });
    check('T9 commit 短备注 → push', !!(r && r._isNew === true && r.category === 'pacing'));
}
{
    const store = new DirectorStore(createMockManager());
    const cases = [
        { text: '提醒主持人：游戏节奏不要太琐碎', expect: 'pacing' },
        { text: '提醒主持人，加快游戏节奏，修仙路漫漫，岁月悠而长。不要太琐碎了。', expect: 'pacing' },
        { text: '为什么一个月过去我的神念还没恢复满呢？', expect: 'causality' },
        { text: '定位时间锚点，要求阿拉伯数字显示年月日', expect: 'format' },
    ];
    let allOk = true;
    for (const c of cases) {
        const r = store.detect(c.text);
        if (!r || r.category !== c.expect) {
            console.log('  回归失败:', c.text, '实际:', r?.category);
            allOk = false;
        }
    }
    check('T10 现有 4 条回归全部命中', allOk);
}
{
    const store = new DirectorStore(createMockManager());
    const text = '⚠️ [摘要] 未命中\n(async function() {\n  console.log("test");\n})();\n' + 'x'.repeat(9000);
    const r = store.detect(text);
    check('T11 9000 字 console → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const text = '老者见你沉吟...请做出你的行动。\n\ntime:342年11月18日 13:25\nlocation:东洲·青岳·落霞宗·藏经阁·一楼大厅\ncharacters:冉汐, N013 守阁老者\nitem:青玉镯=冉汐@左手腕\nitem:下品灵石=冉汐@储物袋\nitem:中品灵石=冉汐@储物袋';
    const r = store.detect(text);
    check('T12 594 字 Horae 块 → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const text = 'time:342年11月18日\nlocation:藏经阁\n节奏不要太琐碎';
    const r = store.detect(text);
    check('T13 time+location 两字段 → pacing 通过', !!(r && r.category === 'pacing'));
}
{
    const store = new DirectorStore(createMockManager());
    const text = 'item:青玉镯=冉汐@左手腕\nitem:下品灵石=冉汐@储物袋\nitem:中品灵石=冉汐@储物袋\n【修正】这些写法不对，帮我改一下';
    const r = store.detect(text);
    check('T14 多行重复 item: 单字段 → correction 通过', !!(r && r.category === 'correction'));
}

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
