import { inheritDiagnosticCancellation, noteDiagnosticCancellation, noteTicketDiscard } from '@/services/requestLifecycleDiagnostics';

import {entityNamePattern} from './namedEntities';
import { GAME_MODEL_MODULES } from '@/services/moduleModelRuntime';
import {QUEST_LINES} from './questLines';
import { freeTextStatusSemanticRequest, validateFreeTextStatusProposals, type FreeTextStatusResolution } from '../sceneModule/host/freeTextStatusSemantic';
import type { SaveData } from '@/types/game';
import {
  getCurrentStoryEventActions, getCurrentStoryExplorationActions, previewWangZheStayEnding,
  getTrackedStoryOpportunityActions,
  reconcileNaturalIntentMetadata,
  type ScenarioEventActionSelection,
  type ScenarioOpportunityActionSelection,
} from './runtime';
import {
  getBaihuGambleRefusalSelections,
  resolveBaihuGambleRefusalFromText,
  type BaihuGambleRefusalSelection,
} from './baihuGambleRefusal';
import {
  getWuyuanOpenWorldSelections,
  type WuyuanOpenWorldSelection,
} from './wuyuanOpenWorldSlice';
import { isScopedNaturalIntentSave } from './playtestNarrativeScope';
import { freeActionConfig } from './freeAction/config';
import { ticketPromptSection, validateFreeActionTickets, type FreeActionTicket } from './freeAction/ticket';

export const NATURAL_INTENT_MAX_TOKENS = GAME_MODEL_MODULES.find(m=>m.id==='intent')!.policy.maxTokens;
export const NATURAL_INTENT_TIMEOUT_MS = 10000;
export const NATURAL_INTENT_CLARIFY_DEFAULT = '这一步我还没听清你要做什么。请直接说眼前这一动，或点按钮。';

export type NaturalIntentKind =
  | 'button'
  | 'alias'
  | 'matched'
  | 'free'
  | 'unclear'
  | 'failed';

export interface NaturalIntentCandidate {
  source: string;
  actionId: string;
  eventId?: string;
  opportunityId?: string;
  identityId?: string;
  label: string;
  playerLine: string;
  contractHash: string;
  intentMatch?: unknown;
  affinityAssessment?: {characterIds:string[];loadBearing:boolean};
}

export type NaturalIntentSelection =
  | ScenarioEventActionSelection
  | BaihuGambleRefusalSelection
  | ScenarioOpportunityActionSelection
  | WuyuanOpenWorldSelection;

export interface NaturalIntentResult {
  /** Same request/snapshot validated catalog proposal; absent on legacy/fast paths. */
  freeTextStatusResolution?: FreeTextStatusResolution;
  /** 自由行动票：仅 kind==='free' 且校验通过的票；命中作者动作时不收（避免同拍双结算）。 */
  freeActionTickets?: FreeActionTicket[];
  /** 自由行动票：证据通过但目标/物品无效的“未发生”事实行（没有可结算的票时也会带）。 */
  freeActionRefusals?: string[];
  kind: NaturalIntentKind;
  selection?: NaturalIntentSelection;
  reason?: string;
  clarification?: string;
  /** 非阻断提示：本回合照常进行，只告诉玩家发生了什么（如识别超时已按自由行动处理）。 */
  notice?: string;
  /** 正在固定事件链上、识别失败而停下：界面需常驻显示 clarification，直到玩家改输入或重发。 */
  hold?: boolean;
  skipKeywordPreflight: boolean;
  usedModel: boolean;
}

/**
 * 行动解释模块的失败策略（模块卡 onFail=hold_on_contract，用户裁定 2026-10-01）：
 * 识别模型超时/报错/格式坏时——
 * - 候选里有合同动作（主线事件、拒赌应对、机会卡）＝正在固定事件链上：停下，保留输入，
 *   常驻提示请玩家点选项或换说法。自由叙事不能推进事件链，也不能被当作已推进
 *   （真机 fx-pact2：降级后正文写"三个月，我准了"，进度却停在第 2/2 步）。
 * - 只剩地方行动可选：按"拿不准"降级——照常演出、不结算、不回落关键词判定，并提示。
 * 取消、过期、存档已变仍按原样中止。
 */
export const NATURAL_INTENT_DEGRADED_NOTICE = '行动识别没有及时完成，本回合按自由行动处理，不结算剧情动作。';
export const NATURAL_INTENT_CONTRACT_HOLD = '这一步关系到当前剧情进度，行动没能识别，本回合没有推进。输入已保留，请点选上方选项，或换个说法再发送。';
export function onClassifierFailure(reason: string, candidates: readonly NaturalIntentCandidate[]): NaturalIntentResult {
  noteTicketDiscard('intent', reason);
  if (candidates.some(candidate => candidate.source !== 'open_world_engine')) {
    return { kind: 'failed', reason, clarification: NATURAL_INTENT_CONTRACT_HOLD, hold: true, skipKeywordPreflight: true, usedModel: true };
  }
  return { kind: 'free', reason, notice: NATURAL_INTENT_DEGRADED_NOTICE, skipKeywordPreflight: true, usedModel: true };
}

type IntentGenerate = (input: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  signal?: AbortSignal;
  requestId: string;
}) => Promise<string>;

let inFlight: AbortController | null = null;
let latestRequestId = '';

export function abortInFlightNaturalIntent(): void {
  if (inFlight) noteDiagnosticCancellation(inFlight.signal, 'natural_intent_cancel');
  inFlight?.abort();
  inFlight = null;
}

export function hasUnclearIntentFrame(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (/[？?]/.test(raw)) return true;
  if (/(吗|呢)\s*[。.!！]*\s*$/.test(raw)) return true;
  if (/(如果|要是|假如|倘若|若是|怎样|会怎样)/.test(raw)) return true;
  if (/(还没决定|要不要|是不是|有没有|没有说|并不是|并没有|不是要|才怪|才不是|并非|并未)/.test(raw)) return true;
  // 转述标记前面紧跟“对/跟/向…”是玩家自己在说话（我对她说…），“她说完/他说话”也不是转述；与 inputPolicy.stripReportedSpeech 同口径。
  if (new RegExp("(?<![对跟向朝和同给替诉])(?:她说|他说|"+"(?:"+entityNamePattern("character","liuchao.character.ning_yu")+")"+"说|"+"(?:"+entityNamePattern("character","liuchao.character.su_daji")+")"+"说|别人说|有人说|他们说|他问|她问)(?![完话])","").test(raw)) return true;
  if (new RegExp("(我说.{0,12}(?:她|他|"+"(?:"+entityNamePattern("character","liuchao.character.ning_yu")+")"+"|"+"(?:"+entityNamePattern("character","liuchao.character.su_daji")+")"+"|别人|他们).{0,12}(?:不赌|拒绝赌))","").test(raw)) return true;
  if (/(不是不|并不是要|并没有|并非|并未|才怪|才不是)/.test(raw)) return true;
  return false;
}

function compact(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

export function intentSaveFingerprint(saveData: SaveData | null | undefined): string {
  const runtime = (saveData as { 世界?: { 状态?: { 剧本模组?: {
    worldTurn?: number;
    activeEventIds?: string[];
    completedEventIds?: string[];
  } } } } | null | undefined)?.世界?.状态?.剧本模组;
  return JSON.stringify({
    turn: runtime?.worldTurn ?? 0,
    active: runtime?.activeEventIds || [],
    completed: runtime?.completedEventIds || [],
    candidates: listNaturalIntentCandidates(saveData as SaveData).map(item => ({
      source: item.source,
      actionId: item.actionId,
      eventId: item.eventId || '',
      hash: item.contractHash,
    })),
  });
}

export function listNaturalIntentCandidates(saveData: SaveData): NaturalIntentCandidate[] {
  reconcileNaturalIntentMetadata(saveData);
  const refusal = getBaihuGambleRefusalSelections(saveData).map(item => ({
    source: item.source,
    actionId: item.actionId,
    eventId: item.eventId,
    label: item.label,
    playerLine: item.playerLine,
    contractHash: item.contractHash,
  }));
  const events = [...getCurrentStoryEventActions(saveData), ...getCurrentStoryExplorationActions(saveData)].map(item => ({
    source: item.source,
    actionId: item.actionId,
    eventId: item.eventId,
    label: item.label,
    playerLine: item.playerLine,
    contractHash: item.contractHash,
    intentMatch: (saveData as any).世界?.状态?.剧本模组?.events?.find((e:any)=>e.id===item.eventId)?.playerCompletionContract?.actions?.find((a:any)=>a.id===item.actionId)?.intentMatch,
    affinityAssessment: (()=>{const l=QUEST_LINES.find(l=>l.kind==='character'&&l.beats.some(b=>b.eventId===item.eventId));return l?{characterIds:l.ownerCharacterIds,loadBearing:!!l.loadBearing}:undefined;})(),
  }));
  const opportunities = getTrackedStoryOpportunityActions(saveData).map(item => ({
    source: item.source,
    actionId: item.actionId,
    eventId: item.opportunityId,
    opportunityId: item.opportunityId,
    label: item.label,
    playerLine: item.actionText,
    contractHash: item.contractHash,
  }));
  const openWorld = getWuyuanOpenWorldSelections(saveData).map(item => ({
    source: item.source,
    actionId: item.identityId,
    identityId: item.identityId,
    label: item.label,
    playerLine: item.actionText,
    contractHash: item.receiptId,
  }));
  return [...events, ...refusal, ...opportunities, ...openWorld];
}

export function verifyFreshSelection(
  saveData: SaveData,
  parsed: { actionId?: string; source?: string; eventId?: string; contractHash?: string },
): NaturalIntentSelection | undefined {
  const actionId = String(parsed.actionId || '').trim();
  if (!actionId) return undefined;
  const matches = listNaturalIntentCandidates(saveData).filter(item => {
    if (item.actionId !== actionId) return false;
    if (parsed.source && item.source !== parsed.source) return false;
    if (parsed.eventId && (item.eventId || '') !== parsed.eventId) return false;
    if (parsed.contractHash && item.contractHash !== parsed.contractHash) return false;
    return true;
  });
  if (matches.length !== 1) return undefined;
  const chosen = matches[0];
  if (chosen.source === 'baihu_gamble_refusal_engine') {
    return getBaihuGambleRefusalSelections(saveData).find(item =>
      item.actionId === chosen.actionId && item.contractHash === chosen.contractHash,
    );
  }
  if (chosen.source === 'opportunity_engine') {
    return getTrackedStoryOpportunityActions(saveData).find(item =>
      item.actionId === chosen.actionId && item.contractHash === chosen.contractHash,
    );
  }
  if (chosen.source === 'open_world_engine') {
    return getWuyuanOpenWorldSelections(saveData).find(item =>
      item.identityId === chosen.actionId && item.receiptId === chosen.contractHash,
    );
  }
  return [...getCurrentStoryEventActions(saveData), ...getCurrentStoryExplorationActions(saveData)].find(item =>
    item.actionId === chosen.actionId
    && item.eventId === chosen.eventId
    && item.contractHash === chosen.contractHash,
  );
}

export function parseIntentJson(raw: string): {
  actionId?: string;
  source?: string;
  eventId?: string;
  contractHash?: string;
  evidence?: string;
  certainty?: string;
  affinityDelta?: number;
  statusProposals?: unknown;
  tickets?: unknown;
} | null {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!text) return null;
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    const parsed = JSON.parse(fenced[0]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      actionId: typeof parsed.actionId === 'string' ? parsed.actionId : undefined,
      source: typeof parsed.source === 'string' ? parsed.source : undefined,
      eventId: typeof parsed.eventId === 'string' ? parsed.eventId : undefined,
      contractHash: typeof parsed.contractHash === 'string' ? parsed.contractHash : undefined,
      evidence: typeof parsed.evidence === 'string' ? parsed.evidence : undefined,
      certainty: typeof parsed.certainty === 'string' ? parsed.certainty : undefined,
      statusProposals: parsed.statusProposals,
      tickets: parsed.tickets,
      affinityDelta: typeof parsed.affinityDelta === 'number' && Number.isFinite(parsed.affinityDelta) ? parsed.affinityDelta : undefined,
    };
  } catch {
    return null;
  }
}

function evidenceBelongsToPlayer(playerText: string, evidence: string): boolean {
  const hay = compact(playerText);
  const needle = compact(evidence);
  if (!needle || needle.length < 2) return false;
  return hay.includes(needle);
}

const CLAUSE_BREAK = /[，,。.！!？?；;：:“”"「」『』\n]/;

/** 依据所在分句（向两侧扩到标点）本身不能是问句、假设、转述或否定。 */
function evidenceClauseIsAffirmative(playerText: string, evidence: string): boolean {
  const hay = compact(playerText);
  const start = hay.indexOf(compact(evidence));
  if (start < 0) return false;
  let from = start;
  while (from > 0 && !CLAUSE_BREAK.test(hay[from - 1])) from -= 1;
  let to = start + compact(evidence).length;
  while (to < hay.length && !CLAUSE_BREAK.test(hay[to])) to += 1;
  // 带上紧随的句末标点，问号/“呢”才能被识别。
  while (to < hay.length && /[？?！!。.]/.test(hay[to])) to += 1;
  const clause=hay.slice(from,to);
  const requestedTalk=/我.{0,20}(?:问|询问|请[^，。！？?]{1,12}(?:说明|解释|为|帮|解毒)|请她|请他|听她|听他)/.test(playerText);
  return !hasUnclearIntentFrame(requestedTalk?clause.replace(/[？?]/g,'').replace(/(?:吗|呢)$/,''):clause);
}

export function resolveNaturalIntentFastPath(
  saveData: SaveData,
  playerText: string,
  selected?: { playerLine?: string; actionText?: string; source?: string } | null,
): NaturalIntentResult | undefined {
  const raw = String(playerText || '').trim();
  if (!raw) {
    return {
      kind: 'unclear',
      clarification: NATURAL_INTENT_CLARIFY_DEFAULT,
      skipKeywordPreflight: true,
      usedModel: false,
    };
  }
  if (selected && (selected.playerLine === raw || selected.actionText === raw)) {
    return { kind: 'button', skipKeywordPreflight: true, usedModel: false };
  }
  if (!hasUnclearIntentFrame(raw) && previewWangZheStayEnding(saveData, raw)) return {
    kind: 'free', reason: 'stay_on_wangzhe_battlefield', skipKeywordPreflight: true, usedModel: false,
  };
  const refusal = resolveBaihuGambleRefusalFromText(saveData, raw);
  if (refusal) {
    return {
      kind: 'alias',
      selection: refusal,
      skipKeywordPreflight: true,
      usedModel: false,
    };
  }
  // 只匹配当前开放的谈期限动作，不从正文、历史或未来合同推导同意。
  if (isScopedNaturalIntentSave(saveData) && !hasUnclearIntentFrame(raw)
    && /^(?:我|用|以|提供|告诉|同意|答应|认下|订下|立下|签下)/.test(raw)
    && !/[“”"'「」『』]|之前|昨天|曾经|已经|过去|以前|当时/.test(raw)
    && !/(不用|不提供|不告诉|不接受|不接|不认|拒绝|不同意|不答应|不要|不换|不押|不愿|不想|没有认|没认)/.test(raw)
    && /(?:三个月|三月)/.test(raw)) {
    const candidates = getCurrentStoryEventActions(saveData)
      .filter(item => item.eventId === 'lcq.event.sudaji_south_pact');
    const actionId = /(?:同意|答应|认下|订下|立下|签下).{0,12}(?:三个月|三月)/.test(raw)
      ? 'seal_three_month_south_pact'
      : /(?:霓龙丝|尼龙丝).{0,12}(?:产地|线索)|(?:产地|线索).{0,12}(?:霓龙丝|尼龙丝)/.test(raw) && /(?:提供|告诉|用|以|换)/.test(raw) ? 'offer_nylon_clue_for_term' : '';
    const matches = candidates.filter(item => item.actionId === actionId);
    if (matches.length === 1) return {
      kind: 'alias', selection: matches[0], skipKeywordPreflight: true, usedModel: false,
    };
  }
  return undefined;
}

function buildIntentPrompt(playerText: string, candidates: NaturalIntentCandidate[], saveData?: SaveData): {
  systemPrompt: string;
  userPrompt: string;
} {
  // 自由行动票：freeAction 关闭时提示词与今天逐字一致。
  const tickets = saveData && freeActionConfig().enabled ? ticketPromptSection(saveData) : undefined;
  const statusRequest = freeTextStatusSemanticRequest(playerText, '');
  const statusCatalog = JSON.parse(statusRequest.input).catalog.filter((d: { evidenceFrom: string }) => d.evidenceFrom === 'input');
  const systemPrompt = [
    '你只做意图分类及独立状态提案。动作只能从候选里选一个，或返回 none。',
    '禁止发明新动作，禁止把任务标成完成，禁止改写事实。',
    '候选intentMatch.allowInquiry=true时，直接询问也可匹配；不要求玩家知道答案或人名。若报出错误来源、命中rejectIf，或者只是关心而没探问来源，返回none。',
    '实际交谈动作（我询问、请她说明、我答应保密、我直说不是喊口号）可匹配对应候选；纯问规则、假设、转述他人或互相冲突的复合选择返回none。按候选intentMatch语义归最近一档；无关输入必须none，不靠只提到人物名完成。',
    '候选带affinityAssessment时，由你作为主持评估这次相关回应的affinityDelta数值，普通和承重都为-15..+15；代码会钳制，绝对值达到10的回应会记为大事。只给这次回应的好感，不改世界事实，记忆只影响语气。缺评估或无关则不结算。',
    statusRequest.system.replace(/返回纯JSON.*?。没有状态/, 'statusProposals条目字段为statusId、actor(player/other/unknown)、assertion(current/denied/hypothetical/uncertain)、source(input)、evidence(逐字证据)、confidence(0到1)。没有状态'),
    '本次只有玩家输入，状态仅从statusCatalog的input条目提案，source必须input。statusProposals必须为数组，没有状态用空数组；动作none不等于没有状态。',
    ...(tickets ? [tickets.system] : []),
    `只输出 JSON：{"actionId":"候选id或none","source":"候选source或省略","eventId":"候选eventId或省略","evidence":"玩家原文中的短语","certainty":"high或low","affinityDelta":0,"statusProposals":[]${tickets ? ',"tickets":[]' : ''}}`,
  ].join('');
  const userPrompt = JSON.stringify({
    playerText,
    statusCatalog,
    ...(tickets ? { freeAction: tickets.payload } : {}),
    candidates: candidates.map(item => ({
      source: item.source,
      actionId: item.actionId,
      eventId: item.eventId || undefined,
      playerLine: item.playerLine,
      label: item.label,
      contractHash: item.contractHash,
      intentMatch:item.intentMatch, affinityAssessment:item.affinityAssessment,
    })),
  });
  return { systemPrompt, userPrompt };
}

/**
 * 非人物线（白湖商馆等）当前开放的可选停靠点：按内容包 intentMatch 的明文短语确定性匹配，不等模型。
 * 人物线要主持评估好感，仍交给模型；问句、假设、转述、否定框，以及一句话命中多个选项，一律不在这里结算。
 */
export function resolveOptionalLineAlias(saveData: SaveData, playerText: string): ScenarioEventActionSelection | undefined {
  const raw = compact(String(playerText || ''));
  if (!raw || hasUnclearIntentFrame(String(playerText))) return undefined;
  const events = (saveData as any).世界?.状态?.剧本模组?.events as Array<{ id: string; playerCompletionContract?: { actions?: Array<{ id: string; intentMatch?: { matchAny?: string[]; matchAll?: string[]; rejectIf?: string[] } }> } }> | undefined;
  const hits = getCurrentStoryExplorationActions(saveData).filter(item => {
    const line = QUEST_LINES.find(l => l.beats.some(b => b.eventId === item.eventId));
    if (!line || line.kind === 'character') return false;
    const match = events?.find(e => e.id === item.eventId)?.playerCompletionContract?.actions?.find(a => a.id === item.actionId)?.intentMatch;
    if (!match) return false;
    const phrases = (list?: string[]) => (list || []).map(compact).filter(Boolean);
    const any = phrases(match.matchAny), all = phrases(match.matchAll);
    if (phrases(match.rejectIf).some(word => raw.includes(word))) return false;
    if (any.length > 0 && !any.some(word => raw.includes(word))) return false;
    if (all.length > 0 && !all.every(word => raw.includes(word))) return false;
    return any.length > 0 || all.length > 0;
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/** 拿不准：照常让 NPC 回应，但不结算任何候选，也不回落关键词判定。 */
function narrateWithoutSettlement(reason: string, usedModel: boolean): NaturalIntentResult {
  return { kind: 'free', reason, skipKeywordPreflight: true, usedModel };
}

export async function resolveNaturalIntent(input: {
  saveData: SaveData;
  playerText: string;
  selected?: { playerLine?: string; actionText?: string; source?: string } | null;
  generate?: IntentGenerate;
  signal?: AbortSignal;
  resolveFromText?: (saveData: SaveData, playerText: string) => ScenarioEventActionSelection | undefined;
}): Promise<NaturalIntentResult> {
  if (input.signal?.aborted) {
    return { kind: 'failed', reason: 'aborted', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: false };
  }
  const fast = resolveNaturalIntentFastPath(input.saveData, input.playerText, input.selected);
  if (fast) return fast;

  // 试玩范围内且自由行动开启时，含修炼词的句子也交给模型出票（“和她一起修炼”可能是对人做的事）；自我修炼句返回空票，由界面照旧走本地修炼预检。
  const isTrainingText = /练功|修炼|闭关|冲关|冲击境界/.test(input.playerText);
  const modelTicketsTraining = isTrainingText && freeActionConfig().enabled && isScopedNaturalIntentSave(input.saveData) && Boolean(input.generate);
  if(isTrainingText&&!modelTicketsTraining)return {kind:'free',skipKeywordPreflight:false,usedModel:false};
  // 修炼句识别失败（坏 JSON / 报错）：回到旧的本地修炼判定，不像普通自由句那样被“固定事件链”拦住。
  const classifierFailure = (reason: string, candidates: readonly NaturalIntentCandidate[]): NaturalIntentResult => {
    if (!modelTicketsTraining) return onClassifierFailure(reason, candidates);
    noteTicketDiscard('intent', reason);
    return { kind: 'free', reason, skipKeywordPreflight: false, usedModel: true };
  };
  const alias = input.resolveFromText?.(input.saveData, input.playerText);
  if (alias && !QUEST_LINES.some(l=>l.kind==='character'&&l.beats.some(b=>b.eventId===alias.eventId))) {
    return { kind: 'alias', selection: alias, skipKeywordPreflight: true, usedModel: false };
  }

  if (!isScopedNaturalIntentSave(input.saveData)) {
    return { kind: 'free', skipKeywordPreflight: false, usedModel: false };
  }
  const optional = resolveOptionalLineAlias(input.saveData, input.playerText);
  if (optional) return { kind: 'alias', selection: optional, skipKeywordPreflight: true, usedModel: false };

  if (!input.generate) {
    return narrateWithoutSettlement('no_classifier', false);
  }

  const fingerprint = intentSaveFingerprint(input.saveData);
  const candidates = listNaturalIntentCandidates(input.saveData);
  // An empty action catalog still permits independent catalog-constrained state recognition.

  abortInFlightNaturalIntent();
  const controller = new AbortController();
  inFlight = controller;
  const requestId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  latestRequestId = requestId;
  if (input.signal?.aborted) {
    inheritDiagnosticCancellation(input.signal, controller.signal);
    controller.abort();
    return { kind: 'failed', reason: 'aborted', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: false };
  }
  const onAbort = () => { inheritDiagnosticCancellation(input.signal, controller.signal); controller.abort(); };
  input.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const { systemPrompt, userPrompt } = buildIntentPrompt(String(input.playerText || '').trim(), candidates, input.saveData);
    const output = await input.generate({
      systemPrompt,
      userPrompt,
      maxTokens: NATURAL_INTENT_MAX_TOKENS,
      signal: controller.signal,
      requestId,
    });
    if (controller.signal.aborted || latestRequestId !== requestId) {
      noteTicketDiscard('intent', 'stale');
      return { kind: 'failed', reason: 'stale', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    if (intentSaveFingerprint(input.saveData) !== fingerprint) {
      noteTicketDiscard('intent', 'state_changed');
      return { kind: 'failed', reason: 'state_changed', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    const parsed = parseIntentJson(output);
    if (!parsed) return classifierFailure('malformed', candidates);
    // Verified only after cancellation and snapshot checks; old responses may omit the new field.
    const freeTextStatusResolution = parsed.statusProposals === undefined ? undefined
      : validateFreeTextStatusProposals(JSON.stringify({ proposals: parsed.statusProposals }), input.playerText, '', 'input');
    if (freeTextStatusResolution?.state === 'clarify') return {
      kind: 'unclear', reason: 'uncertain_status_proposal', clarification: freeTextStatusResolution.reason,
      hold: true, skipKeywordPreflight: true, usedModel: true, freeTextStatusResolution,
    };
    // 票只在“没有命中任何作者动作”的自由回合收：模型说 none / 缺动作 / 不确定。其余 free 原因（候选被否决）不收。
    const withTickets = (): Pick<NaturalIntentResult, 'freeActionTickets' | 'freeActionRefusals'> => {
      if (!freeActionConfig().enabled || parsed.tickets === undefined) return {};
      const checked = validateFreeActionTickets(parsed.tickets, String(input.playerText || ''), input.saveData);
      for (const drop of checked.discards) noteTicketDiscard('free_action', drop.reason, drop.key);
      return {
        ...(checked.tickets.length ? { freeActionTickets: checked.tickets } : {}),
        ...(checked.refusals.length ? { freeActionRefusals: checked.refusals } : {}),
      };
    };
    const free = (reason: string, tickets = false): NaturalIntentResult => {
      noteTicketDiscard('intent', reason, parsed.actionId);
      return { ...narrateWithoutSettlement(reason, true), freeTextStatusResolution, ...(tickets ? withTickets() : {}) };
    };
    if (parsed.certainty !== 'high') return free('low_certainty', true);
    if (!parsed.actionId) return free('missing_action', true);
    if (parsed.actionId === 'none') {
      return { kind: 'free', reason: 'explicit_none', skipKeywordPreflight: true, usedModel: true, freeTextStatusResolution, ...withTickets() };
    }
    if (!parsed.evidence || !evidenceBelongsToPlayer(String(input.playerText || ''), parsed.evidence)) {
      return free('bad_evidence');
    }
    const chosenCandidate=candidates.find(c=>c.actionId===parsed.actionId&&(!parsed.eventId||c.eventId===parsed.eventId));
    const match=chosenCandidate?.intentMatch as {allowInquiry?:boolean;rejectIf?:string[]}|undefined;
    if((match?.rejectIf||[]).some(word=>compact(input.playerText).includes(compact(word))))return free('rejected_intent');
    const inquiry=match?.allowInquiry===true && !/^(如果|要是|假如|倘若|她说|他说|别人说)/.test(input.playerText.trim());
    if (!inquiry && !evidenceClauseIsAffirmative(String(input.playerText || ''), parsed.evidence)) {
      return free('non_affirmative_evidence');
    }
    const selection = verifyFreshSelection(input.saveData, parsed);
    if (!selection) return free('stale_or_ambiguous_candidate');
    const affection=candidates.find(c=>c.actionId===parsed.actionId&&c.eventId===('eventId' in selection?selection.eventId:undefined))?.affinityAssessment;
    if(affection){if(parsed.affinityDelta===undefined)return free('missing_affinity_assessment');(selection as ScenarioEventActionSelection).lineAffinityDelta=parsed.affinityDelta;}
    return { kind: 'matched', selection, skipKeywordPreflight: true, usedModel: true, freeTextStatusResolution };
  } catch {
    if (input.signal?.aborted) {
      return { kind: 'failed', reason: 'aborted', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    return classifierFailure('classifier_error', candidates);
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
    if (inFlight === controller) inFlight = null;
  }
}
