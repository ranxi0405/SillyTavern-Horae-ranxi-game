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

**封存 + 实际游玩验证阶段（v0.2-refactor-complete）**

核心架构重构已完成，当前版本达到稳定基线。

**暂停继续堆功能**，转为：
- 实际游玩《问道长生》
- 参照《觅长生》《鬼谷八荒》等修仙游戏
- 以玩家视角记录：真正有趣的机制 / 重复疲劳的机制 / 值得吸收 / 应该避免
- 基于实际体验决定下一轮开发方向

所有新功能开发暂停，仅做阻塞性 bug 修复。

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
- **Facts 注入 Prompt**：generateCompactPrompt 尾部追加 [已知事实] 段
  - public：直接列出（· 主体 | 属性 = 值）
  - hidden：[部分知情] 前缀
  - gm_only：[仅天道] 前缀
  - 实测：注入位置正确，5 条 facts 完整显示

**Thread 层**
- ThreadStore v0.1：长期未完成事务结构化存储
  - 类型：quest / npc_goal / world_event / mystery / appointment
  - 状态：open / progressing / blocked / completed / failed / abandoned
  - 优先级：low / normal / high / critical
  - 幂等：同 type + title 相似 → 更新（不新建）
  - participants 并集，relatedFactIds 并集
  - visibility 复用 Fact 机制
- 与 Fact 合并提取：一次 AI 调用返回 <horaefacts> + <horaethreads>
- 注入 [未完成事务] 段：按 priority 排序，显示 type/status/deadline 标签
- Agenda 与 Thread 共存：Agenda 是 UI 投影，Thread 是后端真源

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


### 2026-09-28 ~ 2026-09-29

#### S1.5-fix · Commit bc66c34

**类型**：fix

**改动原因**：Fact 生产链存在两个非阻塞问题——source 字段被解析默认值覆盖、处境 predicate 过度提取短期状态。

**Bug 1 · source 字段覆盖**

- 位置：index.js 的 _enrichFactsWithSource
- 原因：source: f.source || sourceTag 优先取解析阶段默认值 factExtraction
- 修改前：source: f.source || sourceTag,
- 修改后：source: sourceTag,
- 效果：新 fact 的 source 正确显示 summary:<summaryId>

**Bug 2 · 处境 predicate 过度提取**

- 位置：index.js 的 fact 提取 prompt predicate 推荐词表
- 原因：短期状态（"大比在即""危机感加剧"等）写入长期 FactStore
- 修改前：词表含"处境"
- 修改后：从词表移除"处境"
- 效果：新提取不再产生 predicate=处境

**历史数据迁移**

- 脚本：tools/retire-situation-facts.console.js
- 方式：active 处境 fact → invalidated，保留溯源字段
- 结果：问道长生0.9 迁移 11 条

**涉及文件**：index.js, tools/patch-s15-fix.mjs, tools/deploy-s15-fix.mjs

**验证**：2026-09-28 新提取 4 条 fact，source 全部为 summary:as_1790601552224，predicate=处境 数量为 0

---

#### S1.5-fix 归档 · Commit a4dc0e0

**类型**：chore

**改动原因**：将 Console 迁移脚本归档进仓库，供将来复用。

**涉及文件**：tools/retire-situation-facts.console.js

---

#### B3a · Commit 10754aa

**类型**：feat

**改动原因**：角色卡中已有 identity 数据，但代码中没有读取链路，HUD / Prompt 无法使用。

**新增**

- core/memory/identityStore.js：identity 数据结构 + 校验 + 规范化
- index.js 新增 5 个函数：_readCardIdentity / _writeCardIdentity / _clearCardIdentity / _cacheIdentityToChat / _loadIdentityFromCard
- CHAT_CHANGED 事件钩子 + 初始化调用

**修改前**：无 identity 读取链路，卡上数据不可见

**修改后**：CHAT_CHANGED → _loadIdentityFromCard() → _readCardIdentity() → _cacheIdentityToChat()

**涉及文件**：core/memory/identityStore.js（新）, index.js, tools/patch-b3a-identity.mjs, tools/deploy-b3a-identity.mjs

---

#### B3b · Commit 1eb16d7

**类型**：feat

**改动原因**：identity 数据已缓存，但尚未注入 Prompt，AI 看不到角色固有设定。

**新增**

- core/horaeManager.js 新增 _generateIdentitySection()
- Prompt 拼装处在 _generateFactsSection 之前插入 identity 段
- import isIdentityEmpty + sanitizeHiddenKeywords

**修改前**：Prompt 中无 [角色固有设定] 段

**修改后**：

[角色固有设定]
· 灵根 = [隐藏灵根]
· 体质 = [隐藏体质]
· 仙姿 = 清灵脱俗
· 天赋 = 过目不忘 / 剑心通明
· 出身 = 东洲青岳凡人家庭出身

**涉及文件**：core/horaeManager.js, tools/patch-b3b-identity.mjs, tools/deploy-b3b-identity.mjs

---

#### B3c-1 · Commit 6b7488c

**类型**：fix

**改动原因**：merge-attributes POST 请求缺少 CSRF headers，全部返回 403，导致 identity 无法写入角色卡。

**修改前**：headers: { 'Content-Type': 'application/json' },（5 处）

**修改后**：headers: getRequestHeaders(),（5 处）

**新增 import**：getRequestHeaders from '/script.js'

**涉及文件**：index.js, tools/patch-b3c1-csrf.mjs, tools/deploy-b3c1-csrf.mjs

**验证**：写卡返回 200，刷新后 _loadIdentityFromCard 从卡读成功

---

#### B3c-2 · Commit b969825

**类型**：feat

**改动原因**：identity 数据已能读取和注入 Prompt，但 RPG tab 中没有可视化展示。

**新增**

- assets/templates/drawer.html：新增 #horae-rpg-identity-area 区块
- index.js 新增 renderIdentityPanel()，挂入 updateRpgDisplay()
- locales/zh-CN.json + en.json：新增 7 个 identity i18n key

**修改前**：RPG tab 无身份面板

**修改后**：RPG tab 显示"角色固有设定"只读面板

**涉及文件**：index.js, assets/templates/drawer.html, locales/zh-CN.json, locales/en.json, tools/patch-b3c2-ui.mjs, tools/deploy-b3c2-ui.mjs

---

#### B3c-2b · Commit 1735191

**类型**：feat

**改动原因**：需要支持"真实值 / 伪装值"分离——UI 显示伪装值，Prompt 使用真实值。

**schema 变更**

- 新增字段：xianZi（仙姿）、spiritRootDisplay、constitutionDisplay
- arts 保留字段，默认空数组，UI / Prompt 不显示

**UI 渲染**

- renderIdentityPanel：spiritRootDisplay || spiritRoot，constitutionDisplay || constitution
- Prompt 使用真实值 + sanitize

**修改前**：identity 只有真实值，无 display 字段

**修改后**：

{
  "spiritRoot": "无界灵根",
  "spiritRootDisplay": "四系伪灵根",
  "constitution": "无界道体",
  "constitutionDisplay": "凡体",
  "xianZi": "清灵脱俗"
}

**涉及文件**：core/memory/identityStore.js, core/horaeManager.js, index.js, locales/zh-CN.json, locales/en.json, tools/patch-b3c2b-identity.mjs, tools/deploy-b3c2b-identity.mjs

---

#### B3c-2c · Commit c3903a3

**类型**：fix

**改动原因**：AI 用 skill:灵植|二品|... 输出六艺，parser 把它当普通 skill 塞进 rpg.skills，导致六艺出现在"其他"分组。

**L1 Parser 层**

- 新增 _CRAFT_NAMES + _isCraftName
- 两处 _isCraftCat 分支后追加 _isCraftName 检查
- 命中六艺 canonical key → 转进 rpg.arts

**L2 Render 层**

- _groupSkillsByCategory 跳过 name 命中六艺的项

**L3 迁移**

- tools/migrate-b3c2c-craft-from-skills.console.js：把历史 skills 里的六艺项迁到 arts

**Q1 扩展**

- _extractCraftXp 兼容裸数字（280 → xp=280）

**修改前**：skill:灵植|二品|280 → skills 里出现 category: other

**修改后**：skill:灵植|二品|280 → arts[owner][灵植] = { tier: '二品', xp: 280 }

**涉及文件**：core/horaeManager.js, index.js, tools/patch-b3c2c-craft-skill.mjs, tools/patch-b3c2c2-craft-xp.mjs, tools/migrate-b3c2c-craft-from-skills.console.js

---

#### B3d · Commit dacdfee

**类型**：feat

**改动原因**：主角的灵根/体质/天赋等已由 identity 管理，但 fact extraction 仍会重复提取，导致 Fact 和 identity 双主。

**L1 Prompt 层**

- 新增【主角 identity-owned predicate —— 永不提取】段
- 移除矛盾示例 ✅ 冉汐|灵根|杂灵根
- 新增 NPC 反向示例

**L2 Parser 层**

- 新增 IDENTITY_OWNED_PREDICATES Set
- 新增 _isMainCharacterSubject() helper
- parser 层硬过滤：仅对主角生效

**修改前**：冉汐|灵根|杂灵根 可进入 FactStore

**修改后**：主角灵根/体质/天赋/血脉/仙姿 被拦截；NPC 不受影响

**涉及文件**：index.js, tools/patch-b3d-identity-fact.mjs, tools/deploy-b3d-identity-fact.mjs

---

#### W1 · Commit 8f33295

**类型**：feat

**改动原因**：世界书 uid=4 的灵根体系缺少五行灵根描述，AI 不知道"五行灵根属于正常灵根"。

**修改前**：正常灵根体系包括伪灵根、真灵根、地灵根、天灵根、变异灵根。

**修改后**：补充五行灵根体系，说明五系/四系=伪灵根、三系=中等、双系=较好、单系=优秀

**涉及文件**：worldbook-v0.9.json, tools/patch-w1-worldbook.mjs

---

#### W1b · Commit 84de1e2

**类型**：fix

**改动原因**：W1 的灵根描述措辞混乱，分类顺序与修仙界惯例不符。

**修改前**：五行灵根属于正常灵根体系，按属性数量与纯度划分资质：五系、四系…

**修改后**：灵根由五行属性（金、木、水、火、土）构成…伪灵根：具备四种或五种…真灵根：具备两种或三种…地灵根…天灵根…变异灵根…

**涉及文件**：worldbook-v0.9.json, tools/patch-w1b-worldbook.mjs, tools/deploy-w1-worldbook.mjs

---

#### B3c-3 · Commit 78b179a

**类型**：feat

**改动原因**：RPG tab 身份面板已渲染，但 HUD 行中缺少 identity 胶囊。

**新增**

- _getIdentityForCharacter(name) helper
- _buildCapsulesHtml(rpg, options) 扩展签名
- identity 独立容器 .horae-rpg-hud-identity-tags
- 两处 caller（RPG tab 卡片头部 + HUD 行 header）传参
- CSS：.horae-rpg-hud-identity-chip 系列
- i18n：3 个新 key

**修改前**：HUD 只有年龄/境界/神识胶囊

**修改后**：HUD 追加 灵根/体质/仙姿 胶囊，独立容器，NPC 不显示

**涉及文件**：index.js, assets/styles/style.css, locales/zh-CN.json, locales/en.json, tools/patch-b3c3-hud-identity.mjs, tools/deploy-b3c3-hud-identity.mjs

---

#### B3c-2c-visual-1 · Commit 1c6d411 + db6bf39

**类型**：feat

**改动原因**：RPG tab 总览/六艺/身份面板全是裸文本，无对齐、无图标、无视觉层次。

**总览 tab**

- 修为行改为 .horae-rpg-card + .horae-rpg-field-row
- 属性行加图标映射（资质=medal / 悟性=spa / 身灵=fist-raised / 道心=yin-yang / 仙缘=feather）

**六艺 tab**

- 加图标 + 进度条 + 段位徽章
- 图标：炼丹=flask / 炼器=hammer / 符箓=scroll / 阵法=shapes / 御兽=paw / 灵植=seedling
- _ART_GRADE_RANGES 上限改为整数（20→20, 99→100, …）

**身份面板**

- 加图标（灵根=seedling / 体质=shield / 仙姿=gem / 天赋=star / 血脉=dna / 出身=house）
- 血脉图标红色

**涉及文件**：index.js, assets/styles/style.css, tools/patch-b3c2c-visual1.mjs, tools/patch-b3c2c-visual1b-ranges.mjs, tools/deploy-b3c2c-visual1.mjs

---

#### W2 · Commit 1ae986d

**类型**：fix

**改动原因**：代码 _ART_GRADE_RANGES 已改为整数上限，但世界书 uid=6 仍是旧值，AI 和 UI 认知不一致。

**修改前**：

学徒 0~19
一品 20~99
二品 100~499
三品 500~2999
四品 3000~7999
五品 8000~29999
六品 30000+

**修改后**：

学徒 0~20
一品 21~100
二品 101~500
三品 501~3000
四品 3001~8000
五品 8001~30000
六品 30001+

**涉及文件**：worldbook-v0.9.json, tools/patch-w2-worldbook-arts.mjs

---

#### B3c-2c-visual-2 · Commit feec2eb

**类型**：feat

**改动原因**：六艺进度条颜色不随段位变，且六品无上限导致进度条永远 100%。

**数值表重置**

学徒       0-100
一品       101-500
二品       501-2000
三品       2001-6000
四品       6001-12000
五品       12001-22000
六品       22001-36000

**上限逻辑**

- 新增 _ART_GRADE_CAP = 36000
- xp >= 36000 后：进度条 100% + 不显示 /max
- 丹道三阶：满条 + xp（无 /max）

**tier 容错**

- _normalizeTier：丹道·天成 / 丹道 天成 / 丹道天成 / 丹道-天成 统一
- _resolveTierClass：tier → CSS class 后缀

**色阶**

- 学徒=灰蓝 / 一品=绿 / 二品=蓝 / 三品=紫 / 四品=金 / 五品=橙红 / 六品=红
- 丹道·天成=金渐变 / 丹道·化境=紫金渐变 / 丹道·无极=白金渐变

**涉及文件**：index.js, assets/styles/style.css, tools/patch-b3c2c-visual2-artscolor.mjs

---

#### W4 · Commit e39ba88

**类型**：fix

**改动原因**：世界书存在边界表述模糊——"登仙之后"可能被 AI 理解为刚入登仙就触发飞升；"筑基之后形成道基"可能被理解为筑基圆满才形成道基；uid=2 飞升段与 uid=12 独立飞升词条重复。

**P1 · 删 飞升 无上限 行**

- uid=2 气血/灵力表末尾
- 修改前：登仙 30000 / 30000 换行 飞升 无上限
- 修改后：登仙 30000 / 30000

**P2 · 删整段飞升机制**

- uid=2 末尾从 飞升机制： 到 飞升与否、成败，全由玩家行动与判定决定。
- 保留 uid=12 独立飞升词条

**P3 · 登仙之后 → 登仙圆满之后**

- uid=2：登仙之后不再属于普通境界提升
- 修改后：登仙圆满之后不再属于普通境界提升

**P4 · 筑基之后形成道基 → 突破筑基后形成道基**

- uid=7：明确"突破到筑基"那一刻形成道基，非筑基圆满

**P5 · 登仙之后，修士面临 → 登仙圆满之后，修士面临**

- uid=12：与 P3 一致

**涉及文件**：worldbook-v0.9.json, tools/patch-w4-worldbook-boundary-fix.mjs

### 2026-10-02 ~ 2026-10-03

**本阶段主题**：从"核心重构阶段"过渡到"稳定基线 + 封存"。

---

#### TODO-A · ST Author's Note 泄漏隐藏真相

- **状态**：✅ 已关闭
- **commit**：8f3cbf5（仅落文档 ISSUES.md）
- **现象**：`horaeDebugChat[2]` 出现 934 字《问道长生》作者注释，含"无界灵根 / 无界道体"字面值，AI 在玩家可见正文泄漏
- **根因**：ST 原生 Author's Note，`chat_metadata.note_prompt` 显式包含隐藏真相字面值；`note_interval=1 / note_position=0 / note_role=0` → 每轮作为独立 system 消息常驻注入
- **泄漏链**：`chat_metadata.note_prompt` → `authors-note.js getAuthorsNote()` → `script.js` AN 注入 → `dbg[2]` → 主模型 → 玩家可见正文
- **已排除**：`char.*` 字段 / `character_book` / World Info / Horae 源码硬编码 / P5 `[角色固有设定]` / P7.5.1 `[NPC 认知]`
- **修复**：仅重写当前聊天 `note_prompt` 的【隐藏设定】段
  - 移除字面值 `无界灵根` / `无界道体`
  - 移除与 `identity.spiritRoot.display` 冲突的具体值 `"杂灵根"`
  - 保留全部行为约束（认知隔离 / 测灵不暴露 / NPC 不得提及 / 异常仅作线索）
- **未改动**：Horae 代码 / World Info / Identity schema / P7.5.1 / NPC Knowledge
- **无 Git 代码改动**：`chat_metadata` 属运行时数据

#### TODO-C · deploy REL_FILES 补齐

- **状态**：✅ 已关闭
- **commit**：ccc1724
- **现象**：`tools/deploy-p3-mount.mjs` 的 `REL_FILES` 缺 `identityNpcPrompt.js` 与 `directorStore.js`
- **修复**：补齐两行到 REL_FILES
- **改动**：单文件 +2 行

#### TODO-E · RPG `<horaee?rpg>` typo 兼容

- **状态**：✅ 已关闭
- **commit**：6f719df
- **现象**：AI 偶发把 `<horaerpg>`（8 字符）写成 `<horaerpg>`（9 字符），parser 严格匹配只认 8 字符，导致 `_rpgChanges` 未生成，RPG State 不更新
- **根因**：模型原始输出 typo（swipe[0] 层确认），非后处理、非 parser bug、非 Prompt 内容错误
- **修复**：`core/horaeManager.js` 单行，`/<horaerpg>/` → `/<horaee?rpg>/`
- **协议语义**：正式协议仍为 `<horaerpg>`；`<horaerpg>` 仅作历史/异常输入兼容
- **修复范围**：收敛为 1 处 1 行
- **未改动**：Prompt / vector / 摘要 / index.js / injectHoraeRpgLinePatch / _stripHoraeAnalysisInput
- **未做**：后处理替换 / 历史正文改写

**TODO-E 最终验收结果**

- ✅ `<horaee?rpg>` typo 可被 parser 兼容（单测 5/5 通过）
- ✅ `_rpgChanges` 正确生成（msg 215: `bars.冉汐 = { hp:[260,null], mp:[240,null], sp:[285,null] }`）
- ✅ replay/rebuild 可恢复历史 RPG 状态
- ✅ `getRpgState()` / HUD 状态正确（msg 215 恢复为 hp=[260,300]/mp=[240,300]/sp=[285,285]）
- ✅ `<horaeevent>` 不受影响
- ✅ 原始 `message.mes` 未被改写（typo 保留，码点级确认）
- ✅ runtime 已正确部署（source/runtime hash 一致 `d8678f...`）
- ✅ 未修改 Prompt / vector / 摘要 / 后处理

---

**本阶段结束基线**

- **HEAD**：`dd2facb`
- **运行目录**：`I:/AI/SillyTavern-1.19.0/public/scripts/extensions/third-party/SillyTavern-Horae` 已部署新代码
- **核心重构阶段正式结束**，下一阶段为"封存 + 实际游玩验证"
- **封存 Tag**：`v0.2-refactor-complete`


## 六、未完成事项

**本阶段封存时遗留（不阻塞封存）**

- Vector 系统当前是独立层，未与 FactStore 打通
- P7.5.1 真实 NPC E2E 尚未验证（需独立 fixture，禁止污染真实存档）
- TODO-B：`characters_present` 偶发 `characters:A|B|C` 形态污染（独立 parser/data-format 问题）
- TODO-D（待立）：`factStore.js` / `stateStore.js` / `threadStore.js` 是否纳入 `REL_FILES` 的评估

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
