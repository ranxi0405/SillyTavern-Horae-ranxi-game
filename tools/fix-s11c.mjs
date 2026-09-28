import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = path.join(ROOT, 'tools/patch-s11c-remove-level-xp.mjs');

let content = fs.readFileSync(f, 'utf8');
content = content.replace(/\r\n/g, '\n');

// 字面字符：反斜杠 + n（脚本源码里的 \n 就是这两个字符）
const LN = '\\n';

const oldStr = [
  "      name: 'present 收集: 删 rpg.xp keys',",
  "      before: `                ...Object.keys(rpg.equipment || {})," + LN + "                ...Object.keys(rpg.xp || {})," + LN + "                ...Object.keys(rpg.currency || {})," + LN + "`,",
  "      after: `                ...Object.keys(rpg.equipment || {})," + LN + "                ...Object.keys(rpg.currency || {})," + LN + "`,",
].join('\n');

const newStr = [
  "      name: 'present 收集: 删 rpg.xp keys',",
  "      before: `                ...Object.keys(rpg.xp || {})," + LN + "`,",
  "      after: ``,",
  "      appliedAnchor: `                ...Object.keys(rpg.currency || {})," + LN + "`,",
].join('\n');

const idx = content.indexOf(oldStr);
if (idx === -1) {
  console.error('XX OLD not found. 请把下面命令的输出贴回给 assistant：');
  console.error('   grep -n -A4 "present 收集: 删 rpg.xp keys" tools/patch-s11c-remove-level-xp.mjs');
  process.exit(1);
}
if (content.indexOf(oldStr, idx + 1) !== -1) {
  console.error('XX multiple matches. 请把 grep -n -A4 的输出贴回。');
  process.exit(2);
}
content = content.substring(0, idx) + newStr + content.substring(idx + oldStr.length);
fs.writeFileSync(f, content, 'utf8');
console.log('FIXED OK');
