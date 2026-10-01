#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/identity-value-display-design.md');
const VIEW = path.join(ROOT, 'core/memory/identityView.js');
const T_VIS = path.join(ROOT, 'tools/test-identityView-visibility.mjs');
const T_P5 = path.join(ROOT, 'tools/test-p5-identity-section.mjs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

const VIEW_AI_OLD = `export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    return sorted.map(e => {
        const label = _label(e, lang, true);
        // P6.5: AI 天道视角读 canonical value；
        // display 若非空且异于 value，附注「对外：<display>」供描述 NPC 视角。
        // gmOnly 由 isAiVisible 过滤。
        const safeValue = sanitizeHiddenKeywords(String(e.value));
        const rawDisplay = e.display != null ? String(e.display) : null;
        const safeDisplay = rawDisplay ? sanitizeHiddenKeywords(rawDisplay) : null;
        if (safeDisplay && safeDisplay !== safeValue) {
            return '· ' + label + ' = ' + safeValue + '（对外：' + safeDisplay + '）';
        }
        return '· ' + label + ' = ' + safeValue;
    });
}`;

const VIEW_AI_NEW = `export function renderIdentityAiEntries(id, opts = {}) {
    const lang = opts.lang || 'zh-CN';
    const entries = getIdentityEntries(id, { includeNotGenerated: false });
    const visible = entries.filter(isAiVisible);
    const sorted = _sortEntries(visible, { hiddenLast: true });
    const rows = [];
    for (const e of sorted) {
        const vis = e.visibility || 'public';
        const revealed = e.revealedAt != null;
        const hasDisplay = e.display != null && String(e.display).trim() !== '';

        // P6.5.1b: AI View = 世界当前认知（不是 GM 全知）
        //   revealedAt != null  → value（世界已确认真相）
        //   未 reveal + display → display（世界当前认知）
        //   未 reveal + public + 无 display → value
        //   未 reveal + hidden/discoverable + 无 display → 不输出
        // 不输出 [隐藏{label}] 占位（占位本身是信息泄露）
        // 不输出「对外：display」双层（display 就是世界当前认知）
        // discovery.discoveredAt 有值不影响输出（由剧情上下文体现）
        let output;
        if (revealed) {
            output = sanitizeHiddenKeywords(String(e.value));
        } else if (hasDisplay) {
            output = sanitizeHiddenKeywords(String(e.display));
        } else if (vis === 'public') {
            output = sanitizeHiddenKeywords(String(e.value));
        } else {
            continue;
        }
        rows.push('· ' + _label(e, lang, true) + ' = ' + output);
    }
    return rows;
}`;

const DOC_S2_START = '## 2. 核心原则';
const DOC_S2_END = '## 3. 字段语义';

const DOC_S2_NEW = `## 2. 核心原则

五条不可违反：

1. **\`identity\` = 世界真相**  
   \`value\` 是真相。\`display\` 不是真值，是**对外公开认知**。  
   \`display\` 不构成 identity 的第二事实源。

2. **\`npcKnowledge\` = NPC 对真相的认知记录**  
   \`known\` 表示「NPC 已获得某 entry 的认知记录」，具体看到「存在」还是「真实 value」，由 View 规则决定。  
   \`known\` 不是第二种 identity。

3. **\`identityView\` = 按视角过滤真相**  
   四视角（Player / AI / GM / NPC）在 View 层统一实现。  
   View 不写 identity，不写 npcKnowledge。

4. **\`Prompt\` = 最终渲染**  
   Prompt 只接收 View 的输出。  
   Prompt 不直接读 raw identity，不直接读 raw display，不直接读 raw npcKnowledge。

5. **View 的知识边界**（P6.5.1b 新增）  
   
   \`visibility\` 描述的是**信息在世界中的公开程度**，不代表 AI 可以读取真实数据。  
   AI 作为剧情主持，只能使用**当前世界已知事实**。
   
   | 视角 | 知识范围 |
   |---|---|
   | GM | 真实数据 |
   | AI（剧情主持） | 世界当前认知 |
   | Player | 主角当前认知 |
   | NPC | 该 NPC 当前认知 |
   
   后续所有 View 按此原则扩展，**不要**把 AI 当 GM。

`;

const DOC_42_START = '### 4.2 AI（天道视角）';
const DOC_42_END = '### 4.3 GM（全知）';

const DOC_42_NEW = `### 4.2 AI（剧情主持视角）

**主体**：剧情主持 AI。

**认知**：**世界当前认知**，不是 GM 全知。

AI 是剧情主持人，不是 GM。AI 只能使用「当前世界中已被确认的事实」，
不能读取任何未在世界中公开的隐藏信息。

**判定规则**（与 Player View 一致的认知边界）：

1. \`gmOnly\` → 不输出
2. \`value == null\` → 不输出（基础准入）
3. \`revealedAt != null\` → 使用 \`value\`（世界已确认真相）
4. 未 reveal + \`display\` 有效 → 使用 \`display\`（世界当前认知）
5. 未 reveal + \`public\` + 无 \`display\` → 使用 \`value\`
6. 未 reveal + \`hidden\` / \`discoverable\` + 无 \`display\` → **不输出**

**display 有效性定义**：

- \`display == null\` / \`undefined\` / \`''\` / \`'   '\` → 无 display
- 其余 → 有 display

**关键差异（vs P6.5.1 旧设计）**：

- **不输出 \`[隐藏{label}]\` 占位**——占位符本身就告知 AI「存在隐藏设定」，是信息泄露
- **不输出「对外：display」双层**——\`display\` 就是世界当前认知，直接输出即可
- \`discovery.discoveredAt\` 有值**不影响** AI 输出——「发现异常」应由剧情上下文体现，不是 identity Prompt 主动告知

**与 GM 的区别**：

- GM：读取全部真实数据（value + display + visibility + revealedAt + discovery）
- AI：只读取世界当前认知（display / value），不读取任何隐藏信息

**与 Player 的区别**（当前数据结构下）：

- 判定逻辑完全一致
- 输出格式不同：Player 输出 \`{ icon, label, value, extraCls }\`（UI 对象），AI 输出 \`['· label = value']\`（Prompt 字符串）

**与 P4.4 hiddenKeywords 的关系**：

- \`sanitizeHiddenKeywords\` 仍作为最终输出前的脱敏层
- 若角色卡配了 hiddenKeywords，AI 看到的 display 若含该词也会被替换
- 这属于 P4.4 层面，与 P6.5.1b 的视角决策正交

`;

const DOC_52_START = '### 5.2 AI 视角';
const DOC_52_END = '### 5.3 GM 视角';

const DOC_52_NEW = `### 5.2 AI（剧情主持）视角

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

- AI 是**剧情主持**，不是 GM 全知
- AI 只能使用「世界当前认知」——未 reveal 时看 \`display\`，reveal 后看 \`value\`
- **不输出 \`[隐藏{label}]\` 占位**：占位符会告知 AI「存在隐藏设定」，是信息泄露
- **不输出「对外：display」双层**：\`display\` 就是世界当前认知，直接输出
- \`discovery.discoveredAt\` 有值不影响输出——应由剧情上下文体现
- 判定逻辑与 §5.1 Player View 一致（除输出格式）

`;

const T_VIS_CONTENT = `import { renderIdentityAiEntries } from '../core/memory/identityView.js';

console.log('=== P4.3 identityView AI 视角测试（P6.5.1b 世界当前认知） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: public + 无 display -> value
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case1 public 无 display]');
    check('含 女', joined.includes('女'));
    check('无占位', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case2: public + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V', display: 'D', visibility: 'public' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case2 public + display]');
    check('含 display D', joined.includes('D'));
    check('不含 value V（独立）', !/[^A-Z]V[^A-Z]/.test(joined) || !joined.includes('= V'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case3: public + revealed -> value（reveal 优先）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V3', display: 'D3', visibility: 'public', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case3 public + revealed]');
    check('含 value V3', joined.includes('V3'));
    check('不含 display D3', !joined.includes('D3'));
    console.log('');
}

// case4: hidden + display -> display（关键：不再 [隐藏] 占位）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V4', display: 'DISP_V4', visibility: 'hidden' }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case4 hidden + display]');
    check('含 display DISP_V4', joined.includes('DISP_V4'));
    check('不含 value HIDDEN_V4（关键）', !joined.includes('HIDDEN_V4'));
    check('无 [隐藏] 占位（关键）', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case5: hidden + 无 display -> 不输出（关键：不再 [隐藏] 占位）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V5', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case5 hidden + 无 display]');
    check('rows 空（关键）', rows.length === 0);
    check('无 [隐藏] 占位', !rows.join('\\n').includes('[隐藏'));
    console.log('');
}

// case6: hidden + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case6 hidden + revealed]');
    check('含 value V6', joined.includes('V6'));
    check('不含 display D6', !joined.includes('D6'));
    console.log('');
}

// case7: discoverable + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V7', display: 'D7', visibility: 'discoverable', revealedAt: null }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case7 discoverable + display]');
    check('含 display D7', joined.includes('D7'));
    check('不含 value V7', !joined.includes('V7'));
    check('无 [隐藏] 占位', !joined.includes('[隐藏'));
    console.log('');
}

// case8: discoverable + 无 display -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V8', visibility: 'discoverable', revealedAt: null }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case8 discoverable + 无 display]');
    check('rows 空', rows.length === 0);
    console.log('');
}

// case9: discoverable + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V9', display: 'D9', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case9 discoverable + revealed]');
    check('含 value V9', joined.includes('V9'));
    check('不含 display D9', !joined.includes('D9'));
    console.log('');
}

// case10: gmOnly -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_X', visibility: 'gmOnly' }]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case10 gmOnly]');
    check('rows 空', rows.length === 0);
    check('无泄漏', !rows.join('\\n').includes('GM_X'));
    console.log('');
}

// case11: value=null -> 不输出
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'OK', visibility: 'public' },
    ]);
    const rows = renderIdentityAiEntries(id);
    console.log('[case11 value=null]');
    check('rows len = 1', rows.length === 1);
    check('仅剩 spiritRoot', rows[0].includes('OK'));
    console.log('');
}

// case12: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', display: null, visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'HID_V', display: 'HID_D', visibility: 'hidden' },
        { id: 'e3', kind: 'constitution', value: 'CON_V', display: null, visibility: 'hidden' },
        { id: 'e4', kind: 'bloodline', value: 'BLD_V', display: 'BLD_D', visibility: 'discoverable', revealedAt: { iso: 'x' } },
        { id: 'e5', kind: 'goldenFinger', value: 'GM_Z', visibility: 'gmOnly' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case12 混合]');
    check('public 女 存在', joined.includes('女'));
    check('hidden display HID_D 存在', joined.includes('HID_D'));
    check('hidden value HID_V 不出现', !joined.includes('HID_V'));
    check('hidden 无 display CON_V 不出现', !joined.includes('CON_V'));
    check('discoverable revealed BLD_V 存在', joined.includes('BLD_V'));
    check('gmOnly GM_Z 不出现', !joined.includes('GM_Z'));
    check('无 [隐藏] 占位', !joined.includes('[隐藏'));
    check('无双层', !joined.includes('对外'));
    console.log('');
}

// case13: display = '' -> 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V13', display: '', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log("[case13 display='']");
    check('rows 空（视为无 display）', rows.length === 0);
    console.log('');
}

// case14: display = '   ' -> 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V14', display: '   ', visibility: 'hidden' }]);
    const rows = renderIdentityAiEntries(id);
    console.log("[case14 display='   ']");
    check('rows 空', rows.length === 0);
    console.log('');
}

// case15: 全局验证无 [隐藏] 与「对外」
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'V15', display: 'D15', visibility: 'hidden' },
    ]);
    const joined = renderIdentityAiEntries(id).join('\\n');
    console.log('[case15 全局验证]');
    check('无 [隐藏]', !joined.includes('[隐藏'));
    check('无「对外」', !joined.includes('对外'));
    console.log('');
}

console.log('pass: ' + pass + ', fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
`;

const T_P5_CONTENT = `import { renderIdentityAiSection } from '../core/memory/identityView.js';

console.log('=== P5 identity section 测试（P6.5.1b 世界当前认知） ===');
console.log('');
let pass = 0, fail = 0;
function check(label, cond) {
    console.log((cond ? '[PASS]' : '[FAIL]') + ' ' + label);
    if (cond) pass++; else fail++;
}
const mkId = (entries) => ({ _v: 'v0.2', entries });

// case1: 空
{
    console.log('[case1 null / 空]');
    check('null -> ""', renderIdentityAiSection(null) === '');
    check('undefined -> ""', renderIdentityAiSection(undefined) === '');
    check('空 entries -> ""', renderIdentityAiSection(mkId([])) === '');
    console.log('');
}

// case2: public 无 display
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case2 public]');
    check('含 header', s.includes('[角色固有设定]'));
    check('含 女', s.includes('女'));
    check('无「对外」', !s.includes('对外'));
    console.log('');
}

// case3: hidden + display -> display（关键）
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V3', display: 'DISP_V3', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case3 hidden + display]');
    check('含 display DISP_V3', s.includes('DISP_V3'));
    check('不含 value HIDDEN_V3（关键）', !s.includes('HIDDEN_V3'));
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    check('无双层', !s.includes('对外'));
    console.log('');
}

// case4: hidden + 无 display -> 不输出
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'HIDDEN_V4', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case4 hidden + 无 display]');
    check('返回 ""', s === '');
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    console.log('');
}

// case5: hidden + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V5', display: 'D5', visibility: 'hidden', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case5 hidden + revealed]');
    check('含 value V5', s.includes('V5'));
    check('不含 display D5', !s.includes('D5'));
    console.log('');
}

// case6: discoverable + display -> display
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V6', display: 'D6', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case6 discoverable + display]');
    check('含 display D6', s.includes('D6'));
    check('不含 value V6', !s.includes('V6'));
    console.log('');
}

// case7: discoverable + 无 display -> 空
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V7', visibility: 'discoverable', revealedAt: null }]);
    const s = renderIdentityAiSection(id);
    console.log('[case7 discoverable + 无 display]');
    check('返回 ""', s === '');
    console.log('');
}

// case8: discoverable + revealed -> value
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V8', display: 'D8', visibility: 'discoverable', revealedAt: { iso: 'x' } }]);
    const s = renderIdentityAiSection(id);
    console.log('[case8 discoverable + revealed]');
    check('含 value V8', s.includes('V8'));
    check('不含 display D8', !s.includes('D8'));
    console.log('');
}

// case9: gmOnly -> 空
{
    const id = mkId([{ id: 'e1', kind: 'goldenFinger', value: 'GM_P5', visibility: 'gmOnly' }]);
    const s = renderIdentityAiSection(id);
    console.log('[case9 gmOnly]');
    check('返回 ""', s === '');
    check('无泄漏', !s.includes('GM_P5'));
    console.log('');
}

// case10: lang=en
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: 'Female', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'en' });
    console.log('[case10 lang=en]');
    check('含 [Character Identity]', s.includes('[Character Identity]'));
    check('含 Female', s.includes('Female'));
    console.log('');
}

// case11: lang=ja
{
    const id = mkId([{ id: 'e1', kind: 'gender', value: '女', visibility: 'public' }]);
    const s = renderIdentityAiSection(id, { lang: 'ja' });
    console.log('[case11 lang=ja]');
    check('含 キャラクター固有設定', s.includes('キャラクター固有設定'));
    console.log('');
}

// case12: 混合
{
    const id = mkId([
        { id: 'e1', kind: 'gender', value: '女', visibility: 'public' },
        { id: 'e2', kind: 'spiritRoot', value: 'MIX_V', display: 'MIX_D', visibility: 'hidden' },
        { id: 'e3', kind: 'goldenFinger', value: 'MIX_GM', visibility: 'gmOnly' },
        { id: 'e4', kind: 'background', value: '东洲青岳', visibility: 'public' },
    ]);
    const s = renderIdentityAiSection(id);
    console.log('[case12 混合]');
    check('public 女 出现', s.includes('女'));
    check('public 东洲青岳 出现', s.includes('东洲青岳'));
    check('hidden display MIX_D 出现', s.includes('MIX_D'));
    check('hidden value MIX_V 不出现', !s.includes('MIX_V'));
    check('gmOnly MIX_GM 不出现', !s.includes('MIX_GM'));
    check('无 [隐藏] 占位', !s.includes('[隐藏'));
    check('无双层', !s.includes('对外'));
    check('含 header', s.includes('[角色固有设定]'));
    console.log('');
}

// case13: display = '' 视为无
{
    const id = mkId([{ id: 'e1', kind: 'spiritRoot', value: 'V13', display: '', visibility: 'hidden' }]);
    const s = renderIdentityAiSection(id);
    console.log("[case13 display='']");
    check('返回 ""', s === '');
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

function replaceBetween(src, startMarker, endMarker, newContent) {
    const i = src.indexOf(startMarker);
    if (i === -1) return { ok: false, reason: 'start not found' };
    const j = src.indexOf(endMarker, i + startMarker.length);
    if (j === -1) return { ok: false, reason: 'end not found' };
    return { ok: true, content: src.slice(0, i) + newContent + src.slice(j) };
}

console.log('=== P6.5.1b Patch ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

for (const f of [DOC, VIEW]) {
    if (!fs.existsSync(f)) { console.error('XX missing: ' + f); process.exit(1); }
}

const docSrc = fs.readFileSync(DOC, 'utf8');
const viewSrc = fs.readFileSync(VIEW, 'utf8');

// view: 精确匹配
const viewCnt = countOccurrences(viewSrc, VIEW_AI_OLD);
const viewOK = viewCnt === 1;

// doc: 锚点法
const r2 = replaceBetween(docSrc, DOC_S2_START, DOC_S2_END, DOC_S2_NEW);
const r42 = r2.ok ? replaceBetween(r2.content, DOC_42_START, DOC_42_END, DOC_42_NEW) : { ok: false };
const r52 = r42.ok ? replaceBetween(r42.content, DOC_52_START, DOC_52_END, DOC_52_NEW) : { ok: false };

console.log('patch plan:');
console.log('  [' + (viewOK ? 'OK' : 'XX count=' + viewCnt).padEnd(10) + '] view-ai        renderIdentityAiEntries 重写');
console.log('  [' + (r2.ok ? 'OK' : 'XX ' + r2.reason).padEnd(10) + '] doc-s2         §2 加设计原则');
console.log('  [' + (r42.ok ? 'OK' : 'XX ' + r42.reason).padEnd(10) + '] doc-42         §4.2 重写');
console.log('  [' + (r52.ok ? 'OK' : 'XX ' + r52.reason).padEnd(10) + '] doc-52         §5.2 重写');
console.log('  [NEW]      test-vis       test-identityView-visibility.mjs 重写');
console.log('  [NEW]      test-p5        test-p5-identity-section.mjs 重写');
console.log('');

if (!viewOK || !r2.ok || !r42.ok || !r52.ok) {
    console.error('XX abort. no files written.');
    process.exit(1);
}

console.log('view  delta: ' + (viewSrc.replace(VIEW_AI_OLD, VIEW_AI_NEW).length - viewSrc.length) + ' bytes');
console.log('doc   delta: ' + (r52.content.length - docSrc.length) + ' bytes');
console.log('');

if (DRY_RUN) { console.log('DRY-RUN done.'); process.exit(0); }

fs.writeFileSync(VIEW, viewSrc.replace(VIEW_AI_OLD, VIEW_AI_NEW), 'utf8');
console.log('[write] ' + VIEW);
fs.writeFileSync(DOC, r52.content, 'utf8');
console.log('[write] ' + DOC);
fs.writeFileSync(T_VIS, T_VIS_CONTENT, 'utf8');
console.log('[write] ' + T_VIS);
fs.writeFileSync(T_P5, T_P5_CONTENT, 'utf8');
console.log('[write] ' + T_P5);
console.log('');
console.log('done.');
