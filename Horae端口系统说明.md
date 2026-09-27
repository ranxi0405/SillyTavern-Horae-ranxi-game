# Horae 端口系统说明

## 系统定义

Horae Port 是 Horae 自带的前端挂载层。第三方扩展、预设脚本、状态栏作者可以在不修改 Horae 源码的前提下，向固定插槽注册自己的 UI 组件。

端口只承担展示与交互。数据来源由调用方决定：可以直接读 Horae 自身的状态（时间线、地点、角色、物品、关系、RPG 模板等），也可以通过自定义数据源从其他扩展、用户脚本、外部接口取数，再交给端口渲染。

常见用途：

- 给 Horae 抽屉新增一个分页
- 在每条消息面板里追加自定义信息块
- 在底部栏放一个全局 HUD
- 把外部扩展的状态值与 Horae 状态组合在一起渲染

---

## 核心 API

```javascript
window.Horae.portApiVersion           // 端口协议版本号，整数
window.Horae.slots                    // 当前支持的插槽 ID 列表

window.Horae.registerPort(definition)
window.Horae.unregisterPort(id)
window.Horae.refreshPorts(scope?)
window.Horae.getPorts()

window.Horae.registerDataProvider(id, provider)
window.Horae.unregisterDataProvider(id)
window.Horae.getDataProviderIds()
```

`registerPort` 与 `registerDataProvider` 都返回一个 `unregister()` 函数，调用即可解除注册。

Horae 不会预装任何外部数据源，所有 Provider 都需要调用方自行注册。

### 兼容性检查

端口协议如有破坏性变更会递增 `portApiVersion`。第三方插件建议在加载时先检查：

```javascript
if (!window.Horae || (window.Horae.portApiVersion ?? 0) < 1) {
    console.warn('[my-plugin] 当前 Horae 版本不支持端口协议 v1，已跳过注册。');
    return;
}
```

---

## 可用插槽

| 插槽 ID          | 位置                                            | 适用场景                                |
| ---------------- | ----------------------------------------------- | --------------------------------------- |
| `bottom-bar`     | 聊天输入区上方（找不到则回退到屏幕底部）        | 全局 HUD、当前位置、资源条、快捷操作    |
| `status`         | Horae 抽屉「状态」页底部                        | 当前世界状态摘要、附加状态卡片          |
| `drawer-tab`     | Horae 抽屉新增标签页                            | 复杂界面，例如完整数据浏览器            |
| `message-panel`  | 每条消息的 Horae 元数据面板内部                 | 楼层级附加信息、单条记录的扩展字段      |
| `rpg-hud`        | 每条消息上方的 RPG HUD 内部                     | RPG 模式下的扩展状态条、Buff、装备摘要  |

`bottom-bar` 优先挂在 `#form_sheld` / `#send_form` / `#sheld` 的父容器内，跟随聊天布局；这些节点都不存在时才会落到 `body` 末尾。

`rpg-hud` 仅在 Horae RPG 模式开启且消息上有 HUD DOM 时才有挂载点。

---

## 端口定义

```javascript
window.Horae.registerPort({
    id: 'example.bottom-status',
    slot: 'bottom-bar',
    title: '状态',
    icon: 'fa-solid fa-chart-simple',
    priority: 50,

    render(context) {
        const { state, helpers } = context;
        const location = state.scene?.location || '未知地点';
        const time = state.timestamp?.story_time || '--:--';

        return `
            <span>${helpers.escapeHtml(time)}</span>
            <span>${helpers.escapeHtml(location)}</span>
        `;
    },

    update(context, root) {
        const span = root.querySelector('.location');
        if (span) span.textContent = context.state.scene?.location || '未知地点';
    },

    dispose(root) {
        // 清理事件、定时器、观察器等
    },
});
```

### 字段

| 字段       | 类型       | 必填 | 说明                                                |
| ---------- | ---------- | :--: | --------------------------------------------------- |
| `id`       | `string`   |  是  | 端口唯一标识，详见下方命名约定。重名会**静默覆盖**旧端口。 |
| `slot`     | `string`   |  是  | 插槽 ID，必须是上文表格中的一个。                   |
| `title`    | `string`   |  否  | 显示名，用于 `drawer-tab` 标签页。                  |
| `icon`     | `string`   |  否  | Font Awesome 类名，用于 `drawer-tab` 标签页。       |
| `priority` | `number`   |  否  | 排序值，数字越小越靠前。默认 `100`。                |
| `render`   | `function` |  是  | 首次挂载时调用，返回内容。                          |
| `update`   | `function` |  否  | 每次刷新调用。未提供时回退到 `render`。             |
| `dispose`  | `function` |  否  | 端口卸载或被替换时调用，用于清理。                  |

#### `id` 命名约定

端口 ID 全局共享，重名会被后注册者覆盖且不报错。强烈建议采用三段式命名：

```
<作者命名空间>.<插件名>.<功能>
```

仅使用 `status-card`、`hud` 这类通用名极易与其他插件冲突。

### 返回值

`render` 与 `update` 均接受以下返回值：

- HTML 字符串：以 `innerHTML` 写入根节点
- `Node`（DOM 节点）
- jQuery 对象
- `null`：清空挂载点但保留位置
- `false`：移除整个挂载点（适合按条件隐藏）
- `undefined`：仅在 `update` 中表示已自行操作 `root`，无需重写

`render` 抛出异常会显示占位提示。同一端口连续抛出 5 次后会被自动卸载，避免污染界面与控制台。

#### 安全提示

字符串返回值会通过 `innerHTML` 注入。任何来自聊天消息、LLM 输出、Provider 返回值、用户输入的文本，都必须先经过 `context.helpers.escapeHtml()`，否则会引入 XSS 风险。如果输出不需要 HTML 结构，建议直接返回 `Node` 或自行操作 `textContent`。

---

## 上下文对象

```javascript
{
    api,            // window.Horae 引用
    context,        // SillyTavern 的 getContext() 结果
    settings,       // Horae 当前设置的浅拷贝
    state,          // Horae 聚合状态（getLatestState）
    rpg,            // 对应楼层的 RPG 快照
    chat,           // 当前聊天消息数组
    messageIndex,   // 楼层索引；全局插槽为 null
    meta,           // 当前楼层的 horae_meta；全局插槽为 null
    slot,           // 当前插槽 ID
    portId,         // 当前端口 ID
    firstRender,    // true 表示这是首次挂载
    root,           // 端口的根 DOM
    container,      // 所在的容器 DOM
    panelEl,        // 仅 message-panel：消息面板根
    messageEl,      // 仅 message-panel / rpg-hud：消息根
    hudEl,          // 仅 rpg-hud：HUD 根
    providers,      // 所有已注册数据源的当前快照
    getProvider,    // (id) => providers[id] ?? null
    helpers,
}
```

### `helpers`

| 字段                   | 说明                                       |
| ---------------------- | ------------------------------------------ |
| `escapeHtml(str)`      | HTML 转义                                  |
| `showToast(msg, type)` | 调用 Horae Toast                           |
| `isLightMode()`        | 当前是否为浅色主题                         |
| `t(key, vars?)`        | Horae i18n 翻译                            |
| `eventSource`          | SillyTavern 事件总线                       |
| `event_types`          | SillyTavern 事件类型枚举                   |

> Provider 之间不能互相依赖：构造 `providers` 时是同步遍历的，后注册的 Provider 在前一个的回调里读到的是空对象。

---

## 数据源（Data Provider）

Provider 是端口读取外部数据的统一入口。Horae 本身不预装任何 Provider；任何插件、用户脚本都可以注册自己的数据源，让端口拿到所需的数据。

### 注册

```javascript
const stop = window.Horae.registerDataProvider('myPlugin', () => {
    return window.MyPlugin?.getState?.() ?? null;
});
```

同一刷新批次内，相同 `messageIndex` 下的 Provider 结果会被缓存复用：每次刷新里 Provider 函数对每个楼层（含全局插槽的"无楼层"键）至多被调用一次。Provider 抛出异常时返回值为 `null`，并在控制台记录。

Provider 应保持纯函数语义、避免内部副作用：只在被调用时按需读取外部状态并返回快照，不要假定 Horae 会以特定频率触发它。

### 读取

```javascript
render(context) {
    const data = context.providers.myPlugin || {};
    return `<span>${context.helpers.escapeHtml(data.title || '')}</span>`;
}
```

### 卸载

```javascript
stop(); // registerDataProvider 返回的函数
// 或
window.Horae.unregisterDataProvider('myPlugin');
```

### 数据归属约定

端口可以同时读取 Horae 状态、当前楼层 meta 和任意已注册的 Provider 数据，但建议遵循单一来源原则：同一字段只由一处维护，端口仅做组合与展示。例如某个数值已经由外部扩展维护，Horae 端口可以读取并显示，但不要再让 Horae 自己同时维护一份。

---

## 触发刷新的事件

`refreshPorts` 会在以下时机自动调用：

- Horae 初始化完成。
- `CHAT_CHANGED`：聊天切换。
- `MESSAGE_RENDERED` / `CHARACTER_MESSAGE_RENDERED`：消息渲染。
- `MESSAGE_SWIPED`：分页 swipe。
- `MESSAGE_EDITED` / `MESSAGE_DELETED`：消息编辑或删除后。
- Horae 主刷新（`refreshAllDisplays`）。
- 注册或卸载端口、注册或卸载数据源。
- 切换抽屉到 `drawer-tab` 端口时，会单独再渲染一次该端口。

短窗口内多次触发会被合并为一次（30ms 防抖）。合并窗口内若收到不同范围的刷新请求，最终会以 `document` 为范围执行，确保不会因为某次窄范围刷新覆盖掉随后的全局刷新。

需要手动重绘时调用：

```javascript
window.Horae.refreshPorts();
```

---

## `render` 与 `update` 的区别

- 首次挂载或重新创建 root 时调用 `render`。`context.firstRender === true`。
- 之后每次刷新调用 `update(context, root)`，`context.firstRender === false`。
- 没有定义 `update` 时回退到 `render`，会整段重写 `root.innerHTML`，会丢失输入框焦点、滚动位置和事件绑定。
- 端口含交互组件时建议实现 `update`，仅修改需要变化的子节点。

### `drawer-tab` 性能建议

`drawer-tab` 端口在每次刷新时都会被调用，无论标签页当前是否可见。如果端口的渲染开销较大（例如完整数据浏览器、大型表格），应在 `update` 内自行判断可见性后跳过：

```javascript
update(context, root) {
    const tabContent = root.closest('.horae-tab-content');
    if (tabContent && !tabContent.classList.contains('active')) return;
    // ... 真正的 DOM 更新
}
```

这样不可见的标签页只会在用户切到它时进行一次实际重绘。

---

## 主题与样式约定

### 可用 CSS 变量

端口的根容器会继承 Horae 主题变量：

| 变量                       | 用途             |
| -------------------------- | ---------------- |
| `--horae-primary`          | 主色             |
| `--horae-primary-light`    | 主色亮调         |
| `--horae-primary-dark`     | 主色暗调         |
| `--horae-accent`           | 强调色           |
| `--horae-bg`               | 背景             |
| `--horae-bg-secondary`     | 次背景           |
| `--horae-bg-hover`         | 悬停背景         |
| `--horae-border`           | 边框             |
| `--horae-text`             | 主文本           |
| `--horae-text-muted`       | 次文本           |
| `--horae-success`          | 成功色           |
| `--horae-warning`          | 警示色           |
| `--horae-danger`           | 危险色           |
| `--horae-shadow`           | 阴影             |
| `--horae-radius`           | 圆角             |

### 浅色模式

端口所在容器在浅色主题下会带上 `.horae-light` 类，按需配套样式。

### 命名建议

端口注入的 CSS / DOM ID 建议加自己的命名空间前缀，例如 `myplugin-`、`myteam.tag-`，避免与其他端口冲突。

---

## 运行时依赖

端口在 SillyTavern 环境下运行，可直接使用以下全局：

- `jQuery` / `$`
- `lodash` / `_`
- `toastr`

Horae 自身不依赖任何第三方变量系统。是否引入更多依赖由端口作者自行决定。

---

## 示例

### 状态页卡片（仅使用 Horae 状态）

```javascript
window.Horae.registerPort({
    id: 'example.scene-card',
    slot: 'status',
    priority: 80,

    render(context) {
        const { state, helpers } = context;
        const location = state.scene?.location || '未知地点';
        const atmosphere = state.scene?.atmosphere || '';

        return `
            <div class="horae-state-section">
                <div class="horae-section-header">
                    <i class="fa-solid fa-location-dot"></i> 当前场景
                </div>
                <div>${helpers.escapeHtml(location)}</div>
                <div>${helpers.escapeHtml(atmosphere)}</div>
            </div>
        `;
    },
});
```

### 抽屉分页（浏览当前楼层 meta）

```javascript
window.Horae.registerPort({
    id: 'example.meta-viewer',
    slot: 'drawer-tab',
    title: '元数据',
    icon: 'fa-solid fa-database',
    priority: 60,

    render(context) {
        const chat = context.chat || [];
        const last = chat[chat.length - 1];
        const meta = last?.horae_meta;
        if (!meta) return `<div class="horae-empty-hint">当前楼层暂无元数据</div>`;
        const json = JSON.stringify(meta, null, 2);
        return `<pre style="white-space:pre-wrap;font-size:12px;">${context.helpers.escapeHtml(json)}</pre>`;
    },
});
```

### 带定时器的端口

```javascript
window.Horae.registerPort({
    id: 'example.clock',
    slot: 'bottom-bar',

    render(context) {
        const span = document.createElement('span');
        const tick = () => { span.textContent = new Date().toLocaleTimeString(); };
        tick();
        context.root._horaeTimer = setInterval(tick, 1000);
        return span;
    },

    dispose(root) {
        if (root._horaeTimer) clearInterval(root._horaeTimer);
    },
});
```

### 按条件隐藏

```javascript
window.Horae.registerPort({
    id: 'example.boss-warning',
    slot: 'message-panel',

    render(context) {
        const danger = context.state.scene?.atmosphere === '紧张';
        if (!danger) return false;
        return `<div class="horae-port-error">⚠ 高紧张度场景</div>`;
    },
});
```

---

## 可选：与外部变量系统集成

Horae 不内置对任何变量系统的依赖。如果你同时使用了 MVU（或其他类似工具），可以用一段桥接代码把它接入 Horae 端口；这只是 Provider 的一种使用范例，并不是 Horae 必须配合的对象。

```javascript
// 示例：把 MVU 的 stat_data 接入 Horae 端口
window.Horae.registerDataProvider('mvu', () => {
    if (typeof globalThis.getAllVariables !== 'function') return null;
    const variables = globalThis.getAllVariables();
    return variables?.stat_data ?? null;
});

window.Horae.registerPort({
    id: 'example.mvu-bridge',
    slot: 'status',
    render(context) {
        const data = context.providers.mvu;
        if (!data) return `<div class="horae-empty-hint">未检测到 MVU 数据</div>`;
        const json = JSON.stringify(data, null, 2);
        return `<pre style="white-space:pre-wrap;font-size:12px;">${context.helpers.escapeHtml(json)}</pre>`;
    },
});
```

同样的写法也适用于其他扩展：把对方的当前状态包装成一个 Provider，端口里通过 `context.providers.<id>` 取用即可。

---

## 错误处理

- `render` / `update` 抛错会替换为占位提示。
- 同一端口连续抛错达到 5 次会自动卸载，并 toast 提醒。
- Provider 抛错时其结果为 `null`，端口需要自行兜底。

---

## 事件广播

注册或卸载端口时会派发：

- `window` 上的 `horae:portsChanged` 事件
- `eventSource.emit('horae:portsChanged', detail)`

`detail` 形如 `{ type: 'register' | 'unregister', id, slot }`。其他扩展可据此监听端口变化。
