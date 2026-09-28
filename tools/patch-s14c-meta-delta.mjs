#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BACKUP = FILE + '.bak-before-s14c';
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

console.log('=== S1.4c: 元事件 Delta 全局段 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

{
    const before = `    generateRpgPrompt() {`;
    const after = `    generateMetaDeltaPrompt() {
        const L = (zh, en, ja, ko, ru) => {
            const lang = this._getAiOutputLang();
            if (lang === 'zh-CN' || lang === 'zh-TW') return zh;
            if (lang === 'ja') return ja;
            if (lang === 'ko') return ko;
            if (lang === 'ru') return ru;
            return en;
        };
        return L(
            '\\n【元事件字段——仅变化时写；不输出=保持】\\n' +
            '- 变化时必须输出：time（时间推进）、characters（角色进出）、location（场景切换）、costume、item、affection、mood、npc、agenda\\n' +
            '- 删除：item- / agenda-；清空 characters：characters:\\n' +
            '- event：本楼层有新事件才写；无事件不写\\n',
            '\\n[Meta-Event Fields — write only on change; omitted = keep]\\n' +
            '- MUST output on change: time (time advance), characters (in/out), location (scene switch), costume, item, affection, mood, npc, agenda\\n' +
            '- Deletion: item- / agenda-; clear characters: characters:\\n' +
            '- event: write only if a new event occurred this floor\\n',
            '\\n【メタイベント——変化時のみ記載；省略＝保持】\\n' +
            '- 変化時必須：time（時間進行）、characters（入退場）、location（シーン切替）、costume、item、affection、mood、npc、agenda\\n' +
            '- 削除：item- / agenda-；characters クリア：characters:\\n' +
            '- event：この階層で新イベント発生時のみ記載\\n',
            '\\n【메타 이벤트 — 변화 시에만 기재; 생략 = 유지】\\n' +
            '- 변화 시 필수: time(시간 진행), characters(입퇴장), location(장면 전환), costume, item, affection, mood, npc, agenda\\n' +
            '- 삭제: item- / agenda-; characters 초기화: characters:\\n' +
            '- event: 이번 층에 새 이벤트 발생 시에만 기재\\n',
            '\\n[Мета-события — только при изменении; пропуск = сохранить]\\n' +
            '- ОБЯЗАТЕЛЬНО при изменении: time (ход времени), characters (вход/выход), location (смена сцены), costume, item, affection, mood, npc, agenda\\n' +
            '- Удаление: item- / agenda-; очистка characters: characters:\\n' +
            '- event: только при новом событии на этом уровне\\n'
        );
    }

    generateRpgPrompt() {`;
    const r = applyReplace('新增 generateMetaDeltaPrompt', before, after, 'generateMetaDeltaPrompt() {');
    if (r === 1) changed++; else if (r === -1) failed++;
}

{
    const before = `        this.generateMoodPrompt() +
        this.generateRpgPrompt() +
        this._generateCustomCalendarPrompt();`;
    const after = `        this.generateMoodPrompt() +
        this.generateRpgPrompt() +
        this.generateMetaDeltaPrompt() +
        this._generateCustomCalendarPrompt();`;
    const r = applyReplace('接入 generateStableSystemPrompt', before, after, `this.generateMetaDeltaPrompt() +\n        this._generateCustomCalendarPrompt();`);
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