// ⚠️ 这是 F12 浏览器 Console 脚本（不是 Node 脚本，不要用 node 运行）
//
// 使用方式：
//   1. SillyTavern → F12 → Console
//   2. 粘贴本文件 → 默认 DRY_RUN，只输出匹配项
//   3. 记录日志里的 matched ids
//   4. 把 EXPECTED_IDS 填上这两个 id
//   5. 再粘一次（DRY_RUN 仍为 true）→ 应显示 "EXPECTED_IDS 校验通过"
//   6. 把 DRY_RUN 改为 false → 再粘一次 → 实际删除 + saveChat

(async function cleanDirectorNotes() {
    // ───── 开关 ─────
    const DRY_RUN = true;

    // 首次运行请保持为空数组；从日志里拿到 id 后填入：
    // const EXPECTED_IDS = ['d_xxxxxx_yyyy', 'd_xxxxxx_zzzz'];
    const EXPECTED_IDS = [];

    // ───── 目标 spec（来自本次已确认的污染数据） ─────
    const TARGET_SPECS = [
        {
            label: 'note[5] prototype：protagonist / 594 字 / 含 item+time+location',
            expectCategory: 'protagonist',
            minLen: 500,
            maxLen: 700,
            pollutionCheck: (t) =>
                /(?:^|\n)\s*item[:：]/i.test(t) &&
                /(?:^|\n)\s*time[:：]/i.test(t) &&
                /(?:^|\n)\s*location[:：]/i.test(t),
        },
        {
            label: 'note[6] prototype：continuity / 9543 字 / 含 console.log 或 function',
            expectCategory: 'continuity',
            minLen: 9000,
            maxLen: 11000,
            pollutionCheck: (t) =>
                /console\.log\b/.test(t) ||
                /function\s*\(/.test(t) ||
                /\(async function/.test(t),
        },
    ];

    // ───── 匹配 + 校验（可重入） ─────
    function resolveTargets(notes) {
        const result = { ok: false, matched: [], reason: '' };
        if (!Array.isArray(notes)) { result.reason = 'notes 不是数组'; return result; }

        const matched = [];
        for (const spec of TARGET_SPECS) {
            const hits = [];
            notes.forEach((d, i) => {
                const t = String(d?.text || '');
                if (d?.category !== spec.expectCategory) return;
                if (t.length < spec.minLen || t.length > spec.maxLen) return;
                if (!spec.pollutionCheck(t)) return;
                hits.push({ idx: i, id: d.id, category: d.category, length: t.length });
            });
            if (hits.length !== 1) {
                result.reason = `spec「${spec.label}」命中 ${hits.length} 条（期望恰好 1 条）`;
                return result;
            }
            matched.push(hits[0]);
        }

        const ids = matched.map(m => m.id).filter(Boolean);
        if (ids.length !== 2 || new Set(ids).size !== 2) {
            result.reason = `目标 id 不唯一或缺失（ids=${JSON.stringify(ids)}）`;
            return result;
        }

        if (Array.isArray(EXPECTED_IDS) && EXPECTED_IDS.length > 0) {
            const expSet = new Set(EXPECTED_IDS);
            if (expSet.size !== EXPECTED_IDS.length) {
                result.reason = 'EXPECTED_IDS 存在重复 id';
                return result;
            }
            const matchedSet = new Set(ids);
            const sameSize = expSet.size === matchedSet.size;
            const sameIds = [...expSet].every(x => matchedSet.has(x));
            if (!sameSize || !sameIds) {
                result.reason = `匹配 id 与 EXPECTED_IDS 不一致\nexpected=${JSON.stringify([...expSet])}\nmatched =${JSON.stringify(ids)}`;
                return result;
            }
        }

        result.ok = true;
        result.matched = matched;
        return result;
    }

    // ───── 0. 环境检查 ─────
    const chat = window.Horae?.getChat?.();
    const meta = chat?.[0]?.horae_meta;
    if (!meta) { console.error('❌ 未找到 Horae.getChat()[0].horae_meta'); return; }
    const notes = meta.directorNotes;
    if (!Array.isArray(notes)) { console.error('❌ meta.directorNotes 不是数组'); return; }

    console.log('=== directorNotes 当前总数:', notes.length, '===');
    console.log('');
    console.log('=== 全部条目摘要 ===');
    notes.forEach((d, i) => {
        const t = String(d?.text || '');
        console.log(`[${i}] id=${d?.id || '(无)'} cat=${d?.category} len=${t.length} status=${d?.status} head="${t.slice(0, 50).replace(/\n/g, '⏎')}"`);
    });
    console.log('');

    // ───── 1. 首次校验 ─────
    const pre = resolveTargets(notes);
    if (!pre.ok) {
        console.error('❌ 校验失败:', pre.reason);
        console.error('   abort，未修改任何数据');
        return;
    }
    console.log('=== 匹配到的目标 ===');
    pre.matched.forEach(m => {
        console.log(`  idx=${m.idx} id=${m.id} cat=${m.category} len=${m.length}`);
    });
    console.log('');

    // ───── 2. EXPECTED_IDS 状态 ─────
    if (Array.isArray(EXPECTED_IDS) && EXPECTED_IDS.length > 0) {
        console.log('✅ EXPECTED_IDS 校验通过');
    } else {
        console.warn('⚠️ EXPECTED_IDS 未锁定（当前为空数组）');
        console.warn('  请把以下 id 填入脚本常量 EXPECTED_IDS：');
        console.warn('  const EXPECTED_IDS = [' + pre.matched.map(m => `'${m.id}'`).join(', ') + '];');
    }
    console.log('');

    // ───── 3. 预期外疑似污染（仅警告） ─────
    const others = [];
    notes.forEach((d, i) => {
        if (pre.matched.some(m => m.idx === i)) return;
        const t = String(d?.text || '');
        if (/<horae>/i.test(t) || /console\.log/i.test(t) || t.length > 500) {
            others.push({ idx: i, id: d.id, cat: d.category, len: t.length });
        }
    });
    if (others.length > 0) {
        console.warn('⚠️ 发现预期外的疑似污染项（本次不会删）:');
        others.forEach(x => console.warn(`  [${x.idx}] id=${x.id} ${x.cat} len=${x.len}`));
        console.warn('');
    }

    // ───── 4. DRY-RUN 退出 ─────
    if (DRY_RUN) {
        console.log('=== DRY-RUN 完成，未修改任何数据 ===');
        return;
    }

    // ───── 5. apply 前置校验：EXPECTED_IDS 必须锁定 ─────
    if (!Array.isArray(EXPECTED_IDS) || EXPECTED_IDS.length === 0) {
        console.error('❌ EXPECTED_IDS 未锁定，拒绝 apply');
        return;
    }

    // ───── 6. 二次校验（apply 前重入） ─────
    const pre2 = resolveTargets(notes);
    if (!pre2.ok) {
        console.error('❌ 二次校验失败:', pre2.reason, '→ abort');
        return;
    }
    const id1 = JSON.stringify(pre.matched.map(m => m.id));
    const id2 = JSON.stringify(pre2.matched.map(m => m.id));
    if (id1 !== id2) {
        console.error('❌ 二次校验 id 不一致 → abort');
        console.error('  pre :', id1);
        console.error('  pre2:', id2);
        return;
    }

    // ───── 7. 定位阶段：全量 findIndex，任一失败 abort（不 splice） ─────
    console.log('=== 定位待删 id（findIndex 全量校验） ===');
    const locations = [];
    for (const m of pre2.matched) {
        const idx = notes.findIndex(d => d.id === m.id);
        if (idx < 0) {
            console.error(`❌ id=${m.id} 找不到 → abort（未修改任何数据）`);
            return;
        }
        locations.push({
            idx,
            id: m.id,
            cat: String(notes[idx].category || ''),
            len: String(notes[idx].text || '').length,
        });
    }
    console.log('全量 id 定位成功:');
    locations.forEach(l => console.log(`  idx=${l.idx} id=${l.id} cat=${l.cat} len=${l.len}`));
    console.log('');

    // ───── 8. 应用阶段：按 index 倒序 splice ─────
    locations.sort((a, b) => b.idx - a.idx);
    console.log('=== 执行删除（倒序 splice） ===');
    for (const l of locations) {
        const removed = notes.splice(l.idx, 1)[0];
        console.log(`已删除 idx=${l.idx} id=${removed?.id} cat=${removed?.category} len=${removed?.text?.length || 0}`);
    }
    console.log('删除后 directorNotes 总数:', notes.length);

    // ───── 9. saveChat ─────
    if (typeof window.SillyTavern !== 'undefined' && window.SillyTavern.getContext) {
        const ctx = window.SillyTavern.getContext();
        if (typeof ctx.saveChat === 'function') {
            await ctx.saveChat();
            console.log('✅ saveChat 完成');
        } else {
            console.warn('⚠️ 未找到 ctx.saveChat，请手动保存对话');
        }
    } else {
        console.warn('⚠️ 未找到 SillyTavern.getContext，请手动保存对话');
    }
})();
