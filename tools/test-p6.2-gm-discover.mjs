import { createIdentityGmApi } from '../core/memory/identityGmApi.js';

const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log = () => {};
console.warn = () => {};

let pass = 0, fail = 0;
function check(label, cond) {
    _origLog((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

let fakeId = null;
const ctx = {
    getIdentity: () => fakeId,
    setIdentity: (id) => { fakeId = id; },
    saveCard: async () => true,
};
const gm = createIdentityGmApi(ctx);

function mkEntry(id, kind, value, extra = {}) {
    return Object.assign({
        id, kind, value,
        visibility: 'discoverable',
        revealedAt: null,
        discovery: null,
    }, extra);
}

_origLog('=== P6.2 GM discover / reveal 测试 ===');
_origLog('');

// case1: discover 首次写 discoveredAt
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.discover('e1', { story: '342年12月24日' });
    const d = fakeId.entries[0].discovery;
    check('discovery 对象已创建', d && typeof d === 'object');
    check('type=manual', d.type === 'manual');
    check('discoveredAt.iso 存在', typeof d.discoveredAt?.iso === 'string');
    check('discoveredAt.story = 342年12月24日', d.discoveredAt.story === '342年12月24日');
    check('revealedAt 未变', fakeId.entries[0].revealedAt === null);
    _origLog('');
}

// case2: discover 二次幂等
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.discover('e1', { story: 'first' });
    const iso1 = fakeId.entries[0].discovery.discoveredAt.iso;
    const story1 = fakeId.entries[0].discovery.discoveredAt.story;
    await new Promise(r => setTimeout(r, 15));
    gm.discover('e1', { story: 'second' });
    const iso2 = fakeId.entries[0].discovery.discoveredAt.iso;
    const story2 = fakeId.entries[0].discovery.discoveredAt.story;
    check('iso 保留首次', iso1 === iso2);
    check('story 不被二次覆盖', story1 === story2);
    _origLog('');
}

// case3: discover 时 discovery 已有结构化对象 -> 保留 type/trigger
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X', {
        discovery: { type: 'condition', trigger: 'spiritual_sense', discoveredAt: null, progress: 0 }
    })] };
    gm.discover('e1');
    const d = fakeId.entries[0].discovery;
    check('type 保持 condition', d.type === 'condition');
    check('trigger 保持 spiritual_sense', d.trigger === 'spiritual_sense');
    check('discoveredAt 被写入', !!d.discoveredAt?.iso);
    _origLog('');
}

// case4: reveal 首次写 revealedAt
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: '342年12月25日' });
    const r = fakeId.entries[0].revealedAt;
    check('revealedAt.iso 存在', typeof r?.iso === 'string');
    check('revealedAt.story = 342年12月25日', r.story === '342年12月25日');
    _origLog('');
}

// case5: reveal 不传 opts
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1');
    check('revealedAt.story = null', fakeId.entries[0].revealedAt.story === null);
    _origLog('');
}

// case6: reveal 二次幂等：iso 保留，story 覆盖
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: 'first' });
    const iso1 = fakeId.entries[0].revealedAt.iso;
    await new Promise(r => setTimeout(r, 15));
    gm.reveal('e1', { story: 'second' });
    const iso2 = fakeId.entries[0].revealedAt.iso;
    const story2 = fakeId.entries[0].revealedAt.story;
    check('iso 保留首次', iso1 === iso2);
    check('story 被覆盖为 second', story2 === 'second');
    _origLog('');
}

// case7: reveal 二次不传 story -> story 不被覆盖
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    gm.reveal('e1', { story: 'first' });
    gm.reveal('e1');
    check('story 保留 first', fakeId.entries[0].revealedAt.story === 'first');
    _origLog('');
}

// case8: help 包含 discover 与 reveal
{
    const helpText = gm.help();
    check('help 含 discover', helpText.includes('discover'));
    check('help 含 reveal', helpText.includes('reveal'));
    _origLog('');
}

// case9: 非法 entryId
{
    fakeId = { _v: 'v0.2', entries: [mkEntry('e1', 'spiritRoot', 'X')] };
    const r1 = gm.discover('missing');
    const r2 = gm.reveal('missing');
    check('discover 不存在 entry 返回 null', r1 === null);
    check('reveal 不存在 entry 返回 null', r2 === null);
    _origLog('');
}

// case10: identity 不存在
{
    fakeId = null;
    const r1 = gm.discover('e1');
    const r2 = gm.reveal('e1');
    check('identity null 时 discover 返回 null', r1 === null);
    check('identity null 时 reveal 返回 null', r2 === null);
    _origLog('');
}

console.log = _origLog;
console.warn = _origWarn;

_origLog('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
