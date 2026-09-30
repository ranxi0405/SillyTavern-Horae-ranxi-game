/**
 * Horae IdentityKindRegistry v0.1
 *
 * 职责：
 *   - 集中管理 identity entries 的 kind 定义（label / icon / order / aliases）
 *   - 提供扩展 kind 的 fallback 逻辑
 *   - 纯数据 + 纯函数，无副作用
 *
 * 数据流向：
 *   identityKindRegistry.js → identityStore / View / Prompt
 *
 * 设计原则：
 *   - 核心 kind 硬编码注册
 *   - 扩展 kind 通过 entry.meta.label / entry.meta.icon fallback
 *   - kind 名称发布后不可重命名，只允许新增 alias
 *   - 不依赖任何其他模块
 */

/**
 * 核心 kind 注册表
 *
 * 字段说明：
 *   - label:   Player View 显示用（i18n）
 *   - aiLabel: Prompt 注入用（i18n）
 *   - icon:    FontAwesome class
 *   - order:   排序号（越小越靠前）
 *   - category: 'core' | 'extended'
 *   - aliases: 兼容别名（历史 kind 名称）
 */
export const KIND_REGISTRY = {
    gender: {
        label: { 'zh-CN': '性别', 'zh-TW': '性別', en: 'Gender' },
        aiLabel: { 'zh-CN': '性别', 'zh-TW': '性別', en: 'Gender' },
        icon: 'fa-venus-mars',
        order: 1,
        category: 'core',
        aliases: [],
    },
    spiritRoot: {
        label: { 'zh-CN': '灵根', 'zh-TW': '靈根', en: 'Spirit Root' },
        aiLabel: { 'zh-CN': '灵根', 'zh-TW': '靈根', en: 'Spirit Root' },
        icon: 'fa-seedling',
        order: 10,
        category: 'core',
        aliases: [],
    },
    constitution: {
        label: { 'zh-CN': '体质', 'zh-TW': '體質', en: 'Constitution' },
        aiLabel: { 'zh-CN': '体质', 'zh-TW': '體質', en: 'Constitution' },
        icon: 'fa-shield',
        order: 11,
        category: 'core',
        aliases: [],
    },
    bloodline: {
        label: { 'zh-CN': '血脉', 'zh-TW': '血脈', en: 'Bloodline' },
        aiLabel: { 'zh-CN': '血脉', 'zh-TW': '血脈', en: 'Bloodline' },
        icon: 'fa-dna',
        order: 12,
        category: 'core',
        aliases: [],
    },
    xianZi: {
        label: { 'zh-CN': '仙姿', 'zh-TW': '仙姿', en: 'Xian Zi' },
        aiLabel: { 'zh-CN': '仙姿', 'zh-TW': '仙姿', en: 'Xian Zi' },
        icon: 'fa-gem',
        order: 13,
        category: 'core',
        aliases: ['xianzi'],
    },
    talent: {
        label: { 'zh-CN': '天赋', 'zh-TW': '天賦', en: 'Talents' },
        aiLabel: { 'zh-CN': '天赋', 'zh-TW': '天賦', en: 'Talents' },
        icon: 'fa-star',
        order: 20,
        category: 'core',
        aliases: [],
    },
    arts: {
        label: { 'zh-CN': '初始功法', 'zh-TW': '初始功法', en: 'Innate Arts' },
        aiLabel: { 'zh-CN': '初始功法', 'zh-TW': '初始功法', en: 'Innate Arts' },
        icon: 'fa-book',
        order: 21,
        category: 'core',
        aliases: [],
    },
    background: {
        label: { 'zh-CN': '出身', 'zh-TW': '出身', en: 'Background' },
        aiLabel: { 'zh-CN': '出身', 'zh-TW': '出身', en: 'Background' },
        icon: 'fa-house',
        order: 30,
        category: 'core',
        aliases: [],
    },
    goldenFinger: {
        label: { 'zh-CN': '金手指', 'zh-TW': '金手指', en: 'Golden Finger' },
        aiLabel: { 'zh-CN': '金手指', 'zh-TW': '金手指', en: 'Golden Finger' },
        icon: 'fa-hand-sparkles',
        order: 40,
        category: 'core',
        aliases: ['goldenfinger', 'golden_finger'],
    },
    goldenFingerSource: {
        label: { 'zh-CN': '金手指来源', 'zh-TW': '金手指來源', en: 'Golden Finger Source' },
        aiLabel: { 'zh-CN': '金手指来源', 'zh-TW': '金手指來源', en: 'Golden Finger Source' },
        icon: 'fa-question',
        order: 41,
        category: 'core',
        aliases: ['goldenfingersource', 'golden_finger_source'],
    },
};

/** 未注册 kind 的 fallback 图标 */
const FALLBACK_ICON = 'fa-circle-dot';

/** 未注册 kind 的 fallback order */
const FALLBACK_ORDER = 9999;

/** 支持的语言列表（未列出的语言 fallback 到 en） */
const SUPPORTED_LANGS = ['zh-CN', 'zh-TW', 'en'];

/** 归一化语言代码 */
function _normLang(lang) {
    if (!lang || typeof lang !== 'string') return 'en';
    const t = lang.trim();
    if (SUPPORTED_LANGS.includes(t)) return t;
    // 简化 fallback：ja/ko/ru 先用 en
    if (t.startsWith('zh')) return 'zh-CN';
    return 'en';
}

/**
 * 解析 alias → 主 kind 名
 * @param {string} kind
 * @returns {string} 主 kind 名（找不到返回原 kind）
 */
export function resolveKindAlias(kind) {
    if (!kind || typeof kind !== 'string') return kind;
    if (KIND_REGISTRY[kind]) return kind;
    for (const [mainKind, def] of Object.entries(KIND_REGISTRY)) {
        if (Array.isArray(def.aliases) && def.aliases.includes(kind)) {
            return mainKind;
        }
    }
    return kind;
}

/**
 * 获取 kind 定义对象
 * @param {string} kind
 * @returns {object|null} 定义对象（未注册返回 null）
 */
export function getKindDefinition(kind) {
    if (!kind || typeof kind !== 'string') return null;
    const resolved = resolveKindAlias(kind);
    return KIND_REGISTRY[resolved] || null;
}

/**
 * 检查 kind 是否为核心注册 kind
 * @param {string} kind
 * @returns {boolean}
 */
export function isCoreKind(kind) {
    return getKindDefinition(kind) !== null;
}

/**
 * 获取 Player View 用 label
 * @param {string} kind
 * @param {string} [lang='en']
 * @returns {string}
 */
export function getKindLabel(kind, lang = 'en') {
    const def = getKindDefinition(kind);
    if (!def) return kind || '';
    const l = _normLang(lang);
    return def.label?.[l] || def.label?.en || kind;
}

/**
 * 获取 AI Prompt 用 label
 * @param {string} kind
 * @param {string} [lang='en']
 * @returns {string}
 */
export function getKindAiLabel(kind, lang = 'en') {
    const def = getKindDefinition(kind);
    if (!def) return kind || '';
    const l = _normLang(lang);
    return def.aiLabel?.[l] || def.aiLabel?.en || getKindLabel(kind, lang);
}

/**
 * 获取 kind 图标 class
 * @param {string} kind
 * @returns {string}
 */
export function getKindIcon(kind) {
    const def = getKindDefinition(kind);
    return def?.icon || FALLBACK_ICON;
}

/**
 * 获取 kind 排序号
 * @param {string} kind
 * @returns {number}
 */
export function getKindOrder(kind) {
    const def = getKindDefinition(kind);
    return typeof def?.order === 'number' ? def.order : FALLBACK_ORDER;
}

/**
 * 扩展 kind label fallback
 * 优先 entry.meta.label / entry.meta.aiLabel，其次 kind 字符串
 * @param {string} kind
 * @param {object} [entry] - entry 对象（可选，用于读 meta）
 * @param {string} [lang='en']
 * @param {boolean} [forAI=false] - true 时优先 aiLabel
 * @returns {string}
 */
export function getExtendedKindLabel(kind, entry = null, lang = 'en', forAI = false) {
    // 优先核心注册表
    if (isCoreKind(kind)) {
        return forAI ? getKindAiLabel(kind, lang) : getKindLabel(kind, lang);
    }
    // 扩展 kind：从 entry.meta 读
    const meta = entry?.meta || {};
    const l = _normLang(lang);
    const primaryKey = forAI ? 'aiLabel' : 'label';
    const secondaryKey = forAI ? 'label' : 'aiLabel';
    // meta.label / meta.aiLabel 支持 string 或 { lang: string }
    const pick = (v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return v[l] || v.en || null;
        return null;
    };
    return pick(meta[primaryKey]) || pick(meta[secondaryKey]) || kind || '';
}

/**
 * 扩展 kind icon fallback
 * 优先 entry.meta.icon，其次 FALLBACK_ICON
 * @param {string} kind
 * @param {object} [entry] - entry 对象（可选）
 * @returns {string}
 */
export function getExtendedKindIcon(kind, entry = null) {
    if (isCoreKind(kind)) return getKindIcon(kind);
    const meta = entry?.meta || {};
    if (typeof meta.icon === 'string' && meta.icon.trim()) return meta.icon.trim();
    return FALLBACK_ICON;
}

/**
 * 导出常量（供外部使用）
 */
export const _FALLBACK_ICON = FALLBACK_ICON;
export const _FALLBACK_ORDER = FALLBACK_ORDER;
export const _SUPPORTED_LANGS = SUPPORTED_LANGS;
