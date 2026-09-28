#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { ix: path.join(ROOT, 'index.js') };
const SUFFIX = '.bak-before-b3a';
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

console.log('=== B3a: 角色卡 identity 读取 + 运行缓存 ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }

function applyPatch(content, name, before, after, appliedCheck) {
    if (appliedCheck && content.includes(appliedCheck)) { console.log('  .. ' + name + ' (already)'); return { content, status: 0 }; }
    const occ = content.split(before).length - 1;
    if (occ === 0) { console.error('  XX ' + name + ' anchor NOT FOUND'); return { content, status: -1 }; }
    if (occ > 1) { console.error('  XX ' + name + ' (' + occ + ' matches)'); return { content, status: -1 }; }
    console.log('  OK ' + name);
    return { content: content.replace(before, after), status: 1 };
}

const NEW_FUNCTIONS = `// ── B3a: Identity I/O ──
/** 读取角色卡 extensions.horae.identity（不写缓存） */
function _readCardIdentity() {
    const ctx = getContext();
    const charId = ctx?.characterId;
    if (charId == null) return { ok: false, reason: 'noCard' };

    const char = ctx.characters?.[charId];
    if (!char?.data || !char.avatar) return { ok: false, reason: 'noCard', charId };

    const raw = char.data.extensions?.horae?.identity;
    const v = validateIdentity(raw);
    if (!v.ok) {
        return { ok: false, reason: v.reason, charId, avatar: char.avatar, charName: char.name || '' };
    }
    return {
        ok: true,
        identity: v.identity,
        charId,
        avatar: char.avatar,
        charName: char.name || char.data?.name || '',
    };
}

/** 写入角色卡 extensions.horae.identity（B3c 编辑器使用） */
async function _writeCardIdentity(identity) {
    const ctx = getContext();
    const charId = ctx?.characterId;
    if (charId == null) return false;
    const char = ctx.characters?.[charId];
    if (!char?.data || !char.avatar) return false;

    const normalized = normalizeIdentity(identity);
    if (!char.data.extensions) char.data.extensions = {};
    if (!char.data.extensions.horae) char.data.extensions.horae = {};
    char.data.extensions.horae.identity = normalized;

    try {
        const resp = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                avatar: char.avatar,
                data: { extensions: { horae: { identity: normalized } } },
            }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        _cacheIdentityToChat(normalized);
        return true;
    } catch (err) {
        console.warn('[Horae] 写入角色卡 identity 失败:', err);
        return false;
    }
}

/** 清空角色卡 extensions.horae.identity */
async function _clearCardIdentity() {
    const ctx = getContext();
    const charId = ctx?.characterId;
    if (charId == null) return false;
    const char = ctx.characters?.[charId];
    if (!char?.data?.extensions?.horae?.identity) {
        _cacheIdentityToChat(null);
        return false;
    }

    delete char.data.extensions.horae.identity;
    try {
        const resp = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                avatar: char.avatar,
                data: { extensions: { horae: { identity: null } } },
            }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        _cacheIdentityToChat(null);
        return true;
    } catch (err) {
        console.warn('[Horae] 清除角色卡 identity 失败:', err);
        return false;
    }
}

/** 把 identity 写入 chat[0].horae_meta.identity（运行缓存） */
function _cacheIdentityToChat(identity) {
    const chat = horaeManager.getChat();
    if (!chat?.[0]?.horae_meta) return;
    chat[0].horae_meta.identity = identity || null;
}

/** 从角色卡读取 identity 并缓存。CHAT_CHANGED / 初始化时调用 */
function _loadIdentityFromCard() {
    const r = _readCardIdentity();
    if (!r.ok) {
        _cacheIdentityToChat(null);
        console.log('[Horae][B3a] identity 读取失败:', r.reason);
        return r;
    }
    _cacheIdentityToChat(r.identity);
    console.log('[Horae][B3a] identity 已缓存:', r.identity);
    return r;
}

`;

{
    const { isCRLF, content: raw } = readNorm(FILES.ix);
    let content = raw;
    let c = 0, f = 0;

    // P1: import
    {
        const before = `import { sanitizeHiddenKeywords } from './core/memory/hiddenKeywords.js';\n`;
        const after  = `import { sanitizeHiddenKeywords } from './core/memory/hiddenKeywords.js';\nimport { validateIdentity, normalizeIdentity, emptyIdentity, isIdentityEmpty } from './core/memory/identityStore.js';\n`;
        const appliedCheck = `from './core/memory/identityStore.js';`;
        const r = applyPatch(content, 'B3a-P1 import', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P2: 5 个函数插到 // ── 角色卡 I/O ── 之前
    {
        const before = `// ── 角色卡 I/O ──\nfunction _readCardProfile() {`;
        const after  = `// ── 角色卡 I/O ──\n${NEW_FUNCTIONS}function _readCardProfile() {`;
        const appliedCheck = `function _readCardIdentity() {`;
        const r = applyPatch(content, 'B3a-P2 identity I/O 函数', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P3: CHAT_CHANGED 钩子
    {
        const before = `eventSource.on(event_types.CHAT_CHANGED, onChatChanged);`;
        const after  = `eventSource.on(event_types.CHAT_CHANGED, onChatChanged);\n    eventSource.on(event_types.CHAT_CHANGED, () => { _loadIdentityFromCard(); });`;
        const appliedCheck = `eventSource.on(event_types.CHAT_CHANGED, () => { _loadIdentityFromCard(); });`;
        const r = applyPatch(content, 'B3a-P3 CHAT_CHANGED 钩子', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    // P4: 初始化时调用
    {
        const before = `    refreshAllDisplays();\n    _snapshotCurrentChatMessageRefs();\n\n    if (settings.vectorEnabled) {`;
        const after  = `    refreshAllDisplays();\n    _snapshotCurrentChatMessageRefs();\n    _loadIdentityFromCard();\n\n    if (settings.vectorEnabled) {`;
        const appliedCheck = `    _snapshotCurrentChatMessageRefs();\n    _loadIdentityFromCard();`;
        const r = applyPatch(content, 'B3a-P4 初始化调用', before, after, appliedCheck);
        if (r.status === 1) { content = r.content; c++; } else if (r.status === -1) f++;
    }

    if (DRY_RUN) {
        console.log('DRY-RUN: ' + c + ' patch(es) 待应用, ' + f + ' 处锚点失败');
    } else if (f === 0) {
        backup(FILES.ix);
        writeNorm(FILES.ix, content, isCRLF);
        console.log('APPLIED: ' + c + ' patch(es) 写入 ' + path.basename(FILES.ix));
    } else {
        console.error('APPLY ABORTED: ' + f + ' 处锚点失败，未写入');
        process.exit(1);
    }
}

console.log('done.');
