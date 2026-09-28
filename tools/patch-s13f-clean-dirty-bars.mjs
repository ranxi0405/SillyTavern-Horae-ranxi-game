#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

const RESERVED = new Set(['status','skill','spirit','realm','realm_phase','cultivation','age','lifespan',
    'craft','shentong','currency','base','npc','item','affection','mood','agenda','costume','event',
    'time','location','atmosphere','scene_desc','characters','attr','xp']);

function isDirtyOwner(owner) {
    if (typeof owner !== 'string') return false;
    if (owner.includes('|')) return true;
    if (RESERVED.has(owner)) return true;
    return false;
}

function findChatFiles() {
    const baseDir = '/i/AI/SillyTavern-1.19.0/data/default-user/chats';
    if (!fs.existsSync(baseDir)) return [];
    const out = [];
    function walk(dir) {
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else if (f.endsWith('.jsonl') || (f.endsWith('.json') && !f.includes('.bak'))) out.push(p);
        }
    }
    walk(baseDir);
    return out;
}

console.log('=== S1.3f: 清理历史脏 bars ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : (APPLY ? 'APPLY' : 'ROLLBACK')));

if (ROLLBACK) {
    const chatFiles = findChatFiles();
    let n = 0;
    for (const f of chatFiles) {
        const bak = f + '.bak-s13f';
        if (fs.existsSync(bak)) { fs.copyFileSync(bak, f); fs.unlinkSync(bak); n++; console.log('restored ' + f); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

const chatFiles = findChatFiles();
console.log('找到 chat 文件: ' + chatFiles.length);

for (const file of chatFiles) {
    console.log('\n--- ' + path.basename(file) + ' ---');
    const raw = fs.readFileSync(file, 'utf8');
    const isJSONL = file.endsWith('.jsonl');
    const lines = isJSONL ? raw.split('\n').filter(l => l.trim()) : [raw];
    let totalDirty = 0;
    const cleaned = lines.map(line => {
        if (!line.trim()) return line;
        let obj;
        try { obj = JSON.parse(line); } catch { return line; }
        const rpg0 = obj?.horae_meta?.rpg;
        if (rpg0?.bars) {
            for (const owner of Object.keys(rpg0.bars)) {
                if (isDirtyOwner(owner)) {
                    console.log('  chat[0].bars["' + owner + '"] → 删除');
                    delete rpg0.bars[owner];
                    totalDirty++;
                }
            }
        }
        const c = obj?.horae_meta?._rpgChanges;
        if (c?.bars) {
            for (const owner of Object.keys(c.bars)) {
                if (isDirtyOwner(owner)) {
                    console.log('  floor._rpgChanges.bars["' + owner + '"] → 删除');
                    delete c.bars[owner];
                    totalDirty++;
                }
            }
        }
        return JSON.stringify(obj);
    });
    if (totalDirty === 0) { console.log('  无脏数据'); continue; }
    console.log('  共清 ' + totalDirty + ' 项');
    if (DRY_RUN) continue;
    const bak = file + '.bak-s13f';
    if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
    fs.writeFileSync(file, isJSONL ? cleaned.join('\n') : cleaned[0], 'utf8');
    console.log('  已写入 + 备份');
}

if (DRY_RUN) console.log('\n[dry-run] 未写入。加 --apply 应用。');
