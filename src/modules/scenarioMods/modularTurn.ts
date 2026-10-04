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
/** 内部合同/提示词只能用于编译材料，不能作为玩家正文。 */
export function validateModuleInstructionLeak(text: string): void {
  if (/<\/?行动趋向(?:\s|>)|本地事件判定|(?:lcq|lyl|lyg)\.event\.|advance_declared_objective|按本地合同|固定伤亡[、，,]|不替玩家加\s*buff|只演出该既定结果|不得另行判定|事件完成(?:标记|真值)|(?:事件|动作)\s*=|不对[，,]现在应该称呼|现在应该称呼另一位/.test(text)) {
    throw new ModuleNarrativeGuardError('正文泄露内部合同或指令，须改写为角色可见的场景');
  }
}

/** 兜底只取已结算的作者结果；绝不拼用户输入或按钮标题。 */
export function localModuleGuardNarrative(label: string | undefined, attempted: boolean, settledFact?: string): string {
  if (!attempted) return '你留在原地，眼下还没有采取新的行动。';
  // 只取作者已经批准的本步结果；UI标题和用户输入都不能充当剧情结果。
  const fact = String(settledFact || '').split(/[，,。！？；;]/)
    .map(clause => clause.trim()).filter(clause => clause && !/只写|不得|不描述|本拍不|不提前|主轴成形|事件完成|引擎|合同|预结算|尚未/.test(clause)).join('，').replace(/[，]+$/, '');
  try {
    validateModuleInstructionLeak(fact);
    if (fact && fact.length <= 700 && !/[<>]/.test(fact)) return fact + '。';
  } catch { /* 使用安全通用承接，不拼按钮 */ }
  return '你按刚才的选择采取了行动，眼前的事情有了新的进展。';
}

export function readModuleNarrative(raw: string): string {
  const visible = visibleModuleText(raw);
  const text = visible.startsWith('{') || visible.startsWith('```')
    ? String(parseModuleObject(visible).text || '') : visible;
  validateModuleInstructionLeak(text);
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
  options: { budgetLeft: () => number | null; isFatal: (error: unknown) => boolean; maxAttempts?: number; maxAttemptsForError?: (error: unknown) => number; onRejected?: (error: unknown, attemptNumber: number) => void },
): Promise<ModuleNarrativeAttempt<T>> {
  const canAfford = (count: number) => { const left = options.budgetLeft(); return left === null || left >= count; };
  let attempts = 0;
  let lastError: unknown = null;
  while (attempts < (options.maxAttempts || 2)) {
    attempts += 1;
    try {
      return { ok: true, value: await attempt(attempts), attempts };
    } catch (error) {
      if (options.isFatal(error)) throw error;
      options.onRejected?.(error, attempts);
      lastError = error;
      if (attempts >= (options.maxAttemptsForError?.(error) || options.maxAttempts || 2)) break;
    }
  }
  if (!canAfford(1)) throw lastError;
  return { ok: false, reason: String((lastError as Error)?.message || lastError || '未知原因').slice(0, 200), attempts };
}


export class ModuleNarrativeGuardError extends Error {
  constructor(message: string) { super(message); this.name = 'ModuleNarrativeGuardError'; }
}

/** 正文只描写成年角色；缺年龄时不猜年龄，不能把未知配角写成未成年人。 */
export function validateModuleCastNarrative(text: string, absentNames: string[], recent: string[] = [], requiredNames: string[] = []): void {
  if (/(?<![零一二三四五六七八九十百千\d])(?:[0-9]|1[0-7]|[一二三四五六七八九]|十[一二三四五六七]?|十五六|十六七八?|十七八)(?:岁|歲)?(?:的年纪|岁|歲)|(?:未满|不到|不足)[^。！？\n]{0,8}(?:十八九?|18|19)(?:岁|歲)|(?:十八九|18[—–~-]19)(?:岁|歲)[^。！？\n]{0,8}未满|十六七八(?:岁|歲|的年纪)?|十八九(?:岁|歲)?[（(]?(?:未满|尚未满)|未成年|幼童|小孩/.test(text)) {
    throw new ModuleNarrativeGuardError('正文年龄冲突：所有出场角色须为18岁以上成年人，未知年龄不猜年龄');
  }
  const sentences = text.split(/[。！？\n]/);
  const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const name of absentNames) {
    // "樨夫人谈起族长"只属于历史提及。只有让该角色现在现身、说话或动作才退稿。
    const acting = new RegExp(escapeName(name) + '(?:[，,、 ]|的身影|的身躯|本人|竟|又|仍|正|便|却|忽然|缓缓|抬手|微微|轻轻|笑着|一边|突然|已经|正在|一言不发(?:地)?|默默(?:地)?|向你|对你|从[^，。]{0,10}){0,3}(?:说了|说着|说话|在你身边|出现在|被列入伤员|走来|走进|走出|现身|出现|复活|站起|站在|坐在|站到|躺在|跟在|迎上|伸手|睁眼|开口|说道|说[：:]|道[：:]|问[：:]|点头|摇头|抬头|起身|递给|出手|攻击|笑道|喊道|答道|拉住|看着|望着|在场|列在|仍在伤员)', 'g');
    if (sentences.some(sentence => [...sentence.matchAll(acting)].some(hit =>
      !/回忆|想起|提起|谈起|说起|曾经|生前|当年|昔日/.test(sentence.slice(Math.max(0, (hit.index || 0) - 16), hit.index))))) {
      throw new ModuleNarrativeGuardError(`正文在场冲突：${name}已故、离场或尚未登场，不得在当前现场行动`);
    }
  }
  for (const name of requiredNames) {
    const visible = sentences.some(sentence => sentence.includes(name)
      && !/未现身|并未出现|没有露面|不在场|尚未到场|还未到场|没有到场|没有出场|没来|不见踪影|提起|谈起|说起|回忆|想起/.test(sentence)
      && !new RegExp(escapeName(name) + '[^，。]{0,12}(?:的名字|的往事|的遗物)').test(sentence));
    if (!visible) throw new ModuleNarrativeGuardError(`必到演员缺席：${name}必须在本步骤现场出现，不能只被提及或写成未现身`);
  }
  const current = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length >= 12);
  if (recent.some(entry => {
    const previous = new Set(entry.split(/[。！？\n]/).map(s => s.trim()));
    const repeated = current.filter(s => previous.has(s));
    return repeated.length >= 3 || (repeated.length >= 2 && repeated.join('').length >= 80);
  })) throw new ModuleNarrativeGuardError('正文重复上一回合整段镜头，请只演本步骤的新变化');
}


export { validateNanhuangCanonNarrative } from './narrativeBoundaries';

/** 场景事实只能来自作者步骤与本地账本；不从模型稿推导人物、境界或钱物。 */
export function validateStepSceneNarrative(text: string, card: import('./schema').ScenarioStepScene | undefined,
  scene: { 时段?: string; presentActors?: Array<{ name: string; gender?: string; appearance?: string }>; 账本摘要?: any; 搜刮回执?: Array<{ currency?: string; quantity: number }> }, recent: string[] = []): void {
  const yiHu = scene.账本摘要?.人物状态?.易虎?.status;
  if (yiHu && yiHu !== 'present' && text.split(/[。！？\n]/).some(sentence => /易虎/.test(sentence) && /留下来|留下.{0,8}帮|帮(?:夫人|樨夫人)|带路|向导|熟悉.{0,12}(?:路|商路)|随队|归队/.test(sentence) && !/生前|曾经|当年|过去|失踪前|不是|不能|不再|无法|并未/.test(sentence))) throw new ModuleNarrativeGuardError('人物状态冲突：易虎已失踪或被炼成血虎，不能当普通活人调用');
  for (const group of card?.factChecks || []) {
    if (!group.some(term => text.includes(term))) throw new ModuleNarrativeGuardError(`步骤固定要点缺失：${group.join('／')}`);
  }
  for (const forbidden of card?.forbidden || []) {
    const terms = forbidden.split('|');
    if (terms.some(term => term && text.includes(term))) throw new ModuleNarrativeGuardError(`步骤越界：${forbidden}`);
  }
  if (/程(?:爷|少主|族长)|云公子/.test(text)) throw new ModuleNarrativeGuardError('主角称呼冲突：按人物称呼表，不给主角编造官职或身份');
  const paragraphs = text.split(/[。！？\n]/);
  for (const actor of scene.presentActors || []) {
    const pronoun = actor.gender === '男' ? '她' : actor.gender === '女' ? '他' : '';
    if (!pronoun) continue;
    for (const sentence of paragraphs) {
      const at = sentence.indexOf(actor.name);
      if (at < 0) continue;
      const tail = sentence.slice(at + actor.name.length);
      // 仅同一人物紧接代词的指代检查；不把对白里的他人/他乡算成代词。
      if (new RegExp(`^[，,\\s]*(?:${pronoun}(?:说|问|看|走|抬|转|伸|点|摇|笑|的(?:脸|手|目光)))`).test(tail))
        throw new ModuleNarrativeGuardError(`人物性别冲突：${actor.name}是${actor.gender}`);
    }
    const feature = actor.appearance?.trim();
    if (feature && feature.length > 12 && text.includes(feature) && recent.some(old => old.includes(feature)))
      throw new ModuleNarrativeGuardError(`外貌重复：${actor.name}上一拍已描写这一特征，本轮不再复述`);
  }
  const part = scene.时段;
  const conflicting = part && /夜|黄昏|傍晚/.test(part) ? /清晨|晨光|朝阳|日头高悬|正午/ : /深夜|子时|夜色笼罩|月光洒|夜幕降临/;
  if (part && conflicting.test(text)) throw new ModuleNarrativeGuardError(`昼夜冲突：当前时段是${part}`);
  const realm = scene.账本摘要?.主角?.境界;
  if (/你[^。！？]{0,15}(?:突破|晋升|踏入|达到)[^。！？]{0,8}(?:筑基|金丹|二阳|三阳|四阳)/.test(text))
    throw new ModuleNarrativeGuardError('境界变化没有本地回执');
  if (!card?.ledgerEffects?.jiuyang && realm?.九阳层次 !== '一阳' && /你[^。！？]{0,15}(?:突破|踏入|达到)[^。！？]{0,8}一阳/.test(text))
    throw new ModuleNarrativeGuardError('一阳境界尚未落账');
  if (/你[^。！？]{0,12}(?:付出|支付|花了|收下|得到|获得)[^。！？]{0,12}(?:铜铢|银铢|金铢)/.test(text)
    && !card?.ledgerEffects?.inventoryTransfers?.length && !scene.搜刮回执?.some(drop => drop.currency)) throw new ModuleNarrativeGuardError('钱物交易没有本地结算回执');
}
