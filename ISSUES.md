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
