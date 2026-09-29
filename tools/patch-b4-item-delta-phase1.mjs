#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'core/horaeManager.js');
const SUFFIX = '.bak-before-b4-itemdelta-phase1';
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

console.log('=== B4: item Delta Prompt 修复（阶段 1：L1 + L2） ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const { content: raw, isCRLF } = (() => {
    const t = fs.readFileSync(F, 'utf8');
    const c = t.includes('\r\n');
    return { content: c ? t.replace(/\r\n/g, '\n') : t, isCRLF: c };
})();

let content = raw;
let failed = 0;
let changed = 0;

function apply(name, before, after, appliedCheck, expectedOcc = 1) {
    if (appliedCheck && content.includes(appliedCheck)) {
        console.log('  .. ' + name + ' (already)');
        return;
    }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); failed++; return; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' occ=' + occ + ' expect=' + expectedOcc); failed++; return; }
    console.log('  OK ' + name);
    content = content.split(before).join(after);
    changed++;
}

// L1-zh
apply(
    'L1-zh 移除 item 必填',
    "'- 变化时必须输出：time（时间推进）、characters（角色进出）、location（场景切换）、costume、item、affection、mood、npc、agenda\\n' +",
    "'- 变化时必须输出：time（时间推进）、characters（角色进出）、location（场景切换）、costume、affection、mood、npc、agenda\\n' +",
    "'- 变化时必须输出：time（时间推进）、characters（角色进出）、location（场景切换）、costume、affection、mood、npc、agenda\\n' +"
);
apply(
    'L1-zh 新增 item 语义段',
    "'- item 格式：item:名称=持有人@位置（单前缀，不重复 item:）\\n' +\n            '- 六艺只用 craft:归属|名称|段位|累计值；不要用 skill: 加 craft 后缀\\n',",
    "'- item（**仅本轮实际发生变化的条目**）：\\n' +\n            '    - 新获得 → item:名称=持有人@位置\\n' +\n            '    - 消耗/删除 → item-:名称\\n' +\n            '    - 持有人变化 → item:名称=新持有人@位置\\n' +\n            '    - 位置变化 → item:名称=持有人@新位置\\n' +\n            '    - 状态变化（任务完成、外观改变等）→ item:名称=持有人@位置(新状态)\\n' +\n            '    - 未发生变化 → 不输出\\n' +\n            '    - 已知但本轮无变化 → 不输出\\n' +\n            '    - 禁止重新罗列完整库存\\n' +\n            '    - 禁止为了“确认当前状态”重复输出已有物品\\n' +\n            '    - **如果本轮没有任何 item 变化，完全不要输出 item: 或 item-:**\\n' +\n            '- 六艺只用 craft:归属|名称|段位|累计值；不要用 skill: 加 craft 后缀\\n',",
    "'- item（**仅本轮实际发生变化的条目**）：\\n'"
);

// L1-en
apply(
    'L1-en 移除 item 必填',
    "'- MUST output on change: time (time advance), characters (in/out), location (scene switch), costume, item, affection, mood, npc, agenda\\n' +",
    "'- MUST output on change: time (time advance), characters (in/out), location (scene switch), costume, affection, mood, npc, agenda\\n' +",
    "'- MUST output on change: time (time advance), characters (in/out), location (scene switch), costume, affection, mood, npc, agenda\\n' +"
);
apply(
    'L1-en 新增 item 语义段',
    "'- Deletion: item- / agenda-; clear characters: characters:\\n' +\n            '- event: write only if a new event occurred this floor\\n',",
    "'- Deletion: item- / agenda-; clear characters: characters:\\n' +\n            '- event: write only if a new event occurred this floor\\n' +\n            '- item (**ONLY entries that changed this turn**):\\n' +\n            '    - Newly acquired → item:name=holder@location\\n' +\n            '    - Consumed / removed → item-:name\\n' +\n            '    - Holder changed → item:name=newHolder@location\\n' +\n            '    - Location changed → item:name=holder@newLocation\\n' +\n            '    - State changed (quest done, appearance change, etc.) → item:name=holder@location(newState)\\n' +\n            '    - No change → DO NOT output\\n' +\n            '    - Known but unchanged this turn → DO NOT output\\n' +\n            '    - DO NOT dump the full inventory\\n' +\n            '    - DO NOT re-output items just to “confirm current state”\\n' +\n            '    - **If NO item changed this turn, output NOTHING — no item: and no item-:**\\n',",
    "'- item (**ONLY entries that changed this turn**):\\n'"
);

// L1-ja
apply(
    'L1-ja 移除 item 必填',
    "'- 変化時必須：time（時間進行）、characters（入退場）、location（シーン切替）、costume、item、affection、mood、npc、agenda\\n' +",
    "'- 変化時必須：time（時間進行）、characters（入退場）、location（シーン切替）、costume、affection、mood、npc、agenda\\n' +",
    "'- 変化時必須：time（時間進行）、characters（入退場）、location（シーン切替）、costume、affection、mood、npc、agenda\\n' +"
);
apply(
    'L1-ja 新增 item 语义段',
    "'- 削除：item- / agenda-；characters クリア：characters:\\n' +\n            '- event：この階層で新イベント発生時のみ記載\\n',",
    "'- 削除：item- / agenda-；characters クリア：characters:\\n' +\n            '- event：この階層で新イベント発生時のみ記載\\n' +\n            '- item（**今回のターンで実際に変化した項目のみ**）：\\n' +\n            '    - 新規取得 → item:名前=所持者@場所\\n' +\n            '    - 消費/削除 → item-:名前\\n' +\n            '    - 所持者変更 → item:名前=新所持者@場所\\n' +\n            '    - 場所変更 → item:名前=所持者@新場所\\n' +\n            '    - 状態変化（任務完了、外見変化など）→ item:名前=所持者@場所(新状態)\\n' +\n            '    - 変化なし → 出力しない\\n' +\n            '    - 既知だが今回変化なし → 出力しない\\n' +\n            '    - 完全な所持品リストの再列挙は禁止\\n' +\n            '    - 現在の状態確認のための既存アイテム再出力は禁止\\n' +\n            '    - **今回のターンでアイテム変化が一切ない場合、item: も item-: も出力しないこと**\\n',",
    "'- item（**今回のターンで実際に変化した項目のみ**）：\\n'"
);

// L1-ko
apply(
    'L1-ko 移除 item 必填',
    "'- 변화 시 필수: time(시간 진행), characters(입퇴장), location(장면 전환), costume, item, affection, mood, npc, agenda\\n' +",
    "'- 변화 시 필수: time(시간 진행), characters(입퇴장), location(장면 전환), costume, affection, mood, npc, agenda\\n' +",
    "'- 변화 시 필수: time(시간 진행), characters(입퇴장), location(장면 전환), costume, affection, mood, npc, agenda\\n' +"
);
apply(
    'L1-ko 新增 item 语义段',
    "'- 삭제: item- / agenda-; characters 초기화: characters:\\n' +\n            '- event: 이번 층에 새 이벤트 발생 시에만 기재\\n',",
    "'- 삭제: item- / agenda-; characters 초기화: characters:\\n' +\n            '- event: 이번 층에 새 이벤트 발생 시에만 기재\\n' +\n            '- item(**이번 턴에 실제로 변경된 항목만**):\\n' +\n            '    - 신규 획득 → item:이름=소지자@위치\\n' +\n            '    - 소비/삭제 → item-:이름\\n' +\n            '    - 소지자 변경 → item:이름=새소지자@위치\\n' +\n            '    - 위치 변경 → item:이름=소지자@새위치\\n' +\n            '    - 상태 변경(임무 완료, 외형 변화 등) → item:이름=소지자@위치(새상태)\\n' +\n            '    - 변화 없음 → 출력하지 않음\\n' +\n            '    - 알려졌으나 이번 턴 변화 없음 → 출력하지 않음\\n' +\n            '    - 전체 소지품 목록 재나열 금지\\n' +\n            '    - 현재 상태 확인을 위한 기존 아이템 재출력 금지\\n' +\n            '    - **이번 턴에 아이템 변화가 전혀 없다면 item: / item-: 을 절대 출력하지 말 것**\\n',",
    "'- item(**이번 턴에 실제로 변경된 항목만**):\\n'"
);

// L1-ru
apply(
    'L1-ru 移除 item 必填',
    "'- ОБЯЗАТЕЛЬНО при изменении: time (ход времени), characters (вход/выход), location (смена сцены), costume, item, affection, mood, npc, agenda\\n' +",
    "'- ОБЯЗАТЕЛЬНО при изменении: time (ход времени), characters (вход/выход), location (смена сцены), costume, affection, mood, npc, agenda\\n' +",
    "'- ОБЯЗАТЕЛЬНО при изменении: time (ход времени), characters (вход/выход), location (смена сцены), costume, affection, mood, npc, agenda\\n' +"
);
apply(
    'L1-ru 新增 item 语义段',
    "'- Удаление: item- / agenda-; очистка characters: characters:\\n' +\n            '- event: только при новом событии на этом уровне\\n'",
    "'- Удаление: item- / agenda-; очистка characters: characters:\\n' +\n            '- event: только при новом событии на этом уровне\\n' +\n            '- item (**ТОЛЬКО записи, изменившиеся в этом ходу**):\\n' +\n            '    - Новое приобретение → item:имя=владелец@место\\n' +\n            '    - Израсходовано/удалено → item-:имя\\n' +\n            '    - Смена владельца → item:имя=новыйВладелец@место\\n' +\n            '    - Смена местоположения → item:имя=владелец@новоеМесто\\n' +\n            '    - Смена состояния (задание выполнено, изменилась внешность и т.п.) → item:имя=владелец@место(новоеСостояние)\\n' +\n            '    - Без изменений → НЕ выводить\\n' +\n            '    - Известно, но не изменилось в этом ходу → НЕ выводить\\n' +\n            '    - ЗАПРЕЩЕНО выводить полный список инвентаря\\n' +\n            '    - ЗАПРЕЩЕНО повторно выводить существующие предметы для подтверждения текущего состояния\\n' +\n            '    - **Если в этом ходу предметы НЕ изменились — не выводить ни item:, ни item-:**\\n'",
    "'- item (**ТОЛЬКО записи, изменившиеся в этом ходу**):\\n'"
);

// L2-zh
apply(
    'L2-zh 强制 <horae> 包裹',
    "'[当前状态快照——对比本回合剧情，仅在<horae>中输出发生实质变化的字段]',",
    "'[当前状态快照——对比本回合剧情，仅在<horae>中输出发生实质变化的字段]\\n' +\n            '【强制】所有结构化 meta 行（time/location/item/npc/affection/...）必须包裹在 <horae>...</horae> 标签内。\\n' +\n            '【强制】标签外不得出现任何 meta 行。',",
    "'【强制】所有结构化 meta 行（time/location/item/npc/affection/...）必须包裹在 <horae>...</horae> 标签内。\\n'"
);
// L2-en
apply(
    'L2-en 强制 <horae> 包裹',
    "'[Current State Snapshot — compare with this round\\'s plot, only output substantively changed fields in <horae>]',",
    "'[Current State Snapshot — compare with this round\\'s plot, only output substantively changed fields in <horae>]\\n' +\n            '[MANDATORY] All structured meta lines (time/location/item/npc/affection/...) MUST be wrapped inside <horae>...</horae> tags.\\n' +\n            '[MANDATORY] No meta lines may appear outside the tags.',",
    "'[MANDATORY] All structured meta lines (time/location/item/npc/affection/...) MUST be wrapped inside <horae>...</horae> tags.\\n'"
);
// L2-ja
apply(
    'L2-ja 强制 <horae> 包裹',
    "'[現在の状態スナップショット——今回のストーリーと比較し、実質的に変化したフィールドのみ<horae>に出力]',",
    "'[現在の状態スナップショット——今回のストーリーと比較し、実質的に変化したフィールドのみ<horae>に出力]\\n' +\n            '【必須】すべての構造化メタ行（time/location/item/npc/affection/...）は <horae>...</horae> タグ内に記述すること。\\n' +\n            '【必須】タグ外にメタ行を一切記述しないこと。',",
    "'【必須】すべての構造化メタ行（time/location/item/npc/affection/...）は <horae>...</horae> タグ内に記述すること。\\n'"
);
// L2-ko
apply(
    'L2-ko 强制 <horae> 包裹',
    "'[현재 상태 스냅샷——이번 라운드의 스토리와 비교하여 실질적으로 변경된 필드만 <horae>에 출력]',",
    "'[현재 상태 스냅샷——이번 라운드의 스토리와 비교하여 실질적으로 변경된 필드만 <horae>에 출력]\\n' +\n            '【필수】모든 구조화 메타 행(time/location/item/npc/affection/...)은 반드시 <horae>...</horae> 태그 안에 작성할 것.\\n' +\n            '【필수】태그 밖에 메타 행을 절대 작성하지 말 것.',",
    "'【필수】모든 구조화 메타 행(time/location/item/npc/affection/...)은 반드시 <horae>...</horae> 태그 안에 작성할 것.\\n'"
);
// L2-ru
apply(
    'L2-ru 强制 <horae> 包裹',
    "'[Снимок текущего состояния — сравните с сюжетом этого раунда, выводите в <horae> только существенно изменившиеся поля]',",
    "'[Снимок текущего состояния — сравните с сюжетом этого раунда, выводите в <horae> только существенно изменившиеся поля]\\n' +\n            '[ОБЯЗАТЕЛЬНО] Все структурированные строки meta (time/location/item/npc/affection/...) ДОЛЖНЫ быть обёрнуты в теги <horae>...</horae>.\\n' +\n            '[ОБЯЗАТЕЛЬНО] Ни одна строка meta не должна появляться вне тегов.',",
    "'[ОБЯЗАТЕЛЬНО] Все структурированные строки meta (time/location/item/npc/affection/...) ДОЛЖНЫ быть обёрнуты в теги <horae>...</horae>.\\n'"
);

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }
if (DRY_RUN) { console.log('DRY-RUN done, ' + changed + ' 处待应用.'); process.exit(0); }

const b = F + SUFFIX;
if (!fs.existsSync(b)) fs.copyFileSync(F, b);
fs.writeFileSync(F, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
console.log('APPLIED: ' + path.basename(F) + ' (' + changed + ' 处)');
console.log('done.');
