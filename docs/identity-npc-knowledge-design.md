# Horae Identity · NPC Knowledge 设计（P7.1）

**日期**：2026-09-30
**状态**：设计稿待 review，P7.2 才写代码
**前置**：P1 ~ P6.3d 已完成（Store / View / GM API / Discovery / Prompt / Deploy 全链路）

---

## 1. 目标

P1 ~ P6 完成的是「**真相如何被不同视角过滤**」：

    identityStore → identityView → identityGmApi → identityDiscovery → Prompt

但视角只做了 Player / AI / GM 三种。缺第四种：**NPC**。

现状问题：

- `state.npcs[name]` 只有外貌/性格/关系/年龄等描述字段
- 没有任何"某 NPC 知道某 identity entry"的字段
- 全仓搜 `npcKnowledge` / `knownBy` / `_known` 为空

后果：

- NPC 若出现在 Prompt 里，AI 无法区分"这个 NPC 该知道什么"
- `discovery.type: 'npc'` schema（P6.1 §4.2）无载体
- 未来 NPC 独立认知系统无起点

P7 补的就是 **NPC 认知层**：

    某个 NPC
        ↓
    knows / does not know
        ↓
    某条 identity entry
        ↓
    Prompt 渲染时按 NPC 视角过滤

**P7.1 只定义**，不实现。

---

## 2. 核心原则

四条不可违反：

1. **`identity` = 真相**  
   identity.entries 是唯一事实来源。没有任何第二套 identity。

2. **`npcKnowledge` = NPC 对真相的认知权限记录**  
   它**不是** identity 的副本，**不是** identity 的分身，**不是**新的 value 存储。  
   它只记录「某 NPC 是否知道某 entry 的存在」以及「何时、以何种方式知道」。

3. **`identityView` = 根据视角过滤真相**  
   Player / AI / GM / NPC 四视角在 View 层统一实现。  
   不改 identity，不改 npcKnowledge，只读。

4. **`Prompt` = 最终渲染结果**  
   Prompt 接收 View 的输出，不直接读 raw identity，也不直接读 raw npcKnowledge。

一句话：

    identity         = 真相
    npcKnowledge     = NPC 对真相的认知记录
    identityView     = 根据视角过滤真相
    Prompt           = 最终渲染

---

## 3. 数据结构

### 3.1 挂载位置

    chat[0].horae_meta.npcKnowledge

与 `chat[0].horae_meta.identity` / `facts` / `threads` 同级。

**不挂** `state.npcs[name]`，**不挂** 单条 `chat[i].horae_meta`。

理由：

- 与 identity / facts / threads 语义一致（chat 级全局状态）
- 不污染 `state.npcs` 的 merge 逻辑（`updatableFields` / `protectedFields` 是 AI 可写字段白名单）
- 认知是累积状态，不是每回合事件

### 3.2 结构

    chat[0].horae_meta.npcKnowledge = {
        'N016': {
            'e_legacy_spiritRoot_0': {
                known: true,
                source: 'npc_detected' | 'gm_manual' | 'witnessed' | 'informed',
                at: { iso, story },
                note: null,
            },
            'e_legacy_talent_0': { ... },
        },
        'N021': { ... },
    }

字段说明：

| 字段 | 类型 | 含义 |
|---|---|---|
| key1 | string | NPC 的 `_id`，形如 `'016'` 或 `'N016'`（统一存储格式，见 3.3） |
| key2 | string | identity entry 的 `id`，如 `'e_legacy_spiritRoot_0'` |
| `known` | boolean | NPC 是否已获得该 entry 的认知记录（具体看到"存在"还是真实 value，由 visibility / revealedAt / View 规则决定） |
| `source` | string | 认知来源分类，枚举见 3.4 |
| `at` | object | `{ iso, story }`，记录首次获知时间 |
| `note` | string \| null | 可选备注（自由文本，不影响过滤逻辑） |

### 3.3 npcId / entryId 索引规则

**npcId**

- 使用 NPC 的稳定 `_id`，形如 `'016'`（三位补零，与 `padItemId` 一致）
- **不**使用 NPC 名称作为主键（名称可能被 AI 改名或加别名）
- 存储时统一为**不带 `N` 前缀的裸数字字符串** `'016'`，展示时加 `N` 前缀
- 传入 `N016` / `016` 时统一 normalize 为 `'016'` 再存储，避免 `016` / `N016` 两套格式
- 若 NPC 无 `_id`（尚未分配）→ 该 NPC 的认知**不写入**，等分配后再写

**entryId**

- 使用 identity entry 的 `id`，如 `'e_legacy_spiritRoot_0'`
- 与 `identity.entries[i].id` 一致
- 若 entry 被 `gm.remove()` 删除，对应的 `npcKnowledge[*][entryId]` **保留为历史记录**（不主动清理）
- entryId 永不复用（`gm.remove()` 后新加 entry 会分配新 id）
- View 遇到 identity 中不存在的 entryId 时**直接忽略**，不报错

### 3.4 source 枚举

| value | 语义 | 触发者 |
|---|---|---|
| `'gm_manual'` | GM Console 手动标记 | `gm.npcKnow()` |
| `'npc_detected'` | discovery `type: 'npc'` 条件满足 | P7.4 自动 |
| `'witnessed'` | NPC 亲历事件（预留） | P7.5+ |
| `'informed'` | 由其他 NPC 转告（预留） | P7.5+ |

P7 只实现 `'gm_manual'` 与 `'npc_detected'`。  
`'witnessed'` / `'informed'` 为未来扩展预留，**枚举保留但不实现**。

---

## 4. 程序写入边界

### 4.1 唯一写入入口

    applyNpcKnow(entryId, npcId, opts)     // 写 npcKnowledge[npcId][entryId]
    applyNpcForget(entryId, npcId)         // 删 npcKnowledge[npcId][entryId]

由 `core/memory/npcKnowledge.js`（P7.2）导出，为唯一修改 `npcKnowledge` 的函数。

### 4.2 允许的调用方

| 调用方 | 使用场景 |
|---|---|
| `gm.npcKnow(npcId, entryId, opts)` | Console 手动调试 |
| `gm.npcForget(npcId, entryId)` | Console 手动调试 |
| `identityDiscovery.js` 的 `type: 'npc'` 分支 | P7.4 自动触发 |
| 未来 NPC 亲历事件 | P7.5+ |

### 4.3 禁止的调用方

- **AI** 不可直接写（AI 输出格式不变，`npcKnowledge` 不进入 `<horae>` 标签）
- **Prompt 层**不可写
- **identityView** 不可写（View 只读）
- **identityStore** 不负责修改 `npcKnowledge`（它管 identity 本体）

---

## 5. NPC 认知与 identity visibility 的关系

`visibility` 与 `npcKnowledge` 是两个**正交**维度：

| 维度 | 决定什么 | 变化时机 |
|---|---|---|
| `visibility` | 设计上**允许**谁知道 | 设计期（角色卡编辑 / GM 手动） |
| `npcKnowledge[*].known` | 该 NPC **实际**是否知道 | 运行时（触发条件满足后） |

举例：

    visibility = public
    → 所有人可见，npcKnowledge 无关（都被视为知道）

    visibility = hidden
    → 设计上隐藏
    → 但某 NPC 若 known = true，则该 NPC 可以看见 value

    visibility = discoverable
    → 设计上允许发现
    → 某 NPC 若 known = true，则该 NPC 知道「存在某隐藏设定」，
       但**不知道真实内容**，直到 revealedAt 写入

    visibility = gmOnly
    → NPC 永远不输出（即使 known = true 也不输出，gmOnly 优先级最高）

---

## 6. known 与 revealed 的区别

**这是 P7 最关键的概念区分。**

    known
      = NPC 已获得该 entry 的认知记录
      = 已建立"某 NPC 知道某 identity entry"的记录
      → 具体看到"存在"还是真实 value，
        由 visibility / revealedAt / identityView 规则决定
      ≠ known = true 就等于知道真实 value

    revealedAt
      = identity 层的全局揭示标记
      = 「该设定的真实内容已经公开」

两者关系：

| visibility | entry.revealedAt | npcKnowledge.known | NPC 视角输出 |
|---|---|---|---|
| `public` | — | — | value |
| `hidden` | null | false | 不输出 |
| `hidden` | null | true | **value**（NPC 已获得真实内容） |
| `hidden` | 有 | — | value（已公开） |
| `discoverable` | null | false | 不输出 |
| `discoverable` | null | true | **`[隐藏{label}]`**（知道存在，不知道内容） |
| `discoverable` | 有 | — | value |
| `gmOnly` | — | — | 不输出（即使 known=true） |

**核心约束**：

- `discoverable + known + 未 reveal` → 只能输出 `[隐藏{label}]` 占位
- **绝不能因为 `known = true` 就把真实 value 暴露给 NPC**
- `hidden + known` → 可以输出 value（这是"NPC 已获得真相"的路径）

---

## 7. D4 过滤矩阵（NPC 视角）

| visibility | revealedAt | npcKnowledge.known | 输出 |
|---|---|---|---|
| `public` | — | — | `value` |
| `hidden` | null | false | （不输出） |
| `hidden` | null | true | `value` |
| `hidden` | 有 | — | `value` |
| `discoverable` | null | false | （不输出） |
| `discoverable` | null | true | `[隐藏{label}]` |
| `discoverable` | 有 | — | `value` |
| `gmOnly` | — | — | （不输出） |

**优先级**：

1. `gmOnly` 最优先（永不输出）
2. `public` 其次（无需 known 即可见）
3. `revealedAt != null`（已公开真相）
4. `npcKnowledge.known = true`（NPC 私知）
5. 否则不输出

---

## 8. 与 P6 discovery 的接口关系

P6.1 §4.2 已预留：

    discovery: {
        type: 'npc',
        npcId: 'N016',
        requirement: { affinityMin: 60 },
    }

P7.4 已实现该类型。触发流程：

    1. discovery 评估（evaluateEntry）
       ↓
    2. 满足 requirement（如 affinityMin）
       ↓
    3. 调 applyNpcKnow(entryId, npcId)  // P7.4 唯一写入
       ↓
    4. 写 npcKnowledge[npcId][entryId].known = true

**注意**：

- `type: 'npc'` 满足后**只写 `npcKnowledge`**，**不写** `entry.discovery.discoveredAt`
- 这与 `type: 'condition'` 的全局发现路径**正交**：
  - `condition` 满足 → 写 `entry.discovery.discoveredAt`（全局）
  - `npc` 满足 → 写 `npcKnowledge[npcId][entryId]`（针对特定 NPC）
- 若某 entry 需要同时触发"全局发现 + NPC 私知"，应显式配置为两条独立规则
- 两者都走 `core/memory/npcKnowledge.js` 的 `applyNpcKnow`（唯一状态修改入口）

边界：

- P7 只做 `type: 'npc'`，其他类型（`condition` / `event` / `item`）保持 P6.3 现状
- P7.4 不改 P6.3 已有逻辑

---

## 9. 与未来 P6.5 value/display 视角分离的关系

P7 只解决：

    NPC 知道什么 / 不知道什么

P7 **不**解决：

    NPC 应该看到 value 还是 display

D5 决策：

- P7.3 保留 `opts.valueMode: 'ai' | 'public'` 参数占位
- P7.3 不赋予新语义（沿用 AI 视角的 value + sanitize）
- value/display 分离统一留到 P6.5 正式设计

P6.5 将处理的问题（不在 P7 范围）：

- `display` 字段的多语言支持
- reveal 后 Player / NPC 视角是否切 value
- 是否新增 `aiValue` / `npcValue` 字段
- AI 天道视角是否在 reveal 前看到 display

---

## 10. P7.2 ~ P7.5 边界

| 阶段 | 产物 | 是否本轮 |
|---|---|---|
| P7.1 | 本文档 | 是 |
| P7.2 | `core/memory/npcKnowledge.js`（applyNpcKnow / applyNpcForget / 读写 API）+ 单测 | 否 |
| P7.3 | `renderIdentityNpcRows(id, npcId, knowledge, opts)` 加到 `identityView.js` + 单测 | 否 |
| P7.4 | `identityDiscovery.js` 加 `type: 'npc'` 分支 + GM `npcKnow` / `npcForget` + 单测 | 否 |
| P7.5 | Prompt 层 NPC 视角注入 | 暂不做 |

**P7.5 暂不做的理由**：

- NPC 视角注入 Prompt 会显著增加 Prompt 长度
- AI 是否需要在 Prompt 中区分"NPC 知道什么"仍是待定设计问题
- 若需要，应作为 P7.6 或 P8 议题单独处理
- P7 只打通数据层 / View 层 / API 层

---

## 11. 待决问题（review 时确认）

1. `npcKnowledge[npcId][entryId]` 中 `npcId` 存储格式统一为 `'016'`（不带 N 前缀），展示时加前缀——同意？
2. entry 被 `gm.remove()` 后，`npcKnowledge[*][entryId]` 保留为历史记录，不主动清理——同意？
3. P7.4 的 `applyNpcKnow` 与 P6.3 的 `applyDiscover` 是**独立写入**（不合并）——同意？
4. `source` 枚举中 `'witnessed'` / `'informed'` 保留但 P7 不实现——同意？
5. P7.3 `renderIdentityNpcRows` 保留 `opts.valueMode` 参数占位，不赋予新语义——同意？

---

## 12. 版本

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-30 | 初稿（P7.1） |
