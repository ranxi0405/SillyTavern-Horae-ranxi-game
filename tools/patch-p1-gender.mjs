#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    store:   path.join(ROOT, 'core/memory/identityStore.js'),
    ix:      path.join(ROOT, 'index.js'),
    hm:      path.join(ROOT, 'core/horaeManager.js'),
    zh:      path.join(ROOT, 'locales/zh-CN.json'),
    en:      path.join(ROOT, 'locales/en.json'),
};
const SUFFIX = '.bak-before-p1-gender';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

if (ROLLBACK) {
    let n = 0;
    for (const f of Object.values(FILES)) {
        const b = f + SUFFIX;
        if (fs.existsSync(b)) { fs.copyFileSync(b, f); fs.unlinkSync(b); n++; console.log('restored ' + path.basename(f)); }
    }
    console.log('rolled back ' + n);
    process.exit(0);
}

console.log('=== P1: identity.gender 支持 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));
console.log('');

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }

const buffers = {};
const fileMeta = {};
for (const [k, f] of Object.entries(FILES)) {
    const { isCRLF, content } = readNorm(f);
    buffers[k] = content;
    fileMeta[k] = { isCRLF, path: f, dirty: false };
}

let failed = 0;
function applyPatch(fileKey, name, before, after, appliedCheck, expectedOcc = 1) {
    const cur = buffers[fileKey];
    if (appliedCheck && cur.includes(appliedCheck)) {
        console.log('  .. ' + name + ' (already)');
        return;
    }
    const occ = cur.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); failed++; return; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' occ=' + occ + ' expect=' + expectedOcc); failed++; return; }
    console.log('  OK ' + name);
    buffers[fileKey] = cur.split(before).join(after);
    fileMeta[fileKey].dirty = true;
}

applyPatch(
    'store',
    'P1-a IDENTITY_FIELDS 加 gender',
    `    'spiritRootDisplay',
    'constitutionDisplay',
];`,
    `    'spiritRootDisplay',
    'constitutionDisplay',
    'gender',
];`,
    `    'constitutionDisplay',\n    'gender',\n];`
);

applyPatch(
    'store',
    'P1-b STRING_FIELDS 加 gender',
    `const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background', 'xianZi'];`,
    `const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background', 'xianZi', 'gender'];`,
    `'xianZi', 'gender'];`
);

applyPatch(
    'store',
    'P1-c emptyIdentity 加 gender',
    `        xianZi: null,
        spiritRootDisplay: null,
        constitutionDisplay: null,
    };
}`,
    `        xianZi: null,
        spiritRootDisplay: null,
        constitutionDisplay: null,
        gender: null,
    };
}`,
    `        constitutionDisplay: null,\n        gender: null,\n    };\n}`
);

applyPatch(
    'ix',
    'P2-a modal _bodyHtml 加 gender',
    `    const _bodyHtml =
        _row('horae-identity-sr-real',     t('rpg.identitySpiritRoot') + ' · ' + t('rpg.identityReal'),     id.spiritRoot, '')`,
    `    const _bodyHtml =
        _row('horae-identity-gender',        t('rpg.identityGender'), id.gender, '')
      + _row('horae-identity-sr-real',     t('rpg.identitySpiritRoot') + ' · ' + t('rpg.identityReal'),     id.spiritRoot, '')`,
    `_row('horae-identity-gender',        t('rpg.identityGender'), id.gender, '')`
);

applyPatch(
    'ix',
    'P2-b modal _newId 加 gender',
    `        const _newId = {
            _v: 'v0.1',
            spiritRoot: _parse(_get('horae-identity-sr-real')),`,
    `        const _newId = {
            _v: 'v0.1',
            gender: _parse(_get('horae-identity-gender')),
            spiritRoot: _parse(_get('horae-identity-sr-real')),`,
    `gender: _parse(_get('horae-identity-gender')),`
);

applyPatch(
    'ix',
    'P3 renderIdentityPanel 加 gender',
    `    const rows = [];
    const _sr = id.spiritRootDisplay || id.spiritRoot;`,
    `    const rows = [];
    if (id.gender) rows.push(['fa-venus-mars', t('rpg.identityGender'), id.gender, '']);
    const _sr = id.spiritRootDisplay || id.spiritRoot;`,
    `if (id.gender) rows.push(['fa-venus-mars', t('rpg.identityGender'), id.gender, '']);`
);

applyPatch(
    'hm',
    'P4 _generateIdentitySection 加 gender',
    `        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);`,
    `        pushField(L('性别', 'Gender'), id.gender);
        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);`,
    `pushField(L('性别', 'Gender'), id.gender);`
);

applyPatch(
    'zh',
    'P5 zh-CN i18n 加 identityGender',
    `        "identityXianZi": "仙姿",`,
    `        "identityXianZi": "仙姿",
        "identityGender": "性别",`,
    `"identityGender": "性别",`
);

applyPatch(
    'en',
    'P6 en i18n 加 identityGender',
    `        "identityXianZi": "Xian Zi",`,
    `        "identityXianZi": "Xian Zi",
        "identityGender": "Gender",`,
    `"identityGender": "Gender",`
);

console.log('');
if (failed > 0) { console.error('APPLY ABORTED: ' + failed + ' 处失败'); process.exit(1); }

if (DRY_RUN) {
    console.log('DRY-RUN done, nothing written.');
    for (const [k, m] of Object.entries(fileMeta)) {
        if (m.dirty) console.log('  会修改: ' + path.basename(m.path));
    }
    process.exit(0);
}

let written = 0;
for (const [k, m] of Object.entries(fileMeta)) {
    if (!m.dirty) continue;
    backup(m.path);
    writeNorm(m.path, buffers[k], m.isCRLF);
    console.log('APPLIED: ' + path.basename(m.path));
    written++;
}
console.log('written: ' + written + ' file(s)');
console.log('done.');
