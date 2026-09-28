#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WB = path.join(ROOT, 'worldbook-v0.9.json');
const BACKUP = WB + '.bak-before-w1';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, WB); fs.unlinkSync(BACKUP);
    console.log('rolled back ' + path.basename(WB)); process.exit(0);
}

const NEW_CONTENT = [
    '灵根影响修炼速度以及功法适配。', '',
    '五行灵根属于正常灵根体系，按属性数量与纯度划分资质：',
    '五系（含金木水火土）、四系：属性驳杂，资质较低，常被称为伪灵根。',
    '三系：中等资质。',
    '双系：资质较好。',
    '单系（纯灵根）：单一属性，资质优秀。',
    '此外还有更高层次的地灵根、天灵根，以及由五行变化而来的变异灵根（如冰、雷、风）。', '',
    '灵根与体质相互独立，可同时存在，部分组合会产生协同。', '',
    '修士体质存在等级差异，但具体分类不一而足。常见的有凡体、灵体，以及各类特殊体质（如火灵体、冰心体、雷灵体等），更高层次传闻存在道体乃至圣体。体质的种类、名称、成因与表现，可依据角色的出身、经历、机缘自然形成，不必拘泥于固定列表。', '',
    '体质影响修炼速度、突破成功率、功法适配、战斗表现与寿元。', '',
    '角色拥有资质、悟性、身灵、道心、仙缘五项基础属性，范围为1至100，基础上限为100，到达100后有特殊加成。', '',
    '资质主要影响修炼潜力，悟性影响理解与领悟，身灵影响身体与修炼相关表现，道心影响心境与心魔应对，仙缘影响机缘与运势。', '',
    '普通日常生活不会无理由提升属性。重大突破、机缘、试炼、传承或宝物等特殊情况可以产生永久变化。', '',
    '除主角外，NPC、弟子、修士、凡人等角色同样可以拥有不同的灵根、体质、血脉、天赋、悟性和其他资质。具体类型、稀有程度和实际表现，根据角色的出身、经历、环境、机缘及当前设定自然形成。',
].join('\n');

const TARGET_COMMENT = '灵根、体质与五维属性';
const APPLIED_MARK = '五行灵根属于正常灵根体系';

console.log('=== W1: Worldbook uid=4 灵根/体质/五维 ===');
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
console.log('target order: ' + target.order);
console.log('');

if (target.content.includes(APPLIED_MARK)) {
    console.log('already applied (content 已包含新标记)');
    process.exit(0);
}

console.log('--- before content (前 120 字) ---');
console.log(target.content.slice(0, 120) + (target.content.length > 120 ? '...' : ''));
console.log('');
console.log('--- after content (前 120 字) ---');
console.log(NEW_CONTENT.slice(0, 120) + '...');
console.log('');
console.log('before length: ' + target.content.length + ' 字符');
console.log('after  length: ' + NEW_CONTENT.length + ' 字符');
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

target.content = NEW_CONTENT;
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
