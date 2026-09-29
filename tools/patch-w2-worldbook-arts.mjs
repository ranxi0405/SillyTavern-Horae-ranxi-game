#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WB = path.join(ROOT, 'worldbook-v0.9.json');
const BACKUP = WB + '.bak-before-w2';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, WB); fs.unlinkSync(BACKUP);
    console.log('rolled back ' + path.basename(WB)); process.exit(0);
}

const OLD_BLOCK = `各品阶对应熟练度区间：
学徒 0~19
一品 20~99
二品 100~499
三品 500~2999
四品 3000~7999
五品 8000~29999
六品 30000+`;

const NEW_BLOCK = `各品阶对应熟练度区间：
学徒 0~20
一品 21~100
二品 101~500
三品 501~3000
四品 3001~8000
五品 8001~30000
六品 30001+`;

const OLD_EXAMPLE = `示例：学徒（19/19）→ 一品（20/99）→ 二品（100/499）→ 三品（500/2999）`;
const NEW_EXAMPLE = `示例：学徒（20/20）→ 一品（21/100）→ 二品（101/500）→ 三品（501/3000）`;

const TARGET_COMMENT = '功法与六艺';
const APPLIED_MARK = '学徒 0~20';

console.log('=== W2: Worldbook uid=6 六艺段位区间同步 ===');
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

if (!target.content.includes(OLD_BLOCK)) {
    console.error('XX content 中未找到段位区间锚点块');
    process.exit(1);
}

const occ1 = target.content.split(OLD_BLOCK).length - 1;
const occ2 = target.content.split(OLD_EXAMPLE).length - 1;
console.log('anchor1 (段位块) 出现次数: ' + occ1 + ' (期望 1)');
console.log('anchor2 (示例行) 出现次数: ' + occ2 + ' (期望 1)');

if (occ1 !== 1 || occ2 !== 1) {
    console.error('XX 锚点匹配异常，中止');
    process.exit(1);
}

let newContent = target.content.replace(OLD_BLOCK, NEW_BLOCK);
newContent = newContent.replace(OLD_EXAMPLE, NEW_EXAMPLE);

console.log('');
console.log('--- before (部分) ---');
console.log(OLD_BLOCK);
console.log('--- after (部分) ---');
console.log(NEW_BLOCK);
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
