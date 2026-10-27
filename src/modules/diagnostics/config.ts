/**
 * 诊断日志的配置读取：数值全部在 game-numbers（三分包合并）的 diagnostics 段，代码里不写数字。
 * 内置兜底 = 模块加载时 GAME_NUMBERS.diagnostics 快照（权威源为 numbers 三分包）；
 * 热改（tuning.json 的 numbers.diagnostics）经 applyGameNumbers 合并后生效，这里登记的体检不过则整份退回。
 * 一律调用时再读，不要在模块顶层缓存数值，否则热改不生效。
 */
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';
import { DEBUG_CATEGORY_IDS, type DebugCategory } from './debugCategories';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

export interface DiagnosticsConfig {
  /** 锁死 true：错误码与持久日志始终开启（总策划 2026-10-26），体检拒绝 false；不删键以免旧配置报错。 */
  enabled: boolean;
  /** 低于此级别的事件整条丢弃；consoleLevel / persistLevel 分别决定是否打控制台、是否落盘。 */
  minLevel: LogLevel; consoleLevel: LogLevel; persistLevel: LogLevel;
  ringMax: number; maxBytes: number;
  detailChars: number; stackChars: number; maxDepth: number; maxKeys: number;
  flushMs: number;
  /** 同一 code+module+msg 在 repeatMs 内只记第一条（后面计数并在下一条带出），repeatKeys 限制去重表大小。 */
  repeatMs: number; repeatKeys: number;
  localFallbackMax: number;
  redactKeys: string[]; redactPatterns: string[]; textKeys: string[];
  /** textKeys 下的字符串最多记这么多字；0 = 不记玩家原文。 */
  textChars: number;
  toast: { enabled: boolean; minLevel: LogLevel; dedupeMs: number };
  panel: { recent: number };
  /** tuning.json 不存在（404）是常态，按这个级别记。 */
  tuning404Level: LogLevel;
  /** 调试日志大类开关（debugLog / debugEnabled）：只管控制台调试输出，logEvent / logError 不读这里。 */
  debug: { note?: string; categories: Record<DebugCategory, boolean> };
  /** 持久日志轮转：落盘时删掉早于 retentionDays 天的记录；超 ringMax / maxBytes 时一次删到 trimToRatio 倍以下；每次轮转记 LCQ-SYS-002。 */
  rotation: { note?: string; retentionDays: number; trimToRatio: number };
  /** 叙事来源日志（narrativeSource.ts）：夹英文检测的字母数下限、上下文字数与两张白名单（不分大小写）。 */
  narrativeSource: { note?: string; minLetters: number; contextChars: number; nameWhitelist: string[]; colloquialWhitelist: string[] };
}

export const BUILTIN_DIAGNOSTICS: DiagnosticsConfig = structuredClone(GAME_NUMBERS.diagnostics) as DiagnosticsConfig;
export const diagnosticsConfig = (): DiagnosticsConfig => (GAME_NUMBERS as { diagnostics?: DiagnosticsConfig }).diagnostics ?? BUILTIN_DIAGNOSTICS;

export const levelRank = (level: string): number => LOG_LEVELS.indexOf(level as LogLevel);
export const levelAtLeast = (level: string, floor: string): boolean => levelRank(level) >= levelRank(floor) && levelRank(level) >= 0;

/** 配置体检：返回错误列表（空 = 通过）。 */
export function validateDiagnosticsConfig(cfg: DiagnosticsConfig = diagnosticsConfig()): string[] {
  const errors: string[] = [], count = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
  if (!cfg || typeof cfg !== 'object') return ['diagnostics 段缺失'];
  if (cfg.enabled !== true) errors.push('diagnostics.enabled 须为 true（错误码与持久日志始终开启，不得关闭）');
  for (const key of ['minLevel', 'consoleLevel', 'persistLevel', 'tuning404Level'] as const) if (levelRank(cfg[key]) < 0) errors.push(`diagnostics.${key} 须为 ${LOG_LEVELS.join(' / ')} 之一`);
  for (const key of ['ringMax', 'maxBytes', 'detailChars', 'stackChars', 'maxDepth', 'maxKeys', 'flushMs', 'repeatMs', 'repeatKeys', 'localFallbackMax'] as const) if (!count(cfg[key])) errors.push(`diagnostics.${key} 须为正整数`);
  if (!(Number.isInteger(cfg.textChars) && cfg.textChars >= 0)) errors.push('diagnostics.textChars 须为非负整数');
  for (const key of ['redactKeys', 'redactPatterns', 'textKeys'] as const) if (!Array.isArray(cfg[key]) || cfg[key].some(item => typeof item !== 'string' || !item)) errors.push(`diagnostics.${key} 须为非空字符串数组`);
  for (const pattern of Array.isArray(cfg.redactPatterns) ? cfg.redactPatterns : []) {
    try { new RegExp(pattern); } catch { errors.push(`diagnostics.redactPatterns 含非法正则：${pattern}`); } // lcq-allow: 体检自身，非法正则已转成错误列表返回
  }
  if (typeof cfg.toast?.enabled !== 'boolean' || levelRank(cfg.toast?.minLevel) < 0 || !count(cfg.toast?.dedupeMs)) errors.push('diagnostics.toast 须有布尔 enabled、合法 minLevel、正整数 dedupeMs');
  if (!count(cfg.panel?.recent)) errors.push('diagnostics.panel.recent 须为正整数');
  errors.push(...validateDebugCategories(cfg.debug?.categories));
  const rotation = cfg.rotation;
  if (!(typeof rotation?.retentionDays === 'number' && rotation.retentionDays > 0 && Number.isFinite(rotation.retentionDays))) errors.push('diagnostics.rotation.retentionDays 须为正数（天）');
  if (!(typeof rotation?.trimToRatio === 'number' && rotation.trimToRatio > 0 && rotation.trimToRatio < 1)) errors.push('diagnostics.rotation.trimToRatio 须在 0 与 1 之间（不含两端）');
  const nar = cfg.narrativeSource;
  if (!count(nar?.minLetters) || !count(nar?.contextChars)) errors.push('diagnostics.narrativeSource.minLetters / contextChars 须为正整数');
  for (const key of ['nameWhitelist', 'colloquialWhitelist'] as const) if (!Array.isArray(nar?.[key]) || nar[key].some(item => typeof item !== 'string' || !item.trim())) errors.push(`diagnostics.narrativeSource.${key} 须为字符串数组（可为空，项不能是空串）`);
  return errors;
}

/** 大类开关体检：键集合必须等于 DEBUG_CATEGORY_IDS，值必须是布尔。 */
export function validateDebugCategories(categories: unknown): string[] {
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return ['diagnostics.debug.categories 须为对象'];
  const errors: string[] = [], keys = Object.keys(categories), known = new Set<string>(DEBUG_CATEGORY_IDS);
  const unknown = keys.filter(key => !known.has(key)), missing = DEBUG_CATEGORY_IDS.filter(id => !keys.includes(id));
  if (unknown.length) errors.push(`diagnostics.debug.categories 含未知大类：${unknown.join('、')}（新功能挂到已有大类，增类须用户拍板）`);
  if (missing.length) errors.push(`diagnostics.debug.categories 缺大类：${missing.join('、')}（新功能挂到已有大类，增类须用户拍板）`);
  const nonBool = keys.filter(key => typeof (categories as Record<string, unknown>)[key] !== 'boolean');
  if (nonBool.length) errors.push(`diagnostics.debug.categories 的值须为布尔：${nonBool.join('、')}`);
  return errors;
}

registerNumbersValidator(() => validateDiagnosticsConfig());
