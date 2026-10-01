#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/identity-value-display-design.md');
const VIEW = path.join(ROOT, 'core/memory/identityView.js');
const TEST = path.join(ROOT, 'tools/test-p6.5.2-player-rows.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const DOC_START = '### 5.1 Player 视角';
const DOC_END = '### 5.2 AI（剧情主持）视角';

const NEW_SECTION_5_1 = `### 5.1 Player 视角

Player 是**主角本人视角**，模拟主角当前认知，不是世界真值视角。

**统一判定规则**（按顺序）：

1. \`gmOnly\` → 不输出
2. \`value == null\` → 不输出（基础准入）
3. \`revealedAt != null\` → 使用 \`value\`（主角已获真相）
4. 未 reveal + \`display\` 有效 → 使用 \`display\`
5. 未 reveal + \`public\` + 无 \`display\` → 使用 \`value\`
6. 未 reveal + \`hidden\` / \`discoverable\` + 无 \`display\` → **不输出**

**display 有效性定义**：

- \`display == null\` → 无 display
- \`display == undefined\` → 无 display
- \`display == ''\` → 无 display
- \`display == '   '\` → 无 display
- \`display == '四系伪灵根'\` → 有 display

**完整矩阵**：

| visibility | revealedAt | display | 输出 |
|---|---|---|---|
| \`public\` | — | 有 | \`display\` |
| \`public\` | — | 无 | \`value\` |
| \`public\` | 有 | 任意 | \`value\` |
| \`hidden\` | \`null\` | 有 | \`display\` |
| \`hidden\` | \`null\` | 无 | **不输出** |
| \`hidden\` | 有 | 任意 | \`value\` |
| \`discoverable\` | \`null\` | 有 | \`display\` |
| \`discoverable\` | \`null\` | 无 | **不输出** |
| \`discoverable\` | 有 | 任意 | \`value\` |
| \`gmOnly\` | — | 任意 | **不输出** |

**说明**：

- Player 视角与 AI 视角严格区分：
  - **AI**：读取 canonical value，最终经 hiddenKeywords 脱敏后注入 Prompt
  - **Player**：模拟主角当前认知——主角不知道的真相不显示
- \`revealedAt != null\` 表示主角**已获得真实内容**，此时不再使用 \`display\`（display 成为历史认知）
- \`hidden\` / \`discoverable\` + 未 reveal + 无有效 display → **不输出**（主角完全不知道这条 entry 存在，UI 不应凭空显示占位）
  - 与 AI 视角不同：AI 视角有占位语义（告知天道），Player 视角无占位语义（UI 噪音）
- \`gmOnly\` 永不进入 Player View
- \`value == null\` 由 \`isPlayerVisible\` 基础准入过滤

`;

const VIEW_ISPLAYER_OLD = `export function isPlayerVisible(entry) {
    if (!entry || entry.value == null) return false;
    if (entry.visibility === 'public') return true;
    if (entry.visibility === 'discoverable' && entry.revealedAt != null) return true;
    return false;
}`;

const VIEW_ISPLAYER_NEW = `export function isPlayerVisible(entry) {
    if (!entry || entry.value == null) return false;
    if (entry.visibility === 'gmOnly') return false;
    return true;
}`;

const VIEW_ROWS_OLD = `export function renderIdentityPlayerRows(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isPlayerVisible);
    const sorted = _sortEntries(visible);
    return sorted.map(e => ({
        icon: _icon(e),
        label: _label(e, lang, false),
        value: (e.display != null) ? e.display : e.value,
        extraCls: (e.kind === 'bloodline') ? 'horae-rpg-field-icon--bloodline' : '',
    }));
}`;

const VIEW_ROWS_NEW = `export function renderIdentityPlayerRows(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isPlayerVisible);
    const sorted = _sortEntries(visible);
    const rows = [];
    for (const e of sorted) {
        const vis = e.visibility || 'public';
        const revealed = e.revealedAt != null;
        const hasDisplay = e.display != null && String(e.display).trim() !== '';

        let value;
        if (revealed) {
            value = e.value;
        } else if (hasDisplay) {
            value = e.display;
        } else if (vis === 'public') {
            value = e.value;
        } else {
            // hidden / discoverable + 未 reveal + 无有效 display
            // → 主角完全不知道，跳过
            continue;
        }

        rows.push({
            icon: _icon(e),
            label: _label(e, lang, false),
            value,
            extraCls: (e.kind === 'bloodline') ? 'horae-rpg-field-icon--bloodline' : '',
        });
    }
    return rows;
}`;

const TEST_CONTENT = `import { isPlayerVisible, renderIdentityPlayerRows } from '../core/memory/identityView.js';

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
`;

function countOccurrences(h, n) {
    let c = 0, i = 0;
    while (true) { const j = h.indexOf(n, i); if (j === -1) break; c++; i = j + n.length; }
    return c;
}

console.log('=== P6.5.2 Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [DOC, VIEW]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
}

const docSrc = fs.readFileSync(DOC, 'utf8');
const viewSrc = fs.readFileSync(VIEW, 'utf8');

const docStartIdx = docSrc.indexOf(DOC_START);
const docEndIdx = docSrc.indexOf(DOC_END, docStartIdx + DOC_START.length);
const docAnchorOK = docStartIdx !== -1 && docEndIdx !== -1;
const docNext = docAnchorOK
    ? docSrc.slice(0, docStartIdx) + NEW_SECTION_5_1 + docSrc.slice(docEndIdx)
    : null;

const isPlayerCnt = countOccurrences(viewSrc, VIEW_ISPLAYER_OLD);
const rowsCnt = countOccurrences(viewSrc, VIEW_ROWS_OLD);
const isPlayerOK = isPlayerCnt === 1;
const rowsOK = rowsCnt === 1;
const viewNext = (isPlayerOK && rowsOK)
    ? viewSrc.replace(VIEW_ISPLAYER_OLD, VIEW_ISPLAYER_NEW).replace(VIEW_ROWS_OLD, VIEW_ROWS_NEW)
    : null;

console.log('patch plan:');
console.log('  [' + (docAnchorOK ? 'OK' : 'XX') .padEnd(10) + '] doc-5.1     §5.1 整段替换（锚点法：5.1 -> 5.2）');
console.log('  [' + (isPlayerOK ? 'OK' : 'XX count=' + isPlayerCnt).padEnd(10) + '] isPlayer    isPlayerVisible 替换');
console.log('  [' + (rowsOK ? 'OK' : 'XX count=' + rowsCnt).padEnd(10) + '] player-rows renderIdentityPlayerRows 替换');
console.log('  [NEW]      test        ' + TEST);
console.log('');

if (!docAnchorOK || !isPlayerOK || !rowsOK) {
    console.error('XX abort. no files written.');
    process.exit(1);
}

console.log('doc  delta: ' + (docNext.length - docSrc.length) + ' bytes');
console.log('view delta: ' + (viewNext.length - viewSrc.length) + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(DOC, docNext, 'utf8');
console.log('[write] ' + DOC);
fs.writeFileSync(VIEW, viewNext, 'utf8');
console.log('[write] ' + VIEW);
fs.writeFileSync(TEST, TEST_CONTENT, 'utf8');
console.log('[write] ' + TEST);
console.log('');
console.log('done.');
