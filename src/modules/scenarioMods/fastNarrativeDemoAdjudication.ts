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
export const FAST_NARRATIVE_DEMO_KNIFE_SOURCE = 'nearby_battlefield_corpse' as const;
export const FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID = 'lcq.event.s01_02';
export const FAST_NARRATIVE_DEMO_TERMINAL_PROJECTION = '当前事件终局不可由本轮改写';
export const FAST_NARRATIVE_DEMO_STORAGE_KEY = 'xiantu.fastNarrativeDemo.v1';
const RECEIPT_VERIFICATION_DOMAIN = 'xiantu.fastNarrativeDemo.receipt.v1';
const LEGACY_KNIFE_SOURCE = 'nearest_battlefield_corpse';
const LEGACY_KNIFE_LOCATIONS = ['scene_held', 'on_ground', 'at_corpse'] as const;

type StorageLike = { getItem(key: string): string | null };
type LegacyKnifeLocation = (typeof LEGACY_KNIFE_LOCATIONS)[number];
type StoredKnifeSource = typeof FAST_NARRATIVE_DEMO_KNIFE_SOURCE | typeof LEGACY_KNIFE_SOURCE;

export type FastNarrativeDemoKnifeSource = typeof FAST_NARRATIVE_DEMO_KNIFE_SOURCE;
/** Legacy experimental locations; read for migration only, never written back. */
export type FastNarrativeDemoKnifeLocation = LegacyKnifeLocation;

export interface FastNarrativeDemoSceneFact {
  id: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  kind: 'grounded_scene_item';
  itemName: '短刀';
  quality: '凡品';
  source: StoredKnifeSource;
  sourceText: string;
  establishedByJudgementId: string;
}

export interface FastNarrativeDemoActionReceipt {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  acquired?: boolean;
  knifeLocation?: LegacyKnifeLocation;
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
    acquired: boolean;
    lastJudgementId: string;
  } | null;
  terminalBoundaries: Array<{
    eventId: typeof FAST_NARRATIVE_DEMO_FIXED_TERMINAL_EVENT_ID;
    policy: 'fixed_terminal';
  }>;
}

export interface FastNarrativeDemoAdjudicationView {
  itemName: '短刀';
  source: FastNarrativeDemoKnifeSource;
  sourceText: string;
  acquired: boolean;
  judgementId: string;
  processBoundary: typeof FAST_NARRATIVE_DEMO_TERMINAL_PROJECTION;
}

export interface FastNarrativeDemoSettlementResult {
  applied: boolean;
  reason: 'applied' | 'already_settled' | 'feature_disabled' | 'ineligible_save' | 'unmatched_action' | 'unverified_resolution';
  view: FastNarrativeDemoAdjudicationView | null;
}

const DEMO_ACTION_RE = /尸体[\s\S]{0,20}(?:短刀|刀)[\s\S]{0,30}(?:翻滚|躲开|避开)[\s\S]{0,16}箭|(?:抢下|夺下|抽出)[\s\S]{0,12}(?:短刀|刀)[\s\S]{0,30}(?:翻滚|躲开|避开)[\s\S]{0,16}箭/;
const VALID_OUTCOMES = new Set<JudgementOutcome>([
  'critical_failure', 'failure', 'partial', 'success', 'great_success', 'perfect',
]);
const LEGACY_LOCATION_SET = new Set<string>(LEGACY_KNIFE_LOCATIONS);

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
    const raw = source?.getItem(FAST_NARRATIVE_DEMO_STORAGE_KEY);
    if (raw == null || raw === '') return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

export function acquiredForFastNarrativeDemoOutcome(outcome: unknown): boolean | null {
  if (typeof outcome !== 'string' || !VALID_OUTCOMES.has(outcome as JudgementOutcome)) return null;
  return outcome === 'perfect' || outcome === 'great_success' || outcome === 'success';
}

function acquiredFromLegacyLocation(location: unknown): boolean | null {
  if (location === 'scene_held') return true;
  if (location === 'on_ground' || location === 'at_corpse') return false;
  return null;
}

function canonicalKnifeSource(value: unknown): StoredKnifeSource | null {
  if (value === FAST_NARRATIVE_DEMO_KNIFE_SOURCE || value === LEGACY_KNIFE_SOURCE) return value;
  return null;
}

function receiptAcquired(receipt: FastNarrativeDemoActionReceipt): boolean | null {
  if (typeof receipt.acquired === 'boolean') {
    if (receipt.knifeLocation != null) {
      const fromLocation = acquiredFromLegacyLocation(receipt.knifeLocation);
      if (fromLocation !== receipt.acquired) return null;
    }
    return receipt.acquired;
  }
  return acquiredFromLegacyLocation(receipt.knifeLocation);
}

function newReceiptVerificationSource(receipt: {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  acquired: boolean;
  sceneFactId: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  settledAtTurn: number;
}): string {
  return [
    RECEIPT_VERIFICATION_DOMAIN,
    receipt.judgementId,
    receipt.actionHash,
    receipt.outcome,
    receipt.acquired ? 'acquired=true' : 'acquired=false',
    receipt.sceneFactId,
    String(receipt.settledAtTurn),
  ].join('|');
}

function legacyReceiptVerificationSource(receipt: {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  knifeLocation: LegacyKnifeLocation;
  sceneFactId: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  settledAtTurn: number;
}): string {
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

function hashNewActionReceipt(receipt: {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  acquired: boolean;
  sceneFactId: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  settledAtTurn: number;
}): string {
  return hashJudgementAction(newReceiptVerificationSource(receipt));
}

function hashLegacyActionReceipt(receipt: {
  judgementId: string;
  actionHash: string;
  outcome: JudgementOutcome;
  knifeLocation: LegacyKnifeLocation;
  sceneFactId: typeof FAST_NARRATIVE_DEMO_KNIFE_FACT_ID;
  settledAtTurn: number;
}): string {
  return hashJudgementAction(legacyReceiptVerificationSource(receipt));
}

function isIntactSceneReceipt(
  fact: FastNarrativeDemoSceneFact,
  knife: NonNullable<FastNarrativeDemoAdjudicationState['knife']>,
  receipt: FastNarrativeDemoActionReceipt,
): boolean {
  if (receipt.judgementId !== knife.lastJudgementId) return false;
  if (receipt.sceneFactId !== fact.id) return false;
  if (fact.establishedByJudgementId !== receipt.judgementId) return false;
  if (!normalizeText(receipt.verificationHash)) return false;
  const acquired = receiptAcquired(receipt);
  if (acquired !== knife.acquired) return false;

  if (typeof receipt.acquired === 'boolean') {
    return receipt.verificationHash === hashNewActionReceipt({
      judgementId: receipt.judgementId,
      actionHash: receipt.actionHash,
      outcome: receipt.outcome,
      acquired: receipt.acquired,
      sceneFactId: receipt.sceneFactId,
      settledAtTurn: receipt.settledAtTurn,
    });
  }
  if (receipt.knifeLocation && LEGACY_LOCATION_SET.has(receipt.knifeLocation)) {
    return receipt.verificationHash === hashLegacyActionReceipt({
      judgementId: receipt.judgementId,
      actionHash: receipt.actionHash,
      outcome: receipt.outcome,
      knifeLocation: receipt.knifeLocation,
      sceneFactId: receipt.sceneFactId,
      settledAtTurn: receipt.settledAtTurn,
    });
  }
  return false;
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
        && !!canonicalKnifeSource(value.source)
        && !!normalizeText(value.sourceText)
        && !!normalizeText(value.establishedByJudgementId);
    }).map((fact: unknown) => {
      const value = asRecord(fact)!;
      return {
        id: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
        kind: 'grounded_scene_item' as const,
        itemName: '短刀' as const,
        quality: '凡品' as const,
        source: canonicalKnifeSource(value.source) as StoredKnifeSource,
        sourceText: normalizeText(value.sourceText),
        establishedByJudgementId: normalizeText(value.establishedByJudgementId),
      } satisfies FastNarrativeDemoSceneFact;
    })
    : [];
  const actionReceipts = Array.isArray(raw.actionReceipts)
    ? raw.actionReceipts.flatMap((receipt: unknown) => {
      const value = asRecord(receipt);
      const settledAtTurn = Number(value?.settledAtTurn);
      const hasAcquired = typeof value?.acquired === 'boolean';
      const hasLegacyLocation = LEGACY_LOCATION_SET.has(value?.knifeLocation);
      if (
        !normalizeText(value?.judgementId)
        || !normalizeText(value?.actionHash)
        || !VALID_OUTCOMES.has(value?.outcome)
        || (!hasAcquired && !hasLegacyLocation)
        || value?.sceneFactId !== FAST_NARRATIVE_DEMO_KNIFE_FACT_ID
        || !Number.isFinite(settledAtTurn)
        || !normalizeText(value?.verificationHash)
      ) return [];
      const parsed: FastNarrativeDemoActionReceipt = {
        judgementId: normalizeText(value.judgementId),
        actionHash: normalizeText(value.actionHash),
        outcome: value.outcome as JudgementOutcome,
        sceneFactId: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
        settledAtTurn,
        verificationHash: normalizeText(value.verificationHash),
      };
      if (hasAcquired) parsed.acquired = value.acquired as boolean;
      if (hasLegacyLocation) parsed.knifeLocation = value.knifeLocation as LegacyKnifeLocation;
      if (receiptAcquired(parsed) == null) return [];
      return [parsed];
    })
    : [];
  const rawKnife = asRecord(raw.knife);
  let knife: FastNarrativeDemoAdjudicationState['knife'] = null;
  if (rawKnife?.itemName === '短刀' && !!normalizeText(rawKnife.lastJudgementId)) {
    if (typeof rawKnife.acquired === 'boolean') {
      knife = {
        itemName: '短刀',
        acquired: rawKnife.acquired,
        lastJudgementId: normalizeText(rawKnife.lastJudgementId),
      };
    } else {
      const acquired = acquiredFromLegacyLocation(rawKnife.location);
      if (acquired != null) {
        knife = {
          itemName: '短刀',
          acquired,
          lastJudgementId: normalizeText(rawKnife.lastJudgementId),
        };
      }
    }
  }

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

function persistReceipt(receipt: FastNarrativeDemoActionReceipt): FastNarrativeDemoActionReceipt {
  const acquired = receiptAcquired(receipt);
  if (typeof receipt.acquired === 'boolean' && receipt.knifeLocation == null && acquired != null) {
    return {
      judgementId: receipt.judgementId,
      actionHash: receipt.actionHash,
      outcome: receipt.outcome,
      acquired,
      sceneFactId: receipt.sceneFactId,
      settledAtTurn: receipt.settledAtTurn,
      verificationHash: receipt.verificationHash,
    };
  }
  return {
    judgementId: receipt.judgementId,
    actionHash: receipt.actionHash,
    outcome: receipt.outcome,
    ...(receipt.knifeLocation ? { knifeLocation: receipt.knifeLocation } : {}),
    ...(typeof receipt.acquired === 'boolean' ? { acquired: receipt.acquired } : {}),
    sceneFactId: receipt.sceneFactId,
    settledAtTurn: receipt.settledAtTurn,
    verificationHash: receipt.verificationHash,
  };
}

function writeState(saveData: unknown, state: FastNarrativeDemoAdjudicationState): void {
  const root = asRecord(saveData);
  const marker = asRecord(root?.系统?.扩展?.[QINGYU_OPENING_PLAYTEST_EXTENSION_KEY]);
  if (!marker) throw new Error('清羽 Demo marker 不存在，不能写入判定回执');
  marker.adjudication = {
    version: 1,
    sceneFacts: state.sceneFacts.map(fact => ({
      ...fact,
      source: canonicalKnifeSource(fact.source) === LEGACY_KNIFE_SOURCE
        ? LEGACY_KNIFE_SOURCE
        : FAST_NARRATIVE_DEMO_KNIFE_SOURCE,
    })),
    actionReceipts: state.actionReceipts.map(persistReceipt),
    knife: state.knife
      ? {
        itemName: '短刀' as const,
        acquired: state.knife.acquired,
        lastJudgementId: state.knife.lastJudgementId,
      }
      : null,
    terminalBoundaries: state.terminalBoundaries,
  };
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
    source: FAST_NARRATIVE_DEMO_KNIFE_SOURCE,
    sourceText: fact.sourceText,
    acquired: knife.acquired,
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

  const acquired = acquiredForFastNarrativeDemoOutcome(resolution.outcome);
  if (acquired == null) {
    return { applied: false, reason: 'unverified_resolution', view: readFastNarrativeDemoAdjudicationView(saveData) };
  }
  if (!state.sceneFacts.some(fact => fact.id === FAST_NARRATIVE_DEMO_KNIFE_FACT_ID)) {
    state.sceneFacts.push({
      id: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
      kind: 'grounded_scene_item',
      itemName: '短刀',
      quality: '凡品',
      source: FAST_NARRATIVE_DEMO_KNIFE_SOURCE,
      sourceText: '最近的战场尸体僵硬的手指间原本握着一把凡品短刀。',
      establishedByJudgementId: resolution.id,
    });
  }
  const actionReceipt: Parameters<typeof hashNewActionReceipt>[0] = {
    judgementId: resolution.id,
    actionHash: resolution.actionHash,
    outcome: resolution.outcome as JudgementOutcome,
    acquired,
    sceneFactId: FAST_NARRATIVE_DEMO_KNIFE_FACT_ID,
    settledAtTurn: resolution.resolvedAtTurn,
  };
  state.actionReceipts.push({
    ...actionReceipt,
    verificationHash: hashNewActionReceipt(actionReceipt),
  });
  state.knife = { itemName: '短刀', acquired, lastJudgementId: resolution.id };
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
  if (!view?.acquired || !EXPLICIT_SHORT_KNIFE_USE_RE.test(normalizeText(actionText))) return null;
  return { label: '现场物品·凡品短刀', value: 3, source: 'item' };
}
