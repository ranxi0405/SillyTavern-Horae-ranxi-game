import fs from 'node:fs';

const FILE = 'tools/patch-s13d-hud.mjs';
let content = fs.readFileSync(FILE, 'utf8');

if (content.includes(`_sp.tier === '太虚' && typeof _sp.xp === 'number'`)) {
    console.log('already fixed');
    process.exit(0);
}

const ANCHOR = `        "            if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {",`;

const REPLACE = `        "            if (_sp.tier === '太虚' && typeof _sp.xp === 'number') {",
        "                _tags.push('<span class=\\"horae-rpg-hud-tag\\">' + escapeHtml(_spLabel) + '·' + escapeHtml(_sp.tier) + '（' + _sp.xp + '）</span>');",
        "            } else if (typeof _sp.xp === 'number' && typeof _spTh === 'number') {",`;

const occ = content.split(ANCHOR).length - 1;
if (occ === 0) { console.error('XX anchor not found'); process.exit(1); }
if (occ > 1) { console.error('XX anchor found ' + occ + ' times'); process.exit(2); }

content = content.replace(ANCHOR, REPLACE);
fs.writeFileSync(FILE, content, 'utf8');
console.log('fixed');
