# Horae Identity · Discovery 状态机设计（P6.1）

**日期**：2026-09-30  
**状态**：设计稿待 review，P6.2 才写代码  
**前置**：P1 ~ P5.2 已完成

---

## 1. 目标

P1 ~ P5 完成的是静态展示链路：

    identityStore → identityView → identityGmApi → Prompt

缺动态揭示状态机：

- `discovery` 从建表起是空占位，从未被写过
- `revealedAt` 只由 `gm.reveal()` 手动写
- `hidden → discoverable → revealed` 无触发机制

P6 补的：

    hidden / discoverable
            ↓ 触发条件满足
        discover() / reveal()
            ↓
        AI 看到 value（受限）

**P6.1 只定义，不实现。**

---

## 2. 字段职责表

| 字段 | 职责 | 值域 | 谁写 |
|---|---|---|---|
| `visibility` | 设计者决定的目标可见范围 | `public` / `hidden` / `discoverable` / `gmOnly` | 设计者 / GM |
| `discovery` | 声明式发现路径，不代表已发现 | `null` 或结构化对象 | 设计者 + 程序 |
| `revealedAt` | 最终揭示状态：内容是否已知 | `null` 或 `{ iso, story }` | 程序 |

关键区分：

- `visibility` 回答「允许被发现吗」
- `discovery` 回答「怎么被发现」
- `discoveredAt` 回答「已经知道存在了吗」
- `revealedAt` 回答「已经知道内容了吗」

四态递进，不是 boolean。

---

## 3. visibility 四值语义（沿用 P4.3）

| 值 | 语义 | AI 输出（未 reveal） | AI 输出（已 reveal） |
|---|---|---|---|
| `public` | 直接公开 | `value` | `value` |
| `hidden` | 隐藏设定，不提供发现路径 | `[隐藏{label}]` | `value` |
| `discoverable` | 设计上允许发现，但尚未揭示 | `[隐藏{label}]` | `value` |
| `gmOnly` | 仅 GM 可见，永不进 AI Prompt | 不输出 | 不输出 |

`hidden` 与 `discoverable` 在 AI 视角下输出行为相同（都占位）。

区别在设计意图：

- `hidden` = 不打算让人发现（除非 GM 强制 reveal）
- `discoverable` = 有合理发现路径（P6.3 挂触发器）

这个区别体现在触发系统层（P6.3），不体现在 View 层（P4.3 已实现）。

---

## 4. discovery schema

`discovery` 是结构化对象，禁止裸字符串。

### 4.1 通用结构

    discovery: {
        type: 'condition' | 'event' | 'item' | 'npc' | null,
        trigger: string | null,
        requirement: object | null,
        progress: number,
        discoveredAt: null | { iso, story },
        meta: object,
    }

### 4.2 各 type 示例

condition（条件触发）：

    discovery: {
        type: 'condition',
        trigger: 'spiritual_sense',
        requirement: { senseRealm: '神识化形' },
        progress: 0,
        discoveredAt: null,
    }

event（剧情事件触发）：

    discovery: {
        type: 'event',
        eventId: 'inspect_unknown_vein',
        progress: 0,
        discoveredAt: null,
    }

item（物品触发）：

    discovery: {
        type: 'item',
        itemId: '天机镜',
        requirement: { minUses: 1 },
        progress: 0,
        discoveredAt: null,
    }

npc（NPC 判定触发）：

    discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: 60 },
        progress: 0,
        discoveredAt: null,
    }

无发现路径（hidden 或 gmOnly 默认）：

    discovery: null

---

## 5. 状态转移图

    ┌─────────────────┐
    │ visibility      │
    │ = public        │  → AI 输出 value
    └─────────────────┘

    ┌─────────────────┐
    │ visibility      │
    │ = gmOnly        │  → AI 永不输出（View 层挡）
    └─────────────────┘

    ┌─────────────────┐
    │ visibility      │
    │ = hidden        │
    └────────┬────────┘
             │ 无 discover 路径
             │ GM 强制 reveal()
             ↓
        [revealedAt 写入]
             ↓
        AI 输出 value

    ┌─────────────────┐
    │ visibility      │
    │ = discoverable  │
    └────────┬────────┘
             │ discovery 存在
             ↓
        [discoveredAt = null]
        AI 输出 [隐藏{label}]
             │ 触发条件满足
             │ (P6.3 调 discover())
             ↓
        [discoveredAt 写入]
        AI 仍输出 [隐藏{label}]
             │ 进一步条件满足
             │ 程序调 reveal()
             ↓
        [revealedAt 写入]
        AI 输出 value

关键点：

- `discover()` 不改变 AI 视角输出（仍占位），只标记「知道存在」
- `reveal()` 才让 AI 看到 value
- `hidden` 与 `discoverable` 的区别只在触发路径

---

## 6. 三视角矩阵

| visibility | revealedAt | Player View | AI View | GM View |
|---|---|---|---|---|
| `public` | — | display 优先，无则 value | value | value |
| `hidden` | null | 不显示 | `[隐藏{label}]` | value |
| `hidden` | 有 | display 优先，无则 value | value | value |
| `discoverable` | null + discoveredAt=null | 不显示 | `[隐藏{label}]` | value |
| `discoverable` | null + discoveredAt 写入 | 待定（见 P6.5） | `[隐藏{label}]` | value |
| `discoverable` | 有 | display 优先，无则 value | value | value |
| `gmOnly` | — | 不显示 | 不输出 | value |

「待定」说明：`discoverable` + 已 discover 未 reveal 时，玩家 UI 是否显示「发现线索」提示？留给 **P6.5 value/display 视角分离**。

AI 视角核心原则：

> AI 是天道视角，知道 hidden 的存在，但不泄露真实秘密。  
> 未 revealedAt 前一律占位。P4.3 已实现此规则。

---

## 7. discover / reveal API 语义

### 7.1 `gm.discover(entryId, info)`

语义：知道存在，但不知道内容。

效果：

- 写 `discovery.discoveredAt = { iso, story }`
- 不改 `revealedAt` / `visibility`
- AI 视角输出不变（仍占位）
- 更新 `updatedAt`

参数：

    gm.discover('e_legacy_spiritRoot_0', {
        story: '342年12月24日',
    })

幂等：已 discover 再调 → 只更新 `updatedAt`。

### 7.2 `gm.reveal(entryId, opts)`（P6.2 升级）

语义：知道具体内容。

效果：

- 写 `revealedAt = { iso, story }`
- 不改 `visibility` / `discovery`
- AI 视角输出切到 `value`
- 更新 `updatedAt`

参数：

    gm.reveal('e_legacy_spiritRoot_0', {
        story: '342年12月24日',
    })

幂等：已 reveal 再调 → 只更新 `updatedAt`。

### 7.3 语义对比

| 操作 | 改什么 | AI 视角变化 | 使用场景 |
|---|---|---|---|
| `discover()` | `discovery.discoveredAt` | 无变化 | 发现异常线索、NPC 透露半句 |
| `reveal()` | `revealedAt` | 切到 value | 剧情揭示真相 |
| `hide()` | `visibility='hidden'` | 切到占位 | 撤回已公开的信息 |
| `set({ visibility })` | `visibility` | 依 revealedAt | 设计期调整 |

### 7.4 P6 范围外的 API

- `undiscover()` / `unreveal()`：P6 不做
- `gm.grant()` 批量揭示：P6 不做
- `gm.autoDiscover()`：P6.3 单独做

---

## 8. 触发系统边界（P6.3 才实现）

    触发来源（程序判断）   →  调 API        →   AI 描述
    ─────────────────────────────────────────────────
    神识境界达标           →  discover()     →  「我似乎感应到……」
    持有天机镜             →  reveal()       →  「镜中映出真相」
    剧情事件 inspect_xxx   →  discover()     →  「你察觉到异常」
    NPC 主动告知           →  reveal()       →  「他低声说……」
    GM Console 手动        →  discover/reveal →  AI 收到新状态后描述

禁止：

- AI 主动调 `discover()` / `reveal()`
- AI 决定「玩家已经发现真相」
- AI 自己写 `revealedAt`

允许：

- AI 通过 `horae` 标签提交事件
- 程序读事件，判断是否满足 entry 的 discovery 条件
- 满足则调 `discover()` / `reveal()`
- AI 下一轮收到新状态后描述结果

---

## 9. 与 P1 ~ P5 的对应

| P 阶段 | 已实现 | P6 依赖 |
|---|---|---|
| P1 | `identityStore` 建表 + `discovery` / `revealedAt` 字段 | 无 |
| P2 | 三视角 View 骨架 | 无 |
| P3 | `identityGmApi` 骨架 + `reveal()` 现有实现 | P6.2 升级 |
| P4.1~P4.2 | migration + 懒迁移 | 无 |
| P4.3 | `renderIdentityAiEntries` visibility 语义 | 无 |
| P4.4 | `hiddenKeywords` 动态化 | 无 |
| P5 | `renderIdentityAiSection` 注入 Prompt | 无 |
| P5.1 | 删 horaeManager 旧 identity 注入 | 无 |
| P5.2 | 扩 deploy `REL_FILES` | 无 |

P6.2 改动清单（预告）：

- `core/memory/identityGmApi.js`：新增 `discover()`，升级 `reveal()`，更新 `help()`
- `tools/test-p6.2-gm-discover.mjs`

P6.3 改动清单（预告）：

- 事件监听（`horae_meta.events` 触发 discovery）
- 条件评估（境界 / 物品 / 好感度）
- 新增模块 `core/memory/identityDiscovery.js`
- 只读 identity + 写 discovery/revealedAt，不碰 view / store 结构

---

## 10. 不在 P6 范围

| 议题 | 归属 |
|---|---|
| `value` / `display` / `aiValue` 视角分离 | P6.5 |
| NPC 独立认知系统 | P7 |
| 修为境界 / 六艺 独立管理 | P8 |
| Prompt 结构重排 | 不在计划 |
| `visibility` 语义变更 | 不做，保持 P4.3 |

---

## 11. 待决问题（review 时确认）

1. `discoverable` + `discoveredAt` 写入后，玩家 UI 是否显示「发现线索」提示？→ 推荐留给 P6.5
2. `discovery.type` 是否要开放扩展（`type: 'custom'` + `meta`）？→ 推荐保留 `meta` 字段
3. `progress` 字段是否需要（0~100 渐进累积）？→ 推荐保留接口，P6.2 只读写不消费
4. `reveal()` 后是否自动清空 `discovery`？→ 推荐保留，`discovery` 是历史记录
5. GM 手动 `set({ visibility: 'hidden' })` 覆盖 `discoverable` 时，`discovery` 是否保留？→ 推荐保留，两字段独立

---

## 12. 版本

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-30 | 初稿（P6.1） |

---

## 13. P6.3 实现边界

P6.3 首版只实现 `condition` 类型，其余类型 schema 保留供未来扩展。

### 当前实现

| 类型 | 数据源 | 支持 |
|---|---|---|
| `condition` | state（rpg / affection / items） | ✅ |

### condition 支持的 4 个 key

| key | 数据源 | 语义 |
|---|---|---|
| `senseRealm` | `state.rpg.spirit.tier` | 神识段位达到或超过阈值（蒙昧 < 清明 < 凝照 < 洞玄 < 明心 < 太虚） |
| `realm` | `state.rpg.realm.name` | 大境界名完全匹配 |
| `affinityMin` | `state.affection[npc]` | `{ npc, min }` 好感度 ≥ min |
| `itemHeld` | `state.items[name]` | 持有某物品（存在即满足） |

### 已实现类型（P7 补充）

- `npc`：P7.4 已实现（依赖 P7.2 npcKnowledge 模块）
  - 满足 requirement 后只写 `npcKnowledge[npcId][entryId]`
  - **不写** `entry.discovery.discoveredAt`（与 `condition` 正交）
  - 与 P6.1 §4.2 预留 schema 一致

### 暂缓类型（schema 保留）

- `event`：需 AI 输出结构化 eventId，牵动 Prompt / 解析
- `item`：需 item 事件钩子

### 触发时机

`CHARACTER_MESSAGE_RENDERED` 后，`onMessageReceived` 里 state 结算完成后。

### 落盘

只改内存，依赖 Horae 常规 `saveChat()`。

### 编排

```
condition evaluator (evaluateEntry / evaluateAll)
        ↓
action list（不直接改 identity）
        ↓
runDiscovery 编排
        ↓
applyDiscover / applyReveal / applyNpcKnow（唯一状态修改入口）
```

GM API `discover()` / `reveal()` 也调用同一套 `apply*` 函数。
