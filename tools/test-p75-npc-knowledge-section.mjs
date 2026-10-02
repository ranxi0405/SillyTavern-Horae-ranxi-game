import { generateNpcKnowledgeSection } from '../core/memory/identityNpcPrompt.js';

console.log('=== P7.5.1 generateNpcKnowledgeSection 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

function mkIdentity(entries) { return { _v: 'v0.2', entries }; }
function mkState(present, npcs) { return { scene: { characters_present: present }, npcs: npcs || {} }; }
function mkEntry(id, kind, value, visibility, extra = {}) {
    return Object.assign({ id, kind, value, display: null, visibility, revealedAt: null }, extra);
}
function mkKnown(npcId, entryIds) {
    const bucket = {};
    for (const eid of entryIds) {
        bucket[eid] = { known: true, source: 'test', at: { iso: 't', story: null }, note: null };
    }
    return { [String(npcId).padStart(3, '0')]: bucket };
}

// 从 [NPC 认知] 输出中提取单个 NPC 的完整 body（可能多行）
// 边界：从 npcPrefix 开始，到下一个 "N\d{3} " 开头行之前
// （当前 fixture 只有 1 个 NPC，但保持语义清晰，避免以后 fixture 扩展时误改）
function extractNpcBody(out, npcPrefix) {
    const start = out.indexOf(npcPrefix);
    if (start < 0) return '';
    const rest = out.slice(start);
    const next = rest.slice(npcPrefix.length).match(/\nN\d{3} /);
    return next ? rest.slice(0, npcPrefix.length + next.index) : rest;
}

// T1 无 NPC
{
    const identity = mkIdentity([mkEntry('e1', 'gender', '女', 'hidden')]);
    const state = mkState([], {});
    const out = generateNpcKnowledgeSection(identity, {}, state, { userName: '冉汐' });
    check('T1 无 NPC → 空', out === '');
}

// T1b 仅玩家
{
    const identity = mkIdentity([mkEntry('e1', 'gender', '女', 'hidden')]);
    const state = mkState(['冉汐'], { '冉汐': { _id: '001' } });
    const knowledge = mkKnown('001', ['e1']);
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    check('T1b 仅玩家 → 空', out === '');
}

// T2 public-only
{
    const identity = mkIdentity([mkEntry('e1', 'gender', '女', 'public')]);
    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });
    const knowledge = mkKnown('016', ['e1']);
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    check('T2 public-only → 空', out === '');
}

// T3 hidden + known
{
    const identity = mkIdentity([
        mkEntry('e1', 'spiritRoot', '无界灵根', 'hidden'),
        mkEntry('e2', 'gender', '女', 'public'),
    ]);
    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });
    const knowledge = mkKnown('016', ['e1', 'e2']);
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    check('T3 含段头', out.startsWith('[NPC 认知]'));
    check('T3 含 N016 前缀', out.includes('N016 老者:'));
    check('T3 含 无界灵根', out.includes('无界灵根'));
    check('T3 不含 public gender 值', !out.includes('= 女'));
    check('T3 长度 ≤ 400', out.length <= 400);
}

// T3b：public entry 存在 identity.entries，但完全不在 knowledge 里
// 验证 filteredIdentity 生效：renderer 即使遍历 identity.entries，也只输出 allowed entries
{
    const identity = mkIdentity([
        mkEntry('e1', 'spiritRoot', '无界灵根', 'hidden'),
        mkEntry('e2', 'gender', '女', 'public'),         // public entry 存在
    ]);
    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });
    const knowledge = mkKnown('016', ['e1']);             // knowledge 只含 hidden
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    check('T3b 含段头', out.startsWith('[NPC 认知]'));
    check('T3b 含 hidden 灵根', out.includes('无界灵根'));
    check('T3b 不含 public gender', !out.includes('= 女'));
    check('T3b 非空（filteredIdentity 生效）', out.length > '[NPC 认知]'.length);
}

// T4 单 NPC 超限
{
    const entries = [];
    for (let i = 0; i < 10; i++) {
        entries.push(mkEntry('e' + i, 'talent', '天赋X'.repeat(15), 'hidden'));
    }
    const identity = mkIdentity(entries);
    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });
    const knowledge = mkKnown('016', entries.map(e => e.id));
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    const npcLines = out.split('\n').filter(l => l.startsWith('N016'));
    check('T4 有 NPC 行', npcLines.length === 1);
    check('T4 单 NPC 行 ≤ 100', npcLines[0].length <= 100);
    check('T4 末尾 …', npcLines[0].endsWith('…'));
    check('T4 总长度 ≤ 400', out.length <= 400);
}

// T5 多 NPC 超总预算
{
    const entries = [];
    for (let i = 0; i < 5; i++) {
        entries.push(mkEntry('e' + i, 'talent', '天赋Y'.repeat(20), 'hidden'));
    }
    const identity = mkIdentity(entries);
    const present = [];
    const npcs = {};
    const knowledge = {};
    for (let i = 0; i < 5; i++) {
        const nm = 'NPC' + i;
        const id = String(i + 1).padStart(3, '0');
        present.push(nm);
        npcs[nm] = { _id: id };
        knowledge[id] = {};
        for (const e of entries) {
            knowledge[id][e.id] = { known: true, source: 'test', at: { iso: 't', story: null } };
        }
    }
    const state = mkState(present, npcs);
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    check('T5 总长度 ≤ 400', out.length <= 400);
    const npcLines = out.split('\n').filter(l => l.startsWith('N'));
    check('T5 至少 1 个 NPC', npcLines.length >= 1);
    check('T5 每个 NPC 行 ≤ 100', npcLines.every(l => l.length <= 100));
}

// T6 单 NPC 截断时最终长度恰好 = 100
{
    const entries = [];
    for (let i = 0; i < 5; i++) {
        entries.push(mkEntry('e' + i, 'talent', 'A'.repeat(30), 'hidden'));
    }
    const identity = mkIdentity(entries);
    const state = mkState(['N016 老者'], { 'N016 老者': { _id: '016' } });
    const knowledge = mkKnown('016', entries.map(e => e.id));
    const out = generateNpcKnowledgeSection(identity, knowledge, state, { userName: '冉汐' });
    const body = extractNpcBody(out, 'N016');
    check('T6 单 NPC 存在', !!body);
    check('T6 单 NPC 总长 ≤ 100', body.length > 0 && body.length <= 100);
    check('T6 单 NPC 总长 ≥ 50（接近上限）', body.length >= 50);
    check('T6 末尾 …', body.endsWith('…'));
    check('T6 总段 ≤ 400', out.length <= 400);
}

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
