import type { TextReplaceRule } from '@/types/textRules';
import { stripModelThinking } from './jsonExtract';

const MAX_LINE_LENGTH = 500;
const MAX_REPLACE_RULES = 50;
const MAX_REPLACE_REPLACEMENT_LENGTH = 1500;

let cachedReplaceKey: string | null = null;
let cachedCompiledReplaceRules: Array<{ re: RegExp; replacement: string }> = [];

const INTERNAL_NARRATIVE_CONTROL_MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: 'R2-9叙事护栏', re: /\[R2-9叙事护栏·硬约束\]/ },
  { label: '世界留钩', re: /【世界留钩】|正文结尾必须留下\s*1\s*[-~～至]\s*2\s*个来自世界自身的新动静/ },
  { label: '高智行为约束', re: /【[^】\r\n]{1,40}·高智行为硬合同】/ },
  { label: '角色表演重写指令', re: /【表演门禁退回重写】/ },
  { label: '世界演员合同', re: /【世界演员合同·[^】\r\n]+】/ },
  { label: '世界回合指令', re: /【世界回合·本轮世界必须行动】/ },
  { label: '机会追踪指令', re: /【玩家已追踪机会·本轮最高优先级】/ },
  { label: '可选介入窗口', re: /【可选介入窗口】/ },
  { label: '角色表演卡', re: /【[^】\r\n]{1,40}·角色表演卡(?:（逐轮硬合同）|\(逐轮硬合同\))】/ },
  { label: '承重角色保护', re: /【承重角色保护】/ },
  { label: 'Canon Rail控制协议', re: /【Canon Rail·默认正典】|【高光演出硬合同】/ },
];

const WORLD_HOOK_DIRECTIVE_RE =
  /`?(?:【世界留钩】\s*)?正文结尾必须留下\s*1\s*[-~～至]\s*2\s*个来自世界自身的新动静\s*[（(]信息、异动、NPC议程、风险或机会窗口[）)]\s*[,，;；]?\s*(?:action_options\s*至少一个承接该钩\s*[,，;；]?\s*)?(?:不得把场面完全收干净后只等玩家续写)?[。.]?`?/gi;
const HIGH_INTELLIGENCE_CONTRACT_LABEL_RE = /【[^】\r\n]{1,40}·高智行为硬合同】/g;

type SanitizerSettings = {
  replaceRules: TextReplaceRule[];
};

function safeGetSanitizerSettings(): SanitizerSettings {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { replaceRules: [] };
    }
    const raw = localStorage.getItem('dad_game_settings');
    if (!raw) return { replaceRules: [] };
    const parsed = JSON.parse(raw);
    return {
      replaceRules: Array.isArray(parsed?.replaceRules) ? (parsed.replaceRules as TextReplaceRule[]) : [],
    };
  } catch {
    return { replaceRules: [] };
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildReplaceFlags(rule: TextReplaceRule): string {
  const globalFlag = rule.global === false ? '' : 'g';
  const i = rule.ignoreCase ? 'i' : '';
  const m = rule.mode === 'regex' && rule.multiline ? 'm' : '';
  const s = rule.mode === 'regex' && rule.dotAll ? 's' : '';
  return `${globalFlag}${i}${m}${s}`;
}

function escapeReplacementForText(replacement: string): string {
  return replacement.replace(/\$/g, '$$$$');
}

function compileReplaceRules(rules: TextReplaceRule[]): Array<{ re: RegExp; replacement: string }> {
  const compiled: Array<{ re: RegExp; replacement: string }> = [];
  for (const rule of rules) {
    if (compiled.length >= MAX_REPLACE_RULES) break;
    if (!rule || rule.enabled === false) continue;
    if (typeof rule.pattern !== 'string' || !rule.pattern.trim()) continue;

    const pattern = rule.pattern.length > MAX_LINE_LENGTH ? rule.pattern.slice(0, MAX_LINE_LENGTH) : rule.pattern;
    const replacementRaw = typeof rule.replacement === 'string' ? rule.replacement : '';
    const replacement =
      rule.mode === 'text'
        ? escapeReplacementForText(replacementRaw.slice(0, MAX_REPLACE_REPLACEMENT_LENGTH))
        : replacementRaw.slice(0, MAX_REPLACE_REPLACEMENT_LENGTH);

    try {
      if (rule.mode === 'text') {
        const flags = `${rule.global === false ? '' : 'g'}${rule.ignoreCase ? 'i' : ''}`;
        compiled.push({ re: new RegExp(escapeRegExp(pattern), flags), replacement });
      } else {
        const flags = buildReplaceFlags(rule);
        compiled.push({ re: new RegExp(pattern, flags), replacement });
      }
    } catch {
      // ignore invalid rule
    }
  }
  return compiled;
}

function getCompiledReplaceRules(): Array<{ re: RegExp; replacement: string }> {
  const settings = safeGetSanitizerSettings();
  const settingsKey = JSON.stringify(settings.replaceRules || []);
  if (settingsKey === cachedReplaceKey) return cachedCompiledReplaceRules;

  cachedReplaceKey = settingsKey;
  cachedCompiledReplaceRules = compileReplaceRules(settings.replaceRules || []);
  return cachedCompiledReplaceRules;
}

function sanitizeWithRules(
  text: string,
  replaceRules: Array<{ re: RegExp; replacement: string }>,
): string {
  if (!text) return '';

  let result = text;

  // Built-in: remove thinking/analysis blocks and leftover tags.
  // 支持多种变体：<thinking>, <Thinking>, <antThinking>, <ant-thinking> 等
  result = result
    .replace(/<(?:ant[-_]?)?thinking>[\s\S]*?<\/(?:ant[-_]?)?thinking>/gi, '')
    .replace(/<\/?(?:ant[-_]?)?thinking>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .replace(/<\/?analysis>/gi, '')
    // 移除可能的reasoning标签
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    // 移除可能的thought标签
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\/?thought>/gi, '');

  result = stripInternalNarrativeControlLeaks(result);

  for (const rule of replaceRules) {
    result = result.replace(rule.re, rule.replacement);
  }

  return result;
}

export function sanitizeAITextForDisplay(text: string): string {
  return sanitizeWithRules(text, getCompiledReplaceRules());
}

/** 识别模型是否把系统/剧本控制协议复述进玩家正文，用于生成阶段退回重写。 */
export function findInternalNarrativeControlLeaks(text: string): string[] {
  if (!text) return [];
  return INTERNAL_NARRATIVE_CONTROL_MARKERS
    .filter(({ re }) => re.test(text))
    .map(({ label }) => label);
}

/**
 * 最终展示与入库前的窄范围兜底。
 * 只清理由真机样本证实会泄漏的固定协议文本；正常【环境】标记与成对 NPC 心理反引号保留。
 */
export function stripInternalNarrativeControlLeaks(text: string): string {
  if (!text) return '';
  let result = text
    .replace(WORLD_HOOK_DIRECTIVE_RE, '')
    .replace(HIGH_INTELLIGENCE_CONTRACT_LABEL_RE, '')
    .replace(/【世界留钩】/g, '')
    .replace(/【可选介入窗口】/g, '')
    .replace(/【[^】\r\n]{1,40}·角色表演卡(?:（逐轮硬合同）|\(逐轮硬合同\))】/g, '')
    .replace(/\[R2-9叙事护栏·硬约束\]/g, '')
    .replace(/【表演门禁退回重写】/g, '');
  const changedByProtocolFilter = result !== text;

  // 模型偶尔把提示词里的 Markdown 定界符粘到正文末尾；只移除无法配对的末尾孤立反引号。
  const backtickCount = (result.match(/`/g) || []).length;
  if (backtickCount % 2 === 1) {
    result = result.replace(/`\s*$/, '');
  }
  const cleaned = result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return changedByProtocolFilter || cleaned !== result ? cleaned.trim() : cleaned;
}

/**
 * 从完整的 JSON 响应中提取 text 字段
 * 用于最终显示时调用，不用于流式过程中
 */
export function extractTextFromJsonResponse(text: string): string {
  if (!text) return '';

  const cleaned = stripModelThinking(text);

  // 查找 JSON 对象
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return '';
  }

  const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.text === 'string') {
      return parsed.text;
    }
  } catch {
    // 不将残缺 JSON 或模型分析当作玩家叙事回显。
  }

  return '';
}

/**
 * 从流式 JSON 中安全预览已输出的 text 字段。
 * 只有确认出现 text 键时才显示，避免把前置分析或半截 JSON 渲染给玩家。
 */
export function extractStreamingNarrativeText(text: string): string {
  const cleaned = stripModelThinking(text);
  if (!cleaned) return '';

  const textKey = /"(?:text|叙事文本|narrative)"\s*:\s*"/.exec(cleaned);
  if (!textKey || textKey.index === undefined) return '';

  const valueStart = textKey.index + textKey[0].length;
  let escaped = false;
  let value = '';
  for (let i = valueStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      value += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') break;
    value += ch;
  }

  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    // 流仍未结束时，保守地保留已形成的普通字符，而不显示原始 JSON。
    return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}
