# Horae Identity · NPC 视角 Prompt 注入设计（P7.5）

**日期**：2026-10-02  
**状态**：设计稿待 review，P7.5.x 才写代码  
**前置**：P1 ~ P7.4b（Identity 全链路）+ P6.5.1b~P6.5.3（四视角语义统一）+ 4ebe68c（DirectorStore 污染防护）

---

## 1. 目标

P6.5.3 完成了 `renderIdentityNpcRows(id, npcId, knowledge)` 的 NPC 视角语义，但**没有消费方**：

    npcKnowledge 数据层  ✅
    identityView 渲染层  ✅
    Prompt 消费层        ❌  ← P7.5 补这一层

P7.5 只做一件事：

> 把"某 NPC 对该角色的认知"注入 Prompt，让 AI 扮演 NPC 时知道自己该知道什么、不该知道什么。

**P7.5 不改**：
- `npcKnowledge.js` 结构
- `identityView.js` 渲染逻辑（`renderIdentityNpcRows`）
- `identityDiscovery.js` 触发机制
- Identity Store / View / Schema
- Prompt 现有段顺序
- RPG / State / Item / NPC 资料其他段

---

## 2. 现状链路

### 2.1 已实现（P1 ~ P6.5.3）

| 层 | 组件 | 职责 |
|---|---|---|
| Data | `chat[0].horae_meta.npcKnowledge` | NPC 私知记录 |
| Data | `core/memory/npcKnowledge.js` | `applyNpcKnow` / `hasKnown` / `listNpcKnowledge` |
| View | `core/memory/identityView.js` | `renderIdentityNpcRows(id, npcId, knowledge)` |
| Trigger | `core/memory/identityDiscovery.js` | `type:'npc'` 满足条件 → `applyNpcKnow` |

`renderIdentityNpcRows` 返回：`['· 灵根 = 无界灵根', '· 体质 = [隐藏体质]', ...]`

### 2.2 现状数据（测试环境 2026-10-02）

    characters_present = ['冉汐']     // 仅主角
    pinnedNpcs         = []           // 未配置
    npcKnowledge       = {
        '016': { 'e_legacy_spiritRoot_0': { known: true, source: 'npc_detected', ... } }
    }
    spiritRoot.visibility = 'public'

**关键观察**：当前无真实在场 NPC，`npcKnowledge` 仅一条且对应 `public` entry。

### 2.3 现有 `[当前场景NPC]` 段

`core/horaeManager.js:1276` 附近渲染：

    [当前场景NPC]
    N016 灰袍老者｜外貌=面容枯瘦，身穿灰袍...@与冉汐的关系~性别:男~年龄:60+~...

它是 **NPC 的公开资料**（外貌 / 性格 / 关系 / 职业 / 年龄 / 种族），回答"**这个 NPC 是什么样的人**"。

---

## 3. 核心设计原则

### 原则 1 · 目的不是"让 AI 知道更多"

P7.5 的目标是：

> 保持 NPC 认知边界准确的前提下，避免每轮 Prompt 膨胀。

反向解释：**如果一个 NPC 不知道某事，Prompt 里不应该让它看起来像知道**；反过来，**如果一个 NPC 通过剧情已经知道了某事，AI 应该知道"这个 NPC 知道"**。

### 原则 2 · 只输出"NPC 特别知道的"

`[角色固有设定]` 段（P5）已向 AI 天道视角提供**全部非 gmOnly entry 的当前值**。

如果 NPC 只知道"公开信息"，那 AI 已经从天道路径看到了，**NPC 认知段再输出一遍是冗余**。

所以 P7.5 只输出：

    NPC 视角 ≠ 天道视角 的 entries

即"这个 NPC 特别知道、普通天道视角看不到的"。

### 原则 3 · 玩家不是 NPC

主角（`context.name1`）**永不**进入 NPC 认知段的注入候选。

即使主角"知道"某事，那也是 Player View 议题（P6.5.2），不是 NPC 议题。

### 原则 4 · 空值不输出

- 无在场非玩家 NPC → 整段不输出
- 有 NPC 但 NPC 认知为空 → 该 NPC 不输出
- 所有 NPC 都空 → 整段不输出

**禁止**输出空段头 `[NPC 认知]` 或空行。

### 原则 5 · 未来 scope 预留但本版不实现

P6.5.3 §5.4 已记录未来扩展方向（`npc.scope = ['spirit_detect', ...]`）。

P7.5 设计**接口位置预留**，但**本版返回恒定 true**，不引入 scope 判定。

### 原则 6 · Token 预算优先

初版预算：

    单 NPC ≤ 100 字符（中文，含前缀）
    总 NPC 认知段 ≤ 400 字符

**标记为"初版字符预算"**，未来根据真实 token 实测调整，不视为永久协议。

---

## 4. 注入位置

### 4.1 位置

紧跟 `[当前场景NPC]` 段之后，作为独立段 `[NPC 认知]`：

    [当前场景NPC]
    N016 灰袍老者｜外貌=...@与冉汐的关系~性别:男~...
    N018 神秘人｜外貌=...@与冉汐的关系~性别:男~...

    [NPC 认知]
    N016 灰袍老者: · 灵根 = 无界灵根
    N018 神秘人: · 体质 = [隐藏体质]

### 4.2 选择理由

| 候选 | 判断 |
|---|---|
| **A. 紧跟 `[当前场景NPC]`（推荐）** | 语义连贯，同处 `sendCharacters` 开关下，都在 dataPrompt 内动态段 |
| B. 并入 `[已知事实]` | 语义不符（facts 是事实，NPC 认知是视角） |
| C. 独立段放在 dataPrompt 末尾 | 位置偏远，AI 关联弱 |
| D. 放进 stable system prompt | 会随 `npcKnowledge` 更新而缓存失效 |

### 4.3 代码注入点（设计指引，不写代码）

**实现位置**：`index.js` 的 `onPromptReady` 内，**与 P5 的 `renderIdentityAiSection` 同层**。

**核心原则**（P7.5 硬约束）：Identity View 属于 **Prompt 视图层**，由 `index.js` 负责组合；`horaeManager.js` **不直接消费** `identityView`。

**理由**：P5 的 `renderIdentityAiSection` 已在 `index.js` 调用；`horaeManager.js` 目前不 import `identityView.js`（保持"世界状态管理器"职责）；若强行引入会改变依赖图并可能触发循环。

伪代码（`index.js` 内，见 §4.4）：

    // index.js · onPromptReady（与 P5 的 renderIdentityAiSection 同层）
    const dataPrompt = sanitizeHiddenKeywords(_rawSplit.mainPrompt);
    const identitySection = renderIdentityAiSection(chat?.[0]?.horae_meta?.identity, { lang: horaeManager._getAiOutputLang() });
    const npcKnowledgeSection = _generateNpcKnowledgeSection(
        chat?.[0]?.horae_meta?.identity,
        chat?.[0]?.horae_meta?.npcKnowledge,
        horaeManager.getLatestState(0),
        { lang: horaeManager._getAiOutputLang() }
    );
    const dataPromptWithIdentity = identitySection ? `${identitySection}\n\n${dataPrompt}` : dataPrompt;
    const dataPromptWithBoth = npcKnowledgeSection ? `${dataPromptWithIdentity}\n\n${npcKnowledgeSection}` : dataPromptWithIdentity;

- **不新增开关**：与 `sendCharacters` 语义对齐（无 NPC 或无知识 → 整段不输出）
- **不新增段头到 stable prompt**：保持动态段与现有缓存策略一致
- **不修改 `identityView.js`**：`_generateNpcKnowledgeSection` 是 **`index.js` 内部函数**，只调用 `renderIdentityNpcRows`，不重复实现 View 逻辑
- **不修改 `horaeManager.js`**：不引入 `identityView` 依赖，保持"世界状态管理器"职责

### 4.4 段内顺序（Q3 决策）

StableRulesPrompt → [角色固有设定] → [当前状态快照] → **[NPC 认知]** → recallPrompt → combinedPrompt

**语义顺序**：稳定规则 → 世界/状态数据 → Identity AI View（天道已知） → NPC Knowledge View（NPC 已知） → Recall → 当前对话。

**理由**：天道视角先提供完整事实，NPC 视角随后限制角色认知，两者相邻，AI 更容易理解区别。

---

## 5. 与现有 `[当前场景NPC]` 段职责边界

| 维度 | `[当前场景NPC]`（现有） | `[NPC 认知]`（P7.5 新增） |
|---|---|---|
| **回答的问题** | 这个 NPC **是什么样的人** | 这个 NPC **知道主角的哪些固有设定** |
| **数据来源** | `state.npcs[name]`（外貌/性格/关系/性别/年龄/种族/职业） | `chat[0].horae_meta.npcKnowledge[npcId]` |
| **渲染函数** | `_findMentionedNpcs` + `characters_present` 组合 | `renderIdentityNpcRows(id, npcId, knowledge)` |
| **格式** | `N016 名｜外貌=...@关系~性别:男~...` | `N016 名: · 灵根 = 无界灵根` |
| **变化频率** | NPC 首次出场 / 资料更新时 | `npcKnowledge` 累积时 |
| **是否冗余** | 否（人物资料） | 必须排除冗余（只输出 NPC 视角 ≠ 天道视角） |

**两个段严格分工，不重叠。**

---

## 6. 过滤策略（五层）

### 第一层 · 候选 NPC 筛选

进入候选的 NPC 必须**同时满足**：

1. 在 `state.scene.characters_present` 里（在场）
2. 不是玩家（`name !== context.name1`）
3. 在 `state.npcs[name]` 里有记录且**有 `_id`**（`N016` 之类）

不满足的 NPC **不进入候选**，不参与后续所有层。

### 第二层 · entry 候选筛选

对每个候选 NPC，遍历其 `npcKnowledge[npcId]` 中的所有 entryId，**仅当同时满足**才保留：

1. `npcKnowledge[npcId][entryId].known === true`
2. `entry.visibility !== 'public'`（**Prompt 去重优化**，见下方说明）
3. `entry.visibility !== 'gmOnly'`（永不输出，P6.5.3 已定）
4. `isNpcPerceivable(entry, npcId)` 返回 true（**本版恒定 true**，见 §9）

**第 2 条是关键**：排除 `public` 后，NPC 认知段只包含"**这个 NPC 特别知道的**"，不重复 `[角色固有设定]` 已有的内容。

#### 第 2 条说明（重要）

**这不是安全边界，而是 Prompt 去重优化。**

- visibility 语义（`hidden` / `discoverable` / `gmOnly` 的显示规则、placeholder 逻辑、display/value 选择）**由 `identityView._resolveNpcEntry` 统一处理**
- P7.5 **不重复实现** visibility 判断、placeholder 逻辑、display/value 选择
- 此过滤的**目的**：`public` entry 已经出现在 `[角色固有设定]` 段（由 `renderIdentityAiEntries` 输出），NPC 认知段不再重复发送
- `public` entry **不代表 NPC 不允许知道**，而是"NPC 知道的信息不需要重复告知 AI"

**职责边界**：

    _generateNpcKnowledgeSection  →  哪些 entry 进入 NPC 认知段（筛选）
    renderIdentityNpcRows         →  entry 具体怎么显示（visibility + knowledge 语义）

两处严格分工。P7.5.1 只做上面一条，不动下面一条。

### 第三层 · 单 NPC 渲染

对每个候选 NPC 调用：

    renderIdentityNpcRows(id, npcId, knowledge, { lang })

返回 `['· 灵根 = 无界灵根', ...]`。

- 若返回空数组 → 该 NPC 不输出
- 若返回非空 → 拼接为单行或多行

### 第四层 · 单 NPC 字符裁剪

单 NPC 输出**字符数（中文 1 字符 = 1）上限 100**。

裁剪规则：
- 逐行累加
- 若加入下一行会超过 100，**停止**，末行末尾追加 `…`
- 若单行就超过 100，**该行整体截断到 100 字符 + `…`**

### 第五层 · 总字符裁剪

所有 NPC 输出累加**总字符数上限 400**。

裁剪规则：
- 按 §6.1 候选顺序累加（顺序 = `characters_present` 顺序）
- 若加入下一个 NPC 会超过 400，**停止**（该 NPC 整体不输出）
- **不截断单个 NPC 到一半**（避免语义不完整）

---

## 7. Token 预算与裁剪

### 7.1 预算表

| 范围 | 上限 | 说明 |
|---|---|---|
| 单 NPC 输出字符 | 100 | 中文 1 字符 ≈ 1 token（保守） |
| 全段总字符 | 400 | 约 400 token 增量 |
| 段头 `[NPC 认知]` | ~15 字符 | 若段存在才输出 |

**对现有 Prompt 影响**：
- 现有 dataPrompt 约 5000 ~ 17000 字符（视数据量）
- P7.5 增量上限约 **415 字符**（10% 以下）
- **不改变量级**

### 7.2 标记为"初版"

预算按当前测算值设定，**标记为"初版字符预算"**：
- 未来根据真实 token 实测调整
- 若发现 AI 利用率低，可下调
- 若发现经常裁剪，可上调

**不设计成永久协议，避免僵化。**

### 7.3 裁剪示例

假设 N016 知道 8 条 entries，逐行渲染后累计 130 字符：

    · 灵根 = 无界灵根          (12)
    · 体质 = 无界道体          (12)
    · 仙姿 = 清灵脱俗          (12)
    · 天赋 = 过目不忘          (12)
    · 天赋 = 气运加身          (12)
    · 天赋 = 桃花运            (11)
    · 出身 = 东洲青岳凡人家庭出身 (18)
    · 血脉 = 无界血脉          (12)
    累计 ≈ 101 字符，超过 100

裁剪后：

    N016 灰袍老者: · 灵根 = 无界灵根
    · 体质 = 无界道体
    · 仙姿 = 清灵脱俗
    · 天赋 = 过目不忘
    · 天赋 = 气运加身
    · 天赋 = 桃花运
    · 出身 = 东洲青岳凡人家庭出身…

（7 行累计 ≈ 89 字符，加末行截断 → 保持 ≤ 100）

---

## 8. 空值行为

| 场景 | 输出 |
|---|---|
| `characters_present` 无 NPC（仅主角） | **整段不输出** |
| 有 NPC 但无 `_id` | 跳过该 NPC |
| NPC 无 `npcKnowledge[npcId]` | 跳过该 NPC |
| NPC 有知识但全部 entry 被 §6.2 过滤 | 跳过该 NPC |
| 所有候选 NPC 都跳过 | **整段不输出** |
| 段头 `[NPC 认知]` 无内容 | **不输出空段头** |

**当前测试环境**：
- `characters_present = ['冉汐']`（仅主角）→ 走第一行 → 整段不输出

**这是预期行为，不是 bug。**

---

## 9. 格式示例

### 示例 1 · 单个 NPC，已知主角的隐藏灵根（hidden + known）

    [当前场景NPC]
    N016 灰袍老者｜外貌=面容枯瘦，身穿灰袍，手持刻刀@与冉汐的关系~性别:男~年龄:60+~种族:凡人/低阶修士~职业:采药人/黑市中间商

    [NPC 认知]
    N016 灰袍老者: · 灵根 = 无界灵根

### 示例 2 · 单个 NPC，discoverable + known + 未 reveal

    [NPC 认知]
    N016 灰袍老者: · 灵根 = [隐藏灵根]

（NPC 察觉到异常存在，但不知内容）

### 示例 3 · 两个 NPC 各有认知

    [NPC 认知]
    N016 灰袍老者: · 灵根 = 无界灵根
    N018 神秘人: · 体质 = [隐藏体质]
    · 血脉 = 无界血脉

### 示例 4 · 单 NPC 超 100 字符 → 裁剪

    [NPC 认知]
    N016 灰袍老者: · 灵根 = 无界灵根 · 体质 = 无界道体 · 仙姿 = 清灵脱俗 · 天赋 = 过目不忘 · 天赋 = 气运加身 · 天赋 = 桃花运 · 出身 = 东洲青岳…

### 示例 5 · 当前测试环境（仅主角）

    （无 [NPC 认知] 段）

### 示例 6 · NPC 有知识但全为 public → 过滤后为空

    [当前场景NPC]
    N016 灰袍老者｜...

    （无 [NPC 认知] 段，因为 N016 只知道 public 信息，天道视角已覆盖）

---

## 10. 未来 scope 接口（预留，不实现）

P6.5.3 §5.4 记录了扩展方向：

> 未来 NPC 可能通过能力 scope（`npc.scope = ['spirit_detect', 'bloodline_sense', ...]`）动态获得部分已知条目的 value 读取权。

P7.5 为这个方向**预留接口位置**，但**本版不实现**：

### 10.1 预留函数签名

    function isNpcPerceivable(entry, npcId, npcState) {
        // P7.5：恒返回 true
        // 未来：根据 entry.perception + npc.scope 判定
        return true;
    }

- 位置：`index.js` 内部（非导出）
- 调用点：§6.2 第二层过滤
- 参数：`entry` / `npcId` / `npcState`（当前不需要 `npcState`，但保留签名空间）

### 10.2 不做的部分

- **不新增** `npc.scope` 字段
- **不修改** `npcKnowledge` 结构
- **不新增** `entry.perception` 字段
- **不实现** scope 判定逻辑

**原因**：当前无"特殊 NPC"场景，做了也是空实现，且会引入新的 schema 变量。

**等需求驱动时单独设计 P7.5.x-scope。**

---

## 11. 分阶段实施

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P7.5.1** | `index.js` 加 `[NPC 认知]` 段（不含 scope） | 本文档定稿 |
| **P7.5.2** | （可选）加 `sendNpcKnowledge` 开关 | P7.5.1 使用后评估 |
| **P7.5.x** | scope 扩展 | 特殊 NPC 需求出现时 |

P7.5.1 是核心，P7.5.2 视需而定，P7.5.x 后置。

---

## 12. 待决问题（review 时确认）

### D1 · `[NPC 认知]` 段头是否需要

- **方案 A**：独立段头 `[NPC 认知]`（推荐，清晰）
- 方案 B：并入 `[当前场景NPC]` 段末尾（省字符但语义混）

### D2 · 单 NPC 100 字符上限是否合理

- 中文 1 字符 ≈ 1 token（保守估算）
- 100 字符 ≈ 100 token per NPC
- **若认为过宽** → 建议 80；**若认为过窄** → 建议 150

### D3 · 总 400 字符上限是否合理

- 400 字符 ≈ 400 token
- **若认为过宽** → 建议 300；**若认为过窄** → 建议 600

### D4 · 是否新增 `sendNpcKnowledge` 开关

- **方案 A**：不加，与 `sendCharacters` 共用（推荐）
- 方案 B：加，独立控制

理由倾向 A：与 P7.5 "补全已有链路"的定位一致，避免配置碎片。

### D5 · 多 NPC 顺序优先级

- **方案 A**：`characters_present` 顺序（推荐，简单）
- 方案 B：pinned NPC 优先
- 方案 C：按 `npcKnowledge` 积累时间

理由倾向 A：`characters_present` 已代表"当前场景重要性"。

### D6 · 玩家（主角）entry 是否进入候选

- **方案 A**：永不（推荐，原则 3）
- 方案 B：如果 `npcKnowledge` 里有主角自己的 npcId 则允许

理由倾向 A：主角认知属 Player View 议题（P6.5.2），与 NPC 视角正交。

### D7 · 段头 `[NPC 认知]` 中 `认知` 一词是否合适

- **方案 A**：`[NPC 认知]`（推荐）
- 方案 B：`[NPC 已知]`
- 方案 C：`[NPC 视角]`

理由倾向 A：与 P7.1 / P6.5.3 的"认知"术语一致。

---

## 13. 与现有系统的关系图

    identity.entries
         ↓
    identityView.renderIdentityNpcRows(id, npcId, knowledge)
         ↓
    ┌────────────────────────────────────────────────┐
    │  P7.5 新增：_generateNpcKnowledgeSection       │
    │  · 候选 NPC 筛选（在场、非玩家、有 _id）         │
    │  · entry 候选筛选（known + 非 public/gmOnly）  │
    │  · 单 NPC 100 字符裁剪                         │
    │  · 总 400 字符裁剪                             │
    └────────────────────────────────────────────────┘
         ↓
    index.js onPromptReady 内 [NPC 认知] 段
         ↓
    dataPromptWithIdentity（与 identity AI section 相邻）
         ↓
    API Payload

---

## 14. 版本

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-10-02 | 初稿（P7.5） |
