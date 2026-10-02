import type { SaveData } from '@/types/game';
import {
  getCurrentStoryEventActions, previewWangZheStayEnding,
  getTrackedStoryOpportunityActions,
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

export const NATURAL_INTENT_MAX_TOKENS = 1024;
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
}

export type NaturalIntentSelection =
  | ScenarioEventActionSelection
  | BaihuGambleRefusalSelection
  | ScenarioOpportunityActionSelection
  | WuyuanOpenWorldSelection;

export interface NaturalIntentResult {
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
  if (/(她说|他说|凝羽说|苏妲己说|别人说|有人说|他们说|他问|她问)/.test(raw)) return true;
  if (/(我说.{0,12}(?:她|他|凝羽|苏妲己|别人|他们).{0,12}(?:不赌|拒绝赌))/.test(raw)) return true;
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
  const refusal = getBaihuGambleRefusalSelections(saveData).map(item => ({
    source: item.source,
    actionId: item.actionId,
    eventId: item.eventId,
    label: item.label,
    playerLine: item.playerLine,
    contractHash: item.contractHash,
  }));
  const events = getCurrentStoryEventActions(saveData).map(item => ({
    source: item.source,
    actionId: item.actionId,
    eventId: item.eventId,
    label: item.label,
    playerLine: item.playerLine,
    contractHash: item.contractHash,
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
  return getCurrentStoryEventActions(saveData).find(item =>
    item.actionId === chosen.actionId
    && item.eventId === chosen.eventId
    && item.contractHash === chosen.contractHash,
  );
}

function parseIntentJson(raw: string): {
  actionId?: string;
  source?: string;
  eventId?: string;
  contractHash?: string;
  evidence?: string;
  certainty?: string;
} | null {
  const text = String(raw || '').trim();
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
  return !hasUnclearIntentFrame(hay.slice(from, to));
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

function buildIntentPrompt(playerText: string, candidates: NaturalIntentCandidate[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = [
    '你只做意图分类。只能从候选里选一个，或返回 none。',
    '禁止发明新动作，禁止把任务标成完成，禁止改写事实。',
    '问句、假设、转述他人、否定、互相冲突的复合选择必须返回 none。',
    '只输出 JSON：{"actionId":"候选id或none","source":"候选source或省略","eventId":"候选eventId或省略","evidence":"玩家原文中的短语","certainty":"high或low"}',
  ].join('');
  const userPrompt = JSON.stringify({
    playerText,
    candidates: candidates.map(item => ({
      source: item.source,
      actionId: item.actionId,
      eventId: item.eventId || undefined,
      playerLine: item.playerLine,
      label: item.label,
      contractHash: item.contractHash,
    })),
  });
  return { systemPrompt, userPrompt };
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

  const alias = input.resolveFromText?.(input.saveData, input.playerText);
  if (alias) {
    return { kind: 'alias', selection: alias, skipKeywordPreflight: true, usedModel: false };
  }

  if (!isScopedNaturalIntentSave(input.saveData)) {
    return { kind: 'free', skipKeywordPreflight: false, usedModel: false };
  }

  if (!input.generate) {
    return narrateWithoutSettlement('no_classifier', false);
  }

  const fingerprint = intentSaveFingerprint(input.saveData);
  const candidates = listNaturalIntentCandidates(input.saveData);
  if (!candidates.length) {
    return { kind: 'free', skipKeywordPreflight: true, usedModel: false };
  }

  abortInFlightNaturalIntent();
  const controller = new AbortController();
  inFlight = controller;
  const requestId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  latestRequestId = requestId;
  if (input.signal?.aborted) {
    controller.abort();
    return { kind: 'failed', reason: 'aborted', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: false };
  }
  const onAbort = () => controller.abort();
  input.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const { systemPrompt, userPrompt } = buildIntentPrompt(String(input.playerText || '').trim(), candidates);
    const output = await input.generate({
      systemPrompt,
      userPrompt,
      maxTokens: NATURAL_INTENT_MAX_TOKENS,
      signal: controller.signal,
      requestId,
    });
    if (controller.signal.aborted || latestRequestId !== requestId) {
      return { kind: 'failed', reason: 'stale', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    if (intentSaveFingerprint(input.saveData) !== fingerprint) {
      return { kind: 'failed', reason: 'state_changed', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    const parsed = parseIntentJson(output);
    if (!parsed) return onClassifierFailure('malformed', candidates);
    if (parsed.certainty !== 'high') return narrateWithoutSettlement('low_certainty', true);
    if (!parsed.actionId) return narrateWithoutSettlement('missing_action', true);
    if (parsed.actionId === 'none') {
      return { kind: 'free', reason: 'explicit_none', skipKeywordPreflight: true, usedModel: true };
    }
    if (!parsed.evidence || !evidenceBelongsToPlayer(String(input.playerText || ''), parsed.evidence)) {
      return narrateWithoutSettlement('bad_evidence', true);
    }
    if (!evidenceClauseIsAffirmative(String(input.playerText || ''), parsed.evidence)) {
      return narrateWithoutSettlement('non_affirmative_evidence', true);
    }
    const selection = verifyFreshSelection(input.saveData, parsed);
    if (!selection) return narrateWithoutSettlement('stale_or_ambiguous_candidate', true);
    return { kind: 'matched', selection, skipKeywordPreflight: true, usedModel: true };
  } catch {
    if (input.signal?.aborted) {
      return { kind: 'failed', reason: 'aborted', clarification: NATURAL_INTENT_CLARIFY_DEFAULT, skipKeywordPreflight: true, usedModel: true };
    }
    return onClassifierFailure('classifier_error', candidates);
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
    if (inFlight === controller) inFlight = null;
  }
}
