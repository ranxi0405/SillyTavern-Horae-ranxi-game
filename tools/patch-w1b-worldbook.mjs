#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WB = path.join(ROOT, 'worldbook-v0.9.json');
const BACKUP = WB + '.bak-before-w1b';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, WB); fs.unlinkSync(BACKUP);
    console.log('rolled back ' + path.basename(WB)); process.exit(0);
}

// 旧块（W1 写入的灵根段，锚点唯一）
const OLD_BLOCK = [
    '五行灵根属于正常灵根体系，按属性数量与纯度划分资质：',
    '五系（含金木水火土）、四系：属性驳杂，资质较低，常被称为伪灵根。',
    '三系：中等资质。',
    '双系：资质较好。',
    '单系（纯灵根）：单一属性，资质优秀。',
    '此外还有更高层次的地灵根、天灵根，以及由五行变化而来的变异灵根（如冰、雷、风）。',
].join('\n');

// 新块（五行灵根 + 传统分级）
const NEW_BLOCK = [
    '灵根由五行属性（金、木、水、火、土）构成，属性数量与纯度决定资质高低，是修仙界通用的判定标准。', '',
    '伪灵根：具备四种或五种五行属性，属性驳杂不纯，灵力分散，修炼速度最慢，最为常见。',
    '真灵根：具备两种或三种五行属性，属性相对纯净，修炼速度正常。',
    '地灵根：单一或双系且纯度较高，资质优于真灵根，较为罕见。',
    '天灵根：单一五行属性且纯度极高，修炼天赋顶尖，千年难遇。',
    '变异灵根：五行属性异变而成的特殊灵根（如冰、雷、风、暗等），修炼方向与威力独特，限制亦随之而来。',
].join('\n');

const TARGET_COMMENT = '灵根、体质与五维属性';
const APPLIED_MARK = '伪灵根：具备四种或五种五行属性';
const OLD_MARK = '五行灵根属于正常灵根体系';

console.log('=== W1b: Worldbook uid=4 灵根段修正 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('file: ' + path.relative(ROOT, WB));
console.log('');

const data = JSON.parse(fs.readFileSync(WB, 'utf8'));
const entries = data.entries || {};
let targetUid = null;
let target = null;

for (const [uid, entry] of Object.entries(entries)) {
    if (entry.comment && entry.comment.includes(TARGET_COMMENT)) {
        targetUid = uid;
        target = entry;
        break;
    }
}

if (!target) {
    console.error('XX 未找到 comment 包含 "' + TARGET_COMMENT + '" 的 entry');
    process.exit(1);
}

console.log('target uid: ' + targetUid);
console.log('target comment: ' + target.comment);
console.log('');

if (target.content.includes(APPLIED_MARK)) {
    console.log('already applied (content 已包含新标记)');
    process.exit(0);
}

if (!target.content.includes(OLD_MARK)) {
    console.error('XX content 中未找到锚点 "' + OLD_MARK + '"');
    console.error('当前 content 前 200 字:');
    console.error(target.content.slice(0, 200));
    process.exit(1);
}

const occ = target.content.split(OLD_BLOCK).length - 1;
console.log('anchor 出现次数: ' + occ);
if (occ !== 1) {
    console.error('XX 锚点匹配 ' + occ + ' 次，期望 1 次');
    process.exit(1);
}

const newContent = target.content.replace(OLD_BLOCK, NEW_BLOCK);

console.log('');
console.log('--- 旧灵根段 ---');
console.log(OLD_BLOCK);
console.log('');
console.log('--- 新灵根段 ---');
console.log(NEW_BLOCK);
console.log('');
console.log('旧 content 长度: ' + target.content.length);
console.log('新 content 长度: ' + newContent.length);
console.log('');

if (DRY_RUN) {
    console.log('[DRY-RUN] 未写入');
    process.exit(0);
}

if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(WB, BACKUP);
    console.log('backup: ' + path.basename(BACKUP));
} else {
    console.log('backup exists (skip)');
}

target.content = newContent;
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
