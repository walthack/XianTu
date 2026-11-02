import { getCanonRailContract, getCanonRailOrder, getCanonRailProfile } from '@/modules/scenarioMods/canonRail';
import type { SaveData, StateChange } from '@/types/game';

/**
 * 事件对账（已停用结算，2026-11-02 用户拍板②／剧情推进机制设计稿 2.2-5）。
 *
 * 原先这里从叙事正文结算剧情拍：高光拍「逐拍证据词全部出现在正文」即落 done；谢艺／碧姬按正文里
 * 「人名＋死亡／生还词同句」落互斥结果；停滞或正文像是命中时再请模型对账，Canon Rail 拍还要求
 * 「月霜、寒毒、真阳」这类锚点词全在正文里。这些都是「正文关键词共现」当结算条件——结算只看玩家动作，
 * 不看模型写了什么，所以全部删除：拍只由本拍动作表（按钮／原句／别名）与作者写明的到点（deadline）结算。
 *
 * 冻结文件 AIBidirectionalSystem.ts 仍按原名导入下列函数，这里保留同名出口：不读正文、不写任何 flag、
 * 不再触发对账请求（shouldRunReconcile／evidenceLikely 恒为 false）。buildChainCandidates 只剩只读排序用途。
 */

const CHAIN_EXPOSE_LIMIT = 8;      // 候选链最多列出的事件数

interface RuntimeEventLike {
  id?: unknown;
  name?: unknown;
  axisBeat?: unknown;
  description?: unknown;
  axisSeq?: unknown;
  completion?: Array<{ path?: unknown; operator?: unknown; value?: unknown }>;
  completionEvidence?: unknown;
  critical?: unknown;
  relatedCharacterIds?: unknown;
  playerCompletionContract?: unknown;
  worldActor?: {
    opportunities?: Array<{ completionContract?: { kind?: unknown } }>;
  };
}

/** 正文不再触发对账（停滞兜底与「证据即触发」都已停用）。 */
export function shouldRunReconcile(_stallTurns: unknown): boolean {
  return false;
}

/** 正文不再触发对账。 */
export function evidenceLikely(_recentText: unknown, _candidates: ChainCandidate[]): boolean {
  return false;
}

/** 高光拍「逐拍证据词全在正文」结算已删除；恒返回空。 */
export function runDeterministicHighlightReconcile(_saveData: SaveData, _recentText: string): StateChange[] {
  return [];
}

/** 谢艺「正文点名＋死亡／生还词」结算已删除；s06_03 由本拍动作结算。恒返回空。 */
export function runDeterministicXieyiReconcile(_saveData: SaveData, _recentText: string): StateChange[] {
  return [];
}

/** 碧姬「正文点名小紫、碧姬＋死亡词」结算已删除；s06_04 由本拍动作结算。恒返回空。 */
export function runDeterministicBijiReconcile(_saveData: SaveData, _recentText: string): StateChange[] {
  return [];
}

export interface EventReconcileInput {
  saveData: SaveData;
  recentText: string;
  userAction: string;
  summarize?: (key: string, value: unknown, action: string) => unknown;
  generate?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/** 模型读正文对账已删除：不发请求、不写 flag，恒返回空。 */
export async function runEventReconcile(_input: EventReconcileInput): Promise<StateChange[]> {
  return [];
}

export interface ChainCandidate {
  id: string;
  name: string;
  beat: string;
  /** 完成 flag 的点号键（去掉 flags. 前缀），如 event.s06_01.done */
  flagKey: string;
  mustReach?: string;
  completionEvidence?: string[];
  forbiddenInCanon?: string[];
  relatedCharacterIds?: string[];
}

function eventDoneFlagKey(event: RuntimeEventLike): string {
  for (const c of event.completion || []) {
    const p = typeof c?.path === 'string' ? c.path : '';
    if (p.startsWith('flags.') && c?.operator === 'eq' && c?.value === true) return p.slice('flags.'.length);
  }
  return '';
}

function isFlagTrue(flags: Record<string, unknown>, dottedKey: string): boolean {
  // 与 runtime.resolveConditionValue 同序：嵌套优先，扁平兜底
  const parts = dottedKey.split('.');
  let cur: unknown = flags;
  for (const k of parts) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) { cur = undefined; break; }
    cur = (cur as Record<string, unknown>)[k];
  }
  if (cur !== undefined) return cur === true;
  return flags[dottedKey] === true;
}

/**
 * 从 runtime 计算"最早未完成事件起、按 axisSeq 链序"的候选前缀（暴露上限 CHAIN_EXPOSE_LIMIT）。
 * 只含未完成且有可落 flag 的事件；顺序即 validator 的连续前缀顺序。
 */
export function buildChainCandidates(runtime: {
  events?: RuntimeEventLike[];
  completedEventIds?: string[];
  flags?: Record<string, unknown>;
  modId?: unknown;
}): ChainCandidate[] {
  const flags = (runtime.flags && typeof runtime.flags === 'object') ? runtime.flags as Record<string, unknown> : {};
  const completed = new Set(runtime.completedEventIds || []);
  const railOrder = getCanonRailOrder(getCanonRailProfile(runtime));
  const ordered = (runtime.events || [])
    .filter(e => typeof e?.id === 'string' && !completed.has(e.id as string))
    .map(e => ({ e, flagKey: eventDoneFlagKey(e) }))
    .filter(({ flagKey }) => flagKey && !isFlagTrue(flags, flagKey))
    .sort((a, b) => {
      const railA = railOrder.get(String(a.e.id));
      const railB = railOrder.get(String(b.e.id));
      if (railA !== undefined || railB !== undefined) return (railA ?? Infinity) - (railB ?? Infinity);
      const sa = typeof a.e.axisSeq === 'number' ? a.e.axisSeq as number : Infinity;
      const sb = typeof b.e.axisSeq === 'number' ? b.e.axisSeq as number : Infinity;
      return sa - sb;
    });
  // 已迁移到本地完成合同的事件是权威边界：它本身不能交给 LLM 对账，
  // 它之后的事件也不能跨过该边界提前进入候选链。等本地引擎完成该事件后，
  // completed/flag 过滤会自然移除边界，旧事件才继续沿用原对账兜底。
  const engineOwnedBoundary = ordered.findIndex(({ e }) =>
    Boolean(e.playerCompletionContract)
    || e.worldActor?.opportunities?.some(opportunity =>
      opportunity.completionContract?.kind === 'player_action_sequence'),
  );
  const list = (engineOwnedBoundary >= 0 ? ordered.slice(0, engineOwnedBoundary) : ordered)
    .slice(0, CHAIN_EXPOSE_LIMIT);
  const profile = getCanonRailProfile(runtime);
  return list.map(({ e, flagKey }) => {
    const contract = getCanonRailContract(profile, String(e.id));
    return {
      id: String(e.id),
      name: typeof e.name === 'string' ? e.name : String(e.id),
      beat: typeof e.axisBeat === 'string' && e.axisBeat ? e.axisBeat : (typeof e.description === 'string' ? e.description : ''),
      flagKey,
      mustReach: contract?.mustReach,
      // 半预制高光把逐拍证据放在 event 数据中，主轴与非阻塞事件共用同一真值；
      // 旧事件没有该字段时继续回退到人工 Canon Rail 合同。
      completionEvidence: Array.isArray(e.completionEvidence)
        ? e.completionEvidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : contract?.completionEvidence,
      forbiddenInCanon: contract?.forbiddenInCanon,
      relatedCharacterIds: Array.isArray(e.relatedCharacterIds)
        ? e.relatedCharacterIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  });
}

