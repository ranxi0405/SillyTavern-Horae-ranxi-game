# Horae Identity · Value/Display 视角分离设计（P6.5）

**日期**：2026-09-30  
**状态**：设计稿待 review，P6.5.x 才写代码  
**前置**：P1 ~ P7.4b 已完成（Store / View / GM API / Discovery / NPC Knowledge / Prompt / Deploy 全链路）

---

## 1. 目标

P1 ~ P7 完成的是「真相如何被不同视角过滤」和「谁知道什么」：

    identityStore → identityView → identityGmApi → identityDiscovery → Prompt
                                       ↓
                                 npcKnowledge

但 **value / display 的语义**一直没定死：

- P4.3 `renderIdentityAiEntries` 用 `value`（不看 `display`）
- P2 `renderIdentityPlayerRows` 用 `display 优先`（不看 `value`）
- P7.3 `renderIdentityNpcRows` 用 `value + sanitize`（不看 `display`）

三套函数对 display / value 的处理不一致，导致：

- AI 天道视角看不到「对外公开说法」
- NPC 视角看不到「对外公开说法」
- Player 视角 reveal 后仍用 display

P6.5 只解决一个问题：

> **通过过滤后，某个视角最终应该拿到 value 还是 display**

**P6.5 不改**：
- identity 数据结构
- visibility / discoveredAt / revealedAt / known 的语义
- npcKnowledge 的结构
- Prompt 结构
- discovery 触发逻辑

**P6.5 只改**：View 层渲染函数对 value / display 的取值策略。

---

## 2. 核心原则

四条不可违反：

1. **`identity` = 世界真相**  
   `value` 是真相。`display` 不是真值，是**对外公开认知**。  
   `display` 不构成 identity 的第二事实源。

2. **`npcKnowledge` = NPC 对真相的认知记录**  
   `known` 表示「NPC 已获得某 entry 的认知记录」，具体看到「存在」还是「真实 value」，由 View 规则决定。  
   `known` 不是第二种 identity。

3. **`identityView` = 按视角过滤真相**  
   四视角（Player / AI / GM / NPC）在 View 层统一实现。  
   View 不写 identity，不写 npcKnowledge。

4. **`Prompt` = 最终渲染**  
   Prompt 只接收 View 的输出。  
   Prompt 不直接读 raw identity，不直接读 raw display，不直接读 raw npcKnowledge。

---

## 3. 字段语义

### 3.1 `value`

- **canonical truth**（世界客观事实）
- 例：`"无界灵根"`
- **唯一事实源**
- 空值 / 不可渲染 / 是否过滤由 View 层处理——本设计**不约束数据模型必填性**

### 3.2 `display`

- **对外公开认知**（世界对这条 identity 的公开说法）
- 例：`"四系伪灵根"`
- 可选，可为 `null`
- **不是真值**，是「多数不知情者看到的版本」
- 语义：当某视角「不应知道真相」时，看到的版本
- **不构成 identity 的第二事实源**——它只是「对外版本」

**三者关系（严格不重叠）**：

- `value`：**canonical truth**（世界客观真相）
- `display`：**世界公开认知**（不知情者看到的版本）
- `revealedAt`：**canonical truth 是否已对外公开**
  - `revealedAt == null`：真相尚未公开，不知情者只知 `display`
  - `revealedAt != null`：真相已公开，Player / NPC 直接看 `value`（不再 display 优先）
- `visibility`（`public / hidden / discoverable / gmOnly`）：**设计者意图**，与 `revealedAt` **正交**
  - `public`：设计上即公开；此时 `display` 通常与 `value` 相同或为 `null`
  - `hidden`：设计上隐藏；`revealedAt != null` 表示剧情已揭示
  - `discoverable`：设计上允许被发现；`revealedAt != null` 表示已发现并公开

**禁止重叠**：`public` 不等于 `revealedAt != null`；`display` 不等于 `value` 的另一种表现形式。
P6.5b 文档后续章节严格按本节的语义展开。

### 3.3 `visibility`

四种值，语义不变（沿用 P4.3 / P7.1）：

| 值 | 语义 |
|---|---|
| `public` | 直接公开，所有人可见 |
| `hidden` | 隐藏设定，设计上不主动提供发现路径 |
| `discoverable` | 设计上允许发现，但尚未揭示 |
| `gmOnly` | 仅 GM 可见，永不进入 AI / Player / NPC Prompt |

### 3.4 `revealedAt`

- **全局揭示状态**：`null` 或 `{ iso, story }`
- 语义：identity 的**客观真相**是否已经公开
- 一旦写入，所有视角（Player / AI / NPC）都**应看到 value**

### 3.5 `npcKnowledge[npcId][entryId].known`

- **NPC 私知**：某 NPC 是否已获得该 entry 的认知记录
- 语义由 visibility / revealedAt 组合决定（见 §5）
- **不写全局 `discoveredAt`**（P7.4 决策 1，保持正交）

---

## 4. 四视角定义

### 4.1 Player（主角本人视角）

**主体**：玩家扮演的主角本人。

**认知**：主角自身知道多少，受 `revealedAt` 决定。

- `revealedAt == null`：主角**尚不知道真身**（或设计上不公开）
  - 若 `display` 存在 → 看到 `display`（主角对外身份）
  - 若无 `display` → 看到占位 `[隐藏{label}]`（设计者想让主角也不知道）
- `revealedAt != null`：主角**已知真身**，看 `value`

**关键设计选择**：

- 主角是「**可能被隐瞒真身的角色**」
- 隐瞒的来源：可能是失忆 / 封印 / 家族保密 / 剧情设定
- `display` 就是「主角自己也不知道真相时，以为的自己」

### 4.2 AI（天道视角）

**主体**：剧情主持 AI。

**认知**：**对非 gmOnly entry 的全知视角**。

- AI View 对**非 `gmOnly`** entry 可读取 **canonical value**
- AI 同时读取 `display` 作为「世界公开认知」，用于描述 NPC 视角
- AI 是「天道 + 主持人」双重身份：
  - 天道：可读取所有非 `gmOnly` 的 canonical truth
  - 主持人：决定何时揭露
- **`gmOnly` entry 永不输出**（AI 也看不到）

**与 P4.4 hiddenKeywords 的关系**：

- AI View **读取** canonical value，不代表最终 Prompt 中**原样出现**
- 最终注入 Prompt 前，value 会经过既有 `sanitizeHiddenKeywords` 脱敏层（P4.4）
- 两层职责独立：
  - **P6.5.1**：决定「输出 value 还是 display」，display 异于 value 时附注对外
  - **P4.4 hiddenKeywords**：决定「哪些敏感真值在最终 Prompt 中被替换」
- 因此若角色卡配了 `hiddenKeywords: { '无界灵根': '[隐藏灵根]' }`，
  AI 视角的最终输出会是：
  ```
  · 灵根 = [隐藏灵根]（对外：四系伪灵根）
  ```
  这是**两层机制叠加的正确结果**，不是 P6.5.1 的 bug
- 若某角色卡**未配** hiddenKeywords，则 AI 视角输出：
  ```
  · 灵根 = 无界灵根（对外：四系伪灵根）
  ```
  未脱敏的 canonical value 会直接进入 Prompt
- 角色卡作者**可自行选择**是否配置 hiddenKeywords

**输出格式（双层）**：

- 若 `display` 存在且 `display != value`：`· 灵根 = 无界灵根（对外：四系伪灵根）`
- 若 `display` 为空或等于 `value`：`· 灵根 = 无界灵根`
- `gmOnly`：不输出

**关键决策**：AI 视角**不再输出 `[隐藏{label}]` 占位**。  
理由：AI 是天道，知道真相。占位对 AI 无意义，且会丢失「对外公开说法」信息。

### 4.3 GM（全知）

**主体**：调试 / 开发 / 世界管理员。

**认知**：**全字段可见**。

- value / display / visibility / revealedAt / discovery / 对应 npcKnowledge 摘要
- 不做任何过滤

### 4.4 NPC（特定 NPC 视角）

**主体**：剧情中某个具体 NPC（以 npcId 标识）。

**认知**：**由 npcKnowledge 决定**。

- 若 NPC 已 know 真相（`hidden + known`）→ 看 `value`
- 若 NPC 不知真相 → 看 `display`（若存在）或占位
- `gmOnly`：永不输出

**关键设计选择**：

- NPC 视角不是「读者视角」——不输出 `[隐藏{label}]` 表达「读者应该知道有隐藏」
- NPC 视角是「NPC 认知版本」——NPC 以为的世界是什么样

---

## 5. 完整视角矩阵

### 5.1 Player 视角

| visibility | revealedAt | 输出 |
|---|---|---|
| `public` | — | `display` 优先，无则 `value` |
| `hidden` | `null` | `display` 优先，无则 `[隐藏{label}]` |
| `hidden` | 有 | `value` |
| `discoverable` | `null` | `display` 优先，无则 `[隐藏{label}]` |
| `discoverable` | 有 | `value` |
| `gmOnly` | — | 不输出 |

**说明**：

- `public`：主角看到的对外身份（若 display 存在），或真相
- `hidden + 未 reveal`：主角不知道真身，看到对外说法，或无对外说法则占位
- `revealedAt != null`：主角已知真身，看 `value`（不再优先 display）

### 5.2 AI 视角

| visibility | revealedAt | 输出 |
|---|---|---|
| `public` | — | `value`（`display` 若异则附注对外） |
| `hidden` | `null` | `value`（`display` 若异则附注对外） |
| `hidden` | 有 | `value`（`display` 若异则附注对外） |
| `discoverable` | `null` | `value`（`display` 若异则附注对外） |
| `discoverable` | 有 | `value`（`display` 若异则附注对外） |
| `gmOnly` | — | 不输出 |

**说明**：

- AI 是天道，**永远看 value**
- `revealedAt` 对 AI 不改变输出（AI 已知真相）
- 若 `display` 存在且 `!= value`，附注「对外：<display>」——供 AI 描述 NPC 视角
- **AI 视角不再有 `[隐藏{label}]` 占位**（与 P4.3 现有行为不同）

### 5.3 GM 视角

| visibility | revealedAt | known 摘要 | 输出 |
|---|---|---|---|
| 全部 | 全部 | 全部 | 所有字段（value / display / visibility / revealedAt / discovery / npcKnowers 摘要） |

**说明**：

- 显示 `value` 与 `display` 同时
- 显示 `visibility` 与 `revealedAt`
- 显示 `npcKnowledge` 里「谁 know 该 entry」的 npcId 列表
- 不做任何过滤

### 5.4 NPC 视角

**按 (visibility, revealedAt, known) 三元组决定**：

| visibility | revealedAt | known | 输出 |
|---|---|---|---|
| `public` | — | — | `display` 优先，无则 `value` |
| `hidden` | `null` | `true` | `value` |
| `hidden` | `null` | `false` | `display` 优先，无则 **不输出** |
| `hidden` | 有 | — | `value` |
| `discoverable` | `null` | `true` | `[隐藏{label}]` |
| `discoverable` | `null` | `false` | `display` 优先，无则 **不输出** |
| `discoverable` | 有 | — | `value` |
| `gmOnly` | — | — | 不输出 |

**说明**：

- `hidden + known`：NPC 已获真知，看 `value`（NPC 私知，不需要全局 reveal）
- `hidden + 未 known`：NPC **不知道真相存在**，只知对外说法
  - 这里的 `display` 是 **NPC 实际持有的公开认知**，不代表 NPC 察觉到有隐藏
  - 若 `display` 为 `null` → 不输出（NPC 对这条 entry 一无所知）
- `discoverable + known + 未 reveal`：NPC **察觉到有隐藏**，但不知内容 → `[隐藏{label}]`
- `discoverable + 未 known`：NPC 完全不知有隐藏，只知对外说法（display 优先，无则不输出）
- `revealedAt != null`：全局真相已公开，所有 NPC 直接看 `value`（**不再 display 优先**）

---

## 6. 关键场景走查（以《问道长生》为例）

### 场景 1：主角灵根

    entry: {
        kind: 'spiritRoot',
        value: '无界灵根',
        display: '四系伪灵根',
        visibility: 'hidden',
        revealedAt: null,
    }

| 视角 | 输出 |
|---|---|
| Player | `· 灵根 = 四系伪灵根` |
| AI | `· 灵根 = 无界灵根（对外：四系伪灵根）` |
| GM | `· 灵根 = 无界灵根 / display=四系伪灵根 / visibility=hidden / revealedAt=null` |
| NPC（未 known） | `· 灵根 = 四系伪灵根` |
| NPC（已 known） | `· 灵根 = 无界灵根` |

### 场景 2：reveal 后

    entry.revealedAt = { iso: '...', story: '342/12/24' }

| 视角 | 输出 |
|---|---|
| Player | `· 灵根 = 无界灵根`（不再 display） |
| AI | `· 灵根 = 无界灵根（对外：四系伪灵根）`（不变） |
| NPC（任意） | `· 灵根 = 无界灵根` |

### 场景 3：无 display 的 public 条目

    entry: {
        kind: 'gender',
        value: '女',
        display: null,
        visibility: 'public',
    }

| 视角 | 输出 |
|---|---|
| Player | `· 性别 = 女` |
| AI | `· 性别 = 女` |
| NPC | `· 性别 = 女` |

### 场景 4：gmOnly

    entry: {
        kind: 'goldenFinger',
        value: '天道酬勤',
        visibility: 'gmOnly',
    }

| 视角 | 输出 |
|---|---|
| Player | （不输出） |
| AI | （不输出） |
| NPC | （不输出） |
| GM | 全部可见 |

---

## 7. 是否需要 `aiValue` / `npcValue`？

**结论：不需要。**

理由：

1. `value` = 真相（唯一事实源）
2. `display` = 对外公开认知
3. `visibility` + `revealedAt` + `known` = 权限规则
4. 四视角对 value/display 的取舍由 View 层**组合规则**决定，不需要新字段

**反例**（如果新增 `aiValue` / `npcValue` 会怎样）：

- `aiValue`：AI 视角专用值——但 AI 看 value + display 双层已足够
- `npcValue`：NPC 视角专用值——但 NPC 看 value（know）/ display（未知）已足够
- 新增字段会让「一个事实只有一个主人」原则破裂——真相被拆散到多个字段

**判定**：现有 `value + display + visibility + revealedAt + npcKnowledge.known` 五个维度已足够表达所有场景。

---

## 8. 多语言 display

**归属：不在 P6.5 范围。**

理由：

- 现有 `display` 是单字符串
- 多语言 display 会引入 `display_i18n: { 'zh-CN': '...', 'en': '...' }` 之类的结构
- 这属于 i18n 设计，与「视角分离」正交
- 更自然的做法：后续单独设计 `display` 的多语言支持

**P6.5 只处理**：单语言 `display` 字段在不同视角下的取舍。

---

## 9. `opts.valueMode: 'ai' | 'public'` 占位处理

P7.3 在 `renderIdentityNpcRows` 加了 `opts.valueMode` 占位（未实现语义）。

**P6.5 决策**：

- **不保留 `valueMode` 占位**
- 理由：视角与取值策略已经在函数级别明确（`renderIdentityPlayerRows` / `Ai` / `Npc` / `Gm`），不需要通过 `valueMode` 参数切换
- P6.5.x 实现时，把 `valueMode` 参数删除
- 若未来需要「同一视角不同取值模式」，再单独加参数

---

## 10. P7.3 的修正范围

P6.5 会**修正** `renderIdentityNpcRows` 的现有行为：

| 现状（P7.3） | P6.5 修正 |
|---|---|
| `hidden + known` → `value` | ✅ 保持 |
| `hidden + 未 known` → 不输出 | ✅ 改为 `display` 优先，无则不输出 |
| `discoverable + known + 未 reveal` → `[隐藏{label}]` | ✅ 保持 |
| `discoverable + 未 known + 未 reveal` → 不输出 | ✅ 改为 `display` 优先，无则不输出 |
| `public` → `value` | ⚠️ 改为 `display` 优先 |
| `revealedAt 有` → `value` | ⚠️ 改为 `display` 优先 |

**关键变化**：NPC 视角引入 `display` 优先规则。

**P4.3 的修正范围**：

| 现状（P4.3） | P6.5 修正 |
|---|---|
| `hidden` → `[隐藏{label}]` | ⚠️ 改为 `value（对外：display）` |
| `discoverable + 未 reveal` → `[隐藏{label}]` | ⚠️ 改为 `value（对外：display）` |
| `public` → `value` | ⚠️ 改为 `value（对外：display）` 若 display 异 |
| `gmOnly` → 不输出 | ✅ 保持 |

**关键变化**：AI 视角不再输出占位，改为双层输出。

**P2 的修正范围**：

| 现状（P2） | P6.5 修正 |
|---|---|
| `display 优先` | ✅ 保持 |
| `revealedAt 有` → ? | ⚠️ 需要确认现有实现 |

**待跑：`renderIdentityPlayerRows` 现状代码审查**（P6.5.1 时执行）。

---

## 11. 待决问题（review 时确认）

### D1 · Player 是「主角本人视角」吗？

- **方案 A**：Player = 主角本人，主角可能被隐瞒真身（`display` 或占位直到 reveal）→ **推荐**
- 方案 B：Player = 上帝视角，永远看 value

### D2 · AI 视角是全知还是被限？

- 方案 A：AI 被限（与 Player 相同）——不推荐
- **方案 B**：AI 全知，看 value + display 双层 → **推荐**
- 方案 C：AI 全知但只输出 value（不附 display）——丢失对外信息

### D3 · AI 视角是否保留 `[隐藏{label}]` 占位？

- 方案 A：保留——与 P4.3 一致
- **方案 B**：不保留，改为 `value（对外：display）` → **推荐**

### D4 · NPC `hidden + 未 known` 是否输出 display？

- 方案 A：不输出（NPC 完全不知）
- **方案 B**：输出 display（NPC 只知对外说法）→ **推荐**

### D5 · 是否新增 `aiValue` / `npcValue`？

- **方案 A**：不新增（现有 5 维度足够）→ **推荐**
- 方案 B：新增

### D6 · 多语言 display 归属？

- **方案 A**：不在 P6.5，留后续 → **推荐**
- 方案 B：P6.5 一起做

### D7 · `opts.valueMode` 处理？

- 方案 A：保留为调试占位
- **方案 B**：删除（视角已在函数级别区分）→ **推荐**

---

## 12. 与 P7.5 的关系

P7.5（Prompt 层 NPC 视角注入）**依赖 P6.5**：

- P6.5 定案后，NPC 视角的 value / display 取舍明确
- P7.5 才能确定「哪些 NPC 的认知注入 Prompt」
- 若 P7.5 在 P6.5 前做，会面临「NPC 视角该输出 value 还是 display」的不确定

**P6.5 完成后 P7.5 才有意义。** P7.5 是否启动仍待定（用户决定）。

---

## 13. 实现阶段（P6.5.x）

若上述决策通过，P6.5 将分：

| 阶段 | 内容 |
|---|---|
| P6.5.1 | `renderIdentityAiEntries` 改双层输出（value + display） |
| P6.5.2 | `renderIdentityPlayerRows` 加 reveal 后切 value |
| P6.5.3 | `renderIdentityNpcRows` 加 display 优先 |
| P6.5.4 | 删除 `opts.valueMode` 占位 |
| P6.5.5 | 文档同步（P7.1 §7 矩阵更新） |

每阶段独立 patch + 单测 + 回归。

---

## 14. 版本

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-30 | 初稿（P6.5） |
