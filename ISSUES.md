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
