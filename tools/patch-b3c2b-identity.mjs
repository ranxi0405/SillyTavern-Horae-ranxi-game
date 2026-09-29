#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
    store: path.join(ROOT, 'core/memory/identityStore.js'),
    hm:    path.join(ROOT, 'core/horaeManager.js'),
    ix:    path.join(ROOT, 'index.js'),
    zh:    path.join(ROOT, 'locales/zh-CN.json'),
    en:    path.join(ROOT, 'locales/en.json'),
};
const SUFFIX = '.bak-before-b3c2b';
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

console.log('=== B3c-2b: identity schema 扩展 + Display 伪装 ===');
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

function applyPatch(content, name, before, after, appliedCheck, expectedOcc = 1) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ !== expectedOcc) { console.error('  XX ' + name + ' expected ' + expectedOcc + ', got ' + occ); return { content, status: -1 }; }
    console.log('  OK ' + name + ' (' + occ + ' 处)');
    return { content: content.split(before).join(after), status: 1 };
}

let failed = 0;

// ══════════════════════════════════════════
// P1: identityStore.js
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.store);
    let content = raw;

    {
        const before = `export const IDENTITY_FIELDS = [
    'spiritRoot',
    'constitution',
    'talents',
    'hidden',
    'bloodline',
    'arts',
    'background',
];

const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background'];
const ARRAY_FIELDS = ['talents', 'arts'];`;
        const after = `export const IDENTITY_FIELDS = [
    'spiritRoot',
    'constitution',
    'talents',
    'hidden',
    'bloodline',
    'arts',
    'background',
    'xianZi',
    'spiritRootDisplay',
    'constitutionDisplay',
];

const STRING_FIELDS = ['spiritRoot', 'constitution', 'bloodline', 'background', 'xianZi'];
const ARRAY_FIELDS = ['talents', 'arts'];
const DISPLAY_FIELDS = ['spiritRootDisplay', 'constitutionDisplay'];`;
        const r = applyPatch(content, 'B3c2b-P1a 字段常量', before, after, `const DISPLAY_FIELDS = ['spiritRootDisplay', 'constitutionDisplay'];`, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }
    {
        const before = `export function emptyIdentity() {
    return {
        _v: IDENTITY_VERSION,
        spiritRoot: null,
        constitution: null,
        talents: [],
        hidden: false,
        bloodline: null,
        arts: [],
        background: null,
    };
}`;
        const after = `export function emptyIdentity() {
    return {
        _v: IDENTITY_VERSION,
        spiritRoot: null,
        constitution: null,
        talents: [],
        hidden: false,
        bloodline: null,
        arts: [],
        background: null,
        xianZi: null,
        spiritRootDisplay: null,
        constitutionDisplay: null,
    };
}`;
        const r = applyPatch(content, 'B3c2b-P1b emptyIdentity', before, after, `        xianZi: null,\n        spiritRootDisplay: null,\n        constitutionDisplay: null,\n    };\n}`, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }
    {
        const before = `    for (const f of ARRAY_FIELDS) {
        base[f] = _normArray(raw[f]);
    }
    base.hidden = raw.hidden === true;`;
        const after = `    for (const f of ARRAY_FIELDS) {
        base[f] = _normArray(raw[f]);
    }
    for (const f of DISPLAY_FIELDS) {
        base[f] = _normString(raw[f]);
    }
    base.hidden = raw.hidden === true;`;
        const r = applyPatch(content, 'B3c2b-P1c normalizeIdentity', before, after, `    for (const f of DISPLAY_FIELDS) {\n        base[f] = _normString(raw[f]);\n    }`, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) {
        backup(FILES.store);
        writeNorm(FILES.store, content, isCRLF);
        console.log('  APPLIED: identityStore.js');
    }
}

// ══════════════════════════════════════════
// P2: horaeManager.js — Prompt 段
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.hm);
    let content = raw;

    {
        const before = `        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);
        pushArray(L('天赋', 'Talents'), id.talents);
        pushField(L('血脉', 'Bloodline'), id.bloodline);
        pushArray(L('初始功法', 'Innate Arts'), id.arts);
        pushField(L('出身', 'Background'), id.background);`;
        const after = `        pushField(L('灵根', 'Spirit Root'), id.spiritRoot);
        pushField(L('体质', 'Constitution'), id.constitution);
        pushField(L('仙姿', 'Xian Zi'), id.xianZi);
        pushArray(L('天赋', 'Talents'), id.talents);
        pushField(L('血脉', 'Bloodline'), id.bloodline);
        pushField(L('出身', 'Background'), id.background);`;
        const appliedCheck = `pushField(L('仙姿', 'Xian Zi'), id.xianZi);`;
        const r = applyPatch(content, 'B3c2b-P2 Prompt 段', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) {
        backup(FILES.hm);
        writeNorm(FILES.hm, content, isCRLF);
        console.log('  APPLIED: horaeManager.js');
    }
}

// ══════════════════════════════════════════
// P3: index.js — renderIdentityPanel
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;

    {
        const before = `    const rows = [];
    if (id.spiritRoot) rows.push([t('rpg.identitySpiritRoot'), id.spiritRoot]);
    if (id.constitution) rows.push([t('rpg.identityConstitution'), id.constitution]);
    if (Array.isArray(id.talents) && id.talents.length > 0) rows.push([t('rpg.identityTalents'), id.talents.join(' / ')]);
    if (id.bloodline) rows.push([t('rpg.identityBloodline'), id.bloodline]);
    if (Array.isArray(id.arts) && id.arts.length > 0) rows.push([t('rpg.identityArts'), id.arts.join(' / ')]);
    if (id.background) rows.push([t('rpg.identityBackground'), id.background]);`;
        const after = `    const rows = [];
    const _sr = id.spiritRootDisplay || id.spiritRoot;
    if (_sr) rows.push([t('rpg.identitySpiritRoot'), _sr]);
    const _cs = id.constitutionDisplay || id.constitution;
    if (_cs) rows.push([t('rpg.identityConstitution'), _cs]);
    if (id.xianZi) rows.push([t('rpg.identityXianZi'), id.xianZi]);
    if (Array.isArray(id.talents) && id.talents.length > 0) rows.push([t('rpg.identityTalents'), id.talents.join(' / ')]);
    if (id.bloodline) rows.push([t('rpg.identityBloodline'), id.bloodline]);
    if (id.background) rows.push([t('rpg.identityBackground'), id.background]);`;
        const appliedCheck = `const _sr = id.spiritRootDisplay || id.spiritRoot;`;
        const r = applyPatch(content, 'B3c2b-P3 UI 渲染', before, after, appliedCheck, 1);
        if (r.status === 1) content = r.content; else if (r.status === -1) failed++;
    }

    if (!DRY_RUN && failed === 0) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        console.log('  APPLIED: index.js');
    }
}

// ══════════════════════════════════════════
// P4: locales zh-CN + en
// ══════════════════════════════════════════
{
    const { isCRLF, content: raw } = readNorm(FILES.zh);
    const before = `        "identityBackground": "出身",`;
    const after  = `        "identityBackground": "出身",
        "identityXianZi": "仙姿",`;
    const r = applyPatch(raw, 'B3c2b-P4a zh-CN i18n', before, after, `"identityXianZi": "仙姿",`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.zh); writeNorm(FILES.zh, r.content, isCRLF); console.log('  APPLIED: zh-CN.json'); }
    else if (r.status === -1) failed++;
}
{
    const { isCRLF, content: raw } = readNorm(FILES.en);
    const before = `        "identityBackground": "Background",`;
    const after  = `        "identityBackground": "Background",
        "identityXianZi": "Xian Zi",`;
    const r = applyPatch(raw, 'B3c2b-P4b en i18n', before, after, `"identityXianZi": "Xian Zi",`, 1);
    if (r.status === 1 && !DRY_RUN) { backup(FILES.en); writeNorm(FILES.en, r.content, isCRLF); console.log('  APPLIED: en.json'); }
    else if (r.status === -1) failed++;
}

console.log('');
if (DRY_RUN) {
    console.log('DRY-RUN done, nothing written.');
} else if (failed > 0) {
    console.error('APPLY ABORTED: ' + failed + ' 处失败');
    process.exit(1);
} else {
    console.log('ALL APPLIED.');
}
console.log('done.');
