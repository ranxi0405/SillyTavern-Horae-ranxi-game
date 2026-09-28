#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    ix: path.join(ROOT, 'index.js'),
    hm: path.join(ROOT, 'core/horaeManager.js'),
};
const SUFFIX = '.bak-before-s15';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.basename(f)); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== S1.5: Fact 生产链 + 溯源 + 注入去重 + 迁移 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

let changed = 0, failed = 0;

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }

function applyPatch(content, name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ > 1) { console.error('  XX ' + name + ' (' + occ + ' matches)'); return { content, status: -1 }; }
    console.log('  OK ' + name);
    return { content: content.replace(before, after), status: 1 };
}

// ═══════════════════════════════════════════════════════════
// S1.5a: _buildFactExtractionPrompt 强化
// ═══════════════════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    // P1: zh-CN 追加 State-authoritative 不提取清单（插到【角色卡 / RPG 固有设定】段末尾）
    {
        const before = `【角色卡 / RPG 固有设定 —— 不重复提取】
以下内容已在角色卡、RPG 系统中保存并每回合注入，不要重复提取：
- 主角的天赋、外貌、性格、固有属性
- 主角的已知出身背景
- 主角的固定能力（如"过目不忘"这类天赋）
- 主角已有的基础属性值（五维、境界、灵根）
只提取剧情中"新出现"或"发生变化"的事实。`;
        const after = `【角色卡 / RPG 固有设定 —— 不重复提取】
以下内容已在角色卡、RPG 系统中保存并每回合注入，不要重复提取：
- 主角的天赋、外貌、性格、固有属性
- 主角的已知出身背景
- 主角的固定能力（如"过目不忘"这类天赋）
- 主角已有的基础属性值（五维、境界、灵根）
只提取剧情中"新出现"或"发生变化"的事实。

【State-authoritative predicate —— 永不提取】
以下 predicate 由 RPG State 每回合实时管理，永不提取为 Fact：
- 境界（由 rpg.realm 管理）
- 修为（由 rpg.cultivation 管理）
- 神识（由 rpg.spirit 管理）
- 寿元（由 rpg.lifespan 管理）
- 年龄（由 rpg.age 管理）
- 持有物（由 rpg.equipment / items 管理，见下方"物品永不提取"）

注意：这里的"永不提取"是指"不要把这些当作长期 Fact 提取"，
但你可以在叙事中正常引用这些信息（AI 每回合从 State 快照读取）。

不应提取的示例：
❌ 冉汐|境界|炼气后期       ← State 已管理
❌ 冉汐|神识|清明境         ← State 已管理
❌ 冉汐|持有物|青霜剑       ← 物品系统管理

应提取的示例（Fact 独有，不属 State）：
✅ 冉汐|门派|落霞宗
✅ 冉汐|身份|外门弟子
✅ 冉汐|灵根|杂灵根
✅ 冉汐|性别|女`;
        const r = applyPatch(content, 'S1.5a-P1 zh State-authoritative', before, after, '【State-authoritative predicate —— 永不提取】');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P2: zh-CN 追加"绝对禁止 supersede"清单（插到【动作选择规则】后）
    {
        const before = `【动作选择规则】
- 技能、关系、持有物、见过的地方等可并存 → add
- 当前状态类（境界、位置、身份、门派等）：值变化时用 supersede
- 事实被推翻/失效 → invalidate
- 无法确定 → add（宁可冗余，不可误删）`;
        const after = `【动作选择规则】
- 技能、关系、持有物、见过的地方等可并存 → add
- 当前状态类（境界、位置、身份、门派等）：值变化时用 supersede
- 事实被推翻/失效 → invalidate
- 无法确定 → add（宁可冗余，不可误删）

⚠️【绝对禁止 supersede 的 predicate —— 天然多值，必须用 add】
以下 predicate 天然支持多值，**新增值时强制使用 add**，禁止使用 supersede：
- 关系（一个人可同时有：师父、好友、敌人、同门…）
- 技艺（一个人可同时掌握：炼丹、炼器、阵法…）
- 技能（一个人可同时会：青木诀、流云步、碎玉指…）
- 天赋（一个人可有多个天赋）

若判定需要使用 supersede 但 predicate 属于上述清单，**强制降级为 add**。
仅在这些 predicate 的旧值**被摘要明确证明不再成立**时，才使用 invalidate（不是 supersede）。

⚠️【supersede 的充分条件 —— 必须满足全部】
使用 supersede 必须同时满足：
1. predicate 属于单值类（非上述多值清单）
2. 摘要**明确证明**旧值不再成立、新值取代旧值
3. target 必须精确匹配已有 facts 中的某一条 active 记录

**仅出现一个新的 object 不是 supersede 的充分条件**。
如果无法判断新值是否取代旧值 → 使用 add。`;
        const r = applyPatch(content, 'S1.5a-P2 zh supersede 禁止清单', before, after, '⚠️【绝对禁止 supersede 的 predicate');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P3: zh-CN 追加"已有 facts 多值证据解读"（插到【已有 facts...】说明之前）
    {
        const before = `【已有 facts（仅作为上下文参考，不是过滤器）】
\${existingStr}`;
        const after = `⚠️【已有 facts 多值证据解读】
观察【已有 facts】里的记录：
- 如果同一个 subject + predicate 出现**多个不同的 object** → 该 predicate 是多值 predicate，
  新增值时**必须用 add**。
- 如果同一个 subject + predicate **只有一条** active 记录 → 无法仅凭此判断是单值还是多值，
  最终判断依据是"新值是否与旧值可同时成立"。
- **不要让程序或规则根据 predicate 名字猜单值/多值**，最终由语义判断。

【已有 facts（仅作为上下文参考，不是过滤器）】
\${existingStr}`;
        const r = applyPatch(content, 'S1.5a-P3 zh 多值证据解读', before, after, '⚠️【已有 facts 多值证据解读】');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P4: en 版同步 State-authoritative
    {
        const before = `【Rules】
1. Only "long-term conclusions", not "processes" or "temporary states"
2. Preferred predicates: identity, realm, root, gender, age, race, occupation, sect, location, relation, goal
3. Only confirmed facts, not speculations
4. No temporary states
5. No duplicates with existing facts below
6. Extract as many as there are, no upper limit`;
        const after = `【Rules】
1. Only "long-term conclusions", not "processes" or "temporary states"
2. Preferred predicates: identity, realm, root, gender, age, race, occupation, sect, location, relation, goal
3. Only confirmed facts, not speculations
4. No temporary states
5. No duplicates with existing facts below
6. Extract as many as there are, no upper limit

【State-authoritative predicates — NEVER extract】
The following are managed by RPG State each turn; do NOT extract as Facts:
realm, cultivation, spirit, lifespan, age, held_items.
(Facts unique to narration like sect/identity/spirit_root/gender MUST still be extracted.)

【NEVER use supersede on multi-value predicates】
relation / craft / skill / talent — MUST use add for new values.
supersede requires: (1) single-value predicate, (2) explicit replacement in narrative, (3) exact target match.
A new object alone is NOT sufficient for supersede.`;
        const r = applyPatch(content, 'S1.5a-P4 en State 与多值', before, after, '【State-authoritative predicates — NEVER extract】');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (c > 0 && !DRY_RUN) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        const r = spawnSync(process.execPath, ['--check', FILES.ix], { encoding: 'utf8' });
        if (r.status !== 0) { console.error('  XX index.js syntax: ' + r.stderr); f++; }
        else console.log('  IX syntax OK');
    }
    changed += c; failed += f;
}

// ═══════════════════════════════════════════════════════════
// S1.5b + S1.5d: 溯源 enrich + 懒迁移 hook
// ═══════════════════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    // P5: 新增 _enrichFactsWithSource + _migrateFactsIfNeeded 辅助函数（插到 _autoExtractFactsFromSummary 之前）
    {
        const before = `async function _autoExtractFactsFromSummary(summaryId) {\n    try {`;
        const after = `/** 为提取的 fact 填充溯源字段（不让 AI 猜） */
function _enrichFactsWithSource(facts, entry) {
    if (!Array.isArray(facts) || !entry) return facts;

    const events = entry.originalEvents || [];
    const sourceEventIds = events
        .filter(e => typeof e.msgIdx === 'number')
        .map(e => 'm' + e.msgIdx + '_e' + (e.evtIdx ?? '?'));
    const since = events[0]?.timestamp?.story_date || null;
    const sourceTag = 'summary:' + entry.id;

    return facts.map(f => ({
        ...f,
        since: f.since || since,
        sourceEventIds: (Array.isArray(f.sourceEventIds) && f.sourceEventIds.length > 0)
            ? f.sourceEventIds
            : sourceEventIds,
        source: f.source || sourceTag,
    }));
}

/** 懒迁移：一次性 normalizeLegacy + _factsVersion 标记 */
function _migrateFactsIfNeeded() {
    try {
        const chat = horaeManager.getChat();
        if (!chat?.length) return { migrated: 0, version: null };
        if (!chat[0].horae_meta) return { migrated: 0, version: null };

        const meta = chat[0].horae_meta;
        const CUR_VERSION = 'v0.4';
        if (meta._factsVersion === CUR_VERSION) {
            return { migrated: 0, version: CUR_VERSION, skipped: true };
        }

        const factStore = new FactStore(horaeManager);
        const migrated = factStore.normalizeLegacy();
        meta._factsVersion = CUR_VERSION;
        console.log('[Horae][Fact] 迁移完成: normalizeLegacy=' + migrated + ', version=' + CUR_VERSION);
        try { getContext().saveChat(); } catch (_) {}
        return { migrated, version: CUR_VERSION };
    } catch (e) {
        console.warn('[Horae][Fact] 迁移失败:', e);
        return { migrated: 0, version: null, error: String(e) };
    }
}

async function _autoExtractFactsFromSummary(summaryId) {
    try {
        _migrateFactsIfNeeded();
`;
        const r = applyPatch(content, 'S1.5b+d 新增辅助函数 + 懒迁移', before, after, 'function _enrichFactsWithSource(facts, entry)');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P6: commitBatch 之前调用 enrich
    {
        const before = `        const results = factStore.commitBatch(facts);`;
        const after = `        const enrichedFacts = _enrichFactsWithSource(facts, entry);
        const results = factStore.commitBatch(enrichedFacts);`;
        const r = applyPatch(content, 'S1.5b enrich 注入', before, after, 'const enrichedFacts = _enrichFactsWithSource');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P7: 暴露 window._horaeMigrateFacts
    {
        const before = `window._horaeTestFactExtraction = _testFactExtraction;`;
        const after = `window._horaeTestFactExtraction = _testFactExtraction;
window._horaeMigrateFacts = _migrateFactsIfNeeded;`;
        const r = applyPatch(content, 'S1.5d window 暴露迁移', before, after, `window._horaeMigrateFacts = _migrateFactsIfNeeded;`);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (c > 0 && !DRY_RUN) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        const r = spawnSync(process.execPath, ['--check', FILES.ix], { encoding: 'utf8' });
        if (r.status !== 0) { console.error('  XX index.js syntax: ' + r.stderr); f++; }
        else console.log('  IX syntax OK (part2)');
    }
    changed += c; failed += f;
}

// ═══════════════════════════════════════════════════════════
// S1.5c: _generateFactsSection 注入去重
// ═══════════════════════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;
    let c = 0, f = 0;

    // P8: 新增常量（插入到 _generateFactsSection 之前）
    {
        const before = `    /** 生成"已知事实"段（从 chat[0].horae_meta.facts 读取 active 条目） */
    _generateFactsSection(relevantActors = null) {`;
        const after = `    /** State-authoritative predicate —— 不从 Fact 注入（由 State 段独立提供） */
    static _STATE_AUTHORITATIVE_PREDICATES = new Set([
        '境界', '修为', '神识', '寿元', '年龄', '持有物', '物品',
    ]);

    /** 生成"已知事实"段（从 chat[0].horae_meta.facts 读取 active 条目） */
    _generateFactsSection(relevantActors = null) {`;
        const r = applyPatch(content, 'S1.5c 常量', before, after, '_STATE_AUTHORITATIVE_PREDICATES');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P9: 过滤条件
    {
        const before = `        // Relevance 过滤
        const filtered = active.filter(f => {
            // gm_only 总是注入
            if (f.visibility === 'gm_only') return true;`;
        const after = `        // Relevance 过滤
        const filtered = active.filter(f => {
            // State-authoritative predicate 不注入（避免与 State 段重复）
            if (HoraeManager._STATE_AUTHORITATIVE_PREDICATES.has(f.predicate)) return false;
            // gm_only 总是注入
            if (f.visibility === 'gm_only') return true;`;
        const r = applyPatch(content, 'S1.5c 过滤', before, after, 'HoraeManager._STATE_AUTHORITATIVE_PREDICATES.has(f.predicate)');
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (c > 0 && !DRY_RUN) {
        backup(FILES.hm);
        writeNorm(FILES.hm, content, isCRLF);
        const r = spawnSync(process.execPath, ['--check', FILES.hm], { encoding: 'utf8' });
        if (r.status !== 0) { console.error('  XX horaeManager.js syntax: ' + r.stderr); f++; }
        else console.log('  HM syntax OK');
    }
    changed += c; failed += f;
}

console.log('');
console.log('total: changed=' + changed + ', failed=' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) console.log('[dry-run] not written');
else console.log('=== S1.5 DONE ===');