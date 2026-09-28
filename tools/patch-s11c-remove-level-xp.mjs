#!/usr/bin/env node
/**
 * S1.1c 补丁：彻底移除通用 RPG Level / XP 系统
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_SUFFIX = '.bak-before-s11c';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const DRY_RUN = !APPLY && !ROLLBACK;

function readNormalized(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const isCRLF = raw.includes('\r\n');
  return { raw, isCRLF, content: isCRLF ? raw.replace(/\r\n/g, '\n') : raw };
}
function writeNormalized(filepath, content, isCRLF) {
  const out = isCRLF ? content.replace(/\n/g, '\r\n') : content;
  fs.writeFileSync(filepath, out, 'utf8');
}
function backup(filepath) {
  const bak = filepath + BACKUP_SUFFIX;
  if (fs.existsSync(bak)) return;
  fs.copyFileSync(filepath, bak);
}
function restore(filepath) {
  const bak = filepath + BACKUP_SUFFIX;
  if (!fs.existsSync(bak)) return false;
  fs.copyFileSync(bak, filepath);
  fs.unlinkSync(bak);
  return true;
}

function applyEntry(content, entry) {
  if (entry.startMarker && entry.endMarker) {
    const s = content.indexOf(entry.startMarker);
    const e = content.indexOf(entry.endMarker);
    if (s === -1 || e === -1 || e <= s) {
      return { applied: false, content, reason: 'not_found' };
    }
    return {
      applied: true,
      content: content.substring(0, s) + entry.replaceWith + content.substring(e),
    };
  }
  const { before, after, appliedAnchor } = entry;
  const beforeIdx = content.indexOf(before);
  if (beforeIdx !== -1) {
    return {
      applied: true,
      content: content.substring(0, beforeIdx) + after + content.substring(beforeIdx + before.length),
    };
  }
  if (after && after.length > 0 && content.includes(after)) {
    return { applied: false, content, reason: 'already_applied' };
  }
  if (appliedAnchor && content.includes(appliedAnchor)) {
    return { applied: false, content, reason: 'already_applied' };
  }
  return { applied: false, content, reason: 'not_found' };
}

function applyFile(filepath, entries) {
  if (!fs.existsSync(filepath)) {
    console.error(`  X 文件不存在: ${filepath}`);
    return { ok: false };
  }
  const { content: original, isCRLF } = readNormalized(filepath);
  let content = original;
  const report = [];
  let hasError = false;

  for (const entry of entries) {
    const r = applyEntry(content, entry);
    if (r.applied) {
      content = r.content;
      report.push({ name: entry.name, status: 'APPLIED' });
    } else if (r.reason === 'already_applied') {
      report.push({ name: entry.name, status: 'SKIPPED' });
    } else {
      report.push({ name: entry.name, status: 'NOT FOUND' });
      hasError = true;
    }
  }

  console.log(`\n[${path.relative(ROOT, filepath)}]`);
  for (const r of report) {
    const icon = r.status === 'APPLIED' ? 'OK' : (r.status === 'NOT FOUND' ? 'XX' : '..');
    console.log(`  ${icon} ${r.name}  -> ${r.status}`);
  }

  if (hasError) return { ok: false, content, isCRLF };

  if (DRY_RUN) {
    return { ok: true, content, isCRLF, changed: content !== original };
  }
  if (content !== original) {
    backup(filepath);
    writeNormalized(filepath, content, isCRLF);
    console.log(`  [applied] 已写入`);
  }
  return { ok: true, content, isCRLF, changed: content !== original };
}

const PATCHES = {
  'index.js': [
    {
      name: 'DEFAULT_SETTINGS: 删 sendRpgXp / rpgXpUserOnly',
      before: `    sendRpgXp: false,               // 发送 XP（独立于等级）\n    rpgXpUserOnly: false,           // XP 仅限主角\n`,
      after: ``,
      appliedAnchor: `    sendRpgCurrency: false,         // 发送货币系统\n`,
    },
    {
      name: '_SETTINGS_EXPORT_KEYS: 删 sendRpgXp',
      before: `    'sendRpgEquipment', 'sendRpgXp', 'sendRpgCurrency', 'sendRpgStronghold', 'rpgDiceEnabled',\n`,
      after: `    'sendRpgEquipment', 'sendRpgCurrency', 'sendRpgStronghold', 'rpgDiceEnabled',\n`,
    },
    {
      name: '_SETTINGS_EXPORT_KEYS: 删 rpgXpUserOnly',
      before: `    'rpgEquipmentUserOnly', 'rpgXpUserOnly', 'rpgCurrencyUserOnly', 'rpgUserOnly',\n`,
      after: `    'rpgEquipmentUserOnly', 'rpgCurrencyUserOnly', 'rpgUserOnly',\n`,
    },
    {
      name: 'sub 数组（4920/5454）: 去 levels / xp',
      before: `['bars', 'status', 'skills', 'attributes', 'reputation', 'levels', 'xp', 'currency']`,
      after: `['bars', 'status', 'skills', 'attributes', 'reputation', 'currency']`,
    },
    {
      name: 'RPG_BUCKETS（13481）: 去 levels / xp',
      before: `['bars', 'status', 'skills', 'attributes', 'reputation', 'equipment', 'levels', 'xp', 'currency']`,
      after: `['bars', 'status', 'skills', 'attributes', 'reputation', 'equipment', 'currency']`,
    },
    {
      name: 'sub 数组（20267）: 去 levels / xp',
      before: `['bars', 'status', 'skills', 'attributes', 'reputation', 'levels', 'xp', 'currency', 'equipment']`,
      after: `['bars', 'status', 'skills', 'attributes', 'reputation', 'currency', 'equipment']`,
    },
    {
      name: '_syncRpgTabVisibility: 删 sendLvl',
      before: `    const sendLvl = settings.rpgMode && !!settings.sendRpgLevel;\n`,
      after: ``,
      appliedAnchor: `    const sendCur = settings.rpgMode && !!settings.sendRpgCurrency;\n`,
    },
    {
      name: '_syncRpgTabVisibility: hasContent 去 sendLvl',
      before: `    const hasContent = sendBars || sendAttrs || sendSkills || sendRep || sendEq || sendLvl || sendCur || sendSh;\n`,
      after: `    const hasContent = sendBars || sendAttrs || sendSkills || sendRep || sendEq || sendCur || sendSh;\n`,
    },
    {
      name: '_syncRpgTabVisibility: 删 level-area toggle',
      before: `    $('#horae-rpg-level-area').toggle(sendLvl);\n`,
      after: ``,
      appliedAnchor: `    $('#horae-rpg-currency-area').toggle(sendCur);\n`,
    },
    {
      name: 'updateRpgDisplay: 删 sendLvl 声明',
      before: `    const sendLvl = !!settings.sendRpgLevel;\n`,
      after: ``,
      appliedAnchor: `    const sendCur = !!settings.sendRpgCurrency;\n`,
    },
    {
      name: 'updateRpgDisplay: moduleCount 去 sendLvl',
      before: `    const moduleCount = [sendBars, hasAttrModule, sendSkills, sendEq, sendRep, sendLvl, sendCur, sendSh].filter(Boolean).length;\n`,
      after: `    const moduleCount = [sendBars, hasAttrModule, sendSkills, sendEq, sendRep, sendCur, sendSh].filter(Boolean).length;\n`,
    },
    {
      name: 'updateRpgDisplay: 删 renderLevelValues 调用',
      before: `    if (sendLvl) renderLevelValues();\n`,
      after: ``,
      appliedAnchor: `    if (sendSh) { renderStrongholdTree(); _bindStrongholdEvents(); }\n`,
    },
    {
      name: 'updateRpgDisplay allNames: 删 rpg.levels / rpg.xp',
      before: `        ...Object.keys(rpg.equipment || {}),\n        ...Object.keys(rpg.levels || {}),\n        ...Object.keys(rpg.xp || {}),\n        ...Object.keys(rpg.currency || {}),\n`,
      after: `        ...Object.keys(rpg.equipment || {}),\n        ...Object.keys(rpg.currency || {}),\n`,
    },
    {
      name: 'char card: 删 charLv / charXp（7778-7779）',
      before: `        const charLv = rpg.levels?.[name];\n        const charXp = rpg.xp?.[name];\n`,
      after: ``,
      appliedAnchor: `        const charCur = rpg.currency?.[name] || {};\n`,
    },
    {
      name: 'char card 折叠卡: 删 charLv（7969）',
      before: `            const charLv = rpg.levels?.[name];\n`,
      after: ``,
    },
    {
      name: 'char card: 删 Lv. badge（7980）',
      before: `                if (sendLvl && charLv != null && (!settings.rpgLevelUserOnly || _isUser)) barsHtml += \`<span class="horae-rpg-lv-badge">Lv.\${charLv}</span>\`;\n`,
      after: ``,
    },
    {
      name: 'char card: 删 XP 条（7995-7999）',
      before: `                // XP 条\n                const charXpTop = rpg.xp?.[name];\n                if (sendLvl && (!settings.rpgLevelUserOnly || _isUser) && charXpTop && charXpTop[1] > 0) {\n                    const xpPct = Math.min(100, Math.round(charXpTop[0] / charXpTop[1] * 100));\n                    barsHtml += \`<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">XP</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:\${xpPct}%;background:#a78bfa;"></div></div><span class="horae-rpg-bar-val">\${charXpTop[0]}/\${charXpTop[1]}</span></div>\`;\n                }\n`,
      after: ``,
    },
    {
      name: 'char card 折叠卡: 删 Lv. badge（8021）',
      before: `                if (sendLvl && (!settings.rpgLevelUserOnly || _isUser) && rpg.levels?.[name] != null) barsHtml += \`<span class="horae-rpg-lv-badge">Lv.\${rpg.levels[name]}</span>\`;\n`,
      after: ``,
    },
    {
      name: '删除 renderLevelValues 整个函数',
      startMarker: `/** 渲染等级/经验值数据（配置面板） */\nfunction renderLevelValues() {`,
      endMarker: `\n\n/** 写入本楼 _rpgChanges 并刷新；不会改基线或其他楼的数据 */`,
      replaceWith: `\n/** 写入本楼 _rpgChanges 并刷新；不会改基线或其他楼的数据 */`,
    },
    {
      name: 'commitRpgEdit: 删 case level / xp',
      before: `        case 'level': {\n            if (!ch.levels) ch.levels = {};\n            ch.levels[charName] = payload.value;\n            break;\n        }\n        case 'xp': {\n            if (!ch.xp) ch.xp = {};\n            ch.xp[charName] = [payload.cur, payload.max];\n            break;\n        }\n`,
      after: ``,
      appliedAnchor: `        default: return false;\n`,
    },
    {
      name: 'HUD 编辑绑定: 删 kind level / xp-cur / xp-max',
      before: `        } else if (kind === 'level') {\n            commitRpgEdit(mesId, char, 'level', { value: num });\n        } else if (kind === 'xp-cur' || kind === 'xp-max') {\n            const xp = snap?.xp?.[char] || [0, 100];\n            const cur = kind === 'xp-cur' ? num : (xp[0] || 0);\n            const max = Math.max(1, kind === 'xp-max' ? num : (xp[1] || 100));\n            commitRpgEdit(mesId, char, 'xp', { cur: Math.max(0, Math.min(cur, max)), max });\n        }\n`,
      after: `        }\n`,
    },
    {
      name: '_buildCharHudHtml: 删 charLv / charXp',
      before: `    const charLv = rpg.levels?.[name];\n    const charXp = rpg.xp?.[name];\n`,
      after: ``,
      appliedAnchor: `    const charCur = rpg.currency?.[name] || {};\n`,
    },
    {
      name: '_buildCharHudHtml: 删 sendLvl 声明',
      before: `    const sendLvl = !!settings.sendRpgLevel;\n`,
      after: ``,
      appliedAnchor: `    const sendCur = !!settings.sendRpgCurrency;\n`,
    },
    {
      name: '_buildCharHudHtml: 删 Lv. badge + 编辑 input',
      before: `    if (sendLvl && charLv != null) {\n        html += \`<span class="horae-rpg-hud-lv-badge">\`\n            + \`<span class="horae-rpg-hud-lv-display">Lv.\${charLv}</span>\`\n            + \`<input class="horae-rpg-hud-edit-input horae-rpg-hud-lv-input" type="number" inputmode="numeric" min="0" data-edit-kind="level" value="\${charLv}">\`\n            + \`</span>\`;\n    }\n`,
      after: ``,
    },
    {
      name: '_buildCharHudHtml: 删 XP 条',
      before: `    if (sendLvl && charXp && charXp[1] > 0) {\n        const pct = Math.min(100, Math.round(charXp[0] / charXp[1] * 100));\n        html += \`<div class="horae-rpg-hud-bar horae-rpg-hud-xp">\`\n            + \`<span class="horae-rpg-hud-lbl">XP</span>\`\n            + \`<div class="horae-rpg-hud-track"><div class="horae-rpg-hud-fill" style="width:\${pct}%;background:#a78bfa;"></div></div>\`\n            + _renderEditableVal(charXp[0], charXp[1], 'xp-cur', 'xp-max', '')\n            + \`</div>\`;\n    }\n\n`,
      after: ``,
    },
    {
      name: '_matchPresentChars: 删 levels / xp keys',
      before: `        ...Object.keys(rpg.levels || {}), ...Object.keys(rpg.xp || {}),\n`,
      after: ``,
    },
    {
      name: '_buildRpgSnapshotMap: 删 levels / xp 初始化',
      before: `        levels: { ...(baseRpg.levels || {}) },\n        xp: { ...(baseRpg.xp || {}) },\n`,
      after: ``,
    },
    {
      name: '_buildRpgSnapshotMap: 删 changes.levels / changes.xp',
      before: `            for (const [raw, val] of Object.entries(changes.levels || {})) {\n                acc.levels[resolve(raw)] = val;\n            }\n            for (const [raw, val] of Object.entries(changes.xp || {})) {\n                acc.xp[resolve(raw)] = val;\n            }\n`,
      after: ``,
    },
    {
      name: '_buildRpgLinePatchForEdit: 删 case level / xp',
      before: `        case 'level':\n            return { type: 'level', owner: charName, newLine: \`level:\${charName}=\${payload.value}\` };\n        case 'xp':\n            return { type: 'xp', owner: charName, newLine: \`xp:\${charName}=\${payload.cur}/\${payload.max}\` };\n`,
      after: ``,
      appliedAnchor: `        default:\n            return null;\n`,
    },
    {
      name: '_rpgUoKeys / _rpgUoIds: 删 level',
      before: `    const _rpgUoKeys = ['rpgBarsUserOnly', 'rpgSkillsUserOnly', 'rpgAttrsUserOnly', 'rpgReputationUserOnly', 'rpgEquipmentUserOnly', 'rpgLevelUserOnly', 'rpgCurrencyUserOnly'];\n    const _rpgUoIds = ['bars', 'skills', 'attrs', 'reputation', 'equipment', 'level', 'currency'];\n`,
      after: `    const _rpgUoKeys = ['rpgBarsUserOnly', 'rpgSkillsUserOnly', 'rpgAttrsUserOnly', 'rpgReputationUserOnly', 'rpgEquipmentUserOnly', 'rpgCurrencyUserOnly'];\n    const _rpgUoIds = ['bars', 'skills', 'attrs', 'reputation', 'equipment', 'currency'];\n`,
    },
    {
      name: '_rpgModulePairs: 删 level 行',
      before: `        { checkId: 'horae-setting-rpg-level', settingKey: 'sendRpgLevel', uoId: 'horae-setting-rpg-level-uo' },\n`,
      after: ``,
      appliedAnchor: `        { checkId: 'horae-setting-rpg-currency', settingKey: 'sendRpgCurrency', uoId: 'horae-setting-rpg-currency-uo' },\n`,
    },
    {
      name: '设置同步: 删 3 行 level 控件',
      before: `    $('#horae-setting-rpg-level').prop('checked', !!settings.sendRpgLevel);\n    $('#horae-setting-rpg-level-uo').prop('checked', !!settings.rpgLevelUserOnly);\n    $('#horae-setting-rpg-level-uo').closest('label').toggle(!!settings.sendRpgLevel);\n`,
      after: ``,
      appliedAnchor: `    $('#horae-setting-rpg-currency').prop('checked', !!settings.sendRpgCurrency);\n`,
    },
  ],

  'core/horaeManager.js': [
    {
      name: 'present 收集: 删 _cUoX',
      before: `            const _cUoX = !!this.settings?.rpgXpUserOnly;\n`,
      after: ``,
    },
    {
      name: 'present 收集: 删 rpg.xp keys',
      before: `                ...Object.keys(rpg.xp || {}),\n`,
      after: ``,
      appliedAnchor: `                ...Object.keys(rpg.currency || {}),\n`,
    },
    {
      name: 'present 收集: 删整个 XP 段',
      before: `            // XP（独立系统）\n            const sendXp = !!this.settings?.sendRpgXp;\n            if (sendXp && Object.keys(rpg.xp || {}).length > 0) {\n                let hasXpData = false;\n                for (const [name, xp] of Object.entries(rpg.xp)) {\n                    if (_cUoX && name !== userName) continue;\n                    if (filterRpg && !rpgAllowed.has(name)) continue;\n                    if (!Array.isArray(xp) || xp.length < 2) continue;\n                    if (!hasXpData) { lines.push(\`\\n[\${L('经验','XP','経験','경험','опыт')}]\`); hasXpData = true; }\n                    lines.push(\`\${_ctxPre(name, _cUoX)}\${xp[0]}/\${xp[1]}\`);\n                }\n            }\n\n`,
      after: ``,
    },
    {
      name: 'result.rpg 初始化: 删 xp: {}',
      before: `            result.rpg = { bars: {}, status: {}, skills: [], removedSkills: [], attributes: {}, reputation: {}, equipment: [], unequip: [], xp: {}, currency: [], baseChanges: [], arts: [], shenTong: [], realm: null, cultivation: null, age: null, lifespan: null };\n`,
      after: `            result.rpg = { bars: {}, status: {}, skills: [], removedSkills: [], attributes: {}, reputation: {}, equipment: [], unequip: [], currency: [], baseChanges: [], arts: [], shenTong: [], realm: null, cultivation: null, age: null, lifespan: null };\n`,
    },
    {
      name: 'hasContent: 删 r.xp 子句',
      before: `                || (r.unequip || []).length > 0\n                || Object.keys(r.xp || {}).length > 0\n                || (r.currency || []).length > 0\n`,
      after: `                || (r.unequip || []).length > 0\n                || (r.currency || []).length > 0\n`,
    },
    {
      name: 'Parser: 删 xp 分支',
      before: `        // level\n        // xp\n        if (line.startsWith('xp:')) {\n            const str = line.substring(3).trim();\n            if (_uoX) {\n                const m = str.match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);\n                if (m) {\n                    if (!rpg.xp) rpg.xp = {};\n                    rpg.xp[_uoName] = [parseInt(m[1]), parseInt(m[2])];\n                }\n            } else {\n                const eq = str.indexOf('=');\n                if (eq > 0) {\n                    const owner = str.substring(0, eq).trim();\n                    const valStr = str.substring(eq + 1).trim();\n                    const m = valStr.match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);\n                    if (m) {\n                        if (!rpg.xp) rpg.xp = {};\n                        rpg.xp[owner] = [parseInt(m[1]), parseInt(m[2])];\n                    }\n                }\n            }\n            return;\n        }\n        // currency\n`,
      after: `        // currency\n`,
    },
    {
      name: 'getRpgData fallback: 删 xp: {}',
      before: `            equipment: {}, equipmentConfig: { locked: false, perChar: {} },\n            xp: {},\n            currency: {}, currencyConfig: { denominations: [] },\n`,
      after: `            equipment: {}, equipmentConfig: { locked: false, perChar: {} },\n            currency: {}, currencyConfig: { denominations: [] },\n`,
    },
    {
      name: 'getDefaultRpgPrompt: 删 sendXp 声明',
      before: `        const sendXp = !!this.settings?.sendRpgXp;\n        const sendCur = !!this.settings?.sendRpgCurrency;\n`,
      after: `        const sendCur = !!this.settings?.sendRpgCurrency;\n`,
    },
    {
      name: 'getDefaultRpgPrompt: 门控去 sendXp',
      before: `        if (!sendBars && !sendSkills && !sendAttrs && !sendEq && !sendRep && !sendXp && !sendCur && !sendSh) return '';\n`,
      after: `        if (!sendBars && !sendSkills && !sendAttrs && !sendEq && !sendRep && !sendCur && !sendSh) return '';\n`,
    },
    {
      name: 'getDefaultRpgPrompt: 删 uoXp',
      before: `        const uoXp = !!this.settings?.rpgXpUserOnly;\n`,
      after: ``,
      appliedAnchor: `        const uoCur = !!this.settings?.rpgCurrencyUserOnly;\n`,
    },
    {
      name: 'getDefaultRpgPrompt: anyUo / allUo 去 uoXp',
      before: `        const anyUo = uoBars || uoSkills || uoAttrs || uoEq || uoRep || uoXp || uoCur;\n        const allUo = uoBars && uoSkills && uoAttrs && uoEq && uoRep && uoXp && uoCur;\n`,
      after: `        const anyUo = uoBars || uoSkills || uoAttrs || uoEq || uoRep || uoCur;\n        const allUo = uoBars && uoSkills && uoAttrs && uoEq && uoRep && uoCur;\n`,
    },
    {
      name: 'getDefaultRpgPrompt: 删整个 if (sendXp) 块',
      before: `        if (sendXp) {\n            p += L(\n                \`\\n【经验值——仅变化时写】\\n\`,\n                \`\\n[XP — write only on change]\\n\`,\n                \`\\n【経験値——変化時のみ記載】\\n\`,\n                \`\\n【경험치——변화 시에만 기재】\\n\`,\n                \`\\n[Опыт — только при изменении]\\n\`\n            );\n            if (uoXp) {\n                p += L(\n                    \`  xp:当前经验/升级所需\\n\`,\n                    \`  xp:current XP/needed for next\\n\`,\n                    \`  xp:現在の経験値/次に必要な値\\n\`,\n                    \`  xp:현재 경험치/다음에 필요한 값\\n\`,\n                    \`  xp:текущий опыт/требуется для следующего\\n\`\n                );\n            } else {\n                p += L(\n                    \`  xp:归属=当前经验/升级所需\\n\`,\n                    \`  xp:\${own}=current XP/needed for next\\n\`,\n                    \`  xp:\${own}=現在の経験値/次に必要な値\\n\`,\n                    \`  xp:\${own}=현재 경험치/다음에 필요한 값\\n\`,\n                    \`  xp:\${own}=текущий опыт/требуется для следующего\\n\`\n                );\n            }\n            p += L(\`  经验获取参考：\\n\`, \`  XP gain reference:\\n\`, \`  経験値獲得の参考：\\n\`, \`  경험치 획득 참고:\\n\`, \`  Справка по получению опыта:\\n\`);\n            p += L(\n                \`  - 与角色修为相近或更强的挑战：获得较多经验(10~50+)\\n  - 修为差过大的低级挑战：仅得 1 点经验\\n  - 日常活动/对话/探索：少量经验(1~5)\\n\`,\n                \`  - Challenge near or above character cultivation: more XP (10~50+)\\n  - Trivial challenge far below: only 1 XP\\n  - Daily activities/dialogue/exploration: small XP (1~5)\\n\`,\n                \`  - キャラクターの修為に近いまたはそれ以上の挑戦：多くの経験値(10~50+)\\n  - 修為差が大きい簡単な挑戦：1経験値のみ\\n  - 日常活動/会話/探索：少量の経験値(1~5)\\n\`,\n                \`  - 캐릭터 수위에 가깝거나 더 강한 도전: 많은 경험치(10~50+)\\n  - 수위 차이가 큰 사소한 도전: 1 경험치만\\n  - 일상 활동/대화/탐험: 소량의 경험치(1~5)\\n\`,\n                \`  - Испытание близкое к культивации персонажа или выше: больше опыта (10~50+)\\n  - Тривиальное испытание с большой разницей: только 1 очко опыта\\n  - Повседневные действия/диалог/исследование: немного опыта (1~5)\\n\`\n            );\n        }\n`,
      after: ``,
      appliedAnchor: `        if (sendCur) {\n            const curConfig = this._getRpgCurrencyConfig();\n`,
    },
    {
      name: 'section headings ja: 删 level',
      before: `                reputation: '【評判】評判が変化した時のみ記載、変化なしなら省略可',\n                level: '【レベルと経験値】レベルアップ/ダウンまたは経験値変化時のみ記載、変化なしなら省略可',\n                currency: '【通貨——取引/拾得/消費が発生した時は必ず記載！】',\n`,
      after: `                reputation: '【評判】評判が変化した時のみ記載、変化なしなら省略可',\n                currency: '【通貨——取引/拾得/消費が発生した時は必ず記載！】',\n`,
    },
    {
      name: 'section headings ko: 删 level',
      before: `                reputation: '【평판】평판 변화 시에만 기재, 변화 없으면 생략 가능',\n                level: '【레벨과 경험치】레벨 업/다운 또는 경험치 변화 시에만 기재, 변화 없으면 생략 가능',\n                currency: '【화폐 — 거래/획득/소비 발생 시 필수 기재!】',\n`,
      after: `                reputation: '【평판】평판 변화 시에만 기재, 변화 없으면 생략 가능',\n                currency: '【화폐 — 거래/획득/소비 발생 시 필수 기재!】',\n`,
    },
    {
      name: 'section headings ru: 删 level',
      before: `                reputation: '[Репутация] Записывайте только при изменении репутации; пропускайте, если без изменений',\n                level: '[Уровень и опыт] Записывайте только при повышении/понижении уровня или изменении опыта; пропускайте, если без изменений',\n                currency: '[Валюта — ОБЯЗАТЕЛЬНО записывать при любой сделке/подборе/трате!]',\n`,
      after: `                reputation: '[Репутация] Записывайте только при изменении репутации; пропускайте, если без изменений',\n                currency: '[Валюта — ОБЯЗАТЕЛЬНО записывать при любой сделке/подборе/трате!]',\n`,
    },
    {
      name: 'section headings en: 删 level',
      before: `                reputation: '[Reputation] Write only when reputation changes; skip if unchanged',\n                level: '[XP] Write only on XP change; skip if unchanged',\n                currency: '[Currency — MUST write on any trade/pickup/spending!]',\n`,
      after: `                reputation: '[Reputation] Write only when reputation changes; skip if unchanged',\n                currency: '[Currency — MUST write on any trade/pickup/spending!]',\n`,
    },
    {
      name: 'section headings zh: 删 level',
      before: `            reputation: '【声望】仅声望变化时写，无变化可省略',\n            level: '【经验值】仅经验变化时写，无变化可省略',\n            currency: '【货币——发生交易/拾取/消费时必写！】',\n`,
      after: `            reputation: '【声望】仅声望变化时写，无变化可省略',\n            currency: '【货币——发生交易/拾取/消费时必写！】',\n`,
    },
    {
      name: '_extractRpgPromptSections empty: 删 level',
      before: `            reputation: '',\n            level: '',\n            currency: '',\n`,
      after: `            reputation: '',\n            currency: '',\n`,
    },
    {
      name: '_extractRpgPromptSections keys: 删 level',
      before: `        const keys = ['bars', 'attrs', 'skills', 'equipment', 'reputation', 'level', 'currency', 'stronghold'];\n`,
      after: `        const keys = ['bars', 'attrs', 'skills', 'equipment', 'reputation', 'currency', 'stronghold'];\n`,
    },
    {
      name: '_renderRpgPromptSectionTemplate: 删 level 映射',
      before: `            reputation: sections.reputation || '',\n            level: sections.level || '',\n            currency: sections.currency || '',\n`,
      after: `            reputation: sections.reputation || '',\n            currency: sections.currency || '',\n`,
    },
    {
      name: '_renderRpgPromptSectionTemplate: 正则去 level',
      before: `        return template.replace(/\\[\\[\\s*rpg\\.(full|header|bars|attrs|skills|equipment|reputation|level|currency|stronghold)\\s*\\]\\]/gi, (_, key) => {\n`,
      after: `        return template.replace(/\\[\\[\\s*rpg\\.(full|header|bars|attrs|skills|equipment|reputation|currency|stronghold)\\s*\\]\\]/gi, (_, key) => {\n`,
    },
    {
      name: '_generateMustTagsReminder: 删 sendRpgLevel 子句',
      before: `             !!this.settings.sendRpgEquipment || !!this.settings.sendRpgLevel || !!this.settings.sendRpgCurrency ||\n`,
      after: `             !!this.settings.sendRpgEquipment || !!this.settings.sendRpgCurrency ||\n`,
    },
  ],

  'core/memory/stateStore.js': [
    {
      name: 'EMPTY_SNAPSHOT: 删 xp: {}',
      before: `    reputation: {}, equipment: {}, xp: {},\n`,
      after: `    reputation: {}, equipment: {},\n`,
    },
    {
      name: 'replay: 删 userXp',
      before: `        const userXp = rpgMeta.xp || {};\n`,
      after: ``,
      appliedAnchor: `        const userCurrency = rpgMeta.currency || {};\n`,
    },
    {
      name: 'replay: 删 changes.xp 处理',
      before: `            for (const [raw, val] of Object.entries(changes.xp || {})) {\n                snapshot.xp[_resolve(raw)] = val;\n            }\n`,
      after: ``,
    },
    {
      name: 'replay 回填: 删 userXp 回填',
      before: `        for (const [owner, val] of Object.entries(userXp)) {\n            if (snapshot.xp[owner] === undefined) snapshot.xp[owner] = val;\n        }\n`,
      after: ``,
    },
    {
      name: 'applyChanges: 删 XP 块',
      before: `        // 经验值（XP 独立系统）\n        for (const [raw, val] of Object.entries(changes.xp || {})) {\n            const owner = manager._resolveRpgOwner(raw);\n            if (manager.settings?.rpgXpUserOnly && owner !== _mUN) continue;\n            if (!rpg.xp) rpg.xp = {};\n            rpg.xp[owner] = val;\n        }\n`,
      after: ``,
    },
    {
      name: 'rebuild: 删 oldXp',
      before: `        const oldXp = rpg.xp ? JSON.parse(JSON.stringify(rpg.xp)) : {};\n`,
      after: ``,
      appliedAnchor: `        const oldCurrency = rpg.currency ? JSON.parse(JSON.stringify(rpg.currency)) : {};\n`,
    },
    {
      name: 'rebuild: 删 rpg.xp = {}',
      before: `        rpg.xp = {};\n`,
      after: ``,
      appliedAnchor: `        rpg.currency = {};\n        rpg.spirit = null;\n`,
    },
    {
      name: 'rebuild: 删 oldXp 回填',
      before: `        for (const [owner, val] of Object.entries(oldXp)) {\n            if (rpg.xp[owner] === undefined) rpg.xp[owner] = val;\n        }\n`,
      after: ``,
    },
  ],

  'core/vectorManager.js': [
    {
      name: 'buildVectorDocument: 删 rpg.levels 分支',
      before: `            if (rpg.levels && Object.keys(rpg.levels).length > 0) {\n                for (const [owner, lv] of Object.entries(rpg.levels)) {\n                    rpgLines.push(\`\${owner} 等级\${lv}\`);\n                }\n            }\n            for (const eq of (rpg.equipment || [])) {\n`,
      after: `            for (const eq of (rpg.equipment || [])) {\n`,
    },
  ],

  'assets/templates/drawer.html': [
    {
      name: '删 level area 块（408-413）',
      before: `                <!-- 等级系统 -->\n                <div class="horae-rpg-level-area" id="horae-rpg-level-area" style="display:none;">\n                    <div class="horae-rpg-section-head">\n                        <span data-i18n="rpg.levelXp">等级 / 经验值</span>\n                    </div>\n                    <div id="horae-rpg-level-values-section"></div>\n                </div>\n`,
      after: ``,
    },
    {
      name: '删 level 设置控件（1011-1018）',
      before: `                            <label data-i18n="settings.rpgLevel" style="display:block;margin-bottom:4px;">\n                                <input type="checkbox" id="horae-setting-rpg-level">\n                                等级 / 经验值\n                            </label>\n                            <label class="horae-rpg-sub-toggle" data-i18n="rpg.userOnlySub" style="display:none;margin-bottom:4px;margin-left:22px;font-size:0.9em;">\n                                <input type="checkbox" id="horae-setting-rpg-level-uo">\n                                ↳ 仅限主角\n                            </label>\n`,
      after: ``,
    },
  ],
};

const LOCALE_FILES = [
  'locales/zh-CN.json', 'locales/zh-TW.json', 'locales/en.json',
  'locales/ja.json', 'locales/ko.json', 'locales/ru.json',
];

const LOCALE_KEYS_TO_DELETE = [
  'levelXp', 'rpgLevel', 'levelSet', 'levelPrompt', 'invalidLevelNumber',
  'editLevelXp', 'addLevelChar', 'addLevelCharTitle', 'noLevelData',
  'sendRpgLevel', 'rpgLevelUserOnly',
];

function patchLocale(filepath) {
  if (!fs.existsSync(filepath)) return { ok: false };
  const { content: original, isCRLF } = readNormalized(filepath);
  const lines = original.split('\n');
  const out = [];
  let deleted = 0;
  const deletedKeys = new Set();
  for (const line of lines) {
    let matched = false;
    for (const k of LOCALE_KEYS_TO_DELETE) {
      const re = new RegExp(`^\\s*"${k}"\\s*:`);
      if (re.test(line)) {
        matched = true;
        deleted++;
        deletedKeys.add(k);
        break;
      }
    }
    if (!matched) out.push(line);
  }
  const newContent = out.join('\n');
  const changed = newContent !== original;
  console.log(`\n[${filepath}]`);
  console.log(`  删除 ${deleted} 行（keys: ${[...deletedKeys].sort().join(', ') || '无'}）`);
  if (DRY_RUN || !changed) return { ok: true, changed };
  backup(filepath);
  writeNormalized(filepath, newContent, isCRLF);
  console.log(`  [applied] 已写入`);
  return { ok: true, changed };
}

function validateSyntax(filepath) {
  const ext = path.extname(filepath);
  if (ext !== '.js' && ext !== '.mjs') return { ok: true, skipped: true };
  const r = spawnSync(process.execPath, ['--check', filepath], { encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, stderr: r.stderr };
  return { ok: true };
}

function validateJson(filepath) {
  try {
    JSON.parse(fs.readFileSync(filepath, 'utf8'));
    return { ok: true };
  } catch (e) {
    return { ok: false, stderr: e.message };
  }
}

function main() {
  console.log(`=== S1.1c 移除通用 RPG Level / XP ===`);
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN' : (APPLY ? 'APPLY' : 'ROLLBACK')}`);
  console.log(`根目录: ${ROOT}\n`);

  if (ROLLBACK) {
    console.log('=== 回滚 ===');
    const allFiles = [...Object.keys(PATCHES), ...LOCALE_FILES];
    let restored = 0;
    for (const f of allFiles) {
      const p = path.join(ROOT, f);
      if (restore(p)) {
        console.log(`  OK ${f}`);
        restored++;
      } else {
        console.log(`  .. ${f}（无备份）`);
      }
    }
    console.log(`\n回滚完成：${restored} 个文件已恢复。`);
    return;
  }

  let hasAnyError = false;
  let totalChanged = 0;
  for (const [relpath, entries] of Object.entries(PATCHES)) {
    const filepath = path.join(ROOT, relpath);
    const r = applyFile(filepath, entries);
    if (!r.ok) hasAnyError = true;
    if (r.changed) totalChanged++;
  }
  for (const relpath of LOCALE_FILES) {
    const filepath = path.join(ROOT, relpath);
    const r = patchLocale(filepath);
    if (!r.ok) hasAnyError = true;
    if (r.changed) totalChanged++;
  }

  console.log(`\n=== 汇总 ===`);
  console.log(`变更文件数: ${totalChanged}`);
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN（未写入）' : 'APPLY（已写入）'}`);

  if (hasAnyError) {
    console.log(`\n!! 有补丁未找到（可能已部分应用或代码已变更）。`);
    process.exit(1);
  }

  if (APPLY) {
    console.log(`\n=== 语法校验 ===`);
    const jsFiles = ['index.js', 'core/horaeManager.js', 'core/memory/stateStore.js', 'core/vectorManager.js'];
    let allOk = true;
    for (const f of jsFiles) {
      const p = path.join(ROOT, f);
      const r = validateSyntax(p);
      if (r.ok) console.log(`  OK ${f}`);
      else { console.log(`  XX ${f}: ${r.stderr}`); allOk = false; }
    }
    for (const f of LOCALE_FILES) {
      const p = path.join(ROOT, f);
      const r = validateJson(p);
      if (r.ok) console.log(`  OK ${f}`);
      else { console.log(`  XX ${f}: ${r.stderr}`); allOk = false; }
    }
    if (!allOk) {
      console.log(`\n!! 语法校验失败。可执行 --rollback 回滚。`);
      process.exit(2);
    }
    console.log(`\nALL OK`);
  } else {
    console.log(`\n[dry-run] 未写入任何文件。加 --apply 应用。`);
  }
}

main();
