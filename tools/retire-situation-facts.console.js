/**
 * S1.5-fix 历史数据迁移（浏览器 Console 脚本，不是 node 脚本）
 *
 * 用途：
 *   用于迁移历史错误生成的「处境」predicate fact。
 *   S1.5-fix 后新提取不再产生「处境」，但历史存档中已落库的条目需要一次性迁移。
 *
 * 行为：
 *   - 把 status='active' 且 predicate='处境' 的 fact 置为 'invalidated'
 *   - 不物理删除；保留 id / source / sourceEventIds / since / createdAt
 *   - 幂等：重复运行只处理 active 条目，已 invalidated 不动
 *   - 不参与正常运行流程，不影响 FactStore 结构
 *
 * 使用：
 *   1. 打开 SillyTavern，加载目标存档
 *   2. F12 → Console
 *   3. 粘贴本脚本 → DRY-RUN，查看将迁移的条目
 *   4. 执行 window.__RETIRE_APPLY__ = true
 *   5. 再次粘贴本脚本 → APPLY
 *
 * 首次真实验证：2026-09-28，问道长生0.9 存档，迁移 11 条。
 */
(async function retireSituationFacts() {
    const APPLY = window.__RETIRE_APPLY__ === true;
    const tag = '[S1.5-fix·retire 处境]';
    console.log(tag, 'mode:', APPLY ? 'APPLY' : 'DRY-RUN');
    if (!APPLY) console.log(tag, '提示：设置 window.__RETIRE_APPLY__ = true 后重新运行以应用');

    function getCtx() {
        if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
        if (window.parent?.SillyTavern?.getContext) return window.parent.SillyTavern.getContext();
        return null;
    }
    const ctx = getCtx();
    const chat = ctx?.chat || (typeof window.chat !== 'undefined' ? window.chat : null);

    if (!Array.isArray(chat) || chat.length === 0) {
        console.error(tag, '无法获取当前 chat');
        return;
    }
    const meta = chat[0]?.horae_meta;
    if (!meta || !Array.isArray(meta.facts)) {
        console.error(tag, 'chat[0].horae_meta.facts 不存在');
        return;
    }

    const targets = meta.facts.filter(f => f.status === 'active' && f.predicate === '处境');
    console.log(tag, 'active 处境 facts:', targets.length);
    targets.forEach((f, i) =>
        console.log(tag, `  [${i}] id=${f.id}  ${f.subject}|${f.predicate}|${f.object}  source=${f.source || '-'}`)
    );

    if (targets.length === 0) { console.log(tag, '无可迁移条目'); return; }
    if (!APPLY) { console.log(tag, 'DRY-RUN 结束'); return; }

    const now = new Date().toISOString();
    for (const f of targets) {
        f.status = 'invalidated';
        f.invalidatedAt = now;
        f.updatedAt = now;
    }

    try {
        if (typeof ctx?.saveChat === 'function') await ctx.saveChat();
        else if (typeof window.saveChat === 'function') await window.saveChat();
        else if (typeof window.saveChatDebounced === 'function') window.saveChatDebounced();
        else console.warn(tag, '未找到 saveChat，请手动切一次聊天触发保存');
    } catch (e) {
        console.error(tag, '保存失败:', e);
    }

    console.log(tag, `已 invalidate ${targets.length} 条`);
})();
