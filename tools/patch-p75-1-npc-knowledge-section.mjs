#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(ROOT, 'core/memory/identityNpcPrompt.js');
const INDEX  = path.join(ROOT, 'index.js');
const TEST   = path.join(ROOT, 'tools/test-p75-npc-knowledge-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// ─── 新模块内容 ───

const MODULE_CONTENT = `/**
 * Horae IdentityNpcPrompt v0.1 (Phase P7.5.1)
 *
 * 职责：
 *   - 生成 Prompt 段 [NPC 认知]（P7.5 设计）
 *   - 只读 identity / npcKnowledge / state，不写
 *   - 继续调用 renderIdentityNpcRows 获取 NPC 视角 rows
 *   - 单 NPC ≤100 字符（含省略号），总段 ≤400 字符（含段头/换行/前缀）
 *
 * 边界：
 *   - 不复制 identityView 的 visibility / display / value / placeholder 逻辑
 *   - 不修改 npcKnowledge 结构
 *   - 不新增状态存储
 *   - 不使用 _findMentionedNpcs 逻辑（只处理 state.scene.characters_present）
 *   - 玩家永不为候选
 *
 * 数据链：
 *   state.scene.characters_present
 *     → 排除玩家
 *     → state.npcs[name]._id
 *     → npcKnowledge[npcId]
 *     → known === true
 *     → 排除 public / gmOnly entry
 *     → isNpcPerceivable()
 *     → renderIdentityNpcRows(identity, npcId, filteredKnowledge, { lang })
 *     → 单 NPC ≤100（含省略号）
 *     → 总段 ≤400（含段头/前缀/换行）
 *     → [NPC 认知]
 */

import { renderIdentityNpcRows } from './identityView.js';

const PER_NPC_LIMIT = 100;
const TOTAL_LIMIT = 400;
const SECTION_HEADER = '[NPC 认知]';
const ELLIPSIS = '…';

/**
 * P7.5 §10.1 预留接口，本版恒 true
 */
function _isNpcPerceivable(_entryId, _npcId, _identity) {
    return true;
}

/**
 * 生成 [NPC 认知] 段
 * @param {object} identity - chat[0].horae_meta.identity
 * @param {object} knowledge - chat[0].horae_meta.npcKnowledge
 * @param {object} state - horaeManager.getLatestState(0)
 * @param {object} [opts]
 * @param {string} [opts.lang='zh-CN']
 * @param {string} [opts.userName=''] - 玩家名（用于排除）
 * @returns {string} 完整段文本（含段头），空则返回 ''
 */
export function generateNpcKnowledgeSection(identity, knowledge, state, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const userName = opts.userName || '';

    if (!identity || !knowledge || !state) return '';
    const entries = Array.isArray(identity.entries) ? identity.entries : [];
    if (entries.length === 0) return '';

    const present = Array.isArray(state.scene?.characters_present) ? state.scene.characters_present : [];
    if (present.length === 0) return '';

    const npcs = state.npcs || {};

    // 第一层：候选 NPC 筛选
    const candidates = [];
    for (const name of present) {
        if (!name || name === userName) continue;
        const info = npcs[name];
        if (!info || !info._id) continue;
        const npcId = String(info._id);
        const bucket = knowledge[npcId];
        if (!bucket || typeof bucket !== 'object' || Object.keys(bucket).length === 0) continue;
        candidates.push({ name, npcId });
    }
    if (candidates.length === 0) return '';

    // 第二层：entry 候选筛选（预计算）
    const allowedEntryIds = new Set();
    for (const e of entries) {
        if (!e || !e.id) continue;
        if (e.visibility === 'public') continue;  // Prompt 去重优化（非安全边界）
        if (e.visibility === 'gmOnly') continue;  // 永不输出
        allowedEntryIds.add(e.id);
    }
    if (allowedEntryIds.size === 0) return '';

    // 第三/四层：单 NPC 渲染 + 单 NPC 100 字符裁剪
    const rendered = [];
    for (const { name, npcId } of candidates) {
        const bucket = knowledge[npcId];
        const filtered = { [npcId]: {} };
        let hasAny = false;
        for (const [eid, rec] of Object.entries(bucket)) {
            if (!rec || rec.known !== true) continue;
            if (!allowedEntryIds.has(eid)) continue;
            if (!_isNpcPerceivable(eid, npcId, identity)) continue;
            filtered[npcId][eid] = rec;
            hasAny = true;
        }
        if (!hasAny) continue;

        const rows = renderIdentityNpcRows(identity, npcId, filtered, { lang });
        if (!Array.isArray(rows) || rows.length === 0) continue;

        const prefix = 'N' + npcId + ' ' + name + ': ';
        if (prefix.length >= PER_NPC_LIMIT) continue;

        let acc = '';
        let truncated = false;
        for (const row of rows) {
            const sep = acc ? '\\n' : '';
            const candidate = acc + sep + row;
            if ((prefix + candidate).length <= PER_NPC_LIMIT) {
                acc = candidate;
            } else {
                truncated = true;
                break;
            }
        }
        if (!acc) continue;
        if (truncated) {
            // 保证 (prefix + acc + '…').length = PER_NPC_LIMIT
            const maxBodyLen = PER_NPC_LIMIT - prefix.length - ELLIPSIS.length;
            if (maxBodyLen <= 0) continue;
            acc = acc.length > maxBodyLen ? acc.slice(0, maxBodyLen) : acc;
            acc = acc + ELLIPSIS;
        }
        const full = prefix + acc;
        if (full.length > PER_NPC_LIMIT) continue;
        rendered.push({ full });
    }
    if (rendered.length === 0) return '';

    // 第五层：总 400 字符裁剪（含段头 / 前缀 / 换行 / 省略号）
    let total = SECTION_HEADER.length;
    const lines = [SECTION_HEADER];
    for (const r of rendered) {
        const add = 1 + r.full.length;
        if (total + add > TOTAL_LIMIT) break;
        lines.push(r.full);
        total += add;
    }
    if (lines.length === 1) return '';
    return lines.join('\\n');
}
`;

// ─── 测试文件内容 ───

const TEST_CONTENT = `import { generateNpcKnowledgeSection } from '../core/memory/identityNpcPrompt.js';

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
    const npcLines = out.split('\\n').filter(l => l.startsWith('N016'));
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
    const npcLines = out.split('\\n').filter(l => l.startsWith('N'));
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
    const line = out.split('\\n').filter(l => l.startsWith('N016'))[0];
    check('T6 单行存在', !!line);
    check('T6 单 NPC 行 ≤ 100', line.length <= 100);
    check('T6 单 NPC 行 = 100（截断上限）', line.length === 100);
    check('T6 末尾 …', line.endsWith('…'));
    check('T6 总段 ≤ 400', out.length <= 400);
}

console.log('');
console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

// ─── index.js 三处改动 ───

const IDX_IMPORT_OLD = `import { renderIdentityAiSection } from './core/memory/identityView.js';`;
const IDX_IMPORT_NEW = `import { renderIdentityAiSection } from './core/memory/identityView.js';
import { generateNpcKnowledgeSection } from './core/memory/identityNpcPrompt.js';`;

const IDX_PROMPT_OLD = `        const dataPromptWithIdentity = _identityAiSection
            ? \`\${_identityAiSection}\\n\\n\${dataPrompt}\`
            : dataPrompt;`;

const IDX_PROMPT_NEW = `        const dataPromptWithIdentity = _identityAiSection
            ? \`\${_identityAiSection}\\n\\n\${dataPrompt}\`
            : dataPrompt;

        // P7.5: NPC 认知段（NPC Knowledge View）
        const _npcKnowledgeSection = generateNpcKnowledgeSection(
            chat?.[0]?.horae_meta?.identity,
            chat?.[0]?.horae_meta?.npcKnowledge,
            horaeManager.getLatestState(0),
            { lang: horaeManager._getAiOutputLang(), userName: getContext()?.name1 || '' }
        );
        const dataPromptWithBoth = _npcKnowledgeSection
            ? \`\${dataPromptWithIdentity}\\n\\n\${_npcKnowledgeSection}\`
            : dataPromptWithIdentity;`;

const IDX_DYN_OLD = `const dynamicPrompt = recallPrompt
    ? \`\${dataPromptWithIdentity}\\n\${recallPrompt}\`
    : dataPromptWithIdentity;`;

const IDX_DYN_NEW = `const dynamicPrompt = recallPrompt
    ? \`\${dataPromptWithBoth}\\n\${recallPrompt}\`
    : dataPromptWithBoth;`;

const PATCHES = [
    { id: 'idx-import', desc: 'index.js 加 generateNpcKnowledgeSection import', match: IDX_IMPORT_OLD, replace: IDX_IMPORT_NEW },
    { id: 'idx-prompt', desc: 'index.js 加 _npcKnowledgeSection + dataPromptWithBoth', match: IDX_PROMPT_OLD, replace: IDX_PROMPT_NEW },
    { id: 'idx-dyn',    desc: 'index.js dynamicPrompt 改用 dataPromptWithBoth', match: IDX_DYN_OLD, replace: IDX_DYN_NEW },
];

function countOccurrences(h, n) {
    if (!n) return 0;
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P7.5.1 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

if (!fs.existsSync(INDEX)) { console.error('XX missing: ' + INDEX); process.exit(1); }
if (fs.existsSync(MODULE)) { console.error('XX module already exists: ' + MODULE); process.exit(1); }

const indexSrc = fs.readFileSync(INDEX, 'utf8');
const stats = []; let failed = null;
for (const p of PATCHES) {
    const count = countOccurrences(indexSrc, p.match);
    const ok = count === 1;
    stats.push({ id: p.id, desc: p.desc, count, ok });
    if (!ok && !failed) failed = { id: p.id, desc: p.desc, count };
}

console.log('patch plan:');
for (const s of stats) {
    const tag = s.ok ? 'OK' : ('XX count=' + s.count);
    console.log('  [' + tag.padEnd(12) + '] ' + s.id.padEnd(12) + ' ' + s.desc);
}
console.log('');

if (failed) {
    console.error('XX abort: ' + failed.id + ' count=' + failed.count);
    process.exit(1);
}

let nextIndex = indexSrc;
for (const p of PATCHES) nextIndex = nextIndex.replace(p.match, p.replace);

console.log('files:');
console.log('  ' + MODULE + '  (new, ' + MODULE_CONTENT.length + ' bytes)');
console.log('  ' + INDEX + '  delta=' + (nextIndex.length - indexSrc.length) + ' bytes');
console.log('  ' + TEST + '  (new, ' + TEST_CONTENT.length + ' bytes)');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done. no files written.'); process.exit(0); }

fs.writeFileSync(MODULE, MODULE_CONTENT, 'utf8');
console.log('[write] ' + MODULE);

fs.writeFileSync(INDEX, nextIndex, 'utf8');
console.log('[write] ' + INDEX);

fs.writeFileSync(TEST, TEST_CONTENT, 'utf8');
console.log('[write] ' + TEST);

console.log('');
console.log('done.');
