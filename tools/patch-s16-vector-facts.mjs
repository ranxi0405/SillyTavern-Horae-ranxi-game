#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { vm: path.join(ROOT, 'core/vectorManager.js'), ix: path.join(ROOT, 'index.js') };
const SUFFIX = '.s16.bak';
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

console.log('=== S1.6: Vector ↔ Summary/Thread ===');
console.log('mode: ' + (DRY_RUN ? 'DRY-RUN' : 'APPLY'));

const V = [];
const I = [];
const p = (name, before, after, check) => ({ name, before, after, appliedCheck: check });

// ─── vectorManager.js ───

V.push(p('1. DB_VERSION 2→3',
`const DB_VERSION = 2;`,
`const DB_VERSION = 3;`,
`const DB_VERSION = 3;`));

V.push(p('2. 新增 SUMMARY_STORE / THREAD_STORE',
`const SNAPSHOT_STORE = 'memorySnapshots';`,
`const SNAPSHOT_STORE = 'memorySnapshots';
const SUMMARY_STORE = 'summaryVectors';
const THREAD_STORE = 'threadVectors';`,
`const SUMMARY_STORE = 'summaryVectors';`));

V.push(p('3. 新增 SIM_DIFF 常量',
`const SNAPSHOT_VERSION = '1.0';`,
`const SNAPSHOT_VERSION = '1.0';
const SUMMARY_MESSAGE_SIM_DIFF_THRESHOLD = 0.15;`,
`const SUMMARY_MESSAGE_SIM_DIFF_THRESHOLD = 0.15;`));

V.push(p('4. constructor 新增 summaryVectors/threadVectors',
`    constructor() {`,
`    constructor() {
        this.summaryVectors = new Map();
        this.threadVectors = new Map();`,
`        this.summaryVectors = new Map();
        this.threadVectors = new Map();`));

V.push(p('5. loadChat 追加 loadSummaries/loadThreads/sync',
`            await this._loadSnapshotsForChat(chatId);`,
`            await this._loadSnapshotsForChat(chatId);
            await this._loadSummariesForChat(chatId, chat);
            await this._loadThreadsForChat(chatId, chat);`,
`await this._loadSummariesForChat(chatId, chat);`));

V.push(p('6. loadChat 末尾调用 sync',
`            const snapCount = this.snapshots.reduce((a, s) => a + s.items.length, 0);`,
`            await this.syncSummaryThreadsFromChat(chat);
            const snapCount = this.snapshots.reduce((a, s) => a + s.items.length, 0);`,
`await this.syncSummaryThreadsFromChat(chat);`));

V.push(p('7. 新增 _iterateSummaryEntries',
`    _getSnapshotEntry(snapKey) {`,
`    _iterateSummaryEntries() {
        const out = [];
        for (const [summaryId, entry] of this.summaryVectors) out.push({ summaryId, entry });
        return out;
    }

    _iterateThreadEntries() {
        const out = [];
        for (const [threadId, entry] of this.threadVectors) out.push({ threadId, entry });
        return out;
    }

    _getSnapshotEntry(snapKey) {`,
`_iterateSummaryEntries() {`));

V.push(p('8. 新增 buildSummaryVectorDocument / buildThreadVectorDocument',
`    async addMessage(messageIndex, meta) {`,
`    buildSummaryVectorDocument(summary) {
        if (!summary?.summaryText) return '';
        if (summary.active === false) return '';
        return summary.summaryText;
    }

    buildThreadVectorDocument(thread) {
        if (!thread?.title) return '';
        const ACTIVE = new Set(['open', 'progressing', 'blocked']);
        if (!ACTIVE.has(thread.status)) return '';
        const parts = [thread.title];
        if (thread.notes) parts.push(thread.notes);
        if (Array.isArray(thread.participants) && thread.participants.length) parts.push(thread.participants.join(' '));
        return parts.join(' | ');
    }

    async addMessage(messageIndex, meta) {`,
`buildSummaryVectorDocument(summary) {`));


V.push(p('9. 新增 syncSummaryThreadsFromChat',
`    async addMessage(messageIndex, meta) {`,
`    async syncSummaryThreadsFromChat(chat) {
        if (!this.isReady || !this.chatId || !chat?.length) return;
        const meta = chat[0]?.horae_meta;
        if (!meta) return;
        const liveSum = new Set();
        for (const s of (meta.autoSummaries || [])) {
            if (!s?.id || s.active === false) continue;
            const doc = this.buildSummaryVectorDocument(s);
            if (!doc) continue;
            const hash = this._hashString(doc);
            const ex = this.summaryVectors.get(s.id);
            if (ex && ex.hash === hash) { liveSum.add(s.id); continue; }
            const res = await this._embed([this._prepareText(doc, false)]);
            if (!res?.vectors?.[0]) continue;
            const entry = { vector: res.vectors[0], hash, document: doc,
                coveredIndices: Array.isArray(s.coveredIndices) ? [...s.coveredIndices] : [],
                depth: s.depth || 1 };
            this.summaryVectors.set(s.id, entry);
            await this._saveSummaryVector(s.id, entry);
            liveSum.add(s.id);
        }
        for (const [id] of this.summaryVectors) {
            if (!liveSum.has(id)) { this.summaryVectors.delete(id); await this._deleteSummaryVector(id); }
        }
        const liveThr = new Set();
        for (const t of (meta.threads || [])) {
            if (!t?.id) continue;
            const doc = this.buildThreadVectorDocument(t);
            if (!doc) continue;
            const hash = this._hashString(doc);
            const ex = this.threadVectors.get(t.id);
            if (ex && ex.hash === hash) { liveThr.add(t.id); continue; }
            const res = await this._embed([this._prepareText(doc, false)]);
            if (!res?.vectors?.[0]) continue;
            const entry = { vector: res.vectors[0], hash, document: doc, status: t.status };
            this.threadVectors.set(t.id, entry);
            await this._saveThreadVector(t.id, entry);
            liveThr.add(t.id);
        }
        for (const [id] of this.threadVectors) {
            if (!liveThr.has(id)) { this.threadVectors.delete(id); await this._deleteThreadVector(id); }
        }
        this.clearRecallCache('syncSummaryThreads');
    }

    async addMessage(messageIndex, meta) {`,
`async syncSummaryThreadsFromChat(chat) {`));

V.push(p('10. 新增 _saveSummaryVector',
`    async _deleteVector(messageIndex) {`,
`    async _saveSummaryVector(summaryId, data) {
        await this._openDB();
        const key = this.chatId + '_sum_' + summaryId;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(SUMMARY_STORE, 'readwrite');
            tx.objectStore(SUMMARY_STORE).put({ key, chatId: this.chatId, summaryId,
                vector: data.vector, hash: data.hash, document: data.document,
                coveredIndices: data.coveredIndices, depth: data.depth });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _saveThreadVector(threadId, data) {
        await this._openDB();
        const key = this.chatId + '_thr_' + threadId;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(THREAD_STORE, 'readwrite');
            tx.objectStore(THREAD_STORE).put({ key, chatId: this.chatId, threadId,
                vector: data.vector, hash: data.hash, document: data.document, status: data.status });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _deleteVector(messageIndex) {`,
`async _saveSummaryVector(summaryId, data) {`));

V.push(p('11. 新增 _deleteSummaryVector / _deleteThreadVector',
`    async _clearVectors() {`,
`    async _deleteSummaryVector(summaryId) {
        await this._openDB();
        const key = this.chatId + '_sum_' + summaryId;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(SUMMARY_STORE, 'readwrite');
            tx.objectStore(SUMMARY_STORE).delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _deleteThreadVector(threadId) {
        await this._openDB();
        const key = this.chatId + '_thr_' + threadId;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(THREAD_STORE, 'readwrite');
            tx.objectStore(THREAD_STORE).delete(key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async _clearVectors() {`,
`async _deleteSummaryVector(summaryId) {`));

V.push(p('12. 新增 _loadSummariesForChat / _loadThreadsForChat',
`    async _deleteVector(messageIndex) {`,
`    async _loadSummariesForChat(chatId, chat) {
        await this._openDB();
        const stored = await new Promise((resolve, reject) => {
            const tx = this.db.transaction(SUMMARY_STORE, 'readonly');
            const req = tx.objectStore(SUMMARY_STORE).index('chatId').getAll(chatId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
        const liveIds = new Set((chat[0]?.horae_meta?.autoSummaries || [])
            .filter(s => s?.id && s.active !== false).map(s => s.id));
        for (const item of stored) {
            if (!liveIds.has(item.summaryId)) { await this._deleteSummaryVector(item.summaryId); continue; }
            this.summaryVectors.set(item.summaryId, { vector: item.vector, hash: item.hash,
                document: item.document, coveredIndices: item.coveredIndices || [], depth: item.depth || 1 });
        }
    }

    async _loadThreadsForChat(chatId, chat) {
        await this._openDB();
        const stored = await new Promise((resolve, reject) => {
            const tx = this.db.transaction(THREAD_STORE, 'readonly');
            const req = tx.objectStore(THREAD_STORE).index('chatId').getAll(chatId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
        const ACTIVE = new Set(['open', 'progressing', 'blocked']);
        const liveIds = new Set((chat[0]?.horae_meta?.threads || [])
            .filter(t => t?.id && ACTIVE.has(t.status)).map(t => t.id));
        for (const item of stored) {
            if (!liveIds.has(item.threadId)) { await this._deleteThreadVector(item.threadId); continue; }
            this.threadVectors.set(item.threadId, { vector: item.vector, hash: item.hash,
                document: item.document, status: item.status });
        }
    }

    async _deleteVector(messageIndex) {`,
`async _loadSummariesForChat(chatId, chat) {`));


V.push(p('13. search 主循环追加 summary entries',
`        // 快照与当前对话同池竞争：相同阈值、相同打分逻辑，仅以 snapKey 区分来源
        for (const f of snapEntries) {`,
`        for (const f of this._iterateSummaryEntries()) {
            const sim = this._dotProduct(queryVec, f.entry.vector);
            if (sim >= threshold) {
                scored.push({ summaryId: f.summaryId, similarity: sim, document: f.entry.document,
                    source: 'summary', coveredIndices: f.entry.coveredIndices, depth: f.entry.depth });
            }
        }
        for (const f of this._iterateThreadEntries()) {
            const sim = this._dotProduct(queryVec, f.entry.vector);
            if (sim >= threshold) {
                scored.push({ threadId: f.threadId, similarity: sim, document: f.entry.document,
                    source: 'thread', status: f.entry.status });
            }
        }

        // 快照与当前对话同池竞争：相同阈值、相同打分逻辑，仅以 snapKey 区分来源
        for (const f of snapEntries) {`,
`source: 'summary', coveredIndices: f.entry.coveredIndices`));

V.push(p('14. search return 前加 summary/message 去重',
`        const deduped = this._deduplicateResults(adjusted);
        this._debug(\`[Horae Vector] 去重后: \${deduped.length} 条\`);

        return deduped.slice(0, topK);`,
`        const deduped = this._deduplicateResults(adjusted);
        const dedupedFinal = this._dedupSummaryVsMessage(deduped);
        this._debug(\`[Horae Vector] 去重后: \${dedupedFinal.length} 条\`);

        return dedupedFinal.slice(0, topK);`,
`const dedupedFinal = this._dedupSummaryVsMessage(deduped);`));

V.push(p('15. 新增 _dedupSummaryVsMessage',
`    _adjustThresholdByFrequency(results, baseThreshold) {`,
`    _dedupSummaryVsMessage(results) {
        if (!results?.length) return results;
        const summaryHits = results.filter(r => r.source === 'summary');
        if (summaryHits.length === 0) return results;
        const coveredBySummary = new Map();
        for (const sh of summaryHits) {
            const sv = this.summaryVectors.get(sh.summaryId);
            if (!sv?.coveredIndices?.length) continue;
            for (const idx of sv.coveredIndices) {
                const ex = coveredBySummary.get(idx);
                if (!ex || sh.similarity > ex.similarity) coveredBySummary.set(idx, sh);
            }
        }
        if (coveredBySummary.size === 0) return results;
        return results.filter(r => {
            if (r.source === 'summary' || r.source === 'thread' || r.snapKey) return true;
            const cov = coveredBySummary.get(r.messageIndex);
            if (!cov) return true;
            return (r.similarity - cov.similarity) >= SUMMARY_MESSAGE_SIM_DIFF_THRESHOLD;
        });
    }

    _adjustThresholdByFrequency(results, baseThreshold) {`,
`_dedupSummaryVsMessage(results) {`));

V.push(p('16. _buildRecallText 主循环前加 summary/thread map',
`        const memTag = labels.memoryTag || '[历史记忆]';
        const userTag = labels.userTag || '[USER]';
        const aiTag = labels.aiTag || '[AI]';`,
`        const memTag = labels.memoryTag || '[历史记忆]';
        const userTag = labels.userTag || '[USER]';
        const aiTag = labels.aiTag || '[AI]';
        const _sumMap = (chat[0]?.horae_meta?.autoSummaries || []).reduce((m, s) => (m[s.id] = s, m), {});
        const _thrMap = (chat[0]?.horae_meta?.threads || []).reduce((m, t) => (m[t.id] = t, m), {});`,
`const _sumMap = (chat[0]?.horae_meta?.autoSummaries || [])`));

V.push(p('17. _buildRecallText 加 summary / thread 分支',
`            const prefix = snapEntry ? \`\${memTag} \` : '';
            const idLabel = snapEntry ? \`#\${snapEntry.originalIndex >= 0 ? snapEntry.originalIndex : '?'}\` : \`#\${r.messageIndex}\`;`,
`            if (r.summaryId) {
                const s = _sumMap[r.summaryId];
                const rng = s?.range ? \`\${s.range[0]}-\${s.range[1]}\` : '?';
                lines.push(\`[摘要 L\${s?.depth || 1} | \${rng}] \${s?.summaryText || r.document}\`);
                continue;
            }
            if (r.threadId) {
                const t = _thrMap[r.threadId];
                const parts = ['[未完成事务]', t?.type || '?', t?.title || r.document, \`(\${t?.status || '?'})\`];
                if (t?.participants?.length) parts.push('参与: ' + t.participants.join(','));
                lines.push(parts.join(' '));
                continue;
            }
            const prefix = snapEntry ? \`\${memTag} \` : '';
            const idLabel = snapEntry ? \`#\${snapEntry.originalIndex >= 0 ? snapEntry.originalIndex : '?'}\` : \`#\${r.messageIndex}\`;`,
`if (r.summaryId) {`));


V.push(p('18. onupgradeneeded 新增 2 个 store',
`                    const snap = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });`,
`                    const snap = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
                }
                if (event.oldVersion < 3 && !db.objectStoreNames.contains(SUMMARY_STORE)) {
                    const sm = db.createObjectStore(SUMMARY_STORE, { keyPath: 'key' });
                    sm.createIndex('chatId', 'chatId', { unique: false });
                }
                if (event.oldVersion < 3 && !db.objectStoreNames.contains(THREAD_STORE)) {
                    const th = db.createObjectStore(THREAD_STORE, { keyPath: 'key' });
                    th.createIndex('chatId', 'chatId', { unique: false });`,
`!db.objectStoreNames.contains(SUMMARY_STORE)`));

V.push(p('19. clearIndex 追加清理 summary/thread',
`    async clearIndex() {`,
`    async clearIndex() {
        // 同时清理 summary / thread store
        try {
            await this._openDB();
            const _clearStore = (storeName) => new Promise((resolve) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).index('chatId').openCursor(this.chatId);
                req.onsuccess = (e) => { const c = e.target.result; if (c) { c.delete(); c.continue(); } };
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
            await _clearStore(SUMMARY_STORE);
            await _clearStore(THREAD_STORE);
        } catch (_) {}
        this.summaryVectors.clear();
        this.threadVectors.clear();`,
`await _clearStore(SUMMARY_STORE);`));

I.push(p('20. index.js _autoExtractFactsFromSummary 末尾追加 sync',
`        entry._factsExtractedAt = new Date().toISOString();
        entry._factsExtractedCount = okCount;
        entry._threadsExtractedCount = threadOkCount;

        try { await getContext().saveChat(); } catch (_) {}`,
`        entry._factsExtractedAt = new Date().toISOString();
        entry._factsExtractedCount = okCount;
        entry._threadsExtractedCount = threadOkCount;

        // S1.6: 同步 summary / thread 到向量索引（幂等，不阻塞主流程）
        try {
            const vm = (typeof vectorManager !== 'undefined' && vectorManager) ? vectorManager : null;
            if (vm && typeof vm.syncSummaryThreadsFromChat === 'function') {
                await vm.syncSummaryThreadsFromChat(chat).catch(() => {});
            }
        } catch (_) {}

        try { await getContext().saveChat(); } catch (_) {}`,
`await vm.syncSummaryThreadsFromChat(chat).catch`));


// ═══════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════

function readNorm(f) {
    const raw = fs.readFileSync(f, 'utf8');
    const isCRLF = raw.includes('\r\n');
    return { isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNorm(f, content, isCRLF) {
    fs.writeFileSync(f, isCRLF ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}
function backup(f) { const b = f + SUFFIX; if (!fs.existsSync(b)) fs.copyFileSync(f, b); }

function applyPatches(target, patches) {
    const file = FILES[target];
    const { isCRLF, content: raw } = readNorm(file);
    let content = raw;
    let ok = 0, fail = 0;
    console.log('\n[' + path.basename(file) + ']');
    for (const patch of patches) {
        if (patch.appliedCheck && content.includes(patch.appliedCheck)) {
            console.log('  .. ' + patch.name + ' (already)');
            ok++;
            continue;
        }
        const occ = content.split(patch.before).length - 1;
        if (occ === 0) { console.error('  XX ' + patch.name + ' NOT FOUND'); fail++; continue; }
        if (occ > 1) { console.error('  XX ' + patch.name + ' (' + occ + ' matches)'); fail++; continue; }
        content = content.replace(patch.before, patch.after);
        console.log('  OK ' + patch.name);
        ok++;
    }
    if (fail > 0) return { ok: false, fail, content, isCRLF };
    if (DRY_RUN) return { ok: true, fail: 0, content, isCRLF, changed: content !== raw };
    if (content !== raw) {
        backup(file);
        writeNorm(file, content, isCRLF);
        console.log('  [written] ' + path.basename(file));
    }
    return { ok: true, fail: 0, content, isCRLF, changed: content !== raw };
}

let totalChanged = 0;
let totalFail = 0;

const r1 = applyPatches('vm', V);
if (!r1.ok) totalFail += r1.fail;
if (r1.changed) totalChanged++;

if (totalFail === 0) {
    const r2 = applyPatches('ix', I);
    if (!r2.ok) totalFail += r2.fail;
    if (r2.changed) totalChanged++;
} else {
    console.error('\n⚠️ vectorManager.js 有失败，跳过 index.js');
}

console.log('\n=== 汇总 ===');
console.log('变更文件数: ' + totalChanged);
console.log('失败数: ' + totalFail);
console.log('模式: ' + (DRY_RUN ? 'DRY-RUN（未写入）' : 'APPLY（已写入）'));

if (totalFail > 0) { console.error('\n⚠️ 有 patch 未找到，未写入。'); process.exit(1); }
if (DRY_RUN) { console.log('\n[dry-run] 未写入。加 --apply 应用。'); process.exit(0); }

// 语法检查
console.log('\n=== 语法检查 ===');
for (const [k, f] of Object.entries(FILES)) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status === 0) console.log('  OK ' + path.basename(f));
    else { console.error('  XX ' + path.basename(f) + ':\n' + (r.stderr || r.stdout)); totalFail++; }
}
if (totalFail > 0) { console.error('\n⚠️ 语法失败，可 --rollback 回滚'); process.exit(2); }
console.log('\n=== S1.6 DONE ===');
