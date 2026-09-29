/**
 * B3c-2c L3 迁移（浏览器 Console 脚本）
 *
 * 用途：把 chat[0].horae_meta.rpg.skills 里已有的六艺项迁移到 rpg.arts
 *
 * 规则：
 *   - 只处理 name ∈ {炼丹, 炼器, 符箓, 阵法, 御兽, 灵植}
 *   - arts[owner][name] 已存在则跳过
 *   - 从 skills 无条件删除六艺项
 *   - xp 从 sk.desc 提取（支持 "熟练度: N" 和裸数字）
 *
 * 用法：
 *   1. F12 Console
 *   2. 粘贴本脚本 → DRY-RUN
 *   3. window.__MIGRATE_CRAFT_APPLY__ = true → 再粘一次 → APPLY
 *
 * 首次真实验证：2026-09-29，问道长生0.9，迁移 2 条（灵植/炼丹，已存在 arts，仅从 skills 清除）
 */
(async function migrate() {
    const APPLY = window.__MIGRATE_CRAFT_APPLY__ === true;
    const tag = '[B3c-2c·craft 迁移]';
    const CRAFT_NAMES = new Set(['炼丹', '炼器', '符箓', '阵法', '御兽', '灵植']);
    console.log(tag, 'mode:', APPLY ? 'APPLY' : 'DRY-RUN');

    function getCtx() {
        if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
        if (window.parent?.SillyTavern?.getContext) return window.parent.SillyTavern.getContext();
        return null;
    }
    const ctx = getCtx();
    const chat = ctx?.chat || window.chat;
    if (!Array.isArray(chat) || chat.length === 0) { console.error(tag, 'no chat'); return; }
    const meta = chat[0]?.horae_meta;
    const rpg = meta?.rpg;
    if (!rpg) { console.error(tag, 'chat[0].horae_meta.rpg 不存在'); return; }

    const extractXp = (desc) => {
        if (desc == null) return null;
        const s = String(desc).trim();
        if (!s) return null;
        const m = s.match(/熟练度[:：\s]*(\d+)/);
        if (m) { const n = Number(m[1]); return Number.isSafeInteger(n) ? n : null; }
        if (/^\d+$/.test(s)) { const n = Number(s); return Number.isSafeInteger(n) ? n : null; }
        return null;
    };

    const skills = rpg.skills || {};
    const plan = [];
    for (const owner of Object.keys(skills)) {
        const list = skills[owner];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) {
            const sk = list[i];
            if (!sk || typeof sk.name !== 'string') continue;
            if (!CRAFT_NAMES.has(sk.name)) continue;
            plan.push({
                owner,
                name: sk.name,
                tier: sk.level || null,
                xp: extractXp(sk.desc),
                desc: sk.desc,
            });
        }
    }

    console.log(tag, '待迁移项:', plan.length);
    plan.forEach((p, i) => console.log(
        tag, `  [${i}] owner=${p.owner} name=${p.name} tier=${p.tier} xp=${p.xp} desc=${p.desc}`
    ));

    if (plan.length === 0) { console.log(tag, '无可迁移'); return; }
    if (!APPLY) { console.log(tag, 'DRY-RUN 结束'); return; }

    if (!rpg.arts) rpg.arts = {};
    let moved = 0, skipped = 0;
    for (const p of plan) {
        if (!rpg.arts[p.owner]) rpg.arts[p.owner] = {};
        if (rpg.arts[p.owner][p.name]) {
            console.log(tag, `skip (arts 已有): ${p.owner}/${p.name}`);
            skipped++;
            continue;
        }
        const entry = { tier: p.tier };
        if (p.xp != null) entry.xp = p.xp;
        rpg.arts[p.owner][p.name] = entry;
        moved++;
    }
    for (const owner of Object.keys(skills)) {
        if (!Array.isArray(skills[owner])) continue;
        rpg.skills[owner] = skills[owner].filter(sk =>
            !(sk && typeof sk.name === 'string' && CRAFT_NAMES.has(sk.name))
        );
    }

    console.log(tag, `已迁移 ${moved} 条，跳过 ${skipped} 条`);

    try {
        if (typeof ctx?.saveChat === 'function') await ctx.saveChat();
        else if (typeof window.saveChat === 'function') await window.saveChat();
        else if (typeof window.saveChatDebounced === 'function') window.saveChatDebounced();
        else console.warn(tag, '未找到 saveChat，请手动切一次聊天触发保存');
    } catch (e) { console.error(tag, '保存失败:', e); }
    console.log(tag, 'done');
})();
