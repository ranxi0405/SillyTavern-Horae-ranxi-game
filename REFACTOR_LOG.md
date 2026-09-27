# 《问道长生》× Horae 重构日志

## 一、项目背景

- **游戏**：《问道长生》AI 修仙文字游戏
- **平台**：SillyTavern 1.19.0
- **扩展**：Horae 1.15.1（fork 自 SenriYuki）
- **主模型**：Qwen3.5-Plus
- **辅助模型**：Qwen3.5-Flash
- **主角**：冉汐
- **当前仓库**：https://github.com/ranxi0405/SillyTavern-Horae-ranxi-game
- **旧仓库**（归档）：https://github.com/ranxi0405/horae-

## 二、核心理念

**本项目不是简单降低 Token，而是建立可靠的持久世界状态系统。**

一个事实只有一个真正的主人。不要同时让世界书、Horae、摘要、作者注释、Chat History 重复保存同一个当前状态。

**AI 只提议，程序才提交。**

**意图 ≠ 结果。** 玩家声称的行动结果必须经过世界逻辑判定。

## 三、当前阶段

**大方向验证（Alpha / 黑盒测试）**

所有改动都是方向性验证，细节问题在实际游戏中逐步发现和修复。

## 四、分层架构

```
世界规则         → Worldbook（作者定义的稳定规则）
当前世界状态     → StateStore（可回放的事件流）
长期事实         → FactStore（结构化、去重、visibility）
玩家长期要求     → DirectorStore（复发计数）
历史事件         → _rpgChanges（事件流）
剧情叙述         → autoSummaries（L1/L2/L3 分层）
历史检索         → VectorManager（按需召回）
Prompt 投影      → onPromptReady（固定前缀 + 动态区）
```

## 五、时间线

### 2026-09-27

**仓库结构**
- 新建 SillyTavern-Horae-ranxi-game 仓库（完整扩展 + 版本控制）
- 旧仓库 horae- 保留为历史归档

**State 层**
- StateStore v0.1：接管 getRpgStateAt（读）
- StateStore v0.1：接管 _mergeRpgData（写）
- StateStore v0.1：接管 rebuildRpgData（重建）
- 三条路径统一，horaeManager 里只剩委托

**Fact 层**
- FactStore v0.1：长期事实结构化存储
- FactStore v0.2：visibility 三档（public / hidden / gm_only）
- Fact 提取：AI 从 narrative + events 提取结构化事实
- 硬黑名单：无界灵根 / 无界道体（永不提取）
- **自动提取系统上线**：L1 摘要成功后 500ms 触发 fire-and-forget
- 边界加强：永不提取物品信息（Items 系统独立管理）
- 输入：narrative + 关键/重要事件（最多 30 条）+ existingFacts
- 幂等：entry._factsExtractedAt 标记
- 实测：新存档首次自动提取 5/5 成功，无物品越界

**Director 层**
- DirectorStore v0.1：玩家长期导演指令识别
- 12 类识别：pacing / world / format / rules / style /
  constraint / protagonist / npc / causality / continuity /
  correction / content
- 复发计数：相似指令归并（bigram Jaccard，阈值 0.4）
- 查询类指令自动排除（不记录）
- 注入位置：stableRulesPrompt（固定区，Cache 友好）

**Cache 优化**
- 反述规则（generateAntiParaphraseSystemPrompt）并入固定前缀
- combinedPrompt 只保留动态部分（antiParaRef）

**世界书 V0.9.1**
- Entry 4 补全体质体系（凡体/灵体/特殊体质/道体/圣体，开放）
- Entry 4 新增体质影响（修炼/突破/适配/战斗/寿元）
- 移除所有"无界灵根"提及（改由作者注释处理）
- 移除 key 数组中的"无界灵根"

**角色卡 + 作者注释**
- 角色卡：移除【隐藏设定｜仅天道可知】整段
- 角色卡：移除【无界灵根/道体的外部表现】整段
- 角色卡：移除【知识边界】整段
- 角色卡：新增一行占位"存在仅天道可知的隐藏设定，详见作者注释"
- 作者注释：追加【隐藏设定处理规则】段

**Bug 修复**
- 修复 RPG HUD null 值渲染报错（_renderEditableVal 加兜底）

## 六、未完成事项

- summaryText 层的隐藏设定过滤（防止无界灵根注入主模型）
- 元游戏指令识别（避免"玩家查询"误记为"角色得知"）
- L2 摘要读取 originalEvents（防止 L1→L2 信息损失）
- Vector 系统当前是独立层，未与 FactStore 打通
- Thread 系统（未开始，Agenda 是临时替代）

## 七、交接说明

**新对话接手时**：

1. 读取本文件和 ISSUES.md
2. 读取最新 git log
3. 阅读 core/memory/ 下的所有模块
4. 阅读 core/horaeManager.js 和 index.js 的核心函数
5. **不要重新从零分析架构**
6. 从"未完成事项"继续

## 八、重要约定

1. **一个事实只有一个主人**
2. **AI 只提议，程序才提交**
3. **意图 ≠ 结果**
4. **每个 commit 只做一件事**
5. **实测通过才 commit**
6. **每个模块有独立单元测试**
7. **中文文件名用 MINGW64 时要小心编码问题**
