#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'core/memory/directorStore.js');
const TEST_FILE = path.join(ROOT, 'tools/test-director-guard.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const CONST_OLD = `const SIMILARITY_THRESHOLD = 0.4;

const DIRECTOR_CATEGORIES = {`;

const CONST_NEW = `const SIMILARITY_THRESHOLD = 0.4;

// ── 污染防护（防把长文本/代码/Horae 结构化输出误存为长期要求） ──
const MAX_DIRECTOR_NOTE_LEN = 500;
const HORAE_TAG_RE = /<\\/?horae(?:event|_rpg)?>/i;
const CODE_BLOCK_RE = /(?:^|\\n)\\s*(?:console\\.log|function\\s*\\(|\\(async function|\\(function|window\\.\\w+\\s*=)/;
const META_FIELD_RE = /(?:^|\\n)\\s*(time|location|atmosphere|scene_desc|characters|costume|item[!-]{0,2}|affection|npc|agenda-?|rel|mood|event)\\s*[:：]/gi;
const META_FIELD_MIN_DISTINCT = 3;

const DIRECTOR_CATEGORIES = {`;

const DETECT_OLD = `    detect(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        if (t.length < 3) return null;
        if (this.isQuery(t)) return null;

        for (const [category, re] of Object.entries(DIRECTOR_CATEGORIES)) {
            if (re.test(t)) {
                return { category, text: t };
            }
        }
        return null;
    }`;

const DETECT_NEW = `    detect(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        if (t.length < 3) return null;

        // 污染防护：超长文本
        if (t.length > MAX_DIRECTOR_NOTE_LEN) return null;

        // 污染防护：Horae 标签 / 代码块
        if (HORAE_TAG_RE.test(t)) return null;
        if (CODE_BLOCK_RE.test(t)) return null;

        // 污染防护：多字段元数据（≥3 个不同字段，说明是复制的 Horae 块）
        if (DirectorStore._countDistinctMetaFields(t) >= META_FIELD_MIN_DISTINCT) return null;

        if (this.isQuery(t)) return null;

        for (const [category, re] of Object.entries(DIRECTOR_CATEGORIES)) {
            if (re.test(t)) {
                return { category, text: t };
            }
        }
        return null;
    }

    /** 统计文本中出现的不同元数据字段数（用于识别复制的 Horae 结构块） */
    static _countDistinctMetaFields(text) {
        if (!text || typeof text !== 'string') return 0;
        const re = new RegExp(META_FIELD_RE.source, 'gi');
        const fields = new Set();
        for (const m of text.matchAll(re)) {
            let name = String(m[1] || '').toLowerCase();
            if (name.startsWith('item')) name = 'item';
            if (name === 'agenda-') name = 'agenda';
            if (name) fields.add(name);
        }
        return fields.size;
    }`;

const COMMIT_OLD = `    commit({ category, text, source = '' }) {
        if (!category || !text) {
            throw new Error('DirectorStore.commit: category/text required');
        }
        const slot = this._ensureSlot();`;

const COMMIT_NEW = `    commit({ category, text, source = '' }) {
        if (!category || !text) {
            throw new Error('DirectorStore.commit: category/text required');
        }
        // 污染防护：兜底长度校验（即使 detect 放过也不允许超长写入）
        if (typeof text === 'string' && text.length > MAX_DIRECTOR_NOTE_LEN) {
            throw new Error('DirectorStore.commit: text too long (' + text.length + ' > ' + MAX_DIRECTOR_NOTE_LEN + ')');
        }
        const slot = this._ensureSlot();`;

const PATCHES = [
    { id: 'const',  desc: '新增污染防护常量', match: CONST_OLD,  replace: CONST_NEW },
    { id: 'detect', desc: 'detect() 加 3 道污染防护 + _countDistinctMetaFields', match: DETECT_OLD, replace: DETECT_NEW },
    { id: 'commit', desc: 'commit() 兜底长度校验', match: COMMIT_OLD, replace: COMMIT_NEW },
];

const TEST_CONTENT = `import { DirectorStore } from '../core/memory/directorStore.js';

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
    const text = 'time:342年11月18日\\nlocation:藏经阁\\nitem:青玉镯=冉汐@左手腕';
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
    const text = '⚠️ [摘要] 未命中\\n(async function() {\\n  console.log("test");\\n})();\\n' + 'x'.repeat(9000);
    const r = store.detect(text);
    check('T11 9000 字 console → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const text = '老者见你沉吟...请做出你的行动。\\n\\ntime:342年11月18日 13:25\\nlocation:东洲·青岳·落霞宗·藏经阁·一楼大厅\\ncharacters:冉汐, N013 守阁老者\\nitem:青玉镯=冉汐@左手腕\\nitem:下品灵石=冉汐@储物袋\\nitem:中品灵石=冉汐@储物袋';
    const r = store.detect(text);
    check('T12 594 字 Horae 块 → null', r === null);
}
{
    const store = new DirectorStore(createMockManager());
    const text = 'time:342年11月18日\\nlocation:藏经阁\\n节奏不要太琐碎';
    const r = store.detect(text);
    check('T13 time+location 两字段 → pacing 通过', !!(r && r.category === 'pacing'));
}
{
    const store = new DirectorStore(createMockManager());
    const text = 'item:青玉镯=冉汐@左手腕\\nitem:下品灵石=冉汐@储物袋\\nitem:中品灵石=冉汐@储物袋\\n【修正】这些写法不对，帮我改一下';
    const r = store.detect(text);
    check('T14 多行重复 item: 单字段 → correction 通过', !!(r && r.category === 'correction'));
}

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== Director Guard Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(TARGET)) { console.error('XX target missing: ' + TARGET); process.exit(1); }

const src = fs.readFileSync(TARGET, 'utf8');
const stats = []; let failed = null;

for (const p of PATCHES) {
    const count = countOccurrences(src, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(14) + '] ' + s.id.padEnd(8) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX abort: ' + failed.id + ' count=' + failed.count);
    process.exit(1);
}

let next = src;
for (const p of PATCHES) next = next.replace(p.match, p.replace);

console.log('target:');
console.log('  ' + TARGET + '  delta=' + (next.length - src.length) + ' bytes');
console.log('  ' + TEST_FILE + '  (new, ' + TEST_CONTENT.length + ' bytes)');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(TARGET, next, 'utf8');
console.log('[write] ' + TARGET);

fs.writeFileSync(TEST_FILE, TEST_CONTENT, 'utf8');
console.log('[write] ' + TEST_FILE);

console.log('');
console.log('done.');
