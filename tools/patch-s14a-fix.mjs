#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s14a-fix';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    if (!fs.existsSync(BACKUP)) { console.error('no backup'); process.exit(1); }
    fs.copyFileSync(BACKUP, FILE); fs.unlinkSync(BACKUP);
    console.log('rolled back'); process.exit(0);
}

const raw = fs.readFileSync(FILE, 'utf8');
const isCRLF = raw.includes('\r\n');
let content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;
let changed = 0, failed = 0;

function applyReplace(name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return 0; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return -1; }
    if (occ > 1) { console.error('  XX ' + name + ' (' + occ + ' matches)'); return -1; }
    content = content.replace(before, after);
    console.log('  OK ' + name);
    return 1;
}

console.log('=== S1.4a-fix: bars 强格式 + Meta 空值/格式约束 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

// ═══ Patch 1: bars 长段加强格式强制 ═══
{
    const before = `                \`\\n【属性条——仅变化时写；未输出的字段保持当前值】\\n\`,
                \`\\n[Status Bars — write only on change; omitted = keep current value]\\n\`,
                \`\\n【ステータスバー——変化時のみ記載；省略＝現在値を保持】\\n\`,
                \`\\n【스테이터스 바 — 변화 시에만 기재; 생략 = 현재값 유지】\\n\`,
                \`\\n[Шкалы статуса — только при изменении; пропуск = сохранить текущее]\\n\``;
    const after = `                \`\\n【属性条——仅变化时写；未输出的字段保持当前值】\\n\` +
                \`严格使用协议格式（key:owner=value），禁止自然语言描述；空值字段不写行。\\n\` +
                \`✅ 正确: sp:冉汐=120   ❌ 错误: 冉汐: 气血 280/280 | 灵力 260/260\\n\`,
                \`\\n[Status Bars — write only on change; omitted = keep current]\\n\` +
                \`Strict protocol format (key:owner=value); NO natural language; skip empty fields.\\n\` +
                \`✅ Correct: sp:Alan=120   ❌ Wrong: Alan: HP 280/280 | MP 260/260\\n\`,
                \`\\n【ステータスバー——変化時のみ記載；省略＝現在値を保持】\\n\` +
                \`厳密なプロトコル形式（key:owner=value）を使用；自然言語禁止；空値行は書かない。\\n\` +
                \`✅ 正: sp:アラン=120   ❌ 誤: アラン: 気血 280/280 | 霊力 260/260\\n\`,
                \`\\n【스테이터스 바 — 변화 시에만 기재; 생략 = 현재값 유지】\\n\` +
                \`엄격한 프로토콜 형식(key:owner=value) 사용; 자연어 금지; 빈 값 행 미기재.\\n\` +
                \`✅ 올바름: sp:알란=120   ❌ 잘못: 알란: 기혈 280/280 | 영력 260/260\\n\`,
                \`\\n[Шкалы статуса — только при изменении; пропуск = сохранить]\\n\` +
                \`Строгий формат (key:owner=value); БЕЗ естественного языка; пустые поля не выводить.\\n\` +
                \`✅ Верно: sp:Алан=120   ❌ Неверно: Алан: HP 280/280 | MP 260/260\\n\``;
    const r = applyReplace('bars 强格式', before, after, '严格使用协议格式（key:owner=value），禁止自然语言描述');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// ═══ Patch 2: generateMetaDeltaPrompt 加空值 + 格式提示 ═══
{
    const before = `            '- event：本楼层有新事件才写；无事件不写\\n',`;
    const after = `            '- event：本楼层有新事件才写；无事件不写\\n' +
            '- 空值字段不要写行（如 affection: / npc: / agenda: / rel: 无数据则不写）\\n' +
            '- item 格式：item:名称=持有人@位置（单前缀，不重复 item:）\\n' +
            '- 六艺只用 craft:归属|名称|段位|累计值；不要用 skill: 加 craft 后缀\\n',`;
    const r = applyReplace('Meta 加空值/格式', before, after, '空值字段不要写行（如 affection:');
    if (r === 1) changed++; else if (r === -1) failed++;
}

console.log('');
console.log('changed: ' + changed + ', failed: ' + failed);
if (failed > 0) { console.error('abort'); process.exit(1); }
if (DRY_RUN) { console.log('[dry-run] not written'); process.exit(0); }
if (changed === 0) { console.log('nothing to update'); process.exit(0); }

if (fs.existsSync(BACKUP)) console.log('backup exists');
else { fs.copyFileSync(FILE, BACKUP); console.log('backed up'); }

fs.writeFileSync(FILE, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('written ' + path.basename(FILE));

const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) { console.error('syntax error:\n' + r.stderr); process.exit(2); }
console.log('syntax OK');