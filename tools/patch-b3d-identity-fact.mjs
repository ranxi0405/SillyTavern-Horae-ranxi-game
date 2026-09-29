#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'index.js');
const SUFFIX = '.bak-before-b3d';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    const b = F + SUFFIX;
    if (fs.existsSync(b)) { fs.copyFileSync(b, F); fs.unlinkSync(b); console.log('restored'); }
    else console.log('no backup');
    process.exit(0);
}

console.log('=== B3d: 主角 identity predicate 排除（Prompt + Parser） ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

let content = raw;
let failed = 0;

function apply(name, before, after, appliedCheck, expectedOcc = 1) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); failed++; return; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' occ=' + occ + ' expect=' + expectedOcc); failed++; return; }
    console.log('  OK ' + name);
    content = content.split(before).join(after);
}

// ── P1：修正"五维、境界、灵根"边界 ──
apply(
    'B3d-P1 角色卡固有设定段边界修正',
    `- 主角已有的基础属性值（五维、境界、灵根）`,
    `- 主角已有的基础属性值（五维、灵根、体质等）`,
    `- 主角已有的基础属性值（五维、灵根、体质等）`,
    1
);

// ── P2：改示例 + 追加主角 identity 排除段 ──
{
    const before = [
        '应提取的示例（Fact 独有，不属 State）：',
        '✅ 冉汐|门派|落霞宗',
        '✅ 冉汐|身份|外门弟子',
        '✅ 冉汐|灵根|杂灵根',
        '✅ 冉汐|性别|女',
    ].join('\n');
    const after = [
        '应提取的示例（Fact 独有，不属 State）：',
        '✅ 冉汐|门派|落霞宗',
        '✅ 冉汐|身份|外门弟子',
        '✅ 冉汐|性别|女',
        '',
        '【主角 identity-owned predicate —— 永不提取】',
        '以下 predicate 对**主角**由角色卡 extensions.horae.identity 管理，永不提取为 Fact：',
        '- 灵根（主角由 identity.spiritRoot 管理）',
        '- 体质（主角由 identity.constitution 管理）',
        '- 固有天赋（主角由 identity.talents 管理）',
        '- 血脉（主角由 identity.bloodline 管理）',
        '- 仙姿（主角由 identity.xianZi 管理）',
        '',
        '主角的出生背景（background）同样不提取为 Fact。',
        '',
        '⚠️ 重要边界：NPC 同样拥有灵根、体质、血脉、天赋等固有设定。',
        '**NPC 的这类信息属于剧情事实，应正常提取为 Fact**。',
        '本规则只针对主角。',
        '',
        '不应提取的示例（限主角）：',
        '❌ 冉汐|灵根|无界灵根       ← 主角 identity 已管理',
        '❌ 冉汐|体质|无界道体       ← 主角 identity 已管理',
        '❌ 冉汐|固有天赋|过目不忘   ← 主角 identity 已管理',
        '',
        '应提取的示例（NPC 固有设定）：',
        '✅ 某NPC|灵根|天灵根',
        '✅ 某NPC|体质|火灵体',
        '✅ 某NPC|血脉|雷鹏血脉',
    ].join('\n');
    apply('B3d-P2 移除矛盾示例 + 追加主角 identity 排除段', before, after,
        '【主角 identity-owned predicate —— 永不提取】', 1);
}

// ── P3：IDENTITY_OWNED_PREDICATES 定义 + helper ──
{
    const before = `const HIDDEN_KEYWORDS = [
    '无界灵根',
    '无界道体',
];`;
    const after = `const HIDDEN_KEYWORDS = [
    '无界灵根',
    '无界道体',
];

/* ============================================================
 * Fact 提取：主角 identity-owned predicate 硬约束
 * 仅对主角（user 角色）生效；NPC 的灵根/体质/天赋等属于 Fact
 * ============================================================ */
const IDENTITY_OWNED_PREDICATES = new Set([
    '灵根', '体质', '天赋', '血脉', '仙姿',
]);

function _isMainCharacterSubject(subject) {
    const mc = getContext()?.name1 || '';
    return !!mc && subject === mc;
}`;
    apply('B3d-P3 IDENTITY_OWNED_PREDICATES + helper 定义', before, after,
        'function _isMainCharacterSubject(subject) {', 1);
}

// ── P4：parser 层过滤（限定主角） ──
{
    const before = `        if (HIDDEN_KEYWORDS.some(kw => haystack.includes(kw))) {
            console.warn('[Horae][Fact] 命中黑名单，丢弃:', subject, predicate, objectValue);
            continue;
        }`;
    const after = `        if (HIDDEN_KEYWORDS.some(kw => haystack.includes(kw))) {
            console.warn('[Horae][Fact] 命中黑名单，丢弃:', subject, predicate, objectValue);
            continue;
        }

        // 主角 identity-owned predicate 硬过滤（仅对主角生效，NPC 的灵根/体质等正常提取）
        if (_isMainCharacterSubject(subject) && IDENTITY_OWNED_PREDICATES.has(predicate)) {
            console.warn('[Horae][Fact] 主角 identity-owned predicate 命中，丢弃:', subject, predicate, objectValue);
            continue;
        }`;
    apply('B3d-P4 parser 层硬过滤（限定主角）', before, after,
        '// 主角 identity-owned predicate 硬过滤（仅对主角生效，NPC 的灵根/体质等正常提取）', 1);
}

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, nothing written.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('APPLIED: ' + path.basename(F));
console.log('done.');
