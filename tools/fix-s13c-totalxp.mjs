import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'tools/patch-s13c-statestore.mjs');

let content = fs.readFileSync(FILE, 'utf8');

const oldStr = `    let finalTotalXp;
    if (tierChanged) {
        finalTotalXp = curTotalXp + curXp + finalXp;
    } else {
        finalTotalXp = curTotalXp + (finalXp - curXp);
    }`;

const newStr = `    let finalTotalXp;
    if (tierChanged) {
        // totalXp 已包含旧段累计值，晋升后只增加新段获得的 xp
        finalTotalXp = curTotalXp + finalXp;
    } else {
        finalTotalXp = curTotalXp + (finalXp - curXp);
    }`;

if (content.includes(newStr)) {
    console.log('already fixed');
    process.exit(0);
}
if (!content.includes(oldStr)) {
    console.error('XX old not found');
    process.exit(1);
}
content = content.replace(oldStr, newStr);
fs.writeFileSync(FILE, content, 'utf8');
console.log('fixed');
