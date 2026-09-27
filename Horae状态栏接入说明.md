# Horae 状态栏接入说明（角色卡作者向）

本说明面向**角色卡 / 预设 / 正则注入的 HTML 状态栏作者**，目标是把 Horae 收集的剧情状态显示在你自己的状态栏里，与 Horae 自身界面并存。

如果你写的是 SillyTavern 扩展、需要在 Horae 抽屉或聊天 UI 里挂载组件，请改看 `Horae端口系统说明.md`。

---

## 工作模型

正则注入的状态栏会以 iframe 形式渲染在消息内或界面上。Horae 的运行时 API 挂在 SillyTavern 主窗口的 `window.Horae` 上，因此 iframe 内需要通过 `window.parent.Horae` 访问。

```
[ SillyTavern 主窗口 ]
   ├── window.Horae           ← Horae 暴露的 API
   ├── window.SillyTavern     ← ST 官方 API（含事件总线）
   └── <iframe>               ← 你的状态栏
        └── window.parent.Horae / SillyTavern
```

Horae 与 MVU 无任何耦合，可以独立使用，也可以与 MVU 共存：状态栏中两个数据源可以同时读取，各自渲染各自负责的部分。

---

## 可用入口

### `window.parent.Horae` 主要方法

| 方法 | 返回 | 说明 |
| ---- | ---- | ---- |
| `getLatestState(skipLast?)` | `Object` | 截至当前楼层的聚合状态（时间、地点、角色、物品、关系等）。`skipLast` 可跳过末尾若干楼层。 |
| `getRpgState(skipLast?)`    | `Object` | RPG 模板下的属性、技能、装备、声望、货币、据点等数据。 |
| `getEvents(limit?, level?)` | `Array`  | 最近事件列表，可按重要等级过滤。 |
| `getChat()`                 | `Array`  | 当前聊天消息数组（与 ST `getContext().chat` 同源）。 |
| `getSettings()`             | `Object` | Horae 的当前设置浅拷贝，可用于读取主题状态等。 |
| `isEnabled()`               | `Boolean`| Horae 是否启用。 |
| `version`                   | `String` | Horae 插件版本。 |
| `portApiVersion`            | `Number` | 端口协议版本。 |

所有方法均为同步返回，**不会修改 Horae 内部状态**，可放心在渲染循环里反复调用。

### `window.parent.SillyTavern.getContext()`

由 SillyTavern 提供，可拿到 `eventSource` / `event_types`，用于事件订阅。

---

## `getLatestState()` 返回结构

```typescript
{
    timestamp: {
        story_date: string,   // 例如 "1024年 春之月12日"
        story_time: string,   // 例如 "14:30"
        absolute:   string,   // 绝对时间字符串（可选）
    },
    scene: {
        location:           string,
        characters_present: string[],
        atmosphere:         string,
    },
    costumes:    { [角色名]: string },
    items:       {
        [物品名]: {
            holder?:      string,
            location?:    string,
            description?: string,
            importance?:  '' | '!' | '!!',
            icon?:        string,
        }
    },
    deletedItems:   string[],
    deletedAgenda:  string[],
    events:         Array<any>,
    affection:      { [角色名]: number | object },
    npcs:           { [角色名]: object },
    agenda:         Array<any>,
    mood:           { [角色名]: string },
    relationships:  Array<any>,
}
```

字段在剧情未触及时为空对象 / 空数组，渲染前请做空值兜底。

## `getRpgState()` 返回结构

```typescript
{
    bars:        { [owner]: { [name]: { value, max, ... } } },
    status:      { [owner]: Array<{ name, ... }> },
    skills:      { [owner]: Array<{ name, level, desc }> },
    attributes:  { [owner]: { [attr]: number } },
    reputation:  { [owner]: { [category]: { value, subItems } } },
    equipment:   { [owner]: { [slot]: object } },
    levels:      { [owner]: number },
    xp:          { [owner]: number },
    currency:    { [owner]: { [currency]: number } },
    strongholds: Array<object>,
}
```

仅当 Horae 的 RPG 模板启用时才会有数据，否则各字段为空对象/空数组。

## `getEvents()` 元素结构

```typescript
{
    messageIndex: number,
    eventIndex:   number,
    timestamp: {
        story_date: string,
        story_time: string,
    },
    event: {
        summary: string,
        level:   'minor' | 'normal' | 'major' | string,
        // ... 其他自定义字段
    }
}
```

---

## 触发重新渲染

iframe 没法直接订阅 Horae 内部刷新，但可以用以下三种方式之一感知数据变化：

### 方式一：订阅 SillyTavern 事件（推荐）

```javascript
const ctx = window.parent.SillyTavern?.getContext?.();
if (ctx?.eventSource && ctx.event_types) {
    ['MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED',
     'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED',
     'CHAT_CHANGED'].forEach(name => {
        const key = ctx.event_types[name];
        if (key) ctx.eventSource.on(key, render);
    });
}
```

涵盖 90% 的状态变化时机，是首选方案。

### 方式二：监听 Horae 自身派发的 CustomEvent

Horae 在端口变化时会向主窗口派发：

```javascript
window.parent.addEventListener('horae:portsChanged', render);
```

注意这是端口注册/卸载时触发，不会覆盖普通的剧情状态变化。仅在你需要响应 Horae 自身的 UI 配置变化时使用。

### 方式三：轮询 + 状态比对（兜底）

某些早期版本或特殊环境下事件订阅可能不可用，此时退化为定时拉取并比较关键字段：

```javascript
let _last = '';
setInterval(() => {
    const s = window.parent.Horae?.getLatestState?.();
    if (!s) return;
    const sig = (s.timestamp?.story_time || '') + '|' + (s.scene?.location || '');
    if (sig !== _last) { _last = sig; render(); }
}, 1500);
```

---

## 安全与稳定性

1. **永远做存在性检查**。`window.parent.Horae` 可能因为加载顺序、用户未启用 Horae、或预览窗口等原因为 `undefined`。
2. **所有取自 Horae 的字符串都要 HTML 转义**。地点、角色名、物品描述等均来自 LLM 输出，直接拼到 `innerHTML` 会引入 XSS。
3. **不要修改返回对象**。`getLatestState()` 等返回的是 Horae 内部对象的引用，写入会污染下次刷新的结果。
4. **频率控制**。`render` 内部如果 DOM 操作较重，建议自己加 `requestAnimationFrame` 或简单防抖，避免一次消息事件触发多次重排。

---

## 完整示例

可直接作为正则注入内容使用的最小骨架：

```html
<!doctype html>
<meta charset="utf-8">
<style>
.hb{font-family:'Segoe UI','Microsoft YaHei',sans-serif;max-width:520px;margin:10px auto;
    border:2px solid #8B5A2B;border-radius:10px;background:#fff8ee;padding:10px;
    box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:13px;color:#5c3a21}
.hb-h{display:flex;justify-content:space-between;font-weight:bold;color:#8B5A2B;
      border-bottom:1px solid rgba(139,90,43,.3);padding-bottom:6px;margin-bottom:8px}
.hb-row{display:flex;justify-content:space-between;padding:3px 0}
.hb-row+.hb-row{border-top:1px dashed rgba(139,90,43,.15)}
.hb-tag{display:inline-block;font-size:11px;background:#fed7aa;color:#c2410c;
        border-radius:6px;padding:1px 6px;margin:1px 2px}
.hb-empty{color:#999;font-style:italic;text-align:center;padding:6px}
.hb-off{opacity:.45}
</style>

<div class="hb" id="hb">
  <div class="hb-h">
    <span>📍 <span id="hb-loc">--</span></span>
    <span id="hb-time">--:--</span>
  </div>
  <div id="hb-people" class="hb-empty">无在场角色</div>
  <div id="hb-items"  class="hb-empty">无物品</div>
</div>

<script>
(function(){
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function readHorae(){
    try {
      var H = window.parent && window.parent.Horae;
      return H ? H.getLatestState() : null;
    } catch (e) { return null; }
  }

  function render(){
    var s = readHorae();
    var box = document.getElementById('hb');
    if (!s){ box.classList.add('hb-off'); return; }
    box.classList.remove('hb-off');

    document.getElementById('hb-loc').textContent  = s.scene && s.scene.location || '未知地点';
    document.getElementById('hb-time').textContent = s.timestamp && s.timestamp.story_time || '--:--';

    var ppl = (s.scene && s.scene.characters_present) || [];
    var pe = document.getElementById('hb-people');
    if (ppl.length){
      pe.className = '';
      pe.innerHTML = ppl.map(function(n){ return '<span class="hb-tag">'+esc(n)+'</span>'; }).join('');
    } else {
      pe.className = 'hb-empty'; pe.textContent = '无在场角色';
    }

    var items = s.items || {};
    var keys = Object.keys(items);
    var ie = document.getElementById('hb-items');
    if (keys.length){
      ie.className = '';
      ie.innerHTML = keys.slice(0, 6).map(function(k){
        var it = items[k] || {};
        var tail = it.holder || it.location || '';
        return '<div class="hb-row"><span>'+esc(k)+'</span><span style="color:#888">'+esc(tail)+'</span></div>';
      }).join('');
    } else {
      ie.className = 'hb-empty'; ie.textContent = '无物品';
    }
  }

  function bindEvents(){
    try{
      var ctx = window.parent && window.parent.SillyTavern && window.parent.SillyTavern.getContext();
      if (!ctx || !ctx.eventSource || !ctx.event_types) return false;
      ['MESSAGE_RENDERED','CHARACTER_MESSAGE_RENDERED','MESSAGE_SWIPED',
       'MESSAGE_EDITED','MESSAGE_DELETED','CHAT_CHANGED'].forEach(function(name){
        var key = ctx.event_types[name];
        if (key) ctx.eventSource.on(key, render);
      });
      return true;
    } catch(e){ return false; }
  }

  function start(){
    render();
    if (!bindEvents()){
      var n = 0, t = setInterval(function(){
        render();
        if (++n > 240) clearInterval(t);
      }, 1500);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>
```

---

## 与 MVU 共存的写法

Horae 与 MVU 数据互不冲突，可以在同一份状态栏里同时读：

```javascript
function readBoth(){
    var horae = null, stat = null;
    try { horae = window.parent.Horae && window.parent.Horae.getLatestState(); } catch(e){}
    try {
        var g = (window.parent.getAllVariables || window.getAllVariables);
        stat = typeof g === 'function' ? (g().stat_data || null) : null;
    } catch(e){}
    return { horae: horae, mvu: stat };
}
```

建议遵循单一来源原则：同一字段只交给一个系统维护，状态栏只做组合显示。例如位置、角色在场、剧情物品、声望、金钱、好感交给 Horae，自定义数值交给 MVU，两边各自独立、互不写入。

---

## 调试

```javascript
console.log('[Horae]', window.parent.Horae?.version, window.parent.Horae?.getLatestState?.());
```

控制台直接调用 `window.Horae.getLatestState()` 即可立即拿到当前最新数据，便于在卡片里打断点核对字段。
