#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'core/horaeManager.js');
const BAK = FILE + '.bak-before-s11c-fix';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

const BEFORE = `        const _uoX = !!this.settings?.rpgXpUserOnly;\n`;

if (ROLLBACK) {
  if (!fs.existsSync(BAK)) {
    console.log('无备份: ' + BAK);
    process.exit(1);
  }
  fs.copyFileSync(BAK, FILE);
  fs.unlinkSync(BAK);
  console.log('已回滚: ' + path.relative(ROOT, FILE));
  process.exit(0);
}

const raw = fs.readFileSync(FILE, 'utf8');
const isCRLF = raw.includes('\r\n');
const content = isCRLF ? raw.replace(/\r\n/g, '\n') : raw;

console.log('=== S1.1c-fix: 删死变量 _uoX ===');
console.log('模式: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('文件: ' + path.relative(ROOT, FILE));

const idx = content.indexOf(BEFORE);
if (idx === -1) {
  if (content.includes('_uoX')) {
    console.log('XX before 未找到，但文件内仍有 _uoX，请人工检查');
    process.exit(2);
  }
  console.log('.. SKIP: 已应用（_uoX 已不存在）');
  process.exit(0);
}
const second = content.indexOf(BEFORE, idx + 1);
if (second !== -1) {
  console.log('XX 匹配到多处，请人工检查');
  process.exit(3);
}

const newContent = content.substring(0, idx) + content.substring(idx + BEFORE.length);

console.log('OK 待删除 1 行:');
console.log('  - ' + BEFORE.trimEnd());

if (DRY_RUN) {
  console.log('[dry-run] 未写入。加 --apply 应用。');
  process.exit(0);
}

if (fs.existsSync(BAK)) {
  console.log('提示: 备份已存在，不覆盖: ' + path.basename(BAK));
} else {
  fs.copyFileSync(FILE, BAK);
  console.log('已备份: ' + path.basename(BAK));
}

const out = isCRLF ? newContent.replace(/\n/g, '\r\n') : newContent;
fs.writeFileSync(FILE, out, 'utf8');
console.log('已写入: ' + path.relative(ROOT, FILE));

console.log('=== 语法校验 ===');
const r = spawnSync(process.execPath, ['--check', FILE], { encoding: 'utf8' });
if (r.status !== 0) {
  console.log('XX node --check 失败:');
  console.log(r.stderr);
  console.log('可执行 --rollback 回滚');
  process.exit(4);
}
console.log('OK core/horaeManager.js');
