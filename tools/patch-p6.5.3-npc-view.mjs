#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = path.join(ROOT, 'core/memory/identityView.js');
const DOC = path.join(ROOT, 'docs/identity-value-display-design.md');
const T_NPC = path.join(ROOT, 'tools/test-p7.3-npc-rows.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const NPC_OLD = `function _resolveNpcEntry(entry, knowledge, npcId, lang) {
    if (!entry || entry.value == null) return null;
    const vis = entry.visibility || 'public';
    if (vis === 'gmOnly') return null;
    const label = _label(entry, lang, true);

    // public：始终输出
    if (vis === 'public') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // revealedAt 有：真相已公开（hidden / discoverable 都适用）
    if (entry.revealedAt) {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // 未 reveal + hidden/discoverable：需 known
    if (!hasKnown(knowledge, npcId, entry.id)) return null;
    // hidden + known → NPC 已获真知
    if (vis === 'hidden') {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // discoverable + known + 未 reveal → 知道存在，不知内容
    return { label, value: _hiddenPlaceholder(label, lang) };
}`;

const NPC_NEW = `function _resolveNpcEntry(entry, knowledge, npcId, lang) {
    if (!entry || entry.value == null) return null;
    const vis = entry.visibility || 'public';
    if (vis === 'gmOnly') return null;
    const label = _label(entry, lang, true);
    const hasDisplay = entry.display != null && String(entry.display).trim() !== '';

    // P6.5.3: NPC View = 该 NPC 当前认知
    // 判定顺序：
    //   1. gmOnly -> 不输出（已在上方过滤）
    //   2. revealedAt != null -> value（世界已公开真相）
    //   3. public -> display 优先，无则 value
    //   4. hidden/discoverable + 未 reveal:
    //      4a. known -> hidden: value / discoverable: [隐藏{label}]
    //      4b. 未 known -> display 优先，无则不输出

    // revealedAt 优先：世界已公开真相
    if (entry.revealedAt) {
        return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
    }
    // public: display 优先，无则 value
    if (vis === 'public') {
        const v = hasDisplay ? entry.display : entry.value;
        return { label, value: sanitizeHiddenKeywords(String(v)) };
    }
    // 未 reveal + hidden/discoverable
    const known = hasKnown(knowledge, npcId, entry.id);
    if (known) {
        if (vis === 'hidden') {
            return { label, value: sanitizeHiddenKeywords(String(entry.value)) };
        }
        // discoverable + known + 未 reveal -> 知道存在，不知内容
        return { label, value: _hiddenPlaceholder(label, lang) };
    }
    // 未 known：只能看 display，无 display 则不输出
    if (hasDisplay) {
        return { label, value: sanitizeHiddenKeywords(String(entry.display)) };
    }
    return null;
}`;

const DOC_54_START = '### 5.4 NPC 视角';
const DOC_54_END = '---\n\n## 6. 关键场景走查';

const DOC_54_NEW = `### 5.4 NPC 视角

**主体**：剧情中某个具体 NPC（以 npcId 标识）。

**认知**：**该 NPC 当前认知**——由 \`npcKnowledge[npcId][entryId].known\` 决定。

**统一判定规则**（按顺序）：

1. \`gmOnly\` → 不输出
2. \`value == null\` → 不输出（基础准入）
3. \`revealedAt != null\` → 使用 \`value\`（世界已公开真相）
4. \`public\` → \`display\` 优先，无则 \`value\`
5. \`hidden\` / \`discoverable\` + 未 reveal + \`known = true\`：
   - \`hidden\` → \`value\`（NPC 已获真知）
   - \`discoverable\` → \`[隐藏{label}]\`（NPC 察觉存在，不知内容）
6. \`hidden\` / \`discoverable\` + 未 reveal + \`known = false\`：
   - \`display\` 有效 → \`display\`（NPC 只知对外说法）
   - 无有效 \`display\` → **不输出**

**display 有效性定义**（同 §5.1 / §5.2）：

- \`display == null\` / \`undefined\` / \`''\` / \`'   '\` → 无 display
- 其余 → 有 display

**完整矩阵**：

| visibility | revealedAt | known | display | 输出 |
|---|---|---|---|---|
| \`public\` | — | — | 有 | \`display\` |
| \`public\` | — | — | 无 | \`value\` |
| \`public\` | 有 | — | 任意 | \`value\` |
| \`hidden\` | \`null\` | \`true\` | 任意 | \`value\` |
| \`hidden\` | \`null\` | \`false\` | 有 | \`display\` |
| \`hidden\` | \`null\` | \`false\` | 无 | **不输出** |
| \`hidden\` | 有 | — | 任意 | \`value\` |
| \`discoverable\` | \`null\` | \`true\` | 任意 | \`[隐藏{label}]\` |
| \`discoverable\` | \`null\` | \`false\` | 有 | \`display\` |
| \`discoverable\` | \`null\` | \`false\` | 无 | **不输出** |
| \`discoverable\` | 有 | — | 任意 | \`value\` |
| \`gmOnly\` | — | — | 任意 | **不输出** |

**说明**：

- NPC View 是「该 NPC 当前认知」，不是「世界认知」也不是「主角认知」
- \`hidden + known\`：NPC 通过特殊手段（神通 / 鉴定 / 亲历）获得真相 → 看 \`value\`
- \`hidden + 未 known\`：NPC 不知道有隐藏，只知对外说法
  - 这里的 \`display\` 是 **NPC 实际持有的公开认知**，不代表 NPC 察觉到隐藏
  - **不输出 \`[隐藏{label}]\` 占位**（占位会告知 NPC「存在未知项」，是信息泄露）
- \`discoverable + known + 未 reveal\`：NPC **察觉到有异常存在**，但尚未确认真相 → \`[隐藏{label}]\`
  - 这是 NPC View 的**特色**：\`discoverable\` 表示「存在可被发现的异常」，与 \`hidden\`（世界规则隐藏）不同
- \`revealedAt != null\`：全局真相已公开，所有 NPC 直接看 \`value\`（不再 display 优先）
- \`gmOnly\` 永不输出（即使 \`known = true\`）

**sanitize 层**：

- 所有输出（\`value\` / \`display\`）都经过 \`sanitizeHiddenKeywords\` 脱敏
- 若角色卡配了 \`hiddenKeywords: { '无界灵根': '[隐藏灵根]' }\`，则：
  - \`display = '无界灵根'\` → 输出 \`[隐藏灵根]\`
  - \`display = '四系伪灵根'\` → 输出 \`四系伪灵根\`（未配，不误伤）
  - \`display = '对外：四系伪灵根'\` → 输出 \`对外：四系伪灵根\`（普通前缀不动）

**未来扩展**（不在 P6.5.3 范围）：

- 未来 NPC 可能通过能力 scope（\`npc.scope = ['spirit_detect', 'bloodline_sense', ...]\`）动态获得部分已知条目的 value 读取权
- 届时 \`known\` 语义可能扩展为「known + scope 的双重判定」
- P6.5.3 只定义基础结构：\`known = true/false\` 二元

`;

const T_NPC_CONTENT = `import { renderIdentityNpcRows } from '../core/memory/identityView.js';
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
    check('B-1 public 无 display -> value', rows.join('\\n').includes('女'));
    check('B-1 无占位', !rows.join('\\n').includes('[隐藏'));
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
    check('B-3 hidden + known -> value', rows.join('\\n').includes('S_B'));
    check('B-3 无占位', !rows.join('\\n').includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_C', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-4 hidden + revealed -> value', rows.join('\\n').includes('S_C'));
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
    check('B-6 discoverable + known 未 reveal -> 占位', rows.join('\\n').includes('[隐藏'));
    check('B-6 无泄漏', !rows.join('\\n').includes('S_E'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_F', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const rows = renderIdentityNpcRows(id, 'N016', {});
    check('B-7 discoverable + revealed -> value', rows.join('\\n').includes('S_F'));
}
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const k = { '016': { e1: { known: true } } };
    const rows = renderIdentityNpcRows(id, 'N016', k);
    check('B-8 gmOnly + known -> 空', rows.length === 0);
    check('B-8 无泄漏', !rows.join('\\n').includes('GM_X'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'S_G', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    check('B-9 016', renderIdentityNpcRows(id, '016', k).join('\\n').includes('S_G'));
    check('B-9 N016', renderIdentityNpcRows(id, 'N016', k).join('\\n').includes('S_G'));
    check('B-9 16', renderIdentityNpcRows(id, 16, k).join('\\n').includes('S_G'));
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
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\\n');
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
    check('B-13 lang=en 占位 [Hidden:', renderIdentityNpcRows(id, 'N016', k, { lang: 'en' }).join('\\n').includes('[Hidden:'));
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
    check('B-15 valueMode 占位不影响', r1.join('\\n') === r2.join('\\n'));
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
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\\n');
    check('N-2 hidden 未 known + display -> display（关键）', joined.includes('HID_D'));
    check('N-2 不含 value HID_V', !joined.includes('HID_V'));
    check('N-2 无 [隐藏] 占位', !joined.includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'DISC_V', display: 'DISC_D', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\\n');
    check('N-3 discoverable 未 known + display -> display（关键）', joined.includes('DISC_D'));
    check('N-3 不含 value DISC_V', !joined.includes('DISC_V'));
    check('N-3 无 [隐藏] 占位', !joined.includes('[隐藏'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HID_V2', display: 'HID_D2', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\\n');
    check('N-4 hidden + known + display -> value（不是 display）', joined.includes('HID_V2'));
    check('N-4 不含 display HID_D2', !joined.includes('HID_D2'));
}
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'PUB_V', display: 'PUB_D', visibility: 'public', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\\n');
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
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\\n');
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
    const joined = renderIdentityNpcRows(id, 'N016', {}).join('\\n');
    check('S-1 display 含隐藏词被 sanitize', !joined.includes('无界灵根'));
    check('S-1 含占位 [隐藏灵根]', joined.includes('[隐藏灵根]'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '四系伪灵根', visibility: 'hidden' }]);
    check('S-2 display 安全词不误伤', renderIdentityNpcRows(id, 'N016', {}).join('\\n').includes('四系伪灵根'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: '无界灵根', visibility: 'hidden' }]);
    const k = { '016': { e1: { known: true } } };
    const joined = renderIdentityNpcRows(id, 'N016', k).join('\\n');
    check('S-3 known value 含隐藏词被 sanitize', !joined.includes('无界灵根'));
    check('S-3 含占位 [隐藏灵根]', joined.includes('[隐藏灵根]'));
    setActiveHiddenMap({});
}
{
    setActiveHiddenMap({ '无界灵根': '[隐藏灵根]' });
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: '对外：四系伪灵根', visibility: 'hidden' }]);
    check('S-4 普通文本前缀不误伤', renderIdentityNpcRows(id, 'N016', {}).join('\\n').includes('对外：四系伪灵根'));
    setActiveHiddenMap({});
}
console.log('');

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

function replaceBetween(src, startMarker, endMarker, newContent) {
    const i = src.indexOf(startMarker);
    if (i === -1) return { ok: false, reason: 'start not found' };
    const j = src.indexOf(endMarker, i + startMarker.length);
    if (j === -1) return { ok: false, reason: 'end not found' };
    return { ok: true, content: src.slice(0, i) + newContent + src.slice(j) };
}

console.log('=== P6.5.3 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [VIEW, DOC]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
}

const viewSrc = fs.readFileSync(VIEW, 'utf8');
const docSrc = fs.readFileSync(DOC, 'utf8');

const viewCnt = countOccurrences(viewSrc, NPC_OLD);
const viewOK = viewCnt === 1;

const docResult = replaceBetween(docSrc, DOC_54_START, DOC_54_END, DOC_54_NEW);

console.log('patch plan:');
console.log('  [' + (viewOK ? 'OK' : 'XX count=' + viewCnt).padEnd(10) + '] view-npc     _resolveNpcEntry 重写');
console.log('  [' + (docResult.ok ? 'OK' : 'XX ' + docResult.reason).padEnd(10) + '] doc-5.4      §5.4 重写');
console.log('  [NEW]      test-npc     test-p7.3-npc-rows.mjs 重写（含 P6.5.3 + sanitize）');
console.log('');

if (!viewOK || !docResult.ok) {
    console.error('XX abort. no files written.');
    process.exit(1);
}

console.log('view delta: ' + (viewSrc.replace(NPC_OLD, NPC_NEW).length - viewSrc.length) + ' bytes');
console.log('doc  delta: ' + (docResult.content.length - docSrc.length) + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(VIEW, viewSrc.replace(NPC_OLD, NPC_NEW), 'utf8');
console.log('[write] ' + VIEW);
fs.writeFileSync(DOC, docResult.content, 'utf8');
console.log('[write] ' + DOC);
fs.writeFileSync(T_NPC, T_NPC_CONTENT, 'utf8');
console.log('[write] ' + T_NPC);
console.log('');
console.log('done.');
