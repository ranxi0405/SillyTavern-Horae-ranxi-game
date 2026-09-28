# SillyTavern-Horae《问道长生》世界状态引擎项目交接文档

项目日期：2026-09-28
当前阶段：S1.5-fix 完成 → B3 调研准备
当前 Git HEAD：a4dc0e0

版本环境：
- SillyTavern：1.19.0
- Horae：1.15.1
- 模型：Qwen 系列 API

定位：《问道长生》专用持久化世界状态引擎

---

## 1. 项目目标

将原版 Horae 改造成适用于修仙文字 RPG 的：

> 持久世界状态 + 历史事件 + 长期事实 + 未完成事务 + 自动记忆 + 精确 Prompt 投影系统

核心链路：

    真实世界状态 → 事件记录 → 事实提取 → 长期叙事
                → 向量检索 → Prompt 投影 → AI 回复

---

## 2. 核心设计原则

### 2.1 一个事实只有一个主人

| 数据 | 负责人 |
|---|---|
| 境界/修为/神识/寿元 | StateStore |
| 物品 | StateStore / Item 系统 |
| 历史事件 | Event Ledger |
| 长期事实 | FactStore |
| 未完成事务 | ThreadStore |
| 剧情摘要 | Narrative |

### 2.2 AI 只提议，程序才提交

AI 输出建议；程序负责校验、去重、action 判断、保存。

### 2.3 意图 ≠ 结果

「准备突破筑基」不能自动变成「境界 = 筑基」，必须等明确事件「成功突破筑基」。

### 2.4 程序不猜语义

不自动推断好感、突破、物品、战斗结果，只接受明确事件。

---

## 3. 当前已完成模块

| 层级 | 模块 | 状态 |
|---|---|---|
| State | stateStore.js | ✅ |
| Event Ledger | _rpgChanges | ✅ |
| Facts | factStore.js v0.4 | ✅ |
| Threads | threadStore.js | ✅ |
| Narrative | autoSummaries L1/L2/L3 | ✅ |
| Director | DirectorStore | ✅ |
| Vector | summaryVectors / threadVectors | ✅ |

---

## 4. 已完成版本记录

### S1.1c · Commit dcb33cd
移除通用 RPG 等级系统（rpg.levels / rpg.xp / Lv.X / sendRpgLevel / sendRpgXp / locale key），修复 _uoX 死变量。✅

### S1.2 · 清理历史脏 bars
修复 spirit / currency / attr 误读取。✅

### S1.3 系列 · Commit 5f03a29 ffd9939
完成修仙 RPG 状态显示：神识段位 / 修为派生 / HUD 胶囊 / RPG 面板胶囊 / 六艺显示 / 总览精简。✅

### S1.4 · RPG 协议 Delta 化
Token 消耗降低约 80%。Delta bars / 强格式 / 空值处理 / item 单前缀 / 六艺 craft 格式。✅

### S1.5 · Commit e2143fa b10bd61
FactStore 生产链：Fact 三元组 / action 契约 / 多值 predicate add / sourceEventIds / since 时间 / 注入去重 / State-auth 隔离 / 数据迁移。✅

### S1.6 · Commit 6be03a4 ef6d1ec
Vector ↔ Summary / Thread 打通。DB_VERSION 2 → 3，新增 summaryVectors、threadVectors、syncSummaryThreadsFromChat()。✅

### S1.5-fix · Commit bc66c34

修复 Fact 生产链两个非阻塞问题：

**Bug 1 · source 字段覆盖**
- 位置：index.js `_enrichFactsWithSource`
- 原因：`source: f.source || sourceTag` 优先取解析默认值 factExtraction
- 修复：改为 `source: sourceTag`
- 验证：新提取 4 条 fact，source 全部为 summary:as_1790601552224

**Bug 2 · 处境 predicate 过度提取**
- 位置：index.js fact 提取 prompt predicate 推荐词表
- 原因：短期状态（大比在即、危机感加剧等）写入长期 FactStore
- 修复：方案 A，从词表移除 `处境`
- 验证：新提取批次 predicate=处境 数量为 0

**历史数据迁移**
- 脚本：tools/retire-situation-facts.console.js（浏览器 Console 脚本）
- 方式：active 处境 fact → invalidated，保留溯源字段
- 结果：问道长生0.9 迁移 11 条，total facts 不变，active 31 → 20

**部署**
- 脚本：tools/deploy-s15-fix.mjs
- 备份：.bak-s15fix-deploy-<YYYYMMDD-HHMMSS>
- 校验：sha256 + node --check + byte diff

✅ 已 push

### 脚本归档 · Commit a4dc0e0
归档 tools/retire-situation-facts.console.js。✅

---

## 5. 当前部署状态

源码：`C:\Users\admin\Documents\GitHub\SillyTavern-Horae-ranxi-game`
运行端：`I:\AI\SillyTavern-1.19.0\public\scripts\extensions\third-party\SillyTavern-Horae`
同步：✅ 一致（sha256）

备份目录（在运行端扩展目录内）：
- .bak-s11c-deploy-*
- .bak-s13*-deploy-*
- .bak-s14*-deploy-*
- .bak-s15*-deploy-*
- .bak-s16-deploy-20260928-184808
- .bak-s15fix-deploy-20260928-2054*

---

## 6. A 测结果

### 6.1 A 测最终状态

| 阶段 | 结果 |
|---|---|
| 阶段 1 基线检查 | ✅ 通过 |
| 阶段 2 Fact 提取测试 | ✅ 通过 |
| 阶段 3 Prompt 注入验证 | ⚠️ 主动跳过（存档废弃） |
| S1.5-fix 真实验证 | ✅ 通过 |

S1.5-fix 验证批次（2026-09-28T13:20:25）：
- autoSummaries：7 → 8
- facts：40 → 44
- 新 4 条 fact source=summary:as_1790601552224
- 新提取 predicate=处境 数量：0

### 6.2 阶段 1 基线
Facts 31（active 22 / superseded 9）；多值 12 条 active 7；autoSummaries 5；threads 7；IndexedDB vectors 628 / summaryVectors 5 / threadVectors 7。

### 6.3 阶段 2 验证
since ✅ sourceEventIds ✅ 多值 predicate add ✅ State-auth 隔离 ✅

### 6.4 阶段 3 说明
未完成完整 Prompt 抓包，由 S1.5-fix 真实提取验证替代。Vector 召回已工作：`[Horae Vector] === 最终合并: 2 条 ===`。

---

## 7. 历史已知问题（已由 S1.5-fix 修复）

- Bug 1 source 字段覆盖：bc66c34 ✅
- Bug 2 处境 predicate 过度提取：bc66c34 ✅
- 历史数据：tools/retire-situation-facts.console.js 一次性迁移 ✅

当前已知问题：无。

---

## 8. 当前阶段

S1.5-fix 已完成并 push，运行端已同步。

下一站：B3 · 角色卡投影。开始前先做架构调查（不写代码）：
1. 角色卡字段来源
2. 当前 RPG UI 投影链路
3. StateStore / FactStore / Character Card 职责边界

---

## 9. 当前测试存档

问道长生0.9（已决定废弃，正式玩换新存档）。

状态：autoSummaries 8；facts 44；summaryVectors +1；threadVectors +2。

新存档后需重采：阶段 1 基线、阶段 2 提取验证、阶段 3 Prompt 注入验证。

---

## 10. 当前冻结事项

B3 进入实现前保持冻结：Fact schema / Vector DB version / Prompt 注入顺序 / memory layer / recall 逻辑。

五层各自主人，不合并职责：

| 层 | 主人 | 不负责 |
|---|---|---|
| State | StateStore | 历史、事实、摘要 |
| Facts | FactStore | 状态本身、事件流水 |
| Threads | ThreadStore | 已完成事件、状态 |
| Narrative | autoSummaries | 结构化事实、精确状态 |
| Vector | summaryVectors / threadVectors | 事实提取、状态提交 |

---

## 11. 下一步开发路线

- 第一阶段 A 测收尾：✅ 完成
- 第二阶段 S1.5-fix：✅ 完成 bc66c34
- 第三阶段 B3 · 角色卡投影：角色卡（灵根/体质/天赋/隐藏资质）进入 RPG UI；先架构调查，再定方案

后续：Vector ↔ Fact evidence mapping、Agenda ↔ Thread、Narrative L2 完善、Migration 版本管理、transactionId 事务一致性、性能测试。

---

## 12. 接手者第一步

B3 调研前不要改代码。

1. 确认 HEAD = a4dc0e0
2. 确认运行端与源码一致：`node tools/deploy-s15-fix.mjs` 应报 identical
3. 阅读 tools/retire-situation-facts.console.js
4. 进入 B3 调研：角色卡字段来源 / RPG UI 投影链路 / 三层职责边界
5. 输出分析结果再决定实现方案

---

## 13. 最终状态总结

S1.1c ~ S1.5-fix、S1.6、a4dc0e0 已全部完成并 push。

系统已具备：修仙状态系统、事件流水、长期事实、未完成事务、自动摘要、Vector 召回、Delta RPG 协议、State/Facts 分离。

A 测阶段 1、2 通过；阶段 3 主动跳过；S1.5-fix 真实验证通过。

已知问题：无。下一步：B3 调研。
