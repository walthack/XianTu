import type { SaveData } from '@/types/game';
import { isScopedPlaytestSave, isScopedNaturalIntentSave } from './playtestNarrativeScope';
import { validateNarrativeBoundary } from './narrativeBoundaries';

export const MODULE_TURN_KEY = '回合模块试玩';
export const MODULE_TURN_SWITCH = 'xiantu.modularTurnPlaytest.v1';
export interface ModuleReceipt {
  id: string;
  /** 本回合正文来源：modular=模块演出；legacy=原链路；fast=快演出；local=本地合同正文（不请求模型）；card=重要桥段卡片结果句（不请求模型）。 */
  path: 'modular' | 'legacy' | 'fast' | 'local' | 'card';
  route?: import('@/services/moduleModelRuntime').ModuleModelRoute;
  eventId?: string;
  promptChars: number;
  foregroundMs: number;
  text: string;
  /** 本回合写入短期记忆的原始条目；记忆模块据此定位并替换为摘录。 */
  shortTermEntry?: string;
  /** 模块演出未被采用、回落旧链路时的原因与尝试次数。 */
  fallback?: { reason: string; attempts: number };
  memory?: ModuleSideResult;
  /** 旧版每回合质量检查的遗留字段；已并入后台审计，不再写入。 */
  quality?: ModuleSideResult;
}
export interface ModuleSideResult {
  status: 'pending' | 'accepted' | 'rejected' | 'failed' | 'disabled';
  route?: import('@/services/moduleModelRuntime').ModuleModelRoute;
  elapsedMs?: number;
  value?: string;
  error?: string;
  /** 记忆摘录已替换该回合短期记忆条目。 */
  appliedToShortTerm?: boolean;
}
/** 模块拆分开关：玩家选过就按选择；没选过时研发/内测构建默认开、正式版默认关（同审计 Q5 写法）。 */
export function readModuleTurnSwitch(): boolean {
  const value = globalThis.localStorage?.getItem(MODULE_TURN_SWITCH);
  const devDefault = typeof MODULE_DEV_DEFAULTS !== 'undefined' ? MODULE_DEV_DEFAULTS === true : false;
  return value === 'true' || (value !== 'false' && devDefault);
}
/** 用户裁定：两种落地demo的所有回合都只能走模块入口，不受旧开关/事件窗限制。 */
export function isDemoModuleOnly(save: SaveData | null | undefined): boolean {
  return isScopedPlaytestSave(save);
}
export function assertDemoModulePath(save: SaveData | null | undefined, path: ModuleReceipt['path']): void {
  if (isDemoModuleOnly(save) && path !== 'modular' && path !== 'local') {
    console.error('[DEMO_LEGACY_BLOCKED]', { path, modId: (save as any)?.世界?.状态?.剧本模组?.modId });
    throw new Error('DEMO_LEGACY_BLOCKED：试玩回合禁止进入 ' + path + ' 链路，请报告当前事件。');
  }
}
export function isModulePlaytestSelected(save: SaveData | null | undefined): boolean {
  if (isDemoModuleOnly(save)) return true;
  try {
    return isScopedPlaytestSave(save) && readModuleTurnSwitch();
  } catch { return false; }
}
export function isModularTurnEnabled(save: SaveData | null | undefined): boolean {
  return isDemoModuleOnly(save) || (isModulePlaytestSelected(save) && isScopedNaturalIntentSave(save));
}
export function visibleModuleText(raw: string): string {
  const text = String(raw).replace(/<((?:[a-z][\w.-]*:)?think)>[\s\S]*?<\/\1>/gi, '').replace(/<\/(?:[a-z][\w.-]*:)?think\s*>/gi, '').trim();
  if (/<\/?(?:[a-z][\w.-]*:)?think\b/i.test(text)) throw new Error('未闭合思考块');
  return text;
}
export function parseModuleObject(raw: string): Record<string, unknown> {
  return JSON.parse(visibleModuleText(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}
export function readModuleNarrative(raw: string): string {
  const visible = visibleModuleText(raw);
  const text = visible.startsWith('{') || visible.startsWith('```')
    ? String(parseModuleObject(visible).text || '') : visible;
  if (!text.trim() || text.length > 6000) throw new Error('正文为空或异常过长');
  if (text.split(/[，,、。；;：:！？!?…\n]/).some(part => part.trim().length > 120)) throw new Error('正文出现无标点长句，本稿不展示、不落档');
  return text.trim();
}
export function matchModuleExcerpt(text: string, quote: string): string | null {
  const ignored = /[\s“”‘’"'「」『』]/;
  const offsets: number[] = [];
  let normalized = '';
  for (let i = 0; i < text.length; i++) if (!ignored.test(text[i])) { normalized += text[i]; offsets.push(i); }
  const needle = [...quote].filter(char => !ignored.test(char)).join('');
  if (needle.length < 4) return null;
  const start = normalized.indexOf(needle);
  return start < 0 ? null : text.slice(offsets[start], offsets[start + needle.length - 1] + 1);
}
/** 未完成的多步合同不得被正文写成已成立；边界按事件声明在 narrativeBoundaries 数据表。 */
export function validateModuleSettlementNarrative(text: string, eventId: string, completed: boolean): void {
  validateNarrativeBoundary(text, eventId, completed);
}
/** 摘要先用摘录式证据：不接受模型增加关系、物品或世界事实。 */
export function moduleMemorySentences(text: string): Array<{ id: number; text: string }> {
  const paragraphs = text.split(/\n+/).map(value => value.trim()).filter(Boolean);
  const parts = paragraphs.length > 1 ? paragraphs : (text.match(/[^。！？\n]+[。！？]?[”’」』"]?/g) || []);
  return parts.map(text => text.trim()).filter(Boolean).map((text, id) => ({ id, text }));
}
export function validateModuleSide(raw: string, text: string, type: 'memory'): string {
  const object = parseModuleObject(raw);
  if (type === 'memory') {
    if (Array.isArray(object.sentenceIds)) {
      const sentences = moduleMemorySentences(text);
      const ids = object.sentenceIds;
      if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length
        || ids.some(id => !Number.isInteger(id) || typeof id !== 'number' || !sentences[id])) throw new Error('摘要句子ID无效');
      const excerpt = (ids as number[]).sort((a, b) => a - b).map(id => sentences[id].text).join('\n\n');
      if (excerpt.length > 1000) throw new Error('摘要摘录超过预算');
      return excerpt;
    }
    const evidence = object.evidence;
    if (!Array.isArray(evidence) || !evidence.length || evidence.length > 4) throw new Error('缺少摘录证据');
    const quotes = evidence.map(quote => typeof quote === 'string' ? quote.trim() : '');
    const excerpts = quotes.map(quote => quote.length <= 240 ? matchModuleExcerpt(text, quote) : null);
    if (excerpts.some(quote => quote === null)) throw new Error('证据非连续原文');
    return excerpts.join('\n\n');
  }
  throw new Error(`未知后台模块：${type}`);
}

const MEMORY_TIME_PREFIX_RE = /^【[^】]{1,40}】/;
/**
 * 把记忆摘录写回该回合的短期记忆条目（保留原时间前缀）。
 * 只替换与提交时记录完全相同的那一条；找不到（已被挤出或改写）就不写，返回 false。
 */
export function replaceShortTermEntry(shortTerm: unknown, originalEntry: string | undefined, excerpt: string): boolean {
  if (!Array.isArray(shortTerm) || !originalEntry || !excerpt.trim()) return false;
  const index = shortTerm.lastIndexOf(originalEntry);
  if (index < 0) return false;
  const prefix = originalEntry.match(MEMORY_TIME_PREFIX_RE)?.[0] || '';
  shortTerm[index] = `${prefix}${excerpt}`;
  return true;
}

/** 演出模型可读的最近记忆：直接取短期记忆（模块记忆已在其中替换为摘录），不再另记平行账。 */
export function recentModuleMemory(save: SaveData | null | undefined, count = 2): string[] {
  const shortTerm = (save as any)?.社交?.记忆?.短期记忆;
  return Array.isArray(shortTerm) ? shortTerm.filter((item: unknown) => typeof item === 'string').slice(-count) : [];
}
export function getModuleReceipts(save: SaveData | null | undefined): ModuleReceipt[] {
  const value = (save as any)?.系统?.扩展?.[MODULE_TURN_KEY]?.receipts;
  return Array.isArray(value) ? value : [];
}
export function appendModuleReceipt(save: SaveData, receipt: ModuleReceipt): void {
  assertDemoModulePath(save, receipt.path);
  const extensions = (save as any).系统.扩展 ||= {};
  const receipts = getModuleReceipts(save).filter(item => item.id !== receipt.id);
  extensions[MODULE_TURN_KEY] = { version: 1, receipts: [...receipts, receipt].slice(-20) };
}
export interface ModuleScope { characterId: string; slotId: string; epoch: number; history: string; }
export function matchesModuleScope(a: ModuleScope, b: ModuleScope): boolean {
  return a.characterId === b.characterId && a.slotId === b.slotId && a.epoch === b.epoch && a.history === b.history;
}

export type ModuleNarrativeAttempt<T> = { ok: true; value: T; attempts: number } | { ok: false; reason: string; attempts: number };

/**
 * 剧情演出的失败策略（模块卡 onFail=retry_then_legacy，用户裁定 Q3）：
 * 同一快照最多重试 1 次，再失败回落旧链路。演出请求不占旧链路长请求预算；
 * budgetLeft 为本回合旧链路剩余长请求数（null=不限），为 0 时回落放不下，把原错误抛回（保留输入）。
 * isFatal 的错误（取消、预算耗尽）直接抛出，不重试也不回落。
 */
export async function attemptModuleNarrative<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  options: { budgetLeft: () => number | null; isFatal: (error: unknown) => boolean },
): Promise<ModuleNarrativeAttempt<T>> {
  const canAfford = (count: number) => { const left = options.budgetLeft(); return left === null || left >= count; };
  let attempts = 0;
  let lastError: unknown = null;
  while (attempts < 2) {
    attempts += 1;
    try {
      return { ok: true, value: await attempt(attempts), attempts };
    } catch (error) {
      if (options.isFatal(error)) throw error;
      lastError = error;
    }
  }
  if (!canAfford(1)) throw lastError;
  return { ok: false, reason: String((lastError as Error)?.message || lastError || '未知原因').slice(0, 200), attempts };
}
