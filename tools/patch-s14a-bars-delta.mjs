#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s14a';
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

console.log('=== S1.4a: bars 改 Delta ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

// Patch 1: bars heading (5 lang)
{
    const before = `                \`\\n【属性条——每回合必写，缺少=不合格！】\\n\`,
                \`\\n[Status Bars — required every turn, missing = fail!]\\n\`,
                \`\\n【ステータスバー——毎ターン必須、欠落＝不合格！】\\n\`,
                \`\\n【스테이터스 바 — 매 턴 필수, 누락 = 불합격!】\\n\`,
                \`\\n[Шкалы статуса — обязательны каждый ход, пропуск = провал!]\\n\``;
    const after = `                \`\\n【属性条——仅变化时写；未输出的字段保持当前值】\\n\`,
                \`\\n[Status Bars — write only on change; omitted = keep current value]\\n\`,
                \`\\n【ステータスバー——変化時のみ記載；省略＝現在値を保持】\\n\`,
                \`\\n【스테이터스 바 — 변화 시에만 기재; 생략 = 현재값 유지】\\n\`,
                \`\\n[Шкалы статуса — только при изменении; пропуск = сохранить текущее]\\n\``;
    const r = applyReplace('heading', before, after, '【属性条——仅变化时写；未输出的字段保持当前值】');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 2: UO 分支 header
{
    const before = `                    \`仅输出\${userName}的属性条和状态：\\n\`,
                    \`Only output \${userName}'s status bars and status:\\n\`,
                    \`\${userName}のステータスバーとステータスのみを出力：\\n\`,
                    \`\${userName}의 스테이터스 바와 상태만 출력:\\n\`,
                    \`Выводите только шкалы статуса и состояние \${userName}:\\n\``;
    const after = `                    \`仅在 \${userName} 的属性条或状态变化时输出对应行：\\n\`,
                    \`Only when \${userName}'s status bars or status change, output those lines:\\n\`,
                    \`\${userName}のステータスバーまたは状態が変化した時のみ対応行を出力：\\n\`,
                    \`\${userName}의 스테이터스 바 또는 상태 변화 시에만 해당 행 출력:\\n\`,
                    \`Только при изменении шкал или статуса \${userName} выводите строки:\\n\``;
    const r = applyReplace('UO 分支', before, after, '仅在 ${userName} 的属性条或状态变化时输出对应行：');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 3: UO bar defs
{
    const before = `                        \`  ✅ \${bar.key}:当前/最大(\${bar.name})  ← 首次必须标注显示名\\n\`,
                        \`  ✅ \${bar.key}:current/max(\${bar.name})  ← must label display name on first use\\n\`,
                        \`  ✅ \${bar.key}:現在値/最大値(\${bar.name})  ← 初回は表示名を必ず記載\\n\`,
                        \`  ✅ \${bar.key}:현재/최대(\${bar.name})  ← 첫 사용 시 표시 이름 필수\\n\`,
                        \`  ✅ \${bar.key}:текущее/макс(\${bar.name})  ← при первом использовании укажите отображаемое имя\\n\``;
    const after = `                        \`  ✅ \${bar.key}:当前值  ← max 由系统自动派生，无需输出\\n\`,
                        \`  ✅ \${bar.key}:current value  ← max is derived by system; do NOT output\\n\`,
                        \`  ✅ \${bar.key}:現在値  ← maxはシステムが自動算出、出力不要\\n\`,
                        \`  ✅ \${bar.key}:현재값  ← max는 시스템이 자동 도출, 출력 불필요\\n\`,
                        \`  ✅ \${bar.key}:текущее  ← max вычисляется системой; не выводить\\n\``;
    const r = applyReplace('UO bar defs', before, after, '当前值  ← max 由系统自动派生，无需输出');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 4: non-UO header
{
    const before = `                    \`必须为 characters: 中每个在场角色输出全部属性条和状态：\\n\`,
                    \`MUST output ALL status bars and status for EVERY present character in characters: list:\\n\`,
                    \`characters: リスト内のすべての登場キャラクターについて、全ステータスバーとステータスを出力する必要があります：\\n\`,
                    \`characters: 목록의 모든 등장 캐릭터에 대해 전체 스테이터스 바와 상태를 출력해야 합니다:\\n\`,
                    \`НЕОБХОДИМО вывести ВСЕ шкалы статуса и состояние для КАЖДОГО присутствующего персонажа в списке characters:\\n\``;
    const after = `                    \`仅当 characters 中某角色的属性条或状态变化时，为该角色输出对应行：\\n\`,
                    \`Only when a present character's status bar or status changes, output that character's line:\\n\`,
                    \`登場キャラクターのステータスバーまたは状態が変化した時のみ、そのキャラクターの行を出力：\\n\`,
                    \`등장 캐릭터의 스테이터스 바 또는 상태 변화 시에만 해당 캐릭터의 행을 출력:\\n\`,
                    \`Только при изменении шкалы или статуса присутствующего персонажа выводите строку:\\n\``;
    const r = applyReplace('non-UO header', before, after, '仅当 characters 中某角色的属性条或状态变化时');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 5: non-UO bar defs
{
    const before = `                        \`  ✅ \${bar.key}:归属=当前/最大(\${bar.name})  ← 首次必须标注显示名\\n\`,
                        \`  ✅ \${bar.key}:\${own}=current/max(\${bar.name})  ← must label display name on first use\\n\`,
                        \`  ✅ \${bar.key}:\${own}=現在値/最大値(\${bar.name})  ← 初回は表示名を必ず記載\\n\`,
                        \`  ✅ \${bar.key}:\${own}=현재/최대(\${bar.name})  ← 첫 사용 시 표시 이름 필수\\n\`,
                        \`  ✅ \${bar.key}:\${own}=текущее/макс(\${bar.name})  ← при первом использовании укажите отображаемое имя\\n\``;
    const after = `                        \`  ✅ \${bar.key}:归属=当前值  ← max 由系统自动派生，无需输出\\n\`,
                        \`  ✅ \${bar.key}:\${own}=current value  ← max is derived by system; do NOT output\\n\`,
                        \`  ✅ \${bar.key}:\${own}=現在値  ← maxはシステムが自動算出、出力不要\\n\`,
                        \`  ✅ \${bar.key}:\${own}=현재값  ← max는 시스템이 자동 도출, 출력 불필요\\n\`,
                        \`  ✅ \${bar.key}:\${own}=текущее  ← max вычисляется системой; не выводить\\n\``;
    const r = applyReplace('non-UO bar defs', before, after, '${bar.key}:归属=当前值');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 6: Remove "每个在场角色必须写"
{
    const before = `                    \`  - 每个在场角色的每个属性条都必须写，漏写任何一人=不合格\\n\`,
                    \`  - Every present character's every status bar MUST be written; missing anyone = fail\\n\`,
                    \`  - 登場中の各キャラクターのすべてのステータスバーを書く必要があります；誰か一人でも漏れ＝不合格\\n\`,
                    \`  - 등장 중인 모든 캐릭터의 모든 스테이터스 바를 작성해야 합니다; 누구 하나라도 누락 = 불합격\\n\`,
                    \`  - Каждая шкала каждого присутствующего персонажа ДОЛЖНА быть записана; пропуск кого-либо = провал\\n\``;
    const after = `                    \`  - 无变化的属性条不重复输出；缺失行 = 保持当前值\\n\`,
                    \`  - Do NOT repeat unchanged bars; omitted line = keep current value\\n\`,
                    \`  - 変化なしのバーは再出力しない；省略行＝現在値を保持\\n\`,
                    \`  - 변화 없는 바는 재출력하지 않음; 생략 = 현재값 유지\\n\`,
                    \`  - Не повторять неизменённые шкалы; пропуск = сохранить текущее\\n\``;
    const r = applyReplace('删每回合必写规则', before, after, '无变化的属性条不重复输出；缺失行 = 保持当前值');
    if (r === 1) changed++; else if (r === -1) failed++;
}

// Patch 7: Add 0 legal value rule
{
    const before = `                \`  - 战斗/受伤/施法/消耗 → 合理扣减；恢复/休息 → 合理回增\\n\`,
                \`  - Combat/injury/casting/consumption → reasonable deduction; recovery/rest → reasonable increase\\n\`,
                \`  - 戦闘/負傷/詠唱/消費 → 合理的に減少；回復/休息 → 合理的に増加\\n\`,
                \`  - 전투/부상/시전/소모 → 합리적 감소; 회복/휴식 → 합리적 증가\\n\`,
                \`  - Бой/ранение/заклинание/расход → обоснованное уменьшение; восстановление/отдых → обоснованное увеличение\\n\``;
    const after = `                \`  - 战斗/受伤/施法/消耗 → 输出新值；恢复/休息 → 输出新值\\n\`,
                \`  - Combat/injury/casting/consumption → output new value; recovery/rest → output new value\\n\`,
                \`  - 戦闘/負傷/詠唱/消費 → 新しい値を出力；回復/休息 → 新しい値を出力\\n\`,
                \`  - 전투/부상/시전/소모 → 새 값 출력; 회복/휴식 → 새 값 출력\\n\`,
                \`  - Бой/ранение/заклинание/расход → новое значение; восстановление/отдых → новое значение\\n\`
            );
            p += L(
                \`  - 当前值可以是 0（如 hp=0 表示濒死）\\n\`,
                \`  - Current value may be 0 (e.g. hp=0 means dying)\\n\`,
                \`  - 現在値は 0 も可（例: hp=0 は瀕死）\\n\`,
                \`  - 현재값은 0일 수 있음 (예: hp=0은 빈사)\\n\`,
                \`  - Текущее значение может быть 0 (напр. hp=0 — при смерти)\\n\``;
    const r = applyReplace('添加 0 值规则', before, after, '当前值可以是 0（如 hp=0 表示濒死）');
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