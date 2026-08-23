import {
  getJudgementState,
  hashJudgementAction,
  type JudgementFactor,
  type JudgementOutcome,
  type JudgementResolution,
} from '@/utils/judgementEngine';

import {
  isQingyuOpeningPlaytestSave,
  QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
  QINGYU_OPENING_PLAYTEST_MOD_ID,
} from './qingyuOpeningPlaytest';

export const FAST_NARRATIVE_DEMO_KNIFE_FACT_ID = 'qingyu-demo.scene.nearest-corpse-short-knife';
export const FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID = 'lcq.event.s01_02';
export const FAST_NARRATIVE_DEMO_TERMINAL_PROJECTION = '当前事件终局不可由本轮改写';
export const FAST_NARRATIVE_DEMO_STORAGE_KEY = 'xiantu.fastNarrativeDemo.v1';
const RECEIPT_VERIFICATION_DOMAIN = 'xiantu.fastNarrativeDemo.receipt.v1';

type StorageLike = { getItem(key: string): string | null };

export type FastNarrativeDemoKnifeLocation = 'scene_held' | 'on_ground' | 'at_corpse';

export interface FastNarrativeDemoSceneFact {
  id: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  kind: 'grounded_scene_item';
  itemName: '短刀';
  quality: '凡品';
  source: 'nearest_battlefield_corpse';
  sourceText: string;
  establishedByJudgementId: string;
}

export interface FastNarrativeDemoActionReceipt {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  knifeLocation: FastNarrativeDemoKnifeLocation;
  sceneFactId: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  settledAtTurn: number;
  verificationHash: string;
}

export interface FastNarrativeDemoAdjudicationState {
  version: 1;
  sceneFacts: FastNarrativeDemoSceneFact[];
  actionReceipts: FastNarrativeDemoActionReceipt[];
  knife: {
    itemName: '短刀';
    location: FastNarrativeDemoKnifeLocation;
    lastJudgementId: string;
  } | null;
  terminalBoundaries: Array<{
    eventId: typeof FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID;
    policy: 'fixed_terminal';
  }>;
}

export interface FastNarrativeDemoAdjudicationView {
  itemName: '短刀';
  sourceText: string;
  location: FastNarrativeDemoKnifeLocation;
  sceneHeld: boolean;
  judgementId: string;
  processBoundary: typeof FAST_NARRATIVE_DEMO_TERMINAL_PROJECTION;
}

export interface FastNarrativeDemoSettlementResult {
  applied: boolean;
  reason: 'applied' | 'already_settled' | 'feature_disabled' | 'ineligible_save' | 'unmatched_action' | 'unverified_resolution';
  view: FastNarrativeDemoAdjudicationView | null;
}

const DEMO_ACTION_RE = /尸体[\s\S]{0,20}(?:短刀|刀)[\s\S]{0,30}(?:翻滚|躲开|避开)[\s\S]{0,16}箭|(?:抢下|夺下|抽出)[\s\S]{0,12}(?:短刀|刀)[\s\S]{0,30}(?:翻滚|躲开|避开)[\s\S]{0,16}箭/;

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function isFastNarrativeDemoKnifeAction(actionText: string): boolean {
  return DEMO_ACTION_RE.test(normalizeText(actionText));
}

function isFeatureEnabled(storage?: StorageLike): boolean {
  try {
    const source = storage ?? (typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage);
    return source?.getItem(FAST_NARRATIVE_DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function knifeLocationFor(outcome: JudgementOutcome): FastNarrativeDemoKnifeLocation {
  if (outcome === 'perfect' || outcome === 'great_success' || outcome === 'success') return 'scene_held';
  if (outcome === 'partial') return 'on_ground';
  return 'at_corpse';
}

function receiptVerificationSource(receipt: Omit<FastNarrativeDemoActionReceipt, 'verificationHash'>): string {
  return [
    RECEIPT_VERIFICATION_DOMAIN,
    receipt.judgementId,
    receipt.actionHash,
    receipt.outcome,
    receipt.knifeLocation,
    receipt.sceneFactId,
    String(receipt.settledAtTurn),
  ].join('|');
}

function hashActionReceipt(receipt: Omit<FastNarrativeDemoActionReceipt, 'verificationHash'>): string {
  return hashJudgementAction(receiptVerificationSource(receipt));
}

function isIntactSceneReceipt(
  fact: FastNarrativeDemoSceneFact,
  knife: NonNullable<FastNarrativeDemoAdjudicationState['knife']>,
  receipt: FastNarrativeDemoActionReceipt,
): boolean {
  return receipt.judgementId === knife.lastJudgementId
    && receipt.knifeLocation === knife.location
    && receipt.sceneFactId === fact.id
    && fact.establishedByJudgementId === receipt.judgementId
    && !!normalizeText(receipt.verificationHash)
    && receipt.verificationHash === hashActionReceipt({
      judgementId: receipt.judgementId,
      actionHash: receipt.actionHash,
      outcome: receipt.outcome,
      knifeLocation: receipt.knifeLocation,
      sceneFactId: receipt.sceneFactId,
      settledAtTurn: receipt.settledAtTurn,
    });
}

function emptyState(): FastNarrativeDemoAdjudicationState {
  return {
    version: 1,
    sceneFacts: [],
    actionReceipts: [],
    knife: null,
    terminalBoundaries: [],
  };
}

function readState(saveData: unknown): FastNarrativeDemoAdjudicationState | null {
  const root = asRecord(saveData);
  const marker = asRecord(root?.系统?.扩展?.[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY]);
  const raw = asRecord(marker?.adjudication);
  if (!raw || raw.version !== 1) return null;

  const sceneFacts = Array.isArray(raw.sceneFacts)
    ? raw.sceneFacts.filter((fact: unknown) => {
      const value = asRecord(fact);
      return value?.id === FAST_NARRATIVE_DEMO_KNIFE_FACT_ID
        && value.kind === 'grounded_scene_item'
        && value.itemName === '短刀'
        && value.quality === '凡品'
        && value.source === 'nearest_battlefield_corpse'
        && !!normalizeText(value.sourceText)
        && !!normalizeText(value.establishedByJudgementId);
    }) as FastNarrativeDemoSceneFact[]
    : [];
  const validOutcomes = new Set<JudgementOutcome>([
    'critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect',
  ]);
  const validLocations = new Set<FastNarrativeDemoKnifeLocation>(['scene_held', 'on_ground', 'at_corpse']);
  const actionReceipts = Array.isArray(raw.actionReceipts)
    ? raw.actionReceipts.flatMap((receipt: unknown) => {
      const value = asRecord(receipt);
      const settledAtTurn = Number(value?.settledAtTurn);
      if (
        !normalizeText(value?.judgementId)
        || !normalizeText(value?.actionHash)
        || !validOutcomes.has(value?.outcome)
        || !validLocations.has(value?.knifeLocation)
        || value?.sceneFactId !== FAST_NARRATIVE_DEMO_KNIFE_FACT_ID
        || !Number.isFinite(settledAtTurn)
        || !normalizeText(value?.verificationHash)
      ) return [];
      return [{
        judgementId: normalizeText(value.judgementId),
        actionHash: normalizeText(value.actionHash),
        outcome: value.outcome as JudgementOutcome,
        knifeLocation: value.knifeLocation as FastNarrativeDemoKnifeLocation,
        sceneFactId: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
        settledAtTurn,
        verificationHash: normalizeText(value.verificationHash),
      } satisfies FastNarrativeDemoActionReceipt];
    })
    : [];
  const rawKnife = asRecord(raw.knife);
  const knife = rawKnife?.itemName === '短刀'
    && validLocations.has(rawKnife.location)
    && !!normalizeText(rawKnife.lastJudgementId)
    ? {
      itemName: '短刀' as const,
      location: rawKnife.location as FastNarrativeDemoKnifeLocation,
      lastJudgementId: normalizeText(rawKnife.lastJudgementId),
    }
    : null;

  return {
    version: 1,
    sceneFacts,
    actionReceipts,
    knife,
    terminalBoundaries: Array.isArray(raw.terminalBoundaries)
      && raw.terminalBoundaries.some((boundary: unknown) => {
        const value = asRecord(boundary);
        return value?.eventId === FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID
          && value.policy === 'fixed_terminal';
      })
      ? [{ eventId: FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID, policy: 'fixed_terminal' }]
      : [],
  };
}

function writeState(saveData: unknown, state: FastNarrativeDemoAdjudicationState): void {
  const root = asRecord(saveData);
  const marker = asRecord(root?.系统?.扩展?.[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY]);
  if (!marker) throw new Error('清羽 Demo marker 不存在，不能写入判定回执');
  marker.adjudication = state;
}

export function readFastNarrativeDemoAdjudicationView(
  saveData: unknown,
): FastNarrativeDemoAdjudicationView | null {
  if (!isQingyuOpeningPlaytestSave(saveData as any)) return null;
  const state = readState(saveData);
  const knife = state?.knife;
  if (!state || !knife) return null;
  const receipt = [...state.actionReceipts].reverse()
    .find(item => item.judgementId === knife.lastJudgementId);
  const fact = state.sceneFacts.find(item => item.id === FAST_NARRATIVE_DEMO_KNIFE_FACT_ID);
  if (!receipt || !fact || !isIntactSceneReceipt(fact, knife, receipt)) return null;
  return {
    itemName: '短刀',
    sourceText: fact.sourceText,
    location: knife.location,
    sceneHeld: knife.location === 'scene_held',
    judgementId: receipt.judgementId,
    processBoundary: FAST_NARRATIVE_DEMO_TERMINAL_PROJECTION,
  };
}

function verifiedResolution(saveData: unknown, resolution: JudgementResolution): boolean {
  if (resolution.status !== 'resolved' || !resolution.outcome) return false;
  return getJudgementState(saveData).recent.some(receipt => (
    receipt.status === 'resolved'
    && receipt.id === resolution.id
    && receipt.actionHash === resolution.actionHash
    && receipt.outcome === resolution.outcome
  ));
}

export function settleFastNarrativeDemoAdjudication(
  saveData: unknown,
  resolution: JudgementResolution,
  options: { storage?: StorageLike } = {},
): FastNarrativeDemoSettlementResult {
  if (!isFeatureEnabled(options.storage)) {
    return { applied: false, reason: 'feature_disabled', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }
  const root = asRecord(saveData);
  if (
    !isQingyuOpeningPlaytestSave(saveData as any)
    || root?.世界?.状态?.剧本模组?.modId !== QINGYU_OPENING_PLAYTEST_MOD_ID
  ) {
    return { applied: false, reason: 'ineligible_save', view: null };
  }
  if (!isFastNarrativeDemoKnifeAction(resolution?.actionText || '')) {
    return { applied: false, reason: 'unmatched_action', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }
  if (!verifiedResolution(saveData, resolution)) {
    return { applied: false, reason: 'unverified_resolution', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }

  const state = readState(saveData) || emptyState();
  if (state.actionReceipts.some(receipt => receipt.judgementId === resolution.id)) {
    return { applied: false, reason: 'already_settled', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }
  // The benchmark action is a single scene opportunity. A reload may present a new
  // judgement instance for the same wording, but it must not become a reroll faucet.
  if (state.actionReceipts.some(receipt => receipt.actionHash === resolution.actionHash)) {
    return { applied: false, reason: 'already_settled', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }

  const location = knifeLocationFor(resolution.outcome as JudgementOutcome);
  if (!state.sceneFacts.some(fact => fact.id === FAST_NARRATIVE_DEMO_KNIFE_FACT_ID)) {
    state.sceneFacts.push({
      id: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
      kind: 'grounded_scene_item',
      itemName: '短刀',
      quality: '凡品',
      source: 'nearest_battlefield_corpse',
      sourceText: '最近的战场尸体僵硬的手指间原本握着一把凡品短刀。',
      establishedByJudgementId: resolution.id,
    });
  }
  const actionReceipt: Omit<FastNarrativeDemoActionReceipt, 'verificationHash'> = {
    judgementId: resolution.id,
    actionHash: resolution.actionHash,
    outcome: resolution.outcome as JudgementOutcome,
    knifeLocation: location,
    sceneFactId: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
    settledAtTurn: resolution.resolvedAtTurn,
  };
  state.actionReceipts.push({
    ...actionReceipt,
    verificationHash: hashActionReceipt(actionReceipt),
  });
  state.knife = { itemName: '短刀', location, lastJudgementId: resolution.id };
  if (!state.terminalBoundaries.some(boundary => boundary.eventId === FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID)) {
    state.terminalBoundaries.push({
      eventId: FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID,
      policy: 'fixed_terminal',
    });
  }
  writeState(saveData, state);
  return { applied: true, reason: 'applied', view: readFastNarrativeDemoAdjudicationView(saveData) };
}

const EXPLICIT_SHORT_KNIFE_USE_RE = /(?:用|持|拿|握|攥|挥|以|借)[^。！？\n]{0,12}短刀|短刀[^。！？\n]{0,12}(?:刺|砍|劈|挡|格挡|抵挡|投掷|掷出|攻击|防身)/;

export function fastNarrativeDemoShortKnifeFactor(
  saveData: unknown,
  actionText: string,
  storage?: StorageLike,
): JudgementFactor | null {
  if (!isFeatureEnabled(storage)) return null;
  const view = readFastNarrativeDemoAdjudicationView(saveData);
  if (!view?.sceneHeld || !EXPLICIT_SHORT_KNIFE_USE_RE.test(normalizeText(actionText))) return null;
  return { label: '现场物品·凡品短刀', value: 3, source: 'item' };
}
