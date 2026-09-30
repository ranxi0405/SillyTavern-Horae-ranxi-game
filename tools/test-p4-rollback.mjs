import { migrate, rollback } from '../core/memory/identitySchemaVersion.js';

console.log('=== P4 migrate / rollback 测试 ===\n');

// case 1: v0.1 -> v0.2，应生成 backup
{
    const id = { gender: '女', spiritRoot: '无界灵根', talents: ['过目不忘'] };
    const r = migrate(id);
    console.log('[case1 v0.1->v0.2]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| count:', r.migratedCount, '| hasBackup:', !!r.backup);
    console.log('  id._v:', id._v, '| entries.len:', id.entries?.length);
    console.log('');
}

// case 2: rollback 到备份，逐字段比对
{
    const id = { gender: '女', spiritRoot: '无界灵根' };
    const snapshotBefore = JSON.stringify(id);
    const r = migrate(id);
    const snapshotAfterMigrate = JSON.stringify(id);

    const rb = rollback(id, r.backup);
    const snapshotAfterRollback = JSON.stringify(id);

    console.log('[case2 rollback]');
    console.log('  rb.ok:', rb.ok, '| rb.reason:', rb.reason);
    console.log('  after rollback matches pre-migrate:', snapshotAfterRollback === snapshotBefore);
    console.log('  after migrate differs from pre-migrate:', snapshotAfterMigrate !== snapshotBefore);
    console.log('  gender restored:', id.gender === '女');
    console.log('  spiritRoot restored:', id.spiritRoot === '无界灵根');
    console.log('  _v cleared:', id._v === undefined, '| entries cleared:', id.entries === undefined);
    console.log('');
}

// case 3: v0.2 缺 entries 但 legacy 有内容 -> repairedMissingEntries + backup
{
    const id = { _v: 'v0.2', gender: '男' };
    const r = migrate(id);
    console.log('[case3 v0.2 缺 entries，legacy 有值]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  after: _v =', id._v, '| entries.len =', id.entries?.length);
    console.log('');
}

// case 4: v0.2 缺 entries 且 legacy 也为空 -> 拒绝迁移
{
    const id = { _v: 'v0.2' };
    const before = JSON.stringify(id);
    const r = migrate(id);
    const after = JSON.stringify(id);
    console.log('[case4 v0.2 缺 entries，legacy 也空]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  untouched:', before === after);
    console.log('');
}

// case 5: alreadyCurrent -> 不生成 backup
{
    const id = { _v: 'v0.2', entries: [] };
    const r = migrate(id);
    console.log('[case5 alreadyCurrent]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('');
}

// case 6: unknown -> ok:false，不改动
{
    const id = { _v: 'v99.9', foo: 1 };
    const before = JSON.stringify(id);
    const r = migrate(id);
    const after = JSON.stringify(id);
    console.log('[case6 unknown]');
    console.log('  ok:', r.ok, '| reason:', r.reason, '| hasBackup:', !!r.backup);
    console.log('  untouched:', before === after);
    console.log('');
}

// case 7: rollback noBackup
{
    const id = { a: 1 };
    const rb = rollback(id, null);
    console.log('[case7 rollback noBackup]');
    console.log('  ok:', rb.ok, '| reason:', rb.reason);
    console.log('');
}

// case 8: rollback backupIsSameObject
{
    const id = { a: 1 };
    const rb = rollback(id, id);
    console.log('[case8 rollback same object]');
    console.log('  ok:', rb.ok, '| reason:', rb.reason);
    console.log('');
}
