/**
 * Horae RpgUtils v0.1
 *
 * 职责：
 *   - RPG State 纯计算工具（无副作用，无 I/O）
 *   - 从 index.js 抽出，HUD 与 Prompt 共用同一套 phase 算法
 *
 * 边界：
 *   - 不写数据
 *   - 不改 StateStore 结构
 *   - 阶段规则与 index.js 原 _calcCultivationSegmentHud 逐字等价
 */

/**
 * 大境界修为基准（每个大境界的修为总上限）
 * 从 index.js 原 _HUD_REALM_BASE_CULTIVATION 逐字迁入，不改值
 */
export const REALM_BASE_CULTIVATION = {
    '炼气': 1000, '筑基': 2000, '结晶': 4000, '金丹': 8000, '具灵': 16000,
    '元婴': 32000, '化神': 64000, '悟道': 128000, '羽化': 256000, '登仙': 512000,
    '飞升': Infinity,
};

/**
 * 根据修为当前值与大境界名，计算当前小境界阶段
 *
 * 算法（与 index.js 原 _calcCultivationSegmentHud 逐字等价）：
 *   r = cur / max
 *   r < 0.15       -> 初期,  segCur = cur,                segMax = 0.15 * max
 *   r < 0.35       -> 中期,  segCur = cur - 0.15*max,     segMax = 0.20 * max
 *   r < 0.60       -> 后期,  segCur = cur - 0.35*max,     segMax = 0.25 * max
 *   else           -> 圆满,  segCur = cur - 0.60*max,     segMax = 0.40 * max
 *
 *   飞升 / Infinity:  { phase: null, segCur: cur, segMax: Infinity }
 *   登仙圆满:         { phase: '圆满', segCur: cur - 0.60*max, segMax: Infinity }
 *
 * 语义说明（重要）：
 *   - 入参 cur 是 StateStore 原始当前修为（例如 120）
 *   - max 是大境界总上限（例如 筑基 = 2000）
 *   - 返回的 segCur/segMax 代表「当前小境界阶段进度」（例如 120/300）
 *   - segMax 不等于 max：300 是「筑基·初期」阶段上限，2000 是筑基总上限
 *   - 调用方不应把 segMax 当成整个大境界上限
 *   - 本函数不写回 StateStore，[120,2000] 保持原始值
 *
 * @param {number} cur - 当前修为值（StateStore 原始值）
 * @param {string} realmName - 大境界名（筑基 / 金丹 / ...）
 * @returns {{phase: string|null, segCur: number, segMax: number}|null}
 *          null 表示 realmName 未知 / 不在基准表内
 */
export function calcCultivationSegment(cur, realmName) {
    if (!realmName || !(realmName in REALM_BASE_CULTIVATION)) return null;
    const max = REALM_BASE_CULTIVATION[realmName];
    if (max === Infinity || realmName === '飞升') {
        return { phase: null, segCur: cur, segMax: Infinity };
    }
    const curSafe = Math.max(0, cur);
    const r = curSafe / max;
    if (r < 0.15) {
        return { phase: '初期', segCur: Math.round(curSafe), segMax: Math.round(0.15 * max) };
    }
    if (r < 0.35) {
        return { phase: '中期', segCur: Math.round(curSafe - 0.15 * max), segMax: Math.round(0.20 * max) };
    }
    if (r < 0.60) {
        return { phase: '后期', segCur: Math.round(curSafe - 0.35 * max), segMax: Math.round(0.25 * max) };
    }
    if (realmName === '登仙') {
        return { phase: '圆满', segCur: Math.round(curSafe - 0.60 * max), segMax: Infinity };
    }
    const curClamped = Math.min(curSafe, max);
    return { phase: '圆满', segCur: Math.round(curClamped - 0.60 * max), segMax: Math.round(0.40 * max) };
}
