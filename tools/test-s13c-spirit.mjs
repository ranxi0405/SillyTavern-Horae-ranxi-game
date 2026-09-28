const SPIRIT_ORDER = ['蒙昧', '清明', '凝照', '洞玄', '明心', '太虚'];
const SPIRIT_THRESHOLD = { '蒙昧': 1000, '清明': 3000, '凝照': 6000, '洞玄': 10000, '明心': 15000, '太虚': Infinity };

function applySpiritChange(state, changes) {
    if (!changes || typeof changes !== 'object') return false;
    const hasTier = typeof changes.tier === 'string';
    const hasXp = typeof changes.xp === 'number';
    if (!hasTier && !hasXp) return false;
    if (hasXp) {
        if (!Number.isSafeInteger(changes.xp) || changes.xp < 0) return false;
    }
    const curTier = state.spirit?.tier || null;
    const curXp = state.spirit?.xp || 0;
    const curTotalXpRaw = state.spirit?.totalXp;
    const curTotalXp = (curTotalXpRaw !== undefined && curTotalXpRaw !== null) ? curTotalXpRaw : curXp;

    let finalTier = curTier;
    let tierChanged = false;
    if (hasTier) {
        const t = changes.tier;
        if (!SPIRIT_ORDER.includes(t)) return false;
        if (curTier && t !== curTier) {
            const curIdx = SPIRIT_ORDER.indexOf(curTier);
            const newIdx = SPIRIT_ORDER.indexOf(t);
            if (newIdx !== curIdx + 1) return false;
            const threshold = SPIRIT_THRESHOLD[curTier];
            if (!(curXp >= threshold)) return false;
            finalTier = t;
            tierChanged = true;
        } else if (!curTier) {
            finalTier = t;
            tierChanged = true;
        }
    }

    let finalXp;
    if (tierChanged) {
        finalXp = hasXp ? changes.xp : 0;
        const t = SPIRIT_THRESHOLD[finalTier];
        if (finalTier !== '太虚' && finalXp > t) return false;
    } else {
        if (!finalTier && hasXp) return false;
        finalXp = hasXp ? changes.xp : curXp;
        if (hasXp) {
            if (finalXp < curXp) return false;
            if (finalTier !== '太虚') {
                const t = SPIRIT_THRESHOLD[finalTier];
                if (finalXp > t) return false;
            }
        }
    }

    let finalTotalXp;
    if (tierChanged) {
        finalTotalXp = curTotalXp + finalXp;
    } else {
        finalTotalXp = curTotalXp + (finalXp - curXp);
    }

    if (!state.spirit) state.spirit = {};
    state.spirit.tier = finalTier;
    state.spirit.xp = finalXp;
    state.spirit.totalXp = finalTotalXp;
    return true;
}

function caseRun(label, cur, changes, expected) {
    const state = { spirit: { ...cur } };
    applySpiritChange(state, changes);
    const r = state.spirit;
    const pass = (r.tier === expected.tier && r.xp === expected.xp && r.totalXp === expected.totalXp);
    console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label);
    console.log('  got:      tier=' + r.tier + ' xp=' + r.xp + ' totalXp=' + r.totalXp);
    console.log('  expected: tier=' + expected.tier + ' xp=' + expected.xp + ' totalXp=' + expected.totalXp);
    return pass;
}

let all = true;
all = caseRun('A: 凝照 240 -> 340',
    { tier: '凝照', xp: 240, totalXp: 4240 },
    { xp: 340 },
    { tier: '凝照', xp: 340, totalXp: 4340 }) && all;
all = caseRun('B: 凝照 6000 -> 洞玄 100',
    { tier: '凝照', xp: 6000, totalXp: 10000 },
    { tier: '洞玄', xp: 100 },
    { tier: '洞玄', xp: 100, totalXp: 10100 }) && all;
all = caseRun('C: 凝照 6000 -> 洞玄 (未给 xp)',
    { tier: '凝照', xp: 6000, totalXp: 10000 },
    { tier: '洞玄' },
    { tier: '洞玄', xp: 0, totalXp: 10000 }) && all;

console.log(all ? '\nALL PASS' : '\nSOME FAILED');
process.exit(all ? 0 : 1);
