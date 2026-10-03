# 实际游戏问题记录

## 说明

本文件记录**实际游戏中遇到的具体问题**，区别于 REFACTOR_LOG.md 里的架构改动。

所有改动都是大方向验证，真正的问题都是现实游戏中才能发现的（类似 A 测 / 黑盒测试）。

## 格式

```
### YYYY-MM-DD | 严重性 | 状态
- 现象：
- 涉及模块：
- 复现：
- 处理：
```

严重性：🔴 严重 / 🟡 中等 / 🟢 轻微
状态：🆕 新增 / 🔧 修复中 / ✅ 已修 / ❌ 无法复现 / ⏸️ 待观察

---

## 已记录问题

### 2026-09-27 | 🟡 | ⏸️ 待观察
- **现象**：Fact 提取的 visibility 判定在同类信息上不稳定
  （"北麓遗迹有特殊黑铁"两次分别被判为 public / hidden）
- **涉及模块**：FactStore / _buildFactExtractionPrompt
- **处理**：prompt 里已加"拿不准时选 public"规则，待更多样本

### 2026-09-27 | 🟡 | ⏸️ 待观察
- **现象**：DirectorStore 相似度算法在长文本中是否稳定
- **涉及模块**：DirectorStore
- **处理**：已从 min Jaccard 改为 union Jaccard，阈值 0.4

### 2026-09-27 | 🔴 | ✅ 已修
- **现象**：隐藏设定（无界灵根 / 无界道体）可能泄漏到 summaryText
  并随 timelinePrompt 每回合注入主模型
- **涉及模块**：摘要层 / onPromptReady
- **处理**：新增 core/memory/hiddenKeywords.js，index.js 三处注入点加 sanitize
  - stableRulesPrompt / dataPrompt / timelinePrompt / combinedPrompt
  - 存储层保留原文，注入层替换为 [隐藏灵根] / [隐藏体质]
  - 验证：window.horaeDebugPrompt.includes('无界灵根') === false
- **实测反馈**：AI 表现完美——"金光一闪而过"等间接线索，不再直说

### 2026-09-27 | 🟡 | ✅ 已解决（prompt 层面）
- **现象**：玩家查询类指令（"查询主角真实体质"）被 AI 记为
  "冉汐得知真相"，混淆元游戏层与剧情层
- **涉及模块**：作者注释 / prompt
- **处理**：作者注释新增【元游戏层】段，区分查询类 vs 提醒/导演类
  - 查询类：不写 event
  - 提醒/导演类：可以推进剧情，可写 event
- **实测**：AI 对纯查询用天道旁白回复 + 剧情推进（受"加快节奏"导演指令驱动，符合预期）
- **结论**：无需代码兜底，prompt 层面已足够

### 2026-09-27 | 🟢 | ✅ 已修
- **现象**：RPG HUD 渲染时报 "The specified value null cannot be parsed" 刷屏
- **涉及模块**：_renderEditableVal
- **处理**：加 curSafe / maxSafe 兜底（commit 1d9e738）

### 2026-09-27 | 🟢 | ✅ 已修
- **现象**：世界书 Entry 4 提到"无界灵根"，泄漏到 AI 可见范围
- **涉及模块**：worldbook-v0.9.json
- **处理**：V0.9.1 移除所有"无界灵根"提及（commit abe1af8）

---

### 2026-10-03 | 🔴 | ✅ 已修
- **现象**：`horaeDebugChat[2]` 出现 934 字《问道长生》作者注释，含"无界灵根 / 无界道体"字面值，AI 在玩家可见正文泄漏
- **涉及模块**：ST 原生 Author's Note（`chat_metadata.note_prompt`），非 Horae 代码
- **复现**：对话中玩家问及主角资质，AI 正文直接写出"无界灵根"
- **处理**：
  - 根因：`note_prompt` 显式包含隐藏真相字面值，`note_interval=1 / note_position=0 / note_role=0` → 每轮作为独立 system 消息常驻注入
  - 泄漏链：`chat_metadata.note_prompt` → `authors-note.js getAuthorsNote()` → `script.js` AN 注入 → `dbg[2]`（role=system）→ 主模型 → 玩家可见正文
  - 已排除：`char.*` 字段 / `character_book` / World Info / Horae 源码硬编码 / P5 `[角色固有设定]` / P7.5.1 `[NPC 认知]`
  - 修复：仅重写当前聊天 `note_prompt` 的【隐藏设定】段
    - 移除字面值 `无界灵根` / `无界道体`
    - 移除与 `identity.spiritRoot.display` 冲突的具体值 `"杂灵根"`
    - 保留全部行为约束（认知隔离 / 测灵不暴露 / NPC 不得提及 / 异常仅作线索）
    - 新增首句"此为天道层面的真相，仅天道知晓"
  - 验证：
    - `noteHasSpiritRoot / noteHasConstitution / noteHasZa === false`
    - `dbg2HasSpiritRoot / dbg2HasConstitution / dbg2HasZa === false`
    - `dbg[2].role === 'system'`、`dbg[2].len === 935`、全部公开规则段保留
    - `[角色固有设定]` 仍由 Identity 正常输出 `灵根 = 四系伪灵根 / 体质 = 凡体`
  - 架构约束：Identity 继续作为 `无界灵根 / 无界道体` 的 canonical truth owner；未来 reveal 走 Identity reveal 机制（P6.5），不通过 AN
  - 未改动：Horae 代码 / World Info / Identity schema / P7.5.1 / NPC Knowledge

## 观察中的问题

（实际游戏中遇到问题后，把现象记录在此，待分析）

- 待观察：DirectorStore 是否在长时间游戏中产生冗余条目
- 待观察：FactStore 的 active facts 是否会超过 Prompt 容量
- ✅ 已修（commit 41dbe67）：L2 摘要读取 originalEvents
  - _collectAutoResummaryPayload 追加原始关键/重要事件
  - 每 L1 最多 6 条
  - 实测：L2 已存在 originalEvents 累积 415 条
- 待观察：AI 对"玩家长期要求"段的遵守程度
- 待观察：自动摘要偶发"缺时间戳"警告（如 #6 无 story_date）
  - 单条消息缺失不影响主流程，摘要 AI 会跳过
  - 未来若频繁出现再排查

---

## 报告模板

```
现象：（具体表现）
时间：（发生时间）
模块：（涉及哪个系统）
复现：（怎么触发的）
截图：（可选）
```

---

## 后续任务（2026-09-29 新增）

**执行优先级：物品问题 > Persona P1 > 其他**

---

### A. Persona P1 · 内容瘦身

**优先级**：中（当前阶段第三步）

**问题**：

- SillyTavern Persona 当前维护 20+ 字段（年龄/境界/修为/气血/灵力/寿元/五维属性/灵根/体质/天赋/外貌/六艺/资源/物品/身份/道号/家庭/情感等），与 Horae 的 Identity / StateStore / FactStore / Threads 存在大量重复。
- Persona 当前每回合注入 Prompt 最前端（position=0），因此 AI 同时看到 Persona 与 Horae 的结构化数据；当两者不一致时会产生冲突。
- 已发现实际冲突实例：
  - Persona：出身 = 东洲·青岳·云来镇
  - Identity.background：东洲青岳凡人家庭出身
  - 两份数据存在差异。

**审计结论（已完成）**：

- Horae 项目对 SillyTavern Persona **0 处直接引用**（git grep persona 未发现 Persona 读取/写入链路）。
- 因此 Persona 内容瘦身原则上不会影响 Horae 当前运行逻辑。
- 删除前仍需保留备份，并确认 SillyTavern 原生 Persona 功能不会依赖被删除字段。

**瘦身后 Persona 保留**：

- 本名
- 性别（**归属待定**：Identity / StateStore / Persona；需先确认 StateStore 是否存在性别字段、读写链路及 Prompt 注入路径）
- 性格
- 说话风格
- 家庭 / 家庭背景自由文本
- 情感倾向
- 其他尚未被 Horae 结构化接管的玩家自由文本

**从 Persona 删除/迁移**：

- 年龄、境界、修为、气血、灵力、寿元 → StateStore
- 五维属性 → StateStore
- 灵根、体质、仙姿、天赋、隐藏设定 → Identity
- 六艺 → StateStore
- 资源、物品、装备 → StateStore
- 身份、道号 → FactStore
- 出身 → Identity.background
- 当前目标 → Threads

**执行方式**：

- 独立 commit
- 删除前保留 Persona 原始备份
- 确认依赖后再删除
- 保证该改动可以独立回滚

---

### B. 物品状态重复输出 · 聊天正文污染

**优先级：最高**（当前实际游玩体验与输出 Token 的主要问题）

**问题**：

在修改物品注入规则、减少 Horae → 主模型的物品注入后，出现了新的反向现象：

- 战斗结束后
- 发生物品变化后
- 场景涉及物品时

主模型可能反复在正常聊天正文中汇报"主角当前持有什么物品"。

例如：

    冉汐身上有小刀、干粮、青玉镯……

**两层问题必须分开处理**：

| 层 | 方向 | 当前状态 |
|---|---|---|
| A | Horae → 主模型：物品信息注入 | 已在优化（减少注入） |
| B | 主模型 → 聊天正文：物品状态重复描述 | **未解决 ← 当前最高优先级** |

**目标**：

物品状态维护与剧情正文描述应当分工，而不是互相替代。

- 剧情确实涉及物品时，可以自然提及：冉汐取出青玉镯。
- 当剧情导致需要持久化的物品状态发生变化时，由结构化 Delta / 物品协议维护状态。
- 不应因为 Horae 的状态维护机制或相关 Prompt 规则，诱导模型每回合重复汇报完整持有物清单。
- 同时不能禁止正常剧情中的自然物品描写。

**当前尚未确定根因，不立即修改代码。**

**后续需完整审计**：

1. 当前哪些 Prompt / System 规则可能诱导模型反复输出持有物。
2. 是否由当前物品注入内容本身造成模型倾向于复述。
3. 是否由 Delta / Item Protocol 的输出格式或规则造成模型重复汇报。
4. 是否存在"状态维护"和"正文叙事"之间的职责混淆。
5. 是否可以做到：
   - 有实际状态变化 → 输出对应结构化 item Delta；
   - 无状态变化 → 不重复汇报库存；
   - 剧情需要 → 仍允许自然提及具体物品。
6. 检查物品删除、获得、转移、装备/卸下、位置变化等不同状态变化是否存在不同的诱导路径。
7. 在确定根因之前，不进行针对性代码修改；完成审计后再一次性设计完整修复方案。

---

### C. Persona → Horae 动态交接机制（P2）

**优先级：低（架构级，暂缓）**

**目标**：

不是简单地执行"第 N 轮后关闭 Persona"，而是区分：

- 需要长期存在的自由文本：
  - 人格
  - 说话方式
  - 家庭
  - 情感倾向
  - 其他自由文本
- 已由 Horae 接管的结构化内容：
  - 灵根
  - 体质
  - 境界
  - 修为
  - 属性
  - 六艺
  - 物品
  - 资源等

**目标生命周期**：

    完整 Persona / 初始设定
            ↓
    游戏初期让 AI 建立主角认知
            ↓
    Horae 完成结构化数据接管
            ↓
    后续不再重复注入已由 Horae 接管的 Persona 结构化内容
            ↓
    Persona 最终保留：
    人格 / 说话方式 / 家庭 / 情感等自由文本

**技术方案（已完成初步调研）**：

- 监听 CHAT_COMPLETION_PROMPT_READY 事件。
- 通过稳定特征字符串（例如 `【本名】`）精确识别 Persona 消息。
- 检查 Persona → Horae 的交接状态。
- 根据 Identity / State / Fact 等核心数据是否已经建立，以及最小游戏轮次等条件判断是否完成交接。
- 交接后，将完整 Persona 替换为瘦身版 Persona，而不是简单删除整个 Persona。
- 交接状态存储于 chat[0].horae_meta。
- 预留 settings.identityHandoverEnabled 开关。

**收益**：

- Token：减少每回合重复发送已经由 Horae 管理的结构化内容。
- Cache：减少动态 Persona 内容对 Prompt 前缀稳定性的影响。
- 一致性：降低 Persona 与 Horae 双重数据源造成的冲突。

**风险**：

- Hook 误匹配其他 system message → 必须使用精确特征匹配。
- 交接判断过早 → 增加最小轮次及核心数据完整性检查。
- SillyTavern 升级改变事件结构 → 增加防御性检查。
- 回滚 → 通过独立开关关闭交接机制。

**执行原则**：

- 不采用单纯的"第 N 轮关闭 Persona"方案。
- 必须保留自由文本 Persona。
- 结构化数据由 Horae 接管后，再停止重复注入对应 Persona 字段。
- 建议先完成 Persona P1，再实施 P2。
- P2 当前暂缓，不进入本阶段代码修改。

---

## B4 Phase 1 运行时验证记录（2026-09-30）

### 状态：Prompt 层修复正确，暂不判定失败

**验证数据**（#150 后采集）：

| 轮次 | msg | 本轮 item | 裸 meta | 配对 | meta.items |
|---|---|---|---|---|---|
| 基线 #149 | - | - | - | - | 26 |
| 第 1 轮 #151 | - | 6 | 0 | ✅ 2:2 | 3 |
| 第 2 轮 #153 | - | 21 | 0 | ✅ 1:1 | 21 |
| 第 3 轮 #155 | - | 24 | 0 | ✅ 1:1 | 24 |
| 第 4 轮 #157 | - | 32 | 0 | ✅ 1:1 | 32 |

**已验证生效**：

- Phase 1 首轮生效：27 → 3
- L2 强制 `<horae>` 包裹生效：裸 meta 从 8 条降到 0
- 新生成消息的 `<horae>` 标签 1:1 配对

**反弹现象**：后续轮次 3 → 21 → 24 → 32

**反弹原因**：历史消息中的旧 `<horae>` 标签仍含完整 item 清单，AI 模仿历史样本 > 遵守 System Prompt 新规则。

**处理决定**：

- 暂不判定 Phase 1 失败
- 暂不上 Phase 2
- 暂不写历史清理脚本
- Phase 1 保持现状，不继续修改代码
- 后续基于干净存档验证 Phase 1 真实效果

---

### 观察项：HUD 历史楼层 RPG 上限显示为 0

**现象**：历史楼层 HUD 显示 `气血 210/0 | 灵力 210/0 | 神念 285/0`

**判定**：**既有架构行为，不作为 Bug**

**原因**：

- RPG 状态采集只采集最新楼层/最新有效数据
- 历史楼层没有对应的 RPG 数据，上限为 0
- 0 是"该历史楼层无上限值"，不是 parser 解析错误

**禁止修改**（除非当前最新楼层出现真实解析失败）：

- hp/mp/sp parser
- RPG StateStore
- HUD 历史数据渲染
- `<horaerpg>` 格式

---

### 待调查：避瘴符重复删除

**现象**：单次战斗后日志出现连续多次 `[Horae] 物品已消耗自动删除: 避瘴符`（观测到 10 次）

**触发条件**：AI 输出 `item:避瘴符=消耗` 后，删除循环反复触发

**疑似原因**：

- `state.items` 中存在多个"避瘴符"条目（同名同 baseName）
- 或 `meta.deletedItems` 里重复出现
- 或 baseName 匹配逻辑命中多个条目

**优先级**：中（不影响主流程，但日志噪音大）

**调查方向**（待后续执行）：

1. 检查 `state.items` 是否真的存在重复条目
2. 检查 `meta.deletedItems` 是否被多次合并
3. 检查 baseName 匹配逻辑
4. **不与 B4 Phase 1 验证混合**

---

## 通用角色设定系统（未来架构方向）

**状态**：设计阶段，P1 完成后单独启动
**不做**：不写代码、不改 schema、不做迁移

### 背景

当前 identity 是固定字段集合（spiritRoot / constitution / talents / ...），无法表达以下需求：

- 开局随机抽取金手指 / 系统
- 设计者预埋隐藏设定
- 剧情触发后揭示的隐藏血脉
- 同一角色同时存在公开和隐藏天赋
- 某个设定与主角永久绑定

需要把 identity 从"固定字段"升级为"角色设定条目集合"。

### 核心模型

每个"角色设定"是一个条目：

    {
      id: 'id_xxx',
      kind: 'spiritRoot',        // 类型（核心受控 + 允许扩展）
      value: '无界灵根',          // 真实值
      display: '四系伪灵根',      // 玩家可见值（可选，无则 = value）

      visibility: 'hidden',       // 见字段语义
      generation: 'fixed',        // 见字段语义
      generationConfig: {         // generation=random* 时用
        pool: [...],
        weights: [...],
        unique: true,
      },

      bound: true,                // 是否与主角永久绑定
      discovery: {                // 揭示规则（可选）
        trigger: 'breakthrough_to_jindan',
        once: true,
      },
      revealedAt: null,           // 已揭示的剧情时间（记录用，不限制状态转换）
      source: 'designer',         // designer / random / system / player
      meta: {},                   // 扩展字段
    }

identity 结构升级：

    {
      _v: 'v0.2',
      entries: [ /* 上面这种条目数组 */ ],
    }

### 字段语义

#### kind（核心受控 + 允许扩展）

核心 kind：spiritRoot / constitution / talent / bloodline / goldenFinger（金手指）/ goldenFingerSource（金手指来源）

**允许扩展**：specialMark / system / inheritance / destiny / ...
Horae 对核心 kind 有特殊处理，扩展 kind 走通用路径。

#### visibility（当前玩家认知状态）

| 值 | 含义 | 玩家可见 | AI 可见 |
|---|---|---|---|
| public | 开局公开 | 是 | 是，用 value/display |
| hidden | 玩家不知 | 否 | 过 sanitize |
| discoverable | 当前隐藏，可揭示 | 未揭示前否 | 同 hidden |
| gmOnly | 只有 GM 知道 | 否 | 完全不注入 |

**可以运行时变化**，不是单向流：

- hidden → public（直接揭示）
- hidden → discoverable（进入可发现状态）
- discoverable → public（满足条件揭示）
- public → hidden（封印 / 伪装 / 记忆封锁）
- 任何其他转换

**`revealedAt` 仅用于记录揭示历史**，不作为限制 visibility 状态转换的唯一依据。
visibility 是当前状态，可被任何剧情机制改变；revealedAt 只回答"什么时候被揭示过"，不回答"能不能被揭示"。

#### generation（生成方式）

| 值 | 含义 |
|---|---|
| fixed | 设计者预设定 |
| randomAtCreation | 开局随机抽 |
| randomAtEvent | 剧情触发时随机 |

**关键原则**：随机结果由 Horae / 程序确定并持久化，AI 只负责根据已确定的结果进行剧情表现。
**不允许 AI 负责随机**——否则同一存档多次生成 Prompt 会产生不同结果。

#### bound（绑定关系）

| 值 | 含义 |
|---|---|
| true | 主角专属，不转移（灵根 / 体质 / 金手指） |
| false | 可转移（预留） |

### 字段职责（明确分离）

三个字段承担完全不同的职责，**不得混用**：

| 字段 | 职责 | 回答的问题 |
|---|---|---|
| value | 真实值 | "角色本质上是什么" |
| visibility | 权限控制 | "玩家当前能不能看到这个设定" |
| display | 展示内容 | "玩家看到的时候显示什么" |

**关键约束**：

- visibility 是**唯一的权限层**，决定玩家能否看到条目
- display **不是权限控制**——它只是"当玩家被允许看到时，显示什么文案"
- 即使 display 存在，只要 visibility 不是 public（且未揭示），玩家也看不到
- value 是真实数据，永远不直接展示给玩家（除 visibility=public 且无 display 时）

### 覆盖场景

| 场景 | kind | value | visibility | generation | bound |
|---|---|---|---|---|---|
| 签到系统 | goldenFinger | 签到系统 | public | randomAtCreation | true |
| 无界灵根 | spiritRoot | 无界灵根 | hidden | fixed | true |
| 无界道体 | constitution | 无界道体 | hidden | fixed | true |
| 隐藏血脉 | bloodline | 某血脉 | discoverable | randomAtEvent | true |
| 金手指来源 | goldenFingerSource | 未知存在 | gmOnly | fixed | true |
| 隐藏天赋 | talent | 某天赋 | hidden | randomAtCreation | true |
| 公开天赋 | talent | 过目不忘 | public | fixed | true |

### View 分离

**Player View**：只显示 visibility=public 或 已揭示的 discoverable，显示值 = display ?? value。

**GM View**：显示全部条目。

- public / 已揭示 discoverable：正常显示
- hidden：显示 value + 徽章
- discoverable 未揭示：显示 value + 待揭示徽章 + trigger
- gmOnly：显示 value + GM 徽章
- randomAtCreation 未生成：显示 `[未生成]` 占位
  - **[未生成] 的具体 UI 处理、生成按钮、触发时机，暂不设计**
  - 随机池 / 权重 / 随机种子 / 重复生成保护 / 可复现随机等细节，将来单独设计

**GM 入口隔离**：

- 不做 UI 开关（任何开关都可能被玩家找到）
- GM 编辑 = Console 命令（如 Horae.identity.setReal(...)）
- 批量编辑 = ST 角色卡编辑器直接改 JSON

### AI Prompt 注入

    entries
      .filter(e => e.visibility !== 'gmOnly')   // gmOnly 永不注入
      .map(e => {
        if (e.visibility === 'public') return label + ' = ' + (e.display ?? e.value);
        if (e.visibility === 'discoverable' && e.revealedAt) return label + ' = ' + (e.display ?? e.value);
        // hidden / discoverable 未揭示
        return label + ' = ' + sanitizeHiddenKeywords(e.value);
      });

### 迁移路径（未来，非现在）

| 阶段 | 内容 |
|---|---|
| A · 双写 | identity 同时维护旧字段 + entries[]，写入双写，读取优先 entries |
| B · 迁移脚本 | 一次性把旧字段转为 entries，保留备份 |
| C · 废弃旧字段 | 确认全链路走 entries，删旧字段 |

**不做跳跃式迁移。**

### 与当前 P1 的关系

- gender 已加入 identity.gender（旧 schema）
- 将来统一迁移到 entries[]
- P1 不做 schema 迁移
- P1 完成后，单独进入本设计阶段

### 明确不做

- 不加"眼睛按钮"（玩家可能误触）
- 不加 settings.gmMode 让玩家可开关
- 不让 AI 负责随机
- 不做跳跃式迁移
- 不把 hidden 加进任何玩家可见 UI

---

## P1 · Persona 瘦身（已完成 2026-09-30）

### 目标

把 SillyTavern Persona 从"游戏全状态镜像"收缩为"玩家人格/自由文本"。

### 完成内容

**代码支持**：

- identityStore.js 加 gender 字段
- index.js B3c-4 modal 加 gender input
- index.js renderIdentityPanel 加 gender 渲染
- horaeManager.js _generateIdentitySection 加 gender 注入
- locales zh-CN / en 加 identityGender

**数据修正**：

- identity.talents 从 ['过目不忘1'] 修正为 ['过目不忘', '气运加身', '桃花运']
- 通过 B3c-4 modal 完成，验证链路正常

**Persona 瘦身**：

- 从约 20 段收缩为 5 段
- 保留：本名 / 性格 / 家庭 / 功德业力 / 隐藏情感倾向
- 删除：道号 / 基本信息 / 基础属性 / 当前状态 / 灵根 / 体质 / 天赋 / 外貌 / 六艺 / 资源 / 随身物品 / 隐藏设定占位

### 副作用

- 项目 0 处读 persona，瘦身对 Horae 无影响
- ST 原生 persona 预览更新，不涉及其他功能

### 未完成 / 后续

- Identity View / GM View 改造（modal 泄漏真实值）
- 通用角色设定系统（entries[] 迁移）
- 功德/业力归属（等声望/因果系统设计）
- 碎银归属（已确认不迁移，从 Persona 删除即可）

---

## 旧仓库物品同步 · 已完成（2026-09-30）

### 执行结果

- 目标仓库：`SillyTavern-Horae-ranxi`
- 新 HEAD：`930cc5e`
- 同步 commit message：`sync(items): B4 item delta semantics + Bug Y console.log removal`
- 误推 `964262e`（ISSUES.md）已通过 force push 从历史和远端清除

### 同步内容

- Bug Y：`core/horaeManager.js` 删 2 行 console.log
- Item Delta 规则补强：6 语言 `prompts/{lang}/customSystemPrompt.txt`
- 归档脚本：`tools/patch-horae-ranxi-sync-items.mjs`

### 明确不同步

- Persona / identity / gender / 通用角色设定系统
- `<horae>` 强制约束
- 其他非物品内容

### 职责边界（最终确认）

| 仓库 | 职责 |
|---|---|
| `-game` | 完整游戏项目主仓库 |
| `-ranxi` | 物品系统独立同步仓库 |

---

## 通用角色设定系统 · 详细设计（2026-09-30 定稿）

**状态**：设计定稿，未进入代码实现
**前置**：见上文"通用角色设定系统（未来架构方向）"章节

### entries[] 数据模型

#### 顶层结构

    {
      _v: 'v0.2',
      entries: [ /* entry 数组 */ ],
    }

#### 单条 entry 字段定义

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | string | 是 | 自动 | 唯一标识，格式 e_<timestamp><random> |
| kind | string | 是 | — | 类型（核心枚举 + 允许扩展） |
| value | string / object | 是 | — | 真实值 |
| display | string / object / null | 否 | null | 玩家展示值，null 表示 = value |
| visibility | string | 是 | public | 见 visibility 状态机 |
| generation | string | 是 | fixed | 见 generation 生成方式 |
| generationConfig | object / null | 否 | null | random* 时的配置 |
| bound | boolean | 是 | true | 是否与主角永久绑定 |
| discovery | object / null | 否 | null | 揭示规则 |
| revealedAt | { iso, story } / null | 否 | null | 揭示时间（记录用） |
| source | string | 是 | designer | designer / random / system / player |
| meta | object | 否 | {} | 扩展字段 |
| createdAt | string | 是 | 自动 | ISO 时间 |
| updatedAt | string | 是 | 自动 | ISO 时间 |
| _userEdited | boolean | 否 | false | 用户手动编辑标记 |

#### value 类型规则（Q2 决策）

允许：
- string（普通设定：灵根 / 体质 / 性别 / 出身）
- 受限 object（结构化设定：金手指 / 血脉 / 复杂体质）

**受限 object 规则**：
- 必须是 key-value 平铺结构
- value 内不再嵌套深层对象
- 禁止函数 / Symbol / 循环引用
- 序列化后大小限制（未来定）

#### display 语义（Q4 决策）

- null → 用 value 显示
- string / object → 覆盖显示
- **空串不表示"隐藏"**——权限统一由 visibility 控制

#### kind 枚举（Q8 决策：允许扩展）

**核心 kind（Horae 特殊处理）**：

    spiritRoot
    constitution
    talent
    bloodline
    goldenFinger
    goldenFingerSource
    gender

**扩展 kind（通用路径）**：

    system
    specialMark
    inheritance
    destiny
    karma
    ...（未来可扩展）

**未知 kind fallback**：走通用路径 + Console 提示，不报错

#### 同 kind 多 entry（Q3 决策）

**允许**。同一 kind 下可以有多个 entry：
- 公开天赋 × N
- 隐藏天赋 × N
- 剧情获得天赋 × N

每条 entry 独立管理 visibility / generation / revealedAt。

### visibility 状态机

#### 四态定义

| 值 | 玩家可见 | AI 可见 | GM 可见 |
|---|---|---|---|
| public | 是 | 是，用 value/display | 是 |
| hidden | 否 | 过 sanitize | 是 |
| discoverable | 未揭示隐藏 / 已揭示显示 | 同左 | 是 |
| gmOnly | 否 | 完全不注入 | 是 |

#### 允许的状态转换

无强制单向流，任意转换都允许：

    public → hidden            （封印 / 伪装 / 记忆封锁）
    hidden → public            （直接揭示）
    hidden → discoverable      （进入可发现状态）
    discoverable → public      （满足条件揭示）
    discoverable → hidden      （取消揭示）
    gmOnly → hidden            （GM 决定降级）

#### revealedAt 与 visibility 的关系

- revealedAt **只记录历史**，不参与权限判断
- 决定"玩家能不能看到"的唯一依据是 visibility
- discoverable + revealedAt != null 的显示等效于 public

判定代码：

    const playerVisible = (e) =>
      e.visibility === 'public' ||
      (e.visibility === 'discoverable' && e.revealedAt != null);

#### revealedAt 格式（Q5 决策）

    {
      iso: '2026-09-30T12:00:00Z',   // 程序排序 / 逻辑判断
      story: '342年12月24日 08:35',   // 游戏展示
    }

### generation 生成方式

#### 三态

| 值 | 触发时机 |
|---|---|
| fixed | 卡创建时已确定 |
| randomAtCreation | 首次 CHAT_CHANGED 时随机 |
| randomAtEvent | 剧情事件触发时随机 |

#### generationConfig 结构

    {
      pool: [
        { value: '签到系统', weight: 1, display: null },
        { value: '万界交易系统', weight: 2 },
      ],
      unique: true,       // 是否排除已生成
      seed: null,         // 固定种子（可复现）
      rerollable: false,  // 是否允许重新生成
    }

#### 执行主体（关键原则）

随机结果**必须由 Horae 程序执行**，不允许 AI 生成。

理由：
- AI 每次 Prompt 重新生成会产生不同结果
- 需要持久化到 entries
- 需要与"已生成"标记配合

#### 未生成状态（Q6 决策）

generation != 'fixed' 且未生成时：

    {
      value: null,
      generation: 'randomAtCreation',
      generationConfig: { ... },
      _notGenerated: true,
    }

显示策略：
- Prompt 注入：跳过
- Player View：跳过
- GM View：显示 `[未生成]`

### 迁移策略

#### 三阶段（Q1 决策）

**阶段 A · 双写**：
- identity 同时维护旧字段 + entries[]
- _v 升级为 v0.2
- 读取：优先 entries，fallback 旧字段
- 写入：双写（旧字段 + entries）

**阶段 B · 迁移脚本**：
- 一次性把旧字段转为 entries（Q7 决策：一次迁移，不懒迁移）
- 保留 backup
- 删除旧字段

**阶段 C · 废弃**：
- 确认全链路走 entries
- 删除旧字段兼容代码

### View 层设计

#### Player View

过滤规则：

    entries.filter(e =>
      e.visibility === 'public' ||
      (e.visibility === 'discoverable' && e.revealedAt != null)
    );

显示值：`e.display ?? e.value`

**显示字段**：
- kind → i18n label
- value → display ?? value

**不显示**：gmOnly / hidden / 未揭示 discoverable

#### GM View（入口：Console 命令，非 UI）

    Horae.identity.gm.list()                    // 列出所有 entries
    Horae.identity.gm.get(id)                   // 读取单个
    Horae.identity.gm.set(id, { value, ... })   // 修改
    Horae.identity.gm.reveal(id)                // 手动揭示
    Horae.identity.gm.generate(id)              // 触发随机生成

**显示**：全部 entries + visibility 徽章 + generation 徽章 + revealedAt 时间

#### 界面隔离原则

- Player View 是**唯一玩家可见**的入口
- GM View 走 Console（故意不做 UI）
- 不加眼睛按钮 / 不加 settings.gmMode

### AI Prompt 注入

过滤规则：

    entries
      .filter(e => e.visibility !== 'gmOnly')
      .filter(e => e.value != null)
      .map(e => {
        const label = i18n(e.kind);
        if (playerVisible(e)) {
          return `${label} = ${e.display ?? e.value}`;
        }
        return `${label} = ${sanitizeHiddenKeywords(e.value)}`;
      });

排序：
1. 核心 kind 优先（按预定义顺序）
2. 扩展 kind 按 createdAt
3. hidden 条目排后（AI 优先看到 public）

### 揭示机制

#### discovery 规则结构

    discovery: {
      trigger: 'breakthrough_to_jindan',
      conditions: {
        realm: '金丹',
        minContribution: 100,
      },
      once: true,
      autoReveal: true,
    }

#### 揭示流程

1. 剧情事件发生（如突破金丹）
2. 事件匹配 discovery.conditions
3. 若 autoReveal → 自动 revealedAt = { iso, story }
4. visibility 保持 discoverable 或由剧情改为 public

**注意**：revealedAt 赋值本身**不改 visibility**——但如果 visibility 是 discoverable，赋值后 Player View 就会显示。

### 8 个已确认的设计决策

| # | 决策点 | 结论 |
|---|---|---|
| Q1 | _v 版本字段 | A · 升级到 v0.2，旧字段 + entries 并存 |
| Q2 | value 类型范围 | C · string + 受限 object |
| Q3 | 同 kind 是否允许多条 | A · 允许 |
| Q4 | display 语义 | A · null = 用 value；string/object = 覆盖 |
| Q5 | revealedAt 格式 | C · { iso, story } 双字段 |
| Q6 | generation 未生成行为 | C · GM View 显示 `[未生成]`，其他跳过 |
| Q7 | 迁移方式 | A · 一次迁移，不懒迁移 |
| Q8 | source 取值 | B · 允许扩展字符串，提供默认枚举 |

### 明确不做的部分

| 项 | 原因 |
|---|---|
| 不写代码 | 设计阶段 |
| 不改 identity schema | 等设计确认 |
| 不做迁移 | 等代码改造范围确定 |
| 不做 GM View UI | 走 Console 命令，不做界面 |
| 不做眼睛按钮 | 玩家可能误触 |
| 不加 settings.gmMode | 任何玩家可开关都是风险 |
| 不让 AI 负责随机 | 必须由 Horae 执行 |
| 不做跳跃式迁移 | 三阶段走 |
| 不做随机池 UI | 后续单独设计 |

### 后续改造前置条件

**当前阶段（2026-09-30）**：
- 只记录架构方向，不进入代码实现

**真正改造时的优先顺序**：
1. **优先确定 identityStore 与 View 层迁移方案**
2. 再考虑 entries[] 写入
3. 最后做 View 层实现

**具体前置任务**：
- 确定 entries[] 与旧字段的双写接口
- 确定 View 层渲染函数签名
- 确定 GM Console 命令的 API 形状
- 确定迁移脚本的一次性执行时机

---

## 通用角色设定系统 · 前置任务设计（2026-09-30 定稿）

**状态**：设计定稿，未进入代码实现
**执行顺序**：7 → 6 → 1 → 2 → 3 → 4 → 5

### 任务 7 · Schema Version Policy

#### 版本演进

| 版本 | 模型 | 状态 |
|---|---|---|
| v0.1 | 旧字段模型 | 当前 |
| v0.2 | entries 模型 + 双写 | 未来 |
| v0.3 | 移除 legacy 字段 | 未来 |

#### 约束

- **不允许跳跃升级**（v0.1 不能直接跳到 v0.3）
- **每次升级必须有 migrate()**
- **每次升级必须有 verify()**
- **migration 版本管理独立记录**

#### 不变量

- `_v` 字段永远存在
- 迁移是**单向**的（只能 vN → vN+1）
- 每次迁移必须幂等（重复调用无副作用）

### 任务 6 · KIND Registry 设计

#### 注册表结构

    // core/memory/identityKindRegistry.js
    export const KIND_REGISTRY = {
      spiritRoot: {
        label: { zh: '灵根', en: 'Spirit Root', ... },
        aiLabel: { zh: '灵根', en: 'Spirit Root' },
        icon: 'fa-seedling',
        order: 10,
        category: 'core',
      },
      // ...
    };

#### 核心 kind 注册表

| kind | icon | order |
|---|---|---|
| gender | fa-venus-mars | 1 |
| spiritRoot | fa-seedling | 10 |
| constitution | fa-shield | 11 |
| bloodline | fa-dna | 12 |
| xianZi | fa-gem | 13 |
| talent | fa-star | 20 |
| arts | fa-book | 21 |
| background | fa-house | 30 |
| goldenFinger | fa-hand-sparkles | 40 |
| goldenFingerSource | fa-question | 41 |

#### 扩展 kind 处理

**三种路径（混合方案 C）**：
- 核心 kind 走注册表
- 扩展 kind 优先读 `entry.meta.label` / `entry.meta.icon`
- 都没有 → fallback：`kind` 字符串 + `fa-circle-dot`

#### 命名约束（新增）

- **kind 名称发布后不可重命名**
- 只允许**新增 alias**，避免未来迁移问题
- alias 记录在注册表：`aliases: ['specialMark', 'special_mark']`

#### Prompt 标签处理

- 核心 kind → `aiLabel`
- 扩展 kind → `entry.meta.aiLabel ?? entry.meta.label ?? kind`

#### i18n key 命名

    rpg.identityGender
    rpg.identitySpiritRoot
    ...
    rpg.identityExt_<kind>    // 扩展 kind 统一前缀

扩展 kind 默认 label：`Ext <kind>`

### 任务 1 · entries[] 与旧字段双写接口

#### 字段映射表

| 旧字段 | entries 映射 | 备注 |
|---|---|---|
| spiritRoot | { kind: 'spiritRoot', value } | 单值 |
| spiritRootDisplay | entry.display | 不是独立 entry |
| constitution | { kind: 'constitution', value } | 单值 |
| constitutionDisplay | entry.display | 同上 |
| xianZi | { kind: 'xianZi', value } | 需补充核心 kind |
| gender | { kind: 'gender', value } | P1 新增 |
| background | { kind: 'background', value } | 需补充核心 kind |
| bloodline | { kind: 'bloodline', value } | 单值 |
| talents[] | N 条 { kind: 'talent', value } | 数组转多条 |
| arts[] | N 条 { kind: 'arts', value } | 数组转多条 |
| hidden | **不映射为 entry** | 计算属性 |

核心 kind 需补充：background / xianZi / arts

#### 双写约束（强制）

- **未来新增代码禁止直接修改旧字段**
- 必须通过 `setIdentityField()`
- 阶段 A 期间：setIdentityField() 双写 entries + 旧字段镜像
- 阶段 C 时旧字段完全废弃，只写 entries

**违规检测**：阶段 B/C 迁移脚本扫描代码，标记 `id.spiritRoot = ...` 直接赋值。

#### 读取 fallback（含容错）

    1. v0.2 + entries 存在 → 读 entries
    2. v0.2 + entries 缺失 → console.warn + 尝试从旧字段恢复 entries
    3. v0.1 或无 _v → 读旧字段
    4. 全部失败 → 报错

**不做"两边都读再 merge"**——避免不确定性。

#### 接口函数签名

    // 读取
    function getIdentityField(id, kind) → value | null
    
    // 写入（同时更新 entries + 旧字段镜像）
    function setIdentityField(id, kind, value, opts = {})
      // opts: { display, visibility, generation, bound, source, meta }
    
    // 批量读取
    function getIdentityEntries(id, opts = {})
      // opts: { filterByVisibility, includeNotGenerated }
    
    // 同步（阶段 A 一次性迁移用）
    function syncLegacyToEntries(id) → { migratedCount }

#### 写入优先级

阶段 A：**双写**（entries + 旧字段镜像），保证兼容性和数据一致。

### 任务 2 · View 层渲染函数

#### 三个独立函数

| 函数 | 消费者 | 输出 |
|---|---|---|
| renderIdentityPlayerRows(identity) | Player View UI | rows[] 含 display |
| renderIdentityGmRows(identity) | GM Console / 未来 GM UI | rows[] 含 visibility/generation 徽章 |
| renderIdentityAiEntries(identity) | AI Prompt 注入 | lines[] 含 sanitize |

#### 约束（三个函数共享）

- **纯数据转换**
- **不负责保存**
- **不修改 identity**
- **无副作用**（除 console.log）

#### renderIdentityPlayerRows

    1. 归一化为 entries
    2. 过滤：isPlayerVisible(e) === true
    3. 排序：核心 kind 优先 + createdAt
    4. 映射 { icon, label, value, extraCls }
       - icon: KIND_REGISTRY[e.kind].icon ?? 'fa-circle-dot'
       - label: i18n(`rpg.identity${Capitalize(e.kind)}`)
       - value: e.display ?? e.value
    5. 返回

#### renderIdentityGmRows

    1. 归一化为 entries
    2. 不过滤（全部显示）
    3. 附加：
       - visibilityBadge: '🚫' | '🔓' | '🔒' | ''
       - generationBadge: '🎲' | ''
       - revealedAt: e.revealedAt?.story ?? '—'
    4. 返回

**不负责 UI 呈现**——数据由 Console 或未来独立面板消费。

#### renderIdentityAiEntries

    1. 归一化为 entries
    2. 过滤：isAiVisible(e) === true
    3. 排序：
       - 核心 kind 优先
       - 扩展 kind 按 createdAt
       - hidden 排在 public 之后
    4. 映射 line:
       - playerVisible(e) → `${label} = ${display ?? value}`
       - 其他 → `${label} = ${sanitizeHiddenKeywords(value)}`
    5. 返回 lines[]

**关键**：不复用 Player 逻辑——两者过滤规则和 sanitize 需求不同。

#### 过滤函数归一化

    function isPlayerVisible(entry) {
      if (entry.value == null) return false;
      if (entry.visibility === 'public') return true;
      if (entry.visibility === 'discoverable' && entry.revealedAt != null) return true;
      return false;
    }
    
    function isAiVisible(entry) {
      if (entry.value == null) return false;
      if (entry.visibility === 'gmOnly') return false;
      return true;
    }
    
    function isGmVisible(entry) {
      return true;
    }

### 任务 3 · GM Console API

#### 命名空间

    window.Horae.identity.gm.*

#### 命令清单

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| gm.help() | — | string | 显示所有命令 |
| gm.list([filter]) | { kind, visibility } | entry[] | 条件过滤 |
| gm.get(id) | string | entry \| null | 单条 |
| gm.set(id, patch) | string, object | entry \| null | 修改（不含 kind） |
| gm.add(fields) | object | entry | 新增 |
| gm.remove(id) | string | boolean | 删除 |
| gm.reveal(id) | string | entry \| null | 揭示 |
| gm.hide(id) | string | entry \| null | 隐藏 |
| gm.generate(id) | string | entry \| null | 触发随机生成 |
| gm.migrate() | — | { ok, count } | 手动迁移 v0.1 → v0.2 |
| gm.verifyMigration() | — | { ok, issues[] } | 迁移验证 |
| gm.export() | — | string (JSON) | 导出 |
| gm.import(json, opts) | string, { dryRun } | { ok, count, diff } | schema 检查 + dry-run |
| gm.save() | — | boolean | 显式写回角色卡 |

#### gm.set() 约束

- **禁止修改 kind**——要改需 remove + add

#### gm.import() 设计

    gm.import(json, { dryRun = true })

1. 解析 JSON
2. 检查 schema version（必须 v0.2）
3. 检查每条 entry 必填字段
4. dry-run 时返回 diff，不写入
5. 非 dry-run 时覆盖写入 + 返回 { ok, count }

**默认 dryRun: true**——防止误操作。

#### gm.verifyMigration() 设计

    gm.verifyMigration() → {
      ok: boolean,
      issues: [
        { type: 'missing-entry', kind: 'spiritRoot' },
        { type: 'value-mismatch', kind: 'talent', legacyValue, entryValue },
        { type: 'legacy-field-orphan', field: 'foo' },
      ]
    }

检查项：
1. entries 完整（旧字段每个都有对应 entry）
2. legacy 映射正确（value / display 未丢失）
3. 无孤儿旧字段
4. _v === 'v0.2'

#### gm.save()

保留——未来若 identity 有缓存层，需要明确写回入口。当前与 _writeCardIdentity() 等价。

#### 副作用

- 所有 GM 命令**直接修改 chat[0].horae_meta.identity**
- **不自动写角色卡**——需要 gm.save() 显式触发

#### 日志

每个 GM 命令执行后：

    console.log('[Horae][GM] ' + command + ':', result);

#### 权限边界

GM 命令**不做权限校验**——只有懂技术的设计者会用 Console。
未来若暴露到 UI 需引入 GM 身份验证，当前不做。

### 任务 4 · 迁移脚本

#### 触发方式（方案 C · 混合）

- 检测 v0.1 → Console 提示
- 用户手动 `gm.migrate()` 执行
- **不自动执行**

#### 迁移流程

    1. Console 提示
    2. 用户调用 gm.migrate()
    3. 自动执行 gm.export() → 输出到 Console（可复制）
    4. 遍历旧字段 → 生成 entries
    5. 设置 _v: 'v0.2'
    6. 保留旧字段（阶段 A 兼容）
    7. 写回角色卡
    8. 输出摘要

#### 备份策略

- **不写入 `_legacyBackup` 到 identity**——避免 identity 数据膨胀
- 迁移前通过 `gm.export()` 生成**外部临时备份**
- 迁移脚本自身保留日志

#### 回滚

- 从 gm.export() 保存的 JSON 手动恢复
- 或从角色卡文件备份恢复

#### 幂等性

- 迁移脚本检查 id._v：
  - v0.1 → 执行
  - v0.2 → 跳过
- 重复调用无副作用

#### 迁移后验证

    1. entries 数量 > 0
    2. 每条 entry 有 id / kind / value
    3. 旧字段仍在
    4. _v === 'v0.2'
    5. Console 输出摘要：
       [Horae][GM] migrated: 8 entries from 6 legacy fields

#### 触发点

- SillyTavern 启动时（isInitialized = true 附近）
- CHAT_CHANGED 时
- 手动 gm.migrate()

#### 用户通知

- Console 输出（非 UI）
- 不弹 modal
- 不弹 toast

**设计目的**：迁移是开发者/设计者行为，玩家不应被打扰。

### 任务 5 · Prompt 注入映射设计

#### 哪些 kind 注入

**全部注入**（除 `gmOnly`）。

#### 核心 kind 顺序（预定义）

    gender → spiritRoot → constitution → bloodline → xianZi
    → talent → arts → background
    → goldenFinger → goldenFingerSource

**扩展 kind**：按 createdAt，追加在核心 kind 之后。

#### hidden sanitize 规则

- `playerVisible(e)` → 用 `display ?? value`（不走 sanitize）
- 其他（hidden / 未揭示 discoverable）→ `sanitizeHiddenKeywords(value)`

依赖：`core/memory/hiddenKeywords.js` 的 `HIDDEN_MAP`。

**未命中的 value**：原样注入
**不引入"自动打码"机制**——只有 HIDDEN_MAP 命中的才替换。

#### 排序规则

    1. 核心 kind（按预定义顺序）
    2. 扩展 kind（按 createdAt）
    3. hidden 条目排在 public 之后

#### Token 控制

现有约束：
- `_STATE_AUTHORITATIVE_PREDICATES` 已从 facts 层排除 State 类

新增约束（entries 层）：
- 单条 entry value 超过 N 字符时截断（N 待定，建议 200）
- 总 identity 段超过 M token 时截断扩展 kind（保留核心 kind）
- M 待定——需要实测

**暂不做**：token 预算的动态分配。

### 7 项任务关联图

    ┌──────────────────────────────────────┐
    │ 任务 6 · KIND Registry                │
    │  (icon/label/order 来源)              │
    └──────────────┬───────────────────────┘
                   ↓
    ┌──────────────────────────────────────┐
    │ 任务 1 · 双写接口                     │
    │  setIdentityField / getIdentityField  │
    │  syncLegacyToEntries                  │
    └──────────────┬───────────────────────┘
                   ↓
    ┌──────────────┼─────────────┬──────────────┐
    ↓              ↓             ↓              ↓
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ 任务 2   │ │ 任务 3   │ │ 任务 4   │ │ 任务 7   │
    │ View     │ │ GM API   │ │ Migration│ │ Version  │
    └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘
         │            │            │
         └────────────┴─────┬──────┘
                            ↓
                  ┌─────────────────┐
                  │ 任务 5 · Prompt  │
                  │ 注入映射         │
                  │ (依赖 2 + 6)     │
                  └─────────────────┘

依赖关系：
- 任务 5 依赖任务 2（AiEntries）+ 任务 6（Registry）
- 任务 3 依赖任务 1（接口）
- 任务 4 依赖任务 1 + 任务 3（verify）
- 任务 2 依赖任务 6（icon/label 来源）

执行顺序：6 → 1 → 2 → 3 → 4 → 5

### 最终状态

    任务 1~7 设计确认完成
    下一步：进入代码实现（待启动）
    不写代码，不改 schema
