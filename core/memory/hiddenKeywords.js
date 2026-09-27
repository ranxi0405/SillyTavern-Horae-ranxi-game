/**
 * Horae HiddenKeywords v0.1
 *
 * 职责：
 *   - 集中管理"仅天道知晓"的隐藏设定关键词
 *   - 提供 sanitize 函数：把隐藏词替换为占位符
 *   - 用于注入 Prompt 前的过滤（不修改存储层）
 *
 * 设计原则：
 *   - 存储层保持原文（玩家 UI 可看完整）
 *   - 注入层替换（AI 看不到具体名称）
 *   - 未来新增隐藏设定：只在 HIDDEN_MAP 里加一条
 */

export const HIDDEN_MAP = {
    '无界灵根': '[隐藏灵根]',
    '无界道体': '[隐藏体质]',
};

/**
 * 把文本中的隐藏关键词替换为占位符
 * @param {string} text
 * @returns {string}
 */
export function sanitizeHiddenKeywords(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;
    for (const [kw, rep] of Object.entries(HIDDEN_MAP)) {
        if (out.includes(kw)) {
            out = out.split(kw).join(rep);
        }
    }
    return out;
}

/**
 * 检测文本是否包含隐藏关键词
 * @param {string} text
 * @returns {boolean}
 */
export function containsHiddenKeywords(text) {
    if (!text || typeof text !== 'string') return false;
    return Object.keys(HIDDEN_MAP).some(kw => text.includes(kw));
}
