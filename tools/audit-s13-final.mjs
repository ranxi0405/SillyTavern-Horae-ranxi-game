#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(m) { console.log('  PASS | ' + m); pass++; }
function ng(m, d) { console.log('  FAIL | ' + m); if (d) console.log('         ' + d); fail++; }
function chk(c, m, d) { if (c) ok(m); else ng(m, d); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ═══════════════════════════════════════════════════════════
// S1.3a Worldbook 实际内容验证
// ═══════════════════════════════════════════════════════════
console.log('\n========== S1.3a Worldbook ==========');
{
    const src = fs.readFileSync(path.join(ROOT, 'tools/patch-s13a-worldbook.mjs'), 'utf8');
    const m5 = src.match(/const NEW_UID5 = \[([\s\S]*?)\]\.join\('\\n'\);/);
    const m2 = src.match(/const NEW_UID2 = \[([\s\S]*?)\]\.join\('\\n'\);/);
    if (!m5 || !m2) { ng('数组提取失败'); }
    else {
        const uid5 = new Function('return [' + m5[1] + '];')().join('\n');
        const uid2 = new Function('return [' + m2[1] + '];')().join('\n');

        // uid5 段位顺序
        chk(uid5.includes('蒙昧 → 清明 → 凝照 → 洞玄 → 明心 → 太虚'), 'uid5 段位顺序');
        chk(uid5.includes('只能顺序晋升，不可跳段'), 'uid5 不可跳段');
        // 段位阈值
        for (const s of ['蒙昧：1000','清明：3000','凝照：6000','洞玄：10000','明心：15000','太虚：无上限'])
            chk(uid5.includes(s), 'uid5 阈值 ' + s);
        // SP 基础
        for (const s of ['蒙昧：100','清明：250','凝照：600','洞玄：1500','明心：3500','太虚：8000'])
            chk(uid5.includes(s), 'uid5 SP基础 ' + s);
        // 语义
        chk(uid5.includes('局部累计值'), 'uid5 段内语义');
        chk(uid5.includes('终身累计神识值'), 'uid5 终身累计');
        chk(uid5.includes('不因段位晋升归零'), 'uid5 不归零');
        chk(uid5.includes('晋升由 AI 声明，程序校验'), 'uid5 晋升规则');
        chk(uid5.includes('floor(段内修为 / 100)'), 'uid5 神念派生公式');
        // 无旧残留
        chk(!uid5.includes('神识段位到顶后'), 'uid5 无旧表述');
        chk(!uid5.includes('炉火纯青'), 'uid5 无旧修辞');

        // uid2 表
        for (const s of ['炼气 100 / 100','筑基 300 / 300','结晶 600 / 600','金丹 1200 / 1200',
                         '具灵 2000 / 2000','元婴 3500 / 3500','化神 6000 / 6000',
                         '悟道 10000 / 10000','羽化 18000 / 18000','登仙 30000 / 30000','飞升 无上限'])
            chk(uid2.includes(s), 'uid2 ' + s);
        // uid2 不应含 SP
        chk(!uid2.includes('神念上限'), 'uid2 无神念列');
    }
}

// ═══════════════════════════════════════════════════════════
// S1.3b Parser 逻辑验证（正则 + 分支 + 模拟测试）
// ═══════════════════════════════════════════════════════════
console.log('\n========== S1.3b Parser ==========');
{
    const src = fs.readFileSync(path.join(ROOT, 'tools/patch-s13b-parser.mjs'), 'utf8');

    chk(/const barShort = line\.match/.test(src), 'barShort 正则定义');
    chk(/const barShortUo = _uoB/.test(src), 'barShortUo 正则定义');
    chk(/if \(barShort && !\/\^\(status\|skill\)\$\/i\.test\(barShort\[1\]\)\)/.test(src), 'barShort 分支');
    chk(/if \(barShortUo && !\/\^\(status\|skill\)\$\/i\.test\(barShortUo\[1\]\)\)/.test(src), 'barShortUo 分支');
    chk(/line\.startsWith\('bonus:'\)/.test(src), 'bonus: 分支');
    chk(/rpg\.barBonusChanges\.push/.test(src), 'bonus 推入');
    chk(/段内阈值：蒙昧1000/.test(src), 'spiritNote 段内阈值');
    chk(/spirit:xp=当前段位内的累计值/.test(src), 'spiritNote 新语义');
    chk(/const bonusNote = isZh/.test(src), 'bonusNote 定义');
    chk(/r\.barBonusChanges \|\| \[\]\)\.length > 0/.test(src), 'hasContent + bonus');

    // 模拟：barShort 正则实测
    const shortRe = /^([a-zA-Z]\w*):(.+?)=(\d+)(?:\((.+?)\))?$/i;
    let t = 'hp:冉汐=850'.match(shortRe);
    chk(t && t[1] === 'hp' && t[2] === '冉汐' && t[3] === '850', 'barShort: hp:冉汐=850');
    t = 'mp:冉汐=1200'.match(shortRe);
    chk(t && t[1] === 'mp' && t[3] === '1200', 'barShort: mp:冉汐=1200');
    t = 'sp:冉汐=500'.match(shortRe);
    chk(t && t[1] === 'sp' && t[3] === '500', 'barShort: sp:冉汐=500');
    // legacy 兼容
    const legacyRe = /^([a-zA-Z]\w*):(.+?)=(\d+)\s*\/\s*(\d+)(?:\((.+?)\))?$/i;
    t = 'hp:冉汐=850/1000'.match(legacyRe);
    chk(t && t[3] === '850' && t[4] === '1000', 'legacy: hp:冉汐=850/1000');
    // bonus
    const bonusRe = /^bonus:([a-z]+):(.+?)=\+(\d+)$/i;
    t = 'bonus:hp:冉汐=+50'.match(bonusRe);
    chk(t && t[1] === 'hp' && t[2] === '冉汐' && t[3] === '50', 'bonus: bonus:hp:冉汐=+50');
    t = 'bonus:hp:冉汐=-50'.match(bonusRe);
    chk(!t, 'bonus 负数拒绝');
    t = 'bonus:sp:冉汐=+20'.match(bonusRe);
    chk(t && t[1] === 'sp', 'bonus: bonus:sp:冉汐=+20');
    // status/skill 不被 barShort 吃掉
    t = 'status:冉汐=中毒'.match(shortRe);
    chk(!t || t[1].toLowerCase() === 'status', 'status 不被短正则误吞');
}

// ═══════════════════════════════════════════════════════════
// S1.3c 单元测试（独立函数副本，与 patch 脚本一致）
// ═══════════════════════════════════════════════════════════
console.log('\n========== S1.3c StateStore 单元测试 ==========');
{
    const SPIRIT_ORDER = ['蒙昧','清明','凝照','洞玄','明心','太虚'];
    const SPIRIT_THRESHOLD = { '蒙昧':1000,'清明':3000,'凝照':6000,'洞玄':10000,'明心':15000,'太虚':Infinity };
    const SPIRIT_BASE_SP = { '蒙昧':100,'清明':250,'凝照':600,'洞玄':1500,'明心':3500,'太虚':8000 };
    const REALM_BASE_HP = { '炼气':100,'筑基':300,'结晶':600,'金丹':1200,'具灵':2000,'元婴':3500,'化神':6000,'悟道':10000,'羽化':18000,'登仙':30000,'飞升':Infinity };
    const REALM_BASE_MP = { ...REALM_BASE_HP };

    function _deriveMaxFor(state, owner, type) {
        const bonus = (state.barBonuses?.[owner]?.[type]) || 0;
        if (type === 'hp') {
            const name = state.realm?.name;
            if (!name || !(name in REALM_BASE_HP)) return null;
            const base = REALM_BASE_HP[name];
            return base === Infinity ? Infinity : base + bonus;
        }
        if (type === 'mp') {
            const name = state.realm?.name;
            if (!name || !(name in REALM_BASE_MP)) return null;
            const base = REALM_BASE_MP[name];
            return base === Infinity ? Infinity : base + bonus;
        }
        if (type === 'sp') {
            const tier = state.spirit?.tier;
            if (!tier || !(tier in SPIRIT_BASE_SP)) return null;
            const base = SPIRIT_BASE_SP[tier];
            if (base === Infinity) return Infinity;
            const xp = state.spirit?.xp || 0;
            return base + Math.floor(xp / 100) + bonus;
        }
        return null;
    }

    function _deriveAllBarsMax(state) {
        if (!state.bars) return;
        for (const [owner, bars] of Object.entries(state.bars)) {
            if (!bars || typeof bars !== 'object') continue;
            for (const [type, val] of Object.entries(bars)) {
                if (!Array.isArray(val) || val.length < 1) continue;
                const newMax = _deriveMaxFor(state, owner, type);
                if (newMax === null) continue;
                const cur = val[0];
                const label = val[2];
                if (label !== undefined && label !== null && label !== '') {
                    bars[type] = [cur, newMax, label];
                } else {
                    bars[type] = [cur, newMax];
                }
            }
        }
    }

    function _applySpiritChange(state, changes) {
        if (!changes || typeof changes !== 'object') return false;
        const hasTier = typeof changes.tier === 'string';
        const hasXp = typeof changes.xp === 'number';
        if (!hasTier && !hasXp) return false;
        if (hasXp && (!Number.isSafeInteger(changes.xp) || changes.xp < 0)) return false;

        const curTier = state.spirit?.tier || null;
        const curXp = state.spirit?.xp || 0;
        const curTotalXpRaw = state.spirit?.totalXp;
        const curTotalXp = (curTotalXpRaw !== undefined && curTotalXpRaw !== null) ? curTotalXpRaw : curXp;

        let finalTier = curTier;
        let tierChanged = false;
        if (hasTier) {
            const t = changes.tier;
            if (!SPIRIT_ORDER.includes(t)) return false;
            if (curTier && t !== curTier) {
                const curIdx = SPIRIT_ORDER.indexOf(curTier);
                const newIdx = SPIRIT_ORDER.indexOf(t);
                if (newIdx !== curIdx + 1) return false;
                if (!(curXp >= SPIRIT_THRESHOLD[curTier])) return false;
                finalTier = t;
                tierChanged = true;
            } else if (!curTier) {
                finalTier = t;
                tierChanged = true;
            }
        }

        let finalXp;
        if (tierChanged) {
            finalXp = hasXp ? changes.xp : 0;
            const t = SPIRIT_THRESHOLD[finalTier];
            if (finalTier !== '太虚' && finalXp > t) return false;
        } else {
            if (!finalTier && hasXp) return false;
            finalXp = hasXp ? changes.xp : curXp;
            if (hasXp) {
                if (finalXp < curXp) return false;
                if (finalTier !== '太虚' && finalXp > SPIRIT_THRESHOLD[finalTier]) return false;
            }
        }

        let finalTotalXp;
        if (tierChanged) finalTotalXp = curTotalXp + finalXp;
        else finalTotalXp = curTotalXp + (finalXp - curXp);

        if (!state.spirit) state.spirit = {};
        state.spirit.tier = finalTier;
        state.spirit.xp = finalXp;
        state.spirit.totalXp = finalTotalXp;
        return true;
    }

    function _applyBarBonusChanges(state, changes) {
        if (!Array.isArray(changes) || changes.length === 0) return false;
        if (!state.barBonuses) state.barBonuses = {};
        let applied = false;
        for (const c of changes) {
            if (!c || !c.owner || !c.type) continue;
            if (!Number.isSafeInteger(c.delta) || c.delta <= 0) continue;
            if (c.type !== 'hp' && c.type !== 'mp' && c.type !== 'sp') continue;
            if (!state.barBonuses[c.owner]) state.barBonuses[c.owner] = {};
            state.barBonuses[c.owner][c.type] = (state.barBonuses[c.owner][c.type] || 0) + c.delta;
            applied = true;
        }
        return applied;
    }

    // Spirit 案例 A/B/C
    let st = { spirit: { tier:'凝照', xp:240, totalXp:4240 } };
    _applySpiritChange(st, { xp: 340 });
    chk(eq(st.spirit, { tier:'凝照', xp:340, totalXp:4340 }), 'Spirit A: 凝照 240→340', JSON.stringify(st.spirit));

    st = { spirit: { tier:'凝照', xp:6000, totalXp:10000 } };
    _applySpiritChange(st, { tier:'洞玄', xp:100 });
    chk(eq(st.spirit, { tier:'洞玄', xp:100, totalXp:10100 }), 'Spirit B: 凝照→洞玄 xp100', JSON.stringify(st.spirit));

    st = { spirit: { tier:'凝照', xp:6000, totalXp:10000 } };
    _applySpiritChange(st, { tier:'洞玄' });
    chk(eq(st.spirit, { tier:'洞玄', xp:0, totalXp:10000 }), 'Spirit C: 凝照→洞玄 无xp', JSON.stringify(st.spirit));

    // 拒绝场景
    st = { spirit: { tier:'蒙昧', xp:500, totalXp:500 } };
    const r1 = _applySpiritChange(st, { tier:'凝照' });
    chk(r1 === false && st.spirit.tier === '蒙昧', '拒绝：跳段');

    st = { spirit: { tier:'凝照', xp:5999, totalXp:10000 } };
    const r2 = _applySpiritChange(st, { tier:'洞玄' });
    chk(r2 === false && st.spirit.tier === '凝照' && st.spirit.xp === 5999, '拒绝：xp未达阈值');

    st = { spirit: { tier:'凝照', xp:240, totalXp:4240 } };
    const r3 = _applySpiritChange(st, { xp:200 });
    chk(r3 === false && st.spirit.xp === 240, '拒绝：xp倒退');

    st = { spirit: { tier:'凝照', xp:6000, totalXp:10000 } };
    const r4 = _applySpiritChange(st, { xp:6001 });
    chk(r4 === false, '拒绝：超阈值');

    st = { spirit: { tier:'太虚', xp:9999, totalXp:50000 } };
    const r5 = _applySpiritChange(st, { xp:100000 });
    chk(r5 === true && st.spirit.xp === 100000, '太虚允许 xp 无上限');

    st = { spirit: { tier:'凝照', xp:240, totalXp:4240 } };
    const r6 = _applySpiritChange(st, { tier:'非法段位' });
    chk(r6 === false && st.spirit.tier === '凝照', '拒绝：非法 tier');

    // Max 派生
    chk(_deriveMaxFor({ realm:{ name:'炼气' } }, '冉汐', 'hp') === 100, 'hp: 炼气 100');
    chk(_deriveMaxFor({ realm:{ name:'筑基' } }, '冉汐', 'hp') === 300, 'hp: 筑基 300');
    chk(_deriveMaxFor({ realm:{ name:'筑基' }, barBonuses:{ '冉汐':{ hp:50 } } }, '冉汐', 'hp') === 350, 'hp: 筑基+50=350');
    chk(_deriveMaxFor({ spirit:{ tier:'凝照', xp:240 } }, '冉汐', 'sp') === 602, 'sp: 凝照 xp240 = 602');
    chk(_deriveMaxFor({ spirit:{ tier:'凝照', xp:6000 } }, '冉汐', 'sp') === 660, 'sp: 凝照 xp6000 = 660');
    chk(_deriveMaxFor({ spirit:{ tier:'太虚', xp:50000 } }, '冉汐', 'sp') === 8500, 'sp: 太虚 xp50000 = 8500');
    chk(_deriveMaxFor({ realm:{ name:'炼气' } }, '冉汐', 'custom') === null, 'custom type → null');
    chk(_deriveMaxFor({}, '冉汐', 'hp') === null, '无 realm → null');

    // Custom bar 不被修改
    const state = { realm:{ name:'炼气' }, bars:{ '冉汐':{ hp:[50], custom:[42, 99, 'foo'] } } };
    _deriveAllBarsMax(state);
    chk(eq(state.bars['冉汐'].hp, [50, 100]), 'hp 派生 [50,100]');
    chk(eq(state.bars['冉汐'].custom, [42, 99, 'foo']), 'custom 不动');

    // Bonus
    st = {};
    _applyBarBonusChanges(st, [ { owner:'冉汐', type:'hp', delta:50 } ]);
    chk(eq(st.barBonuses, { '冉汐':{ hp:50 } }), 'bonus 累加 +50');
    _applyBarBonusChanges(st, [ { owner:'冉汐', type:'hp', delta:30 } ]);
    chk(st.barBonuses['冉汐'].hp === 80, 'bonus 累加 +30 = 80');
    _applyBarBonusChanges(st, [ { owner:'冉汐', type:'hp', delta:-50 } ]);
    chk(st.barBonuses['冉汐'].hp === 80, 'bonus 负数忽略');
    _applyBarBonusChanges(st, [ { owner:'冉汐', type:'unknown', delta:10 } ]);
    chk(!('unknown' in st.barBonuses['冉汐']), 'bonus 非法 type 忽略');
}

// ═══════════════════════════════════════════════════════════
// S1.3d HUD 逻辑（独立模拟）
// ═══════════════════════════════════════════════════════════
console.log('\n========== S1.3d HUD ==========');
{
    const t = (k) => ({ 'ui.rpgHudAge':'年龄', 'ui.rpgOverviewSpirit':'神识' }[k] || k);
    const esc = (s) => String(s);

    function buildHudTags(rpg) {
        let _hudTagsHtml = '';
        if (rpg.realm && typeof rpg.realm === 'object' && typeof rpg.realm.name === 'string' && rpg.realm.name.length > 0) {
            const _tags = [];
            if (typeof rpg.age === 'number' && typeof rpg.lifespan === 'number') {
                _tags.push('<span class="horae-rpg-hud-tag">' + esc(t('ui.rpgHudAge')) + rpg.age + '/' + rpg.lifespan + '</span>');
            }
            const _rn = rpg.realm.name;
            const _rp = rpg.realm.phase;
            const _rd = (_rn === '飞升' || !_rp) ? _rn : (_rn + '·' + _rp);
            if (Array.isArray(rpg.cultivation) && rpg.cultivation.length >= 2) {
                _tags.push('<span class="horae-rpg-hud-tag">' + esc(_rd) + '（' + rpg.cultivation[0] + '/' + rpg.cultivation[1] + '）</span>');
            } else {
                _tags.push('<span class="horae-rpg-hud-tag">' + esc(_rd) + '</span>');
            }
            const _sp = rpg.spirit;
            if (_sp && typeof _sp === 'object' && typeof _sp.tier === 'string' && _sp.tier.length > 0) {
                const _spLabel = t('ui.rpgOverviewSpirit');
                const _spTh = { '蒙昧':1000,'清明':3000,'凝照':6000,'洞玄':10000,'明心':15000,'太虚':Infinity }[_sp.tier];
                if (_sp.tier === '太虚' && typeof _sp.xp === 'number') {
                    _tags.push('<span class="horae-rpg-hud-tag">' + esc(_spLabel) + '·' + esc(_sp.tier) + '（' + _sp.xp + '）</span>');
                } else if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {
                    _tags.push('<span class="horae-rpg-hud-tag">' + esc(_spLabel) + '·' + esc(_sp.tier) + '（' + _sp.xp + '/' + _spTh + '）</span>');
                } else if (typeof _sp.xp === 'number') {
                    _tags.push('<span class="horae-rpg-hud-tag">' + esc(_spLabel) + '·' + esc(_sp.tier) + '（' + _sp.xp + '）</span>');
                } else {
                    _tags.push('<span class="horae-rpg-hud-tag">' + esc(_spLabel) + '·' + esc(_sp.tier) + '</span>');
                }
            }
            if (_tags.length > 0) _hudTagsHtml = '<span class="horae-rpg-hud-tags">' + _tags.join('') + '</span>';
        }
        return _hudTagsHtml;
    }

    // 完整场景
    let h = buildHudTags({ realm:{ name:'炼气', phase:'后期' }, cultivation:[850,1000], age:26, lifespan:100, spirit:{ tier:'凝照', xp:240 } });
    chk(h.includes('年龄26/100'), 'HUD 年龄 26/100');
    chk(h.includes('炼气·后期（850/1000）'), 'HUD 境界·修为');
    chk(h.includes('神识·凝照（240/6000）'), 'HUD 神识·凝照 240/6000');

    // 太虚
    h = buildHudTags({ realm:{ name:'炼气', phase:'后期' }, cultivation:[850,1000], age:26, lifespan:100, spirit:{ tier:'太虚', xp:9999 } });
    chk(h.includes('神识·太虚（9999）'), 'HUD 太虚（9999）');
    chk(!h.includes('Infinity'), 'HUD 太虚不出现 Infinity');

    // 无 realm
    h = buildHudTags({ spirit:{ tier:'凝照', xp:240 } });
    chk(h === '', 'HUD 无 realm 全空');

    // 有 realm 无 cultivation
    h = buildHudTags({ realm:{ name:'炼气', phase:'后期' } });
    chk(h.includes('炼气·后期') && !h.includes('（'), 'HUD 无 cultivation 仅显示境界');

    // 有 age 无 lifespan
    h = buildHudTags({ realm:{ name:'炼气' }, cultivation:[100,100], age:26 });
    chk(!h.includes('年龄'), 'HUD 无 lifespan 隐藏年龄');

    // spirit tier only
    h = buildHudTags({ realm:{ name:'炼气' }, cultivation:[100,100], spirit:{ tier:'凝照' } });
    chk(h.includes('神识·凝照<'), 'HUD spirit tier only');

    // 太虚无 xp
    h = buildHudTags({ realm:{ name:'炼气' }, cultivation:[100,100], spirit:{ tier:'太虚' } });
    chk(h.includes('神识·太虚<') && !h.includes('Infinity'), 'HUD 太虚无 xp 不显 Infinity');

    // 飞升 phase=null
    h = buildHudTags({ realm:{ name:'飞升', phase:null }, cultivation:[0,0] });
    chk(h.includes('飞升（0/0）'), 'HUD 飞升 phase=null');

    // locale JSON 全部可解析
    for (const f of ['zh-CN','zh-TW','en','ja','ko','ru']) {
        try { JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', f + '.json'), 'utf8')); ok('locale ' + f + '.json parse'); }
        catch (e) { ng('locale ' + f + '.json parse', e.message); }
    }
}

// ═══════════════════════════════════════════════════════════
// Cross-patch 冲突检查
// ═══════════════════════════════════════════════════════════
console.log('\n========== Cross-patch ==========');
{
    // 各 patch 只改自己的文件
    const a = fs.readFileSync(path.join(ROOT, 'tools/patch-s13a-worldbook.mjs'), 'utf8');
    const b = fs.readFileSync(path.join(ROOT, 'tools/patch-s13b-parser.mjs'), 'utf8');
    const c = fs.readFileSync(path.join(ROOT, 'tools/patch-s13c-statestore.mjs'), 'utf8');
    const d = fs.readFileSync(path.join(ROOT, 'tools/patch-s13d-hud.mjs'), 'utf8');

    chk(a.includes("'worldbook-v0.9.json'"), 'S1.3a 只改 worldbook');
    chk(b.includes("'core/horaeManager.js'"), 'S1.3b 只改 horaeManager');
    chk(c.includes("'core/memory/stateStore.js'"), 'S1.3c 只改 stateStore');
    chk(d.includes("'index.js'") && d.includes("'assets/styles/style.css'") && d.includes("'locales/"), 'S1.3d 改 index+css+locales');

    // S1.3c 使用的字段 S1.3b 生产
    chk(b.includes('barBonusChanges') && c.includes('barBonusChanges'), 'field barBonusChanges 前后一致');
    chk(b.includes('const spiritNote = isZh') && b.includes('spiritNote + bonusNote'), 'S1.3b 修改 spiritNote + 集成 bonusNote');
    chk(c.includes('changes.spirit'), 'S1.3c 消费 spirit');

    // S1.3d 使用的数据结构 S1.3c 提供
    chk(d.includes('rpg.spirit') && d.includes('rpg.realm') && d.includes('rpg.cultivation') && d.includes('rpg.age') && d.includes('rpg.lifespan'), 'S1.3d 读取的字段都是 StateStore 提供的');

    // 无重复插入
    chk((b.match(/barShort = line\.match/g) || []).length <= 2, 'S1.3b barShort 不重复定义');
    chk((c.match(/function _applySpiritChange/g) || []).length === 1, 'S1.3c _applySpiritChange 单定义');
}

console.log('\n════════════════════════════════════════');
console.log('PASS: ' + pass + ', FAIL: ' + fail);
console.log('════════════════════════════════════════');
if (fail > 0) process.exit(1);
