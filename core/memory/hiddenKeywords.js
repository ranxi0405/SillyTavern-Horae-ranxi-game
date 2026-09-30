/**
 * Horae HiddenKeywords v0.2
 *
 * 职责：
 *   - 提供 sanitize 函数：把隐藏词替换为占位符
 *   - 隐藏词由当前角色卡提供（extensions.horae.hiddenKeywords）
 *
 * 设计原则：
 *   - 通用系统不硬编码任何具体角色秘密
 *   - 通过 setActiveHiddenMap 在 CHAT_CHANGED / 卡加载时刷新
 */

// 默认空 map（历史兼容保留）
export const HIDDEN_MAP = {};

// 模块级 active map
let _activeMap = {};

function _normalizeMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    const out = {};
    for (const [kw, rep] of Object.entries(map)) {
        if (typeof kw !== 'string' || !kw.trim()) continue;
        if (typeof rep !== 'string' || !rep) continue;
        out[kw] = rep;
    }
    return out;
}

export function setActiveHiddenMap(map) {
    _activeMap = _normalizeMap(map);
}

export function getActiveHiddenMap() {
    return { ..._activeMap };
}

export function sanitizeHiddenKeywords(text, mapOverride) {
    if (!text || typeof text !== 'string') return text;
    const map = (mapOverride && typeof mapOverride === 'object' && !Array.isArray(mapOverride))
        ? _normalizeMap(mapOverride)
        : _activeMap;
    let out = text;
    for (const [kw, rep] of Object.entries(map)) {
        if (out.includes(kw)) {
            out = out.split(kw).join(rep);
        }
    }
    return out;
}

export function containsHiddenKeywords(text, mapOverride) {
    if (!text || typeof text !== 'string') return false;
    const map = (mapOverride && typeof mapOverride === 'object' && !Array.isArray(mapOverride))
        ? _normalizeMap(mapOverride)
        : _activeMap;
    return Object.keys(map).some(kw => text.includes(kw));
}
