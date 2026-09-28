#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WB = path.join(ROOT, 'worldbook-v0.9.json');
const BACKUP = WB + '.bak-before-s13a';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, WB); fs.unlinkSync(BACKUP);
    console.log('rolled back ' + path.basename(WB)); process.exit(0);
}

const NEW_UID5 = [
    '【神识体系】', '',
    '神识境界依次为：',
    '蒙昧 → 清明 → 凝照 → 洞玄 → 明心 → 太虚',
    '只能顺序晋升，不可跳段。神识段位与修为境界完全独立。', '',
    '段内神识修为阈值：',
    '蒙昧：1000', '清明：3000', '凝照：6000', '洞玄：10000', '明心：15000', '太虚：无上限', '',
    '神识段内修为为当前段位的局部累计值。',
    '晋升至下一段位后，段内修为归零重新累计。',
    '另有终身累计神识值，不因段位晋升归零。', '',
    '晋升由 AI 声明，程序校验。段内修为未达阈值时不可晋升。', '',
    '各神识段位基础神念上限：',
    '蒙昧：100', '清明：250', '凝照：600', '洞玄：1500', '明心：3500', '太虚：8000', '',
    '神念是神识实际可调用的资源。神念会因使用而消耗，并可以自然恢复或通过修炼、丹药等方式恢复。',
    '神念上限 = 段位基础值 + floor(段内修为 / 100) + 永久加成。', '',
    '神识可以用于感知、探查、御物、识破幻术、战斗以及其他符合当前能力的行为。', '',
    '神识功法可提升神识修炼速度，加成系数与功法品阶一致。',
].join('\n');

const NEW_UID2 = [
    '修仙境界依次为：炼气、筑基、结晶、金丹、具灵、元婴、化神、悟道、羽化、登仙、飞升。每个大境界分为初期、中期、后期、圆满。必须完成当前境界的修为积累后，才能尝试突破下一境界。登仙之后不再属于普通境界提升，而涉及飞升与超脱。', '',
    '各境界基础寿元上限：',
    '炼气 100', '筑基 200', '结晶 300', '金丹 500', '具灵 800',
    '元婴 1200', '化神 2000', '悟道 5000', '羽化 10000', '登仙 50000', '',
    '各境界基础气血 / 灵力上限：',
    '炼气 100 / 100', '筑基 300 / 300', '结晶 600 / 600', '金丹 1200 / 1200', '具灵 2000 / 2000',
    '元婴 3500 / 3500', '化神 6000 / 6000', '悟道 10000 / 10000', '羽化 18000 / 18000',
    '登仙 30000 / 30000', '飞升 无上限', '',
    '角色年龄和寿元属于持续状态数据，时间经过会正常影响寿元。可通过丹药、机缘等永久增加。', '',
    '上述气血 / 灵力为基础上限，可由突破反哺、永久丹药、传承、宝物等长期效果永久提升。',
].join('\n');

console.log('=== S1.3a Worldbook ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('file: ' + WB);

const data = JSON.parse(fs.readFileSync(WB, 'utf8'));
let changed = 0;

for (const [uid, entry] of Object.entries(data.entries || {})) {
    if (entry.comment && entry.comment.includes('神识与神念')) {
        if (entry.content === NEW_UID5) console.log('  uid ' + uid + ' SKIP');
        else { entry.content = NEW_UID5; console.log('  uid ' + uid + ' APPLIED'); changed++; }
    }
    if (entry.comment && entry.comment.includes('修仙境界与寿元')) {
        if (entry.content === NEW_UID2) console.log('  uid ' + uid + ' SKIP');
        else { entry.content = NEW_UID2; console.log('  uid ' + uid + ' APPLIED'); changed++; }
    }
}

if (DRY_RUN) { console.log('[dry-run] pending ' + changed); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }
if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(WB, BACKUP); console.log('backed up: ' + path.basename(BACKUP)); }
fs.writeFileSync(WB, JSON.stringify(data, null, 2), 'utf8');
console.log('written ' + path.basename(WB));
JSON.parse(fs.readFileSync(WB, 'utf8'));
console.log('JSON OK');
