#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEW_MODULE = path.join(ROOT, 'core/memory/identityDiscovery.js');
const DOC_FILE = path.join(ROOT, 'docs/identity-discovery-state-machine.md');
const TEST_FILE = path.join(ROOT, 'tools/test-p6.3a-identity-discovery.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const IDENTITY_DISCOVERY_JS = `/**
 * Horae IdentityDiscovery v0.1 (Phase P6.3)
 *
 * 职责：
 *   - 评估 identity entries 的 discovery.requirement
 *   - 生成 action list（不直接改 identity）
 *   - applyDiscover / applyReveal 为唯一状态修改入口
 *   - runDiscovery 为编排入口
 *
 * 边界：
 *   - 只做 condition 类型（event / item / npc 延后）
 *   - 不改 visibility / view / Prompt
 *   - 不落盘（依赖常规保存机制）
 *
 * 数据源（state）：
 *   - state.rpg.spirit.tier        神识段位
 *   - state.rpg.realm.name         大境界名
 *   - state.affection[npcName]     好感度
 *   - state.items[itemName]        持有物
 *
 * discovery.requirement 示例：
 *   {
 *     discoverAt: {
 *       senseRealm: '清明',
 *       affinityMin: { npc: 'N016', min: 60 },
 *       realm: '筑基',
 *       itemHeld: '天机镜',
 *     },
 *     revealAt: { ... }
 *   }
 */

const SENSE_TIER_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];

function _nowIso() {
    return new Date().toISOString();
}

/**
 * 应用 discover（唯一状态修改入口）
 * @param {object} entry
 * @param {object} [opts]
 * @returns {object|null}
 */
export function applyDiscover(entry, opts = {}) {
    if (!entry || typeof entry !== 'object') return null;
    if (!entry.discovery || typeof entry.discovery !== 'object') {
        entry.discovery = {
            type: 'manual',
            trigger: null,
            requirement: null,
            progress: 0,
            discoveredAt: null,
            meta: {},
        };
    }
    if (entry.discovery.discoveredAt == null) {
        entry.discovery.discoveredAt = {
            iso: _nowIso(),
            story: (opts && opts.story) || null,
        };
    }
    entry.updatedAt = _nowIso();
    return entry;
}

/**
 * 应用 reveal（唯一状态修改入口）
 * @param {object} entry
 * @param {object} [opts]
 * @returns {object|null}
 */
export function applyReveal(entry, opts = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const now = _nowIso();
    const story = (opts && opts.story) || null;
    if (!entry.revealedAt) {
        entry.revealedAt = { iso: now, story };
    } else if (story) {
        entry.revealedAt.story = story;
    }
    entry.updatedAt = now;
    return entry;
}

// ─── 数据源读取 ───

function _getSenseRealm(state) {
    return state?.rpg?.spirit?.tier ?? null;
}

function _getRealm(state) {
    return state?.rpg?.realm?.name ?? null;
}

function _getAffinity(state, npcName) {
    if (!state?.affection) return null;
    const v = state.affection[npcName];
    return typeof v === 'number' ? v : null;
}

function _hasItem(state, itemName) {
    if (!state?.items) return false;
    return !!state.items[itemName];
}

// ─── condition 匹配 ───

/**
 * 匹配单个 condition key
 * @param {string} key
 * @param {any} value
 * @param {object} state
 * @returns {boolean}
 */
function _matchOne(key, value, state) {
    if (key === 'senseRealm') {
        const cur = _getSenseRealm(state);
        if (cur == null) return false;
        const curIdx = SENSE_TIER_ORDER.indexOf(cur);
        const reqIdx = SENSE_TIER_ORDER.indexOf(String(value));
        if (curIdx < 0 || reqIdx < 0) return cur === String(value);
        return curIdx >= reqIdx;
    }
    if (key === 'realm') {
        const cur = _getRealm(state);
        if (cur == null) return false;
        return cur === String(value);
    }
    if (key === 'affinityMin') {
        if (!value || typeof value !== 'object') return false;
        const npc = value.npc;
        const min = Number(value.min);
        if (!npc || !Number.isFinite(min)) return false;
        const cur = _getAffinity(state, npc);
        if (cur == null) return false;
        return cur >= min;
    }
    if (key === 'itemHeld') {
        return _hasItem(state, String(value));
    }
    // 未知 key → 保守不匹配
    return false;
}

function _matchAll(requirement, state) {
    if (!requirement || typeof requirement !== 'object') return false;
    for (const [k, v] of Object.entries(requirement)) {
        if (!_matchOne(k, v, state)) return false;
    }
    return true;
}

// ─── 评估 ───

/**
 * 评估单条 entry，返回待执行 action（不修改 entry）
 * @param {object} entry
 * @param {object} state
 * @returns {{entryId:string, action:'discover'|'reveal', reason:string}|null}
 */
export function evaluateEntry(entry, state) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.visibility !== 'discoverable') return null;
    const d = entry.discovery;
    if (!d || typeof d !== 'object') return null;
    if (d.type !== 'condition') return null;
    const req = d.requirement;
    if (!req || typeof req !== 'object') return null;

    // reveal 优先（若条件都满足）
    if (req.revealAt && _matchAll(req.revealAt, state)) {
        if (!entry.revealedAt) {
            return { entryId: entry.id, action: 'reveal', reason: 'revealAt matched' };
        }
    }
    if (req.discoverAt && _matchAll(req.discoverAt, state)) {
        if (!d.discoveredAt) {
            return { entryId: entry.id, action: 'discover', reason: 'discoverAt matched' };
        }
    }
    return null;
}

/**
 * 全量评估，返回 action list（不修改 identity）
 * @param {object} identity
 * @param {object} state
 * @returns {Array}
 */
export function evaluateAll(identity, state) {
    if (!identity || !Array.isArray(identity.entries)) return [];
    const actions = [];
    for (const e of identity.entries) {
        const a = evaluateEntry(e, state);
        if (a) actions.push(a);
    }
    return actions;
}

/**
 * 编排：评估 + 应用
 * @param {object} identity
 * @param {object} state
 * @param {object} [opts]
 * @returns {{actions:Array, applied:Array}}
 */
export function runDiscovery(identity, state, opts = {}) {
    const actions = evaluateAll(identity, state);
    if (actions.length === 0) return { actions: [], applied: [] };
    const applied = [];
    for (const a of actions) {
        const entry = identity.entries.find(e => e && e.id === a.entryId);
        if (!entry) continue;
        if (a.action === 'discover') {
            applyDiscover(entry, opts);
        } else if (a.action === 'reveal') {
            applyReveal(entry, opts);
        }
        applied.push(a);
    }
    return { actions, applied };
}
`;

const TEST_FILE_CONTENT = `import {
    applyDiscover, applyReveal,
    evaluateEntry, evaluateAll, runDiscovery,
} from '../core/memory/identityDiscovery.js';

console.log('=== P6.3a identityDiscovery 测试 ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}

const mkEntry = (extra = {}) => Object.assign({
    id: 'e1', kind: 'spiritRoot', value: 'X',
    visibility: 'discoverable',
    discovery: null, revealedAt: null,
}, extra);

// case1: applyDiscover 创建骨架
{
    const e = mkEntry();
    applyDiscover(e);
    check('discovery 对象创建', e.discovery && typeof e.discovery === 'object');
    check('type=manual', e.discovery.type === 'manual');
    check('discoveredAt.iso', typeof e.discovery.discoveredAt?.iso === 'string');
    console.log('');
}

// case2: applyDiscover 幂等
{
    const e = mkEntry();
    applyDiscover(e, { story: 'first' });
    const iso = e.discovery.discoveredAt.iso;
    applyDiscover(e, { story: 'second' });
    check('iso 保留首次', e.discovery.discoveredAt.iso === iso);
    check('story 保留首次', e.discovery.discoveredAt.story === 'first');
    console.log('');
}

// case3: applyReveal 幂等
{
    const e = mkEntry();
    applyReveal(e, { story: 'first' });
    const iso = e.revealedAt.iso;
    applyReveal(e, { story: 'second' });
    check('iso 保留首次', e.revealedAt.iso === iso);
    check('story 被覆盖', e.revealedAt.story === 'second');
    console.log('');
}

// case4: evaluateEntry - senseRealm 满足 discoverAt
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '凝照' } } });
    check('返回 discover action', a && a.action === 'discover');
    console.log('');
}

// case5: evaluateEntry - senseRealm 不满足
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '洞玄' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '清明' } } });
    check('返回 null', a === null);
    console.log('');
}

// case6: evaluateEntry - realm 相等
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { realm: '筑基' } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { rpg: { realm: { name: '筑基' } } });
    const a2 = evaluateEntry(e, { rpg: { realm: { name: '炼气' } } });
    check('相等匹配', a1 && a1.action === 'discover');
    check('不相等 null', a2 === null);
    console.log('');
}

// case7: evaluateEntry - affinityMin
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { affinityMin: { npc: 'N016', min: 60 } } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { affection: { N016: 70 } });
    const a2 = evaluateEntry(e, { affection: { N016: 50 } });
    check('高于阈值匹配', a1 && a1.action === 'discover');
    check('低于阈值 null', a2 === null);
    console.log('');
}

// case8: evaluateEntry - itemHeld
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { itemHeld: '天机镜' } }, discoveredAt: null } });
    const a1 = evaluateEntry(e, { items: { '天机镜': { holder: '冉汐' } } });
    const a2 = evaluateEntry(e, { items: {} });
    check('有物品匹配', a1 && a1.action === 'discover');
    check('无物品 null', a2 === null);
    console.log('');
}

// case9: evaluateEntry - 非 discoverable 跳过
{
    const e = mkEntry({ visibility: 'hidden', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('hidden 不评估', a === null);
    console.log('');
}

// case10: evaluateEntry - 非 condition 类型跳过
{
    const e = mkEntry({ discovery: { type: 'event', eventId: 'x', discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('非 condition 不评估', a === null);
    console.log('');
}

// case11: evaluateEntry - revealAt 优先
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: {
        discoverAt: { senseRealm: '清明' },
        revealAt: { senseRealm: '凝照' },
    }, discoveredAt: null } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '凝照' } } });
    check('优先返回 reveal', a && a.action === 'reveal');
    console.log('');
}

// case12: evaluateEntry - 已 revealed 不再返回
{
    const e = mkEntry({ discovery: { type: 'condition', requirement: { revealAt: { senseRealm: '清明' } }, discoveredAt: null }, revealedAt: { iso: 'x' } });
    const a = evaluateEntry(e, { rpg: { spirit: { tier: '太虚' } } });
    check('已 reveal 返回 null', a === null);
    console.log('');
}

// case13: runDiscovery 全链路
{
    const id = { _v: 'v0.2', entries: [
        mkEntry({ id: 'e1', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '清明' } }, discoveredAt: null } }),
        mkEntry({ id: 'e2', discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '太虚' } }, discoveredAt: null } }),
    ]};
    const r = runDiscovery(id, { rpg: { spirit: { tier: '清明' } } });
    check('actions len = 1', r.actions.length === 1);
    check('e1 discoveredAt 写入', id.entries[0].discovery.discoveredAt?.iso != null);
    check('e2 保持 null', id.entries[1].discovery.discoveredAt == null);
    console.log('');
}

// case14: runDiscovery 无匹配
{
    const id = { _v: 'v0.2', entries: [mkEntry({ discovery: { type: 'condition', requirement: { discoverAt: { senseRealm: '太虚' } }, discoveredAt: null } })] };
    const r = runDiscovery(id, { rpg: { spirit: { tier: '清明' } } });
    check('actions 空', r.actions.length === 0);
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

const DOC_PATCH = `
---

## 13. P6.3 实现边界

P6.3 首版只实现 \`condition\` 类型，其余类型 schema 保留供未来扩展。

### 当前实现

| 类型 | 数据源 | 支持 |
|---|---|---|
| \`condition\` | state（rpg / affection / items） | ✅ |

### condition 支持的 4 个 key

| key | 数据源 | 语义 |
|---|---|---|
| \`senseRealm\` | \`state.rpg.spirit.tier\` | 神识段位达到或超过阈值（蒙昧 < 清明 < 凝照 < 洞玄 < 明心 < 太虚） |
| \`realm\` | \`state.rpg.realm.name\` | 大境界名完全匹配 |
| \`affinityMin\` | \`state.affection[npc]\` | \`{ npc, min }\` 好感度 ≥ min |
| \`itemHeld\` | \`state.items[name]\` | 持有某物品（存在即满足） |

### 暂缓类型（schema 保留）

- \`event\`：需 AI 输出结构化 eventId，牵动 Prompt / 解析
- \`item\`：需 item 事件钩子
- \`npc\`：依赖 P7 NPC 认知系统

### 触发时机

\`CHARACTER_MESSAGE_RENDERED\` 后，\`onMessageReceived\` 里 state 结算完成后。

### 落盘

只改内存，依赖 Horae 常规 \`saveChat()\`。

### 编排

\`\`\`
condition evaluator (evaluateEntry / evaluateAll)
        ↓
action list（不直接改 identity）
        ↓
runDiscovery 编排
        ↓
applyDiscover / applyReveal（唯一状态修改入口）
\`\`\`

GM API \`discover()\` / \`reveal()\` 也调用同一套 \`apply*\` 函数。
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.3a Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

// 检查
let newModuleExists = fs.existsSync(NEW_MODULE);
let docExists = fs.existsSync(DOC_FILE);
if (!docExists) { console.error('XX doc missing: ' + DOC_FILE); process.exit(1); }

const docSrc = fs.readFileSync(DOC_FILE, 'utf8');
const docHasSection = docSrc.includes('## 13. P6.3 实现边界');

console.log('plan:');
console.log('  [NEW]  ' + NEW_MODULE + (newModuleExists ? ' (exists, will overwrite)' : ''));
console.log('  [APPEND] ' + DOC_FILE + (docHasSection ? ' (section 13 exists, skip)' : ''));
console.log('  [NEW]  ' + TEST_FILE);
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(NEW_MODULE, IDENTITY_DISCOVERY_JS, 'utf8');
console.log('[write] ' + NEW_MODULE);

if (!docHasSection) {
    fs.appendFileSync(DOC_FILE, DOC_PATCH, 'utf8');
    console.log('[append] ' + DOC_FILE);
} else {
    console.log('[skip]  ' + DOC_FILE + ' (section 13 already exists)');
}

fs.writeFileSync(TEST_FILE, TEST_FILE_CONTENT, 'utf8');
console.log('[write] ' + TEST_FILE);

console.log('');
console.log('done.');
