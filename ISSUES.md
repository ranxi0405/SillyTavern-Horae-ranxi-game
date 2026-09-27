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

---

## 报告模板

```
现象：（具体表现）
时间：（发生时间）
模块：（涉及哪个系统）
复现：（怎么触发的）
截图：（可选）
```
