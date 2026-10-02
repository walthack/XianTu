import type { SaveData } from '@/types/game';

import { getScenarioFocusEvent } from './runtime';

export const BAIHU_GAMBLE_REFUSAL_VERSION = 1;
export const BAIHU_GAMBLE_REFUSAL_CONTRACT = 'baihu-gamble-refusal:v1';
export const BAIHU_GAMBLE_REFUSAL_SOURCE = 'baihu_gamble_refusal_engine' as const;
export const BAIHU_GAMBLE_REFUSAL_UNAVAILABLE_TEXT = '当前拒赌选择已经过期或无效。';

export const NINGYU_GAMBLE_EVENT_ID = 'lcq.event.ningyu_enters_gamble';
export const SOUTH_PACT_EVENT_ID = 'lcq.event.sudaji_south_pact';
export const GAMBLE_BOND_EVENT_ID = 'lcq.event.gamble_bond_signed';

const WINDOW_EVENT_IDS = new Set([NINGYU_GAMBLE_EVENT_ID, GAMBLE_BOND_EVENT_ID]);
const LOSS_PREP = 'rigged_wager_loss_seen';

const REFUSE_PHRASES = [
  '赌就不必了',
  '不赌了',
  '我不赌',
  '我拒绝赌局',
  '我不参加赌局',
  '拒绝赌局',
  '我不参加这场赌局',
] as const;

const RESPONSE_PHRASES: Record<BaihuGambleRefusalResponseId, readonly string[]> = {
  resist: ['我反抗拘拿', '反抗拘拿', '我反抗', '动手反抗', '抵抗拘拿', '拒捕'],
  flee: ['尝试逃跑', '我尝试逃跑', '我逃跑', '逃走', '突围'],
  yield: ['服软受押', '我服软', '服软', '受押', '束手', '不反抗', '投降受押', '举起双手', '任凭处置', '任凭你们处置', '随你们处置'],
};

const PLAYER_SPEECH_CUE = /(?:我说|摇摇头|摇头|朝.{0,8}(?:说|道|摇)|答道|回答|开口)/;
const REPORTED_SPEECH = /(?:她说|他说|凝羽说|苏妲己说|别人说|有人说|他们说|他问|她问)/;
const ALLOWED_PHRASE_PREFIX = /^(?:我|我说|夫人|苏妲己|妲己|馆主|这|这场|这个|那|那种)?$/;
const GAMBLE_PROPOSED_PREP = 'ningyu_gamble_debut_seen';

export type BaihuGambleRefusalPhase = 'capture_ordered' | 'detained' | 'released';
export type BaihuGambleRefusalResponseId = 'resist' | 'flee' | 'yield';
export type BaihuGambleRefusalActionId = 'refuse_gamble' | BaihuGambleRefusalResponseId;

export interface BaihuGambleRefusalReceipt {
  id: string;
  atTurn: number;
  kind: 'refuse' | 'capture' | BaihuGambleRefusalResponseId | 'detain' | 'release';
  facts: string[];
}

export interface BaihuGambleRefusalState {
  version: typeof BAIHU_GAMBLE_REFUSAL_VERSION;
  sourceEventId: string;
  refusedAtTurn: number;
  phase: BaihuGambleRefusalPhase;
  response?: BaihuGambleRefusalResponseId;
  responseAtTurn?: number;
  gambled: false;
  signedBond: false;
  hallControlled: boolean;
  receipts: BaihuGambleRefusalReceipt[];
}

export interface BaihuGambleRefusalSelection {
  source: typeof BAIHU_GAMBLE_REFUSAL_SOURCE;
  actionId: BaihuGambleRefusalActionId;
  eventId: string;
  label: string;
  actionText: string;
  playerLine: string;
  timeCost: 1;
  costHint: string;
  contractHash: typeof BAIHU_GAMBLE_REFUSAL_CONTRACT;
  settledFacts: string[];
}

type RuntimeLike = {
  modId?: string;
  storyMode?: string;
  worldTurn?: number;
  currentChapterId?: string | null;
  flags?: Record<string, unknown>;
  events?: Array<{
    id?: string;
    name?: string;
    description?: string;
    axisBeat?: string;
    objective?: string;
    completion?: Array<{ path?: string; operator?: string; value?: unknown }>;
  }>;
  activeEventIds?: string[];
  completedEventIds?: string[];
  eventActionStates?: Record<string, {
    contractHash?: string;
    lastAttemptAtTurn?: number;
    lastOutcome?: string;
    readyAtTurn?: number;
    attemptCount?: number;
    preparations?: string[];
    attempts?: Array<{
      actionId?: string;
      outcome?: string;
      attemptedAtTurn?: number;
      detail?: string;
    }>;
  }>;
  eventTimeline?: Record<string, {
    eligibleAtTurn?: number;
    activatedAtTurn?: number;
    occurredAtTurn?: number;
    publiclyRevealedAtTurn?: number;
    playerLearnedAtTurn?: number;
    outcome?: string;
  }>;
  chronicle?: Array<{
    id: string;
    type: 'event' | 'world' | 'stage';
    stageId: string;
    title: string;
    detail?: string;
    sequence: number;
  }>;
  baihuGambleRefusal?: BaihuGambleRefusalState;
};

function runtimeOf(saveData: SaveData | null | undefined): RuntimeLike | undefined {
  return (saveData as { 世界?: { 状态?: { 剧本模组?: RuntimeLike } } } | null | undefined)
    ?.世界?.状态?.剧本模组;
}

function currentTurn(runtime: RuntimeLike | undefined): number {
  return Math.max(0, Number(runtime?.worldTurn) || 0);
}

function normalizeIntent(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

function focusEventId(runtime: RuntimeLike | undefined): string {
  if (!runtime) return '';
  const focus = getScenarioFocusEvent(runtime as Parameters<typeof getScenarioFocusEvent>[0]);
  if (focus?.id) return focus.id;
  const active = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  const completed = new Set(runtime.completedEventIds || []);
  for (const id of active) {
    if (id && !completed.has(id)) return id;
  }
  return String(active[0] || '');
}

function eventState(runtime: RuntimeLike | undefined, eventId: string) {
  return runtime?.eventActionStates?.[eventId];
}

function eventRecord(runtime: RuntimeLike | undefined, eventId: string) {
  return (runtime?.events || []).find(item => item.id === eventId);
}

function flagKeyOf(event: { completion?: Array<{ path?: string }> } | undefined, eventId: string): string {
  const path = event?.completion?.[0]?.path;
  if (typeof path === 'string' && path.startsWith('flags.')) return path.slice('flags.'.length);
  const short = eventId.split('.').pop() || eventId;
  return `event.${short}.done`;
}

export function readBaihuGambleRefusal(saveData: SaveData | null | undefined): BaihuGambleRefusalState | undefined {
  const state = runtimeOf(saveData)?.baihuGambleRefusal;
  if (!state || state.version !== BAIHU_GAMBLE_REFUSAL_VERSION) return undefined;
  if (state.gambled !== false || state.signedBond !== false) return undefined;
  if (state.phase !== 'capture_ordered' && state.phase !== 'detained' && state.phase !== 'released') return undefined;
  return state;
}

export function isBaihuGambleWindowEventId(eventId: string | undefined): boolean {
  return !!eventId && WINDOW_EVENT_IDS.has(eventId);
}

/**
 * 契书拍的结果（用户裁定 2026-10-01）：`event.gamble_bond_signed.done` 只表示"这一拍已结案"，
 * 签契与拒赌被拿下都会结案。下游需要知道"签没签"时，一律读本函数或 outcome 标记，不得读 done。
 */
export const GAMBLE_BOND_OUTCOME_FLAG = 'event.gamble_bond_signed.outcome';
export type GambleBondOutcome = 'signed' | 'refused' | 'open';
export function gambleBondOutcome(saveData: SaveData | null | undefined): GambleBondOutcome {
  const runtime = runtimeOf(saveData);
  if (!runtime) return 'open';
  const flags = runtime.flags || {};
  if (flags[GAMBLE_BOND_OUTCOME_FLAG] === 'refused' || flags['event.gamble_bond_signed.refused_capture'] === true) return 'refused';
  if (flags['event.gamble_bond_signed.done'] === true || (runtime.completedEventIds || []).includes(GAMBLE_BOND_EVENT_ID)) return 'signed';
  return 'open';
}

export function gambleAlreadyLostOrSigned(saveData: SaveData | null | undefined): boolean {
  const runtime = runtimeOf(saveData);
  if (!runtime) return false;
  if (runtime.flags?.['event.gamble_bond_signed.done'] === true
    && runtime.flags?.['event.gamble_bond_signed.refused_capture'] !== true) {
    return true;
  }
  if ((runtime.completedEventIds || []).includes(GAMBLE_BOND_EVENT_ID)
    && runtime.flags?.['event.gamble_bond_signed.refused_capture'] !== true) {
    return true;
  }
  const preparations = new Set(eventState(runtime, GAMBLE_BOND_EVENT_ID)?.preparations || []);
  if (preparations.has(LOSS_PREP)) return true;
  const attempts = eventState(runtime, GAMBLE_BOND_EVENT_ID)?.attempts || [];
  return attempts.some(item => item.actionId === 'confirm_rigged_wager_loss' || item.actionId === 'sign_the_bond');
}

function gambleHasBeenProposed(runtime: RuntimeLike | undefined, currentId: string): boolean {
  if (currentId === GAMBLE_BOND_EVENT_ID) return true;
  if (currentId !== NINGYU_GAMBLE_EVENT_ID) return false;
  const preparations = eventState(runtime, NINGYU_GAMBLE_EVENT_ID)?.preparations || [];
  return preparations.includes(GAMBLE_PROPOSED_PREP);
}

export function isBaihuGambleRefusalWindow(saveData: SaveData | null | undefined): boolean {
  const runtime = runtimeOf(saveData);
  if (!runtime || runtime.storyMode === 'world_sim') return false;
  if (runtime.modId && runtime.modId !== 'lcq.stage_02') return false;
  const currentId = focusEventId(runtime);
  // 用户裁定 2026-10-02：拒赌窗口只开在凝羽入局这一拍；契书拍不再新开（已在扣押中的旧档仍按原窗口应对）。
  if (currentId !== NINGYU_GAMBLE_EVENT_ID) return false;
  if (readBaihuGambleRefusal(saveData)?.phase === 'detained') return false;
  if (gambleAlreadyLostOrSigned(saveData)) return false;
  if (eventState(runtime, currentId)?.readyAtTurn !== undefined) return false;
  if (!gambleHasBeenProposed(runtime, currentId)) return false;
  return true;
}

export function baihuGambleRefusalHidesDefaultEventActions(
  saveData: SaveData | null | undefined,
  eventId?: string,
): boolean {
  const currentId = eventId || focusEventId(runtimeOf(saveData));
  if (!isBaihuGambleWindowEventId(currentId)) return false;
  return readBaihuGambleRefusal(saveData)?.phase === 'capture_ordered';
}

function hasNonAffirmativeIntentFrame(raw: string): boolean {
  if (/[？?]/.test(raw)) return true;
  if (/(吗|呢)\s*[。.!！]*\s*$/.test(raw)) return true;
  if (/(如果|要是|假如|倘若|若是|怎样|会怎样)/.test(raw)) return true;
  if (/(还没决定|要不要|是不是|有没有|没有说|并不是|并没有|不是要|才怪|才不是|不想|并非|并未)/.test(raw)) return true;
  if (/(不是不赌|没有拒绝|并未拒绝|不拒绝赌|不得不赌|不能不赌|并非拒绝)/.test(raw)) return true;
  return false;
}

function playerOwnedQuoteBodies(raw: string): string[] {
  const bodies: string[] = [];
  const re = /[“"「『]([^”"」』]+)[”"」』]/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    const prefix = raw.slice(0, match.index);
    const isReported = REPORTED_SPEECH.test(prefix) && !PLAYER_SPEECH_CUE.test(prefix.slice(-12));
    const isPlayerOwned = PLAYER_SPEECH_CUE.test(prefix) || /^(?:我|我说)/.test(normalizeIntent(prefix));
    if (isPlayerOwned && !isReported) bodies.push(match[1]);
    match = re.exec(raw);
  }
  return bodies;
}

function phraseHitsNormalized(normalized: string, needle: string): boolean {
  if (!normalized || !needle) return false;
  if (normalized === needle || normalized === `我${needle}` || normalized === `我说${needle}`) return true;
  if (!normalized.endsWith(needle)) return false;
  const prefix = normalized.slice(0, normalized.length - needle.length);
  return ALLOWED_PHRASE_PREFIX.test(prefix);
}

function clauseHaystacks(raw: string): string[] {
  const owned = playerOwnedQuoteBodies(raw);
  const chunks = owned.length ? owned : [raw];
  const clauses = chunks.flatMap(chunk => String(chunk || '').split(/[，,。.!！；;：:\n]+/));
  return [...chunks, ...clauses].map(item => item.trim()).filter(Boolean);
}

function matchesAffirmativePhrase(raw: string, phrases: readonly string[]): boolean {
  return clauseHaystacks(raw).some((chunk) => {
    const normalized = normalizeIntent(chunk);
    if (!normalized) return false;
    return phrases.some(phrase => phraseHitsNormalized(normalized, normalizeIntent(phrase)));
  });
}

function matchesYieldGesture(raw: string): boolean {
  const normalized = normalizeIntent(raw);
  return normalized.includes('举起双手')
    && /(任凭处置|任凭你们处置|随你们处置)/.test(normalized);
}

export function isExplicitRefuseGambleText(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (hasNonAffirmativeIntentFrame(raw)) return false;
  if (REPORTED_SPEECH.test(raw) && playerOwnedQuoteBodies(raw).length === 0) return false;
  const compact = raw.replace(/\s+/g, '');
  if (/^(凝羽|苏妲己|她|他|他们|别人)/.test(compact) && playerOwnedQuoteBodies(raw).length === 0) return false;
  const normalized = normalizeIntent(raw);
  if (!normalized || normalized.includes('不得不赌') || normalized.includes('不能不赌')) return false;
  return matchesAffirmativePhrase(raw, REFUSE_PHRASES);
}

function matchConflictResponse(text: string): BaihuGambleRefusalResponseId | undefined {
  const raw = String(text || '').trim();
  if (!raw) return undefined;
  if (hasNonAffirmativeIntentFrame(raw)) return undefined;
  const normalized = normalizeIntent(raw);
  if (!normalized) return undefined;
  const hits = (Object.keys(RESPONSE_PHRASES) as BaihuGambleRefusalResponseId[]).filter((id) => {
    if (id === 'resist' && (normalized.includes('不反抗') || /不反抗/.test(raw))) return false;
    if (id === 'yield' && matchesYieldGesture(raw)) return true;
    return matchesAffirmativePhrase(raw, RESPONSE_PHRASES[id]);
  });
  return hits.length === 1 ? hits[0] : undefined;
}

function refuseFacts(): string[] {
  return [
    '你当面向苏妲己表明这场赌局不必打了。',
    '苏妲己脸色一沉，当场命人拿下你。',
    '你并未入局，也没有赌输，更没有签下卖身契。',
  ];
}

function responseFacts(response: BaihuGambleRefusalResponseId): string[] {
  if (response === 'resist') {
    return [
      '你反抗拘拿，当场与商馆人手冲突。',
      '商馆人多势众，你仍被制住扣押。',
      '你并未入局，也没有赌输，更没有签下卖身契。',
      '你此刻仍受白湖商馆控制。',
    ];
  }
  if (response === 'flee') {
    return [
      '你试图从内院脱身。',
      '退路被封死，你仍被扣押在商馆里。',
      '你并未入局，也没有赌输，更没有签下卖身契。',
      '你此刻仍受白湖商馆控制。',
    ];
  }
  return [
    '你没有硬拼，先受押。',
    '你仍被扣押，处在白湖商馆的控制下。',
    '你并未入局，也没有赌输，更没有签下卖身契。',
  ];
}

function selectionFor(
  actionId: BaihuGambleRefusalActionId,
  eventId: string,
): BaihuGambleRefusalSelection {
  if (actionId === 'refuse_gamble') {
    const actionText = '我说赌就不必了，当场拒绝与苏妲己对赌。';
    return {
      source: BAIHU_GAMBLE_REFUSAL_SOURCE,
      actionId,
      eventId,
      label: '拒绝这场赌局',
      costHint: '将与馆主翻脸，面临拘拿；不会签下赌约。',
      actionText,
      playerLine: actionText,
      timeCost: 1,
      contractHash: BAIHU_GAMBLE_REFUSAL_CONTRACT,
      settledFacts: refuseFacts(),
    };
  }
  if (actionId === 'resist') {
    const actionText = '我反抗拘拿，不让他们轻易拿下。';
    return {
      source: BAIHU_GAMBLE_REFUSAL_SOURCE,
      actionId,
      eventId,
      label: '反抗拘拿',
      costHint: '会发生冲突；当前无法击退商馆人手，仍将受押。',
      actionText,
      playerLine: actionText,
      timeCost: 1,
      contractHash: BAIHU_GAMBLE_REFUSAL_CONTRACT,
      settledFacts: responseFacts('resist'),
    };
  }
  if (actionId === 'flee') {
    const actionText = '我尝试从内院逃跑。';
    return {
      source: BAIHU_GAMBLE_REFUSAL_SOURCE,
      actionId,
      eventId,
      label: '尝试逃跑',
      costHint: '退路受商馆控制；当前无法脱身，仍将受押。',
      actionText,
      playerLine: actionText,
      timeCost: 1,
      contractHash: BAIHU_GAMBLE_REFUSAL_CONTRACT,
      settledFacts: responseFacts('flee'),
    };
  }
  const actionText = '我先服软受押，不硬拼。';
  return {
    source: BAIHU_GAMBLE_REFUSAL_SOURCE,
    actionId: 'yield',
    eventId,
    label: '服软受押',
    costHint: '放弃当场抵抗，仍受商馆扣押；不会签下卖身契。',
    actionText,
    playerLine: actionText,
    timeCost: 1,
    contractHash: BAIHU_GAMBLE_REFUSAL_CONTRACT,
    settledFacts: responseFacts('yield'),
  };
}

function isOnRefusalSourceWindow(runtime: RuntimeLike | undefined, ledger: BaihuGambleRefusalState | undefined): boolean {
  if (!runtime || !ledger?.sourceEventId) return false;
  if (runtime.modId !== 'lcq.stage_02') return false;
  return focusEventId(runtime) === ledger.sourceEventId
    && isBaihuGambleWindowEventId(ledger.sourceEventId);
}

export function getBaihuGambleRefusalSelections(saveData: SaveData | null | undefined): BaihuGambleRefusalSelection[] {
  const runtime = runtimeOf(saveData);
  if (!runtime || runtime.storyMode === 'world_sim') return [];
  const currentId = focusEventId(runtime);
  const ledger = readBaihuGambleRefusal(saveData);
  if (ledger?.phase === 'capture_ordered' && isOnRefusalSourceWindow(runtime, ledger)) {
    return [
      selectionFor('resist', ledger.sourceEventId),
      selectionFor('flee', ledger.sourceEventId),
      selectionFor('yield', ledger.sourceEventId),
    ];
  }
  if (!isBaihuGambleRefusalWindow(saveData) || !currentId) return [];
  return [selectionFor('refuse_gamble', currentId)];
}

export function resolveBaihuGambleRefusalFromText(
  saveData: SaveData | null | undefined,
  playerText: string,
): BaihuGambleRefusalSelection | undefined {
  const available = getBaihuGambleRefusalSelections(saveData);
  if (!available.length) return undefined;
  const raw = String(playerText || '').trim();
  if (!raw) return undefined;
  const exact = available.find(item => item.actionText === raw || item.playerLine === raw || item.label === raw);
  if (exact) return exact;
  const ledger = readBaihuGambleRefusal(saveData);
  if (ledger?.phase === 'capture_ordered') {
    const response = matchConflictResponse(raw);
    return response ? available.find(item => item.actionId === response) : undefined;
  }
  if (!isExplicitRefuseGambleText(raw)) return undefined;
  return available.find(item => item.actionId === 'refuse_gamble');
}

function ensureLedger(runtime: RuntimeLike): BaihuGambleRefusalState {
  if (runtime.baihuGambleRefusal?.version === BAIHU_GAMBLE_REFUSAL_VERSION) {
    return runtime.baihuGambleRefusal;
  }
  const blank: BaihuGambleRefusalState = {
    version: BAIHU_GAMBLE_REFUSAL_VERSION,
    sourceEventId: '',
    refusedAtTurn: currentTurn(runtime),
    phase: 'capture_ordered',
    gambled: false,
    signedBond: false,
    hallControlled: false,
    receipts: [],
  };
  runtime.baihuGambleRefusal = blank;
  return blank;
}

function pushReceipt(ledger: BaihuGambleRefusalState, receipt: BaihuGambleRefusalReceipt): void {
  if (ledger.receipts.some(item => item.id === receipt.id)) return;
  ledger.receipts.push(receipt);
}

function writeRefusalFlags(runtime: RuntimeLike, phase: BaihuGambleRefusalPhase): void {
  runtime.flags ||= {};
  runtime.flags['world.baihu.gamble_refusal_phase'] = phase;
  runtime.flags['world.baihu.refused_gamble'] = true;
  runtime.flags['world.baihu.never_gambled'] = true;
  runtime.flags['world.baihu.never_signed_bond'] = true;
  runtime.flags['world.baihu.hall_controlled'] = phase === 'detained';
  if (phase === 'detained' || phase === 'released') {
    runtime.flags['event.gamble_bond_signed.refused_capture'] = true;
    runtime.flags[GAMBLE_BOND_OUTCOME_FLAG] = 'refused';
  }
}

function patchBondNarrative(runtime: RuntimeLike): void {
  const event = eventRecord(runtime, GAMBLE_BOND_EVENT_ID);
  if (!event) return;
  event.name = '拒赌后被商馆扣押';
  event.description = '程宗扬明确拒绝与苏妲己对赌，并未入局也未签卖身契；苏妲己命人拿下后，他仍受白湖商馆控制。';
  event.axisBeat = '程宗扬拒赌后被扣押，仍受白湖商馆控制；此事不是赌输签契。';
  event.objective = '面对拒赌后被扣押、仍受商馆控制的局面';
}

function markEventSettled(
  runtime: RuntimeLike,
  eventId: string,
  actionId: string,
  detail: string,
): void {
  const turn = currentTurn(runtime);
  const event = eventRecord(runtime, eventId);
  runtime.eventActionStates ||= {};
  const state = runtime.eventActionStates[eventId] || {
    contractHash: BAIHU_GAMBLE_REFUSAL_CONTRACT,
    attemptCount: 0,
    preparations: [],
    attempts: [],
  };
  if (state.readyAtTurn === undefined) {
    state.readyAtTurn = turn;
    state.lastAttemptAtTurn = turn;
    state.lastOutcome = 'success';
    state.attemptCount = Math.max(0, Number(state.attemptCount) || 0) + 1;
    state.attempts = [...(state.attempts || []), {
      actionId,
      outcome: 'success',
      attemptedAtTurn: turn,
      detail,
    }].slice(-8);
  }
  runtime.eventActionStates[eventId] = state;
  runtime.flags ||= {};
  runtime.flags[flagKeyOf(event, eventId)] = true;
  runtime.completedEventIds = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  const currentlyActive = (runtime.activeEventIds || []).includes(eventId);
  // 未激活的后续赌局拍不会进入 active 清算；rail 的 settled 只认 completedEventIds。
  if (!currentlyActive && !runtime.completedEventIds.includes(eventId)) {
    runtime.completedEventIds.push(eventId);
  }
  runtime.eventTimeline ||= {};
  const timeline = runtime.eventTimeline[eventId] || { eligibleAtTurn: turn };
  timeline.occurredAtTurn = timeline.occurredAtTurn ?? turn;
  timeline.playerLearnedAtTurn = timeline.playerLearnedAtTurn ?? turn;
  timeline.outcome = 'participated';
  runtime.eventTimeline[eventId] = timeline;
}

function appendRefusalChronicle(runtime: RuntimeLike, eventId: string, title: string, detail: string): void {
  const chronicle = runtime.chronicle ||= [];
  const id = `chronicle.${runtime.modId || 'lcq.stage_02'}.${eventId}.refused_capture`;
  if (chronicle.some(item => item.id === id)) return;
  chronicle.push({
    id,
    type: 'event',
    stageId: runtime.modId || 'lcq.stage_02',
    title,
    detail,
    sequence: chronicle.length + 1,
  });
}

function sameSelection(left: BaihuGambleRefusalSelection, right: BaihuGambleRefusalSelection): boolean {
  return left.source === right.source
    && left.actionId === right.actionId
    && left.eventId === right.eventId
    && left.contractHash === right.contractHash
    && left.actionText === right.actionText;
}

function isTrueRepeat(
  ledger: BaihuGambleRefusalState,
  selection: BaihuGambleRefusalSelection,
  expectedActionId: BaihuGambleRefusalActionId,
): boolean {
  if (selection.source !== BAIHU_GAMBLE_REFUSAL_SOURCE) return false;
  if (selection.contractHash !== BAIHU_GAMBLE_REFUSAL_CONTRACT) return false;
  if (selection.actionId !== expectedActionId) return false;
  if (ledger.sourceEventId && selection.eventId !== ledger.sourceEventId) return false;
  const expected = selectionFor(expectedActionId, selection.eventId);
  return selection.actionText === expected.actionText;
}

export function settleBaihuGambleRefusalSelection(
  saveData: SaveData,
  selection: BaihuGambleRefusalSelection,
): {
  settled: boolean;
  idempotent: boolean;
  reason?: string;
  settledFacts: string[];
  phase?: BaihuGambleRefusalPhase;
} {
  const runtime = runtimeOf(saveData);
  if (!runtime || selection?.source !== BAIHU_GAMBLE_REFUSAL_SOURCE) {
    return { settled: false, idempotent: false, reason: 'inactive_slice', settledFacts: [] };
  }
  if (runtime.storyMode === 'world_sim') {
    return { settled: false, idempotent: false, reason: 'world_sim', settledFacts: [] };
  }
  if (selection.contractHash !== BAIHU_GAMBLE_REFUSAL_CONTRACT) {
    return { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }
  if (runtime.modId && runtime.modId !== 'lcq.stage_02') {
    return { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }

  const ledger = readBaihuGambleRefusal(saveData);
  const available = getBaihuGambleRefusalSelections(saveData);
  const current = available.find(item => sameSelection(item, selection));

  if (ledger?.phase === 'released') {
    return { settled: false, idempotent: false, reason: 'already_released', settledFacts: [] };
  }

  if (ledger?.phase === 'detained') {
    if (
      isOnRefusalSourceWindow(runtime, ledger)
      && ledger.response
      && isTrueRepeat(ledger, selection, ledger.response)
    ) {
      return { settled: true, idempotent: true, settledFacts: responseFacts(ledger.response), phase: 'detained' };
    }
    return { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }

  if (selection.actionId === 'refuse_gamble' && ledger?.phase === 'capture_ordered') {
    if (isOnRefusalSourceWindow(runtime, ledger) && isTrueRepeat(ledger, selection, 'refuse_gamble')) {
      return { settled: true, idempotent: true, settledFacts: refuseFacts(), phase: 'capture_ordered' };
    }
    return { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }

  if (!current) {
    return { settled: false, idempotent: false, reason: 'stale_selection', settledFacts: [] };
  }

  if (gambleAlreadyLostOrSigned(saveData) && selection.actionId === 'refuse_gamble') {
    return { settled: false, idempotent: false, reason: 'too_late', settledFacts: [] };
  }

  const turn = currentTurn(runtime);
  if (selection.actionId === 'refuse_gamble') {
    const next = ensureLedger(runtime);
    next.sourceEventId = focusEventId(runtime) || selection.eventId;
    next.refusedAtTurn = turn;
    next.phase = 'capture_ordered';
    next.gambled = false;
    next.signedBond = false;
    next.hallControlled = false;
    pushReceipt(next, { id: 'refuse', atTurn: turn, kind: 'refuse', facts: refuseFacts().slice(0, 1) });
    pushReceipt(next, { id: 'capture', atTurn: turn, kind: 'capture', facts: refuseFacts().slice(1) });
    writeRefusalFlags(runtime, 'capture_ordered');
    runtime.baihuGambleRefusal = next;
    return { settled: true, idempotent: false, settledFacts: refuseFacts(), phase: 'capture_ordered' };
  }

  const response = selection.actionId;
  const facts = responseFacts(response);
  const next = ensureLedger(runtime);
  next.phase = 'detained';
  next.response = response;
  next.responseAtTurn = turn;
  next.gambled = false;
  next.signedBond = false;
  next.hallControlled = true;
  if (!next.sourceEventId) next.sourceEventId = selection.eventId;
  pushReceipt(next, { id: `response:${response}`, atTurn: turn, kind: response, facts });
  pushReceipt(next, {
    id: 'detain',
    atTurn: turn,
    kind: 'detain',
    facts: ['你仍被扣押，处在白湖商馆的控制下。', '你并未入局，也没有赌输，更没有签下卖身契。'],
  });
  writeRefusalFlags(runtime, 'detained');
  patchBondNarrative(runtime);
  const sourceId = next.sourceEventId || focusEventId(runtime);
  if (sourceId === NINGYU_GAMBLE_EVENT_ID || focusEventId(runtime) === NINGYU_GAMBLE_EVENT_ID) {
    markEventSettled(runtime, NINGYU_GAMBLE_EVENT_ID, `refuse_gamble_${response}`, facts.join(''));
  }
  markEventSettled(runtime, GAMBLE_BOND_EVENT_ID, `refuse_gamble_${response}`, facts.join(''));
  appendRefusalChronicle(
    runtime,
    GAMBLE_BOND_EVENT_ID,
    '拒赌后被商馆扣押',
    '你拒绝赌局后被扣押，仍受白湖商馆控制；并未入局，也未签卖身契。',
  );
  runtime.baihuGambleRefusal = next;
  return { settled: true, idempotent: false, settledFacts: facts, phase: 'detained' };
}

export function getBaihuGambleRefusalPrompt(saveData: SaveData | null | undefined): string {
  const ledger = readBaihuGambleRefusal(saveData);
  if (!ledger) return '';
  if (ledger.phase === 'released') {
    return [
      '# 白湖拒赌冲突（本地真值）',
      '玩家曾明确拒绝与苏妲己对赌，并未入局、并未赌输、并未签卖身契。',
      '此事已成为既成历史。玩家已从白湖商馆脱身，当前不再被扣押、不再受商馆控制。',
      '不得把这段改写成赌局落败或自愿签契，也不得把现状写成仍在拘押。',
    ].join('\n');
  }
  const process = ledger.receipts
    .flatMap(item => item.facts)
    .filter((fact, index, all) => all.indexOf(fact) === index);
  const processLine = process.length ? `已落账过程：${process.join('；')}` : '';
  if (ledger.phase === 'capture_ordered') {
    return [
      '# 白湖拒赌冲突（本地真值）',
      '玩家已明确拒绝与苏妲己对赌，并未入局、并未赌输、并未签卖身契。',
      '苏妲己因此翻脸并命人拿下。本轮只演拘拿当前，等待玩家反抗、逃跑或服软。',
      '不得写成已经逃脱、已经赌输、自愿签契，也不得把尚未发生的南荒之约写成已经谈妥。',
      processLine,
    ].filter(Boolean).join('\n');
  }
  const responseText = ledger.response === 'resist'
    ? '玩家反抗后仍被制住'
    : ledger.response === 'flee'
      ? '玩家尝试逃跑后仍被拦住'
      : '玩家服软受押';
  return [
    '# 白湖拒赌冲突（本地真值）',
    '玩家已明确拒绝与苏妲己对赌，并未入局、并未赌输、并未签卖身契。',
    `苏妲己命人拿下后，${responseText}；当前仍被扣押、受白湖商馆控制。`,
    '后续商馆任务可以继续，但不得把这段改写成赌局落败或自愿签契，也不得伪记玩家已同意尚未发生的事件。',
    processLine,
  ].filter(Boolean).join('\n');
}

export function previewBaihuGambleRefusalNarrative(
  saveData: SaveData,
  selection?: BaihuGambleRefusalSelection,
): string {
  if (!selection || selection.source !== BAIHU_GAMBLE_REFUSAL_SOURCE) return '';
  const clone = structuredClone(saveData);
  const result = settleBaihuGambleRefusalSelection(clone, selection);
  if (!result.settled || !result.settledFacts?.length) return '';
  return result.settledFacts.map(fact => /[。！？]$/.test(fact) ? fact : `${fact}。`).join('');
}

export function releaseBaihuGambleRefusalIfEscaped(saveData: SaveData | null | undefined): boolean {
  const runtime = runtimeOf(saveData);
  const ledger = readBaihuGambleRefusal(saveData);
  if (!runtime || !ledger) return false;
  if (ledger.phase !== 'capture_ordered' && ledger.phase !== 'detained') return false;
  const escaped = runtime.flags?.['event.baihu_shangguan_escape.done'] === true
    || (runtime.completedEventIds || []).includes('lcq.event.baihu_shangguan_escape');
  if (!escaped) return false;
  const turn = currentTurn(runtime);
  ledger.phase = 'released';
  ledger.hallControlled = false;
  ledger.gambled = false;
  ledger.signedBond = false;
  pushReceipt(ledger, {
    id: 'release',
    atTurn: turn,
    kind: 'release',
    facts: ['你已从白湖商馆脱身，当前不再受商馆扣押。', '你并未入局，也没有赌输，更没有签下卖身契。'],
  });
  writeRefusalFlags(runtime, 'released');
  runtime.baihuGambleRefusal = ledger;
  return true;
}
