import fs from 'node:fs';

const FILE = 'tools/audit-s13-final.mjs';
let content = fs.readFileSync(FILE, 'utf8');

const OLD = `    chk(b.includes('changes.spirit') || b.includes("'spirit:'"), 'S1.3b 处理 spirit');`;
const NEW = `    chk(b.includes("line.startsWith('spirit:')") || b.includes('startsWith(\\'spirit:\\')'), 'S1.3b 处理 spirit 解析');`;

if (content.includes(NEW)) { console.log('already fixed'); process.exit(0); }
if (!content.includes(OLD)) { console.error('XX old not found'); process.exit(1); }

content = content.replace(OLD, NEW);
fs.writeFileSync(FILE, content, 'utf8');
console.log('fixed');
