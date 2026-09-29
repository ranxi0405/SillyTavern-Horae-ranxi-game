#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WB = path.join(ROOT, 'worldbook-v0.9.json');
const BACKUP = WB + '.bak-before-w4';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, WB); fs.unlinkSync(BACKUP);
    console.log('rolled back ' + path.basename(WB)); process.exit(0);
}

console.log('=== W4: Worldbook 边界表述修正（5 处，跨 3 个 uid）===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('file: ' + path.relative(ROOT, WB));
console.log('');

const data = JSON.parse(fs.readFileSync(WB, 'utf8'));
const entries = data.entries || {};

function findUidByComment(fragment) {
    for (const [uid, e] of Object.entries(entries)) {
        if (e.comment && e.comment.includes(fragment)) return uid;
    }
    return null;
}

const uid2 = findUidByComment('修仙境界与寿元');
const uid7 = findUidByComment('道基、突破与特殊机制');
const uid12 = findUidByComment('飞升');

if (!uid2 || !uid7 || !uid12) {
    console.error('XX 未找到必要条目');
    console.error('  uid2(修仙境界与寿元): ' + uid2);
    console.error('  uid7(道基、突破与特殊机制): ' + uid7);
    console.error('  uid12(飞升): ' + uid12);
    process.exit(1);
}

console.log('target uid2 : ' + uid2 + ' ' + entries[uid2].comment);
console.log('target uid7 : ' + uid7 + ' ' + entries[uid7].comment);
console.log('target uid12: ' + uid12 + ' ' + entries[uid12].comment);
console.log('');

let failed = 0;
const summary = [];

function patchEntry(uid, name, before, after, appliedCheck, expectedOcc = 1) {
    const e = entries[uid];
    if (!e) { console.error('  XX ' + name + ' uid ' + uid + ' 不存在'); failed++; return; }
    if (appliedCheck && e.content.includes(appliedCheck) && !e.content.includes(before)) {
        console.log('  .. ' + name + ' (already)');
        summary.push({ name, action: 'already' });
        return;
    }
    const occ = e.content.split(before).length - 1;
    if (occ === 0) {
        // 检查是否 already
        if (appliedCheck && e.content.includes(appliedCheck)) {
            console.log('  .. ' + name + ' (already)');
            summary.push({ name, action: 'already' });
            return;
        }
        console.error('  XX ' + name + ' anchor NOT FOUND');
        failed++;
        return;
    }
    if (occ !== expectedOcc) {
        console.error('  XX ' + name + ' occ=' + occ + ' expect=' + expectedOcc);
        failed++;
        return;
    }
    console.log('  OK ' + name + ' (' + occ + ' 处)');
    e.content = e.content.split(before).join(after);
    summary.push({ name, action: 'patched' });
}

// ── P1: uid=2 删"飞升 无上限" ──
patchEntry(uid2, 'P1 删"飞升 无上限"行',
    `登仙 30000 / 30000\n飞升 无上限\n\n角色年龄和寿元属于持续状态数据`,
    `登仙 30000 / 30000\n\n角色年龄和寿元属于持续状态数据`,
    null, 1
);

// ── P2: uid=2 删整段飞升机制 ──
patchEntry(uid2, 'P2 删整段飞升机制',
    `\n\n飞升机制：\n飞升不因修为达到某固定数值自动触发，由独立机制、玩家行动与判定决定。\n达到登仙圆满后，修士可选择主动发起飞升 → 触发判定。\n判定依据：修为、道心、仙缘、天时、因果等。\n可能结果：成功可结束游戏或继续（飞升者身份）；失败可能陨落、重伤、修为倒退、或保住一线生机。\n可选择不飞升继续修行，修为累积作为仙力。\n飞升成功后 realm=飞升、phase=null，修为继续无上限。\n飞升与否、成败，全由玩家行动与判定决定。`,
    ``,
    null, 1
);

// ── P3: uid=2 登仙之后 → 登仙圆满之后 ──
patchEntry(uid2, 'P3 登仙之后 → 登仙圆满之后',
    `登仙之后不再属于普通境界提升`,
    `登仙圆满之后不再属于普通境界提升`,
    `登仙圆满之后不再属于普通境界提升`, 1
);

// ── P4: uid=7 筑基之后形成道基 → 突破筑基后形成道基 ──
patchEntry(uid7, 'P4 筑基之后形成道基 → 突破筑基后形成道基',
    `筑基之后形成道基`,
    `突破筑基后形成道基`,
    `突破筑基后形成道基`, 1
);

// ── P5: uid=12 登仙之后 → 登仙圆满之后 ──
patchEntry(uid12, 'P5 登仙之后，修士面临 → 登仙圆满之后，修士面临',
    `登仙之后，修士面临`,
    `登仙圆满之后，修士面临`,
    `登仙圆满之后，修士面临`, 1
);

// ── 校验 ──
console.log('');
console.log('=== 校验 ===');

function check(name, cond) {
    if (cond) console.log('  ✅ ' + name);
    else { console.error('  ❌ ' + name); failed++; }
}

check('uid2 不含"飞升 无上限"',           !entries[uid2].content.includes('飞升 无上限'));
check('uid2 不含"飞升机制："',             !entries[uid2].content.includes('飞升机制：'));
check('uid2 含"登仙圆满之后不再属于普通境界"', entries[uid2].content.includes('登仙圆满之后不再属于普通境界'));
check('uid2 保留第一句境界序列"登仙、飞升。"',  entries[uid2].content.includes('登仙、飞升。'));
check('uid7 含"突破筑基后形成道基"',        entries[uid7].content.includes('突破筑基后形成道基'));
check('uid7 不含"筑基之后形成道基"',        !entries[uid7].content.includes('筑基之后形成道基'));
check('uid12 含"登仙圆满之后，修士面临"',    entries[uid12].content.includes('登仙圆满之后，修士面临'));
check('uid12 不含"登仙之后，修士面临"',      !entries[uid12].content.includes('登仙之后，修士面临'));
console.log('');

if (failed > 0) {
    console.error('APPLY ABORTED: ' + failed + ' 处失败');
    process.exit(1);
}

if (DRY_RUN) { console.log('[DRY-RUN] 未写入'); process.exit(0); }

if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(WB, BACKUP);
    console.log('backup: ' + path.basename(BACKUP));
} else {
    console.log('backup exists (skip)');
}

fs.writeFileSync(WB, JSON.stringify(data, null, 2), 'utf8');
console.log('written ' + path.basename(WB));

try {
    JSON.parse(fs.readFileSync(WB, 'utf8'));
    console.log('JSON OK');
} catch (e) {
    console.error('XX JSON 校验失败:', e.message);
    fs.copyFileSync(BACKUP, WB);
    console.log('已从备份恢复');
    process.exit(1);
}

console.log('');
console.log('=== SUMMARY ===');
for (const s of summary) console.log('  ' + s.action + '  ' + s.name);
console.log('done.');
