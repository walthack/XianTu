import type { SaveData } from '@/types/game';

import type {
  ScenarioCondition,
  ScenarioFlagValue,
  ScenarioMod,
  ScenarioModChapter,
  ScenarioModEvent,
  ScenarioModItem,
  ScenarioNarrativeFactReceipt,
  ScenarioNpcDecisionActor,
  ScenarioNpcMemoryEpisode,
  ScenarioNpcPrivateKnowledgeFact,
  ScenarioEventActionJudgement,
  ScenarioPlayerCompletionContract,
  ScenarioPlayerCompletionEffects,
  ScenarioPlayerCompletionOutcome,
  ScenarioPlayerKnowledgeFact,
  ScenarioPathReceipt,
  ScenarioStoryOpportunity,
  ScenarioStoryMode,
  ScenarioWorldSimulation,
} from './schema';
import {
  applyNpcDecisionEffectsWithAudit,
  applyNpcDecisionActorState,
  decideNpcActions,
  npcDecisionConfigHash,
  selectVisibleNpcDecisionIds,
  type NpcDecisionReceipt,
  type NpcWakeAudit,
  type NpcWakeContext,
  type RejectedNpcDecisionEffect,
} from './npcDecisionCore';
import { AFFINITY_THRESHOLDS } from './affinityLadder';
import { syncAcquaintanceLedger, type AcquaintanceLedger } from './acquaintanceLedger';
import {
  AFFINITY_EVENT_GRANT,
  clampAffinity,
  gameDayOf,
  projectStance,
  type StanceState,
} from './affinityLadder';
import { affinityCapFor } from './affinityCaps';
import { REPUTATION_EVENT_GRANT, type ReputationGrant } from './reputationLedger';
import { lineCriticalFrozen, resolveLocationIdFromPosition } from './secondaryLines';
import { recordOffscreenDivergence, recordReconcileDivergences, type ScenarioDivergence } from './divergenceLedger';
import type { JudgementOutcome, JudgementResolution } from '@/utils/judgementEngine';
import { getCanonRailOrder, getCanonRailProfile, isCanonRailChapter, type CanonRailProfile } from './canonRail';
import { updateDivergenceControl, type DivergenceSignal, type WorldPushState } from './divergenceControl';
import {
  deliverDueWorldOmens,
  getWorldSimulationFocusEvent,
  type WorldSimulationRuntimeState,
} from './worldSimulation';
import {
  settleScenarioInventoryTransfers,
  type ScenarioInventorySettlement,
  type ScenarioInventoryTransferReceipt,
} from './inventoryTransactions';
import { resolveFixedQuestObjective } from './fixedQuestObjectives';
import { formatQuestCompass, questCompassPhrases } from './eventNarrativeView';
import { departedPresentNames, stampDepartedCast } from './presence';


export interface ScenarioProgressState {
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  completedChapterIds: string[];
  activeEventIds: string[];
  completedEventIds: string[];
  /**
   * 已结算共历好感的事件（R3-9 §7）。**字段存在与否有语义**：
   * 不存在＝旧档，首次推进时只登记不补发；空数组＝新档，从第一个事件起正常给分。
   */
  affinityGrantedEventIds?: string[];
  /** 主角尚不自知的自身设定（从模组带入，storyContext 据此下禁令）。 */
  undisclosedSelfFacts?: Array<{ fact: string; untilEventId: string; disclosedBy?: string }>;
  playerKnowledge?: Record<string, ScenarioPlayerKnowledgeFact>;
  pathReceipts?: Record<string, ScenarioPathReceipt>;
  npcPrivateKnowledge?: Record<string, ScenarioNpcPrivateKnowledgeFact>;
  /** 本地物品交易回执；transferId 去重，且随关卡继承。 */
  inventoryTransferReceipts?: ScenarioInventoryTransferReceipt[];
}

export interface ScenarioRuntimeTransition {
  /** `fatal_approach` 用 detail 携带本轮的可观察事实；其余类型不带。 */
  detail?: string;
  type: 'chapter_activated' | 'chapter_completed' | 'event_activated' | 'event_completed' | 'event_revealed' | 'event_omen' | 'stage_ready' | 'world_event_resolved' | 'fatal_approach' | 'game_over';
  id: string;
}

export interface ScenarioChronicleEntry {
  id: string;
  type: 'event' | 'world' | 'stage';
  stageId: string;
  title: string;
  detail?: string;
  sequence: number;
}

export interface ScenarioActorReceipt {
  id: string;
  anchorEventId: string;
  opportunityId?: string;
  title: string;
  detail: string;
  outcome: 'participated' | 'partial' | 'offscreen';
  resolvedAtTurn: number;
}

export interface ScenarioActorEntitlement {
  key: string;
  label: string;
  sourceOpportunityId: string;
  earnedAtTurn: number;
}

export interface ScenarioActorMemory {
  relationships: Record<string, Record<string, number>>;
  knowledge: string[];
  episodes: ScenarioNpcMemoryEpisode[];
  /**
   * 下列运行时字段所属的锚点事件。跨事件只继承态度、知识与经历（R2-10C 合同），
   * 换锚点后一律回落 core 初值；只有同锚点重建（配置迁移、npcStates 丢失）才承接。
   */
  runtimeAnchorEventId?: string;
  /** 已消耗的资源余额；缺省表示旧档，回落 core 声明的初值。 */
  resources?: Record<string, number>;
  /** 剩余冷却轮数；败方一轮内不得重赛的唯一刹车，必须跨配置迁移承接。 */
  actionCooldowns?: Record<string, number>;
  /** 在途的多回合行动；迁移后若绑定已消失则显式作废，不得留僵尸。 */
  activeAction?: { actionId: string; remainingTurns: number; score: number };
  /** 议程时钟按 agenda.id 存，避免配置增删议程后按下标错位。 */
  agendaClocks?: Record<string, number>;
  updatedAtTurn: number;
}

export interface ScenarioOpportunityState {
  status: 'available' | 'tracked' | 'expired' | 'participated' | 'partial' | 'offscreen';
  surfacedAtTurn: number;
  trackedAtTurn?: number;
  resolvedAtTurn?: number;
  /** 确定性亲历合同已完成的 step 数；每个成功玩家回合最多 +1。 */
  completionStepIndex?: number;
  /** 防止同一回合/同一动作因重试或重复调用推进多步。 */
  lastCompletionActionKey?: string;
  /** 一轮内即使以不同文本重复调用，也只能有一次有效进度。 */
  lastCompletionProgressAtTurn?: number;
  /** 全部 step 满足后，由 advanceScenarioRuntime 消费并写事件 done。 */
  completionReadyAtTurn?: number;
  /** 合同热更审计键；变化时旧步骤进度不能套到新合同。 */
  completionContractHash?: string;
  /** 每一步实际选择的结构化动作；供后续态度、局势与编年史确定性消费。 */
  completionChoices?: Record<string, string>;
}

export interface ScenarioOpportunityActionSelection {
  source: 'opportunity_engine';
  opportunityId: string;
  stepId: string;
  actionId: string;
  label: string;
  actionText: string;
  timeCost: 1;
  contractHash: string;
}

export interface ScenarioEventActionAttempt {
  actionId: string;
  outcome: ScenarioPlayerCompletionOutcome;
  attemptedAtTurn: number;
  detail: string;
  /** 本次本地动作与 outcome 精确匹配的事实快照；合同／模组热更后也不反推改写。 */
  factReceipts?: ScenarioNarrativeFactReceipt[];
}

export interface ScenarioEventActionState {
  contractHash: string;
  lastAttemptAtTurn?: number;
  lastOutcome?: ScenarioPlayerCompletionOutcome;
  readyAtTurn?: number;
  /** 不因审计数组截断而回退的尝试序号。 */
  attemptCount?: number;
  /** 仅在当前事件合同内有效；合同热更或换事件不会继承。 */
  preparations?: string[];
  attempts: ScenarioEventActionAttempt[];
}

export interface ScenarioEventActionSelection {
  source: 'event_engine' | 'exploration_engine';
  eventId: string;
  actionId: string;
  label: string;
  actionText: string;
  /** 玩家看到并可编辑的自然句；本地判定仍校验 actionText。 */
  playerLine: string;
  timeCost: 1;
  contractHash: string;
  expectedOutcome: ScenarioPlayerCompletionOutcome;
  outcomeText: string;
  remainingTurns?: number;
  /** 纯展示层派生；不进入 completion contract 或 contractHash。 */
  interaction: ScenarioInteractionAffordance;
  stepIndex?: number;
  stepTotal?: number;
  judgement?: ScenarioEventActionJudgement;
}

export type ScenarioInteractionVerb = 'observe' | 'talk' | 'act' | 'use' | 'rest' | 'move' | 'attack';

export interface ScenarioInteractionAffordance {
  verb: ScenarioInteractionVerb;
  targetLabel?: string;
  targetId?: string;
}

export interface ScenarioContractStep {
  eventId: string;
  index: number;
  total: number;
  action: {
    id: string;
    label: string;
    actionText: string;
  };
  remainingLabels: string[];
  reservedFutureTerms: string[];
  sequential: boolean;
}

export interface ScenarioStageDepartureOffer {
  nextStageId: string;
  label: string;
}

export interface ScenarioStageEntryPresentation {
  fromStageId: string;
  fromStageName?: string;
  toStageId: string;
  toStageName?: string;
  enteredAtTurn: number;
  /** 只取目标关 opening；不从旧正文或 LLM 反推新事实。 */
  text: string;
}

export interface ScenarioEventTimelineState {
  eligibleAtTurn: number;
  activatedAtTurn?: number;
  occurredAtTurn?: number;
  publiclyRevealedAtTurn?: number;
  playerLearnedAtTurn?: number;
  outcome?: 'participated' | 'offscreen';
}

export interface ScenarioActorEngineState {
  anchorEventId?: string;
  pressureId?: string;
  activeAgendaId?: string;
  surfacedAgendaIds: string[];
  trackedOpportunityId?: string;
  trackedAtTurn?: number;
  opportunityStates?: Record<string, ScenarioOpportunityState>;
  lastHandledWorldPushTurn?: number;
  /** R2-10B 确定性人物决策；候选评分回执可重放、可审计。 */
  decisionInputHash?: string;
  decisionConfigHash?: string;
  decisions?: NpcDecisionReceipt[];
  visibleDecisionIds?: string[];
  /** 本轮每名 actor 的唤醒/休眠原因；用于预算审计，不进入叙事真值。 */
  wakeAudit?: NpcWakeAudit[];
  situationValues?: Record<string, number>;
  npcStates?: ScenarioNpcDecisionActor[];
  decisionRound?: number;
  /** 旧档携带越界 effect 时的可审计降级记录；不得让回执与实际落账静默分叉。 */
  effectAudit?: Array<RejectedNpcDecisionEffect & { detectedAtTurn: number }>;
  /** 决策配置热更导致 round-0 重建时保留旧/新哈希，避免局势回滚无迹可查。 */
  configMigrations?: Array<{
    anchorEventId: string;
    fromHash: string;
    toHash: string;
    migratedAtTurn: number;
  }>;
  /** 跨事件保留承重 NPC 的态度与已知事实；资源仍由每个事件局部配置。 */
  actorMemory?: Record<string, ScenarioActorMemory>;
  receipts: ScenarioActorReceipt[];
  entitlements: ScenarioActorEntitlement[];
}

export interface RuntimeState extends ScenarioProgressState {
  modId?: string;
  currentChapterId: string | null;
  flags: Record<string, ScenarioFlagValue>;
  /** 缺省视为 canon_companion；world_sim 只由新档初始化显式写入。 */
  storyMode?: ScenarioStoryMode;
  worldSimulation?: ScenarioWorldSimulation;
  worldSimulationState?: WorldSimulationRuntimeState;
  nextStageId?: string | null;
  nextStageReadyId?: string | null;
  /** 剧情停滞轮数：连续多少轮无事件/章节推进（供收束提示分档），推进即清零 */
  stallTurns?: number;
  /** 本局已结束（玩家走进绝路）。置上之后引擎不再推进任何进度。 */
  gameOver?: { endingId: string; title: string; facts: string[]; sourceEventId: string; atTurn: number };
  /** 已送达过的逼近提示，防同一轮/重载重复送。 */
  fatalApproachDelivered?: string[];
  /**
   * 本轮该由正文演出的逼近事实。只演出、不预告结局；非本轮的自动清掉。
   *
   * ⚠ `texts` 是数组不是单值：同一回合可能有多个配了 pressure 的拍同时在逼近，
   * 早先写成单值时**后写覆盖先写，另一条静默丢失**（2026-08-20 评审时发现）。
   */
  pendingFatalApproach?: { texts: string[]; atTurn: number };
  /** 配了 `pressure` 的拍**第一次激活**的世界回合。锚在事件上，不随全局 stall 归零。 */
  pressureStartedAt?: Record<string, number>;
  /** 回主线引子偏移冷却：玩家主动偏移主线时置 N，引擎逐轮递减、期间暂停 stall 并静默引子。
   *  存于 runtime(世界.状态.剧本模组)——引擎专属字段，canonGuard 保护、LLM 命令写不到。 */
  steeringCooldown?: number;
  /** 玩家造成的世界线差异；本地对账引擎独占写入，LLM 只读。 */
  divergences?: ScenarioDivergence[];
  /** 已离场角色名。玩家历史，切关必须继承——死亡事件 flag 不随关卡模板带走。 */
  departedCast?: string[];
  /** 场外世界事件已结算的原事件；与 completedEventIds 分离，防止把玩家未参与的原著拍伪记为完成。 */
  offscreenResolvedEventIds?: string[];
  /** 本轮强制按在场合同结算的世界事件；消费即清，不改时钟。 */
  forcedWorldEventIds?: string[];
  /** 玩家可回看的战役编年史；只记已结算事实，跨关继承。 */
  chronicle?: ScenarioChronicleEntry[];
  /** 玩家认知与世界真值、NPC 知识分账；旧档可缺省。 */
  playerKnowledge?: Record<string, ScenarioPlayerKnowledgeFact>;
  /** 身份/立场/方法等路径选择；只影响后续叙事消费，不改正典事件完成条件。 */
  pathReceipts?: Record<string, ScenarioPathReceipt>;
  /** 密档知情图谱；不进普通关系网，且必须从通用 prompt state 剥离。 */
  npcPrivateKnowledge?: Record<string, ScenarioNpcPrivateKnowledgeFact>;
  /** 非机会卡事件的本地尝试、判定与完成状态。 */
  eventActionStates?: Record<string, ScenarioEventActionState>;
  /** 事件激活时所在地点。用于「走到目标地点才推进」，同地激活的拍不会因人已在场而立刻结清。 */
  eventActivatedAtLocation?: Record<string, string>;
  canon?: {
    characters?: Array<{ id: string; name: string; profile?: { memories?: string[] } }>;
    factions?: Array<{ id: string; name: string }>;
    /** 运行时一直带着（`storyContext` 在读），此前类型漏声明。 */
    locations?: Array<{ id: string; name: string }>;
    items?: ScenarioModItem[];
  };
  opening?: { text: string; playerCharacterId?: string };
  /** 旧档 reconcile 版本戳：与 registry 版本一致则跳过（正典更新后旧档第一回合自动对齐） */
  reconciledRegistryVersion?: string;
  /** R2-9 可复算偏离信号；只驱动提示/UI，不直接裁定剧情事实。 */
  divergenceSignal?: DivergenceSignal;
  /** 世界每 2-3 回合取得一次行动权；失败/低张力可加权。 */
  worldTurn?: number;
  worldPush?: WorldPushState;
  lastWorldPushJudgementId?: string;
  /** 世界演员纵切状态；合同来自事件，存档只保留调度、追踪和一次性回执。 */
  actorEngine?: ScenarioActorEngineState;
  /** 数据驱动的事件时钟；发生、公开、玩家获知分别留痕。 */
  eventTimeline?: Record<string, ScenarioEventTimelineState>;
  /** 玩家主动斩线后的单次桥接合同。 */
  returnBridge?: {
    anchorEventId: string;
    anchorObjective: string;
    branchSummary: string;
    requestedAtTurn: number;
  };
  /**
   * 确定性切关后的主阅读面落点。首个新关 AI 正文成功落账前持续存在，
   * 只负责避免“旧关正文 + 新关任务”的错层，不参与事件完成或世界真值写入。
   */
  stageEntryPresentation?: ScenarioStageEntryPresentation;
  /** 玩家亲历的上一拍；只为下一轮叙事过渡，不参与事件激活或完成门控。 */
  lastSettledBeat?: {
    eventId: string;
    settledAtTurn: number;
    /** 完成上一拍后由引擎确定的下一拍；只用于承接身份，不参与激活。 */
    targetEventId?: string;
    /** 首个余波回合已经呈现；按钮可恢复，但承接身份保留到目标动作触发。 */
    bridgedAtTurn?: number;
    /** 完成动作当时由引擎快照的精确事实；只供下一拍渲染，不参与完成判定。 */
    factReceipts?: ScenarioNarrativeFactReceipt[];
  };
}

export function createInitialPlayerKnowledge(
  mod: ScenarioMod,
): Record<string, ScenarioPlayerKnowledgeFact> {
  return Object.fromEntries((mod.scenario.initialPlayerKnowledge || []).map(fact => [
    fact.factId,
    { ...structuredClone(fact), learnedAtTurn: 0 },
  ]));
}

export function createInitialNpcPrivateKnowledge(
  mod: ScenarioMod,
): Record<string, ScenarioNpcPrivateKnowledgeFact> {
  return Object.fromEntries((mod.scenario.initialNpcPrivateKnowledge || []).map(fact => [
    fact.factId,
    {
      ...structuredClone(fact),
      learnedAtTurn: 0,
      sourceStageId: mod.manifest.id,
    },
  ]));
}

function syncNpcPrivateKnowledgeUnlocks(runtime: RuntimeState): void {
  const completed = new Set(runtime.completedEventIds || []);
  for (const fact of Object.values(runtime.npcPrivateKnowledge || {})) {
    if (!fact.unlockAfterEventId || fact.unlockedAtTurn !== undefined) continue;
    if (completed.has(fact.unlockAfterEventId)) {
      fact.unlockedAtTurn = Math.max(0, Number(runtime.worldTurn) || 0);
    }
  }
}

function ensureActorEngine(runtime: RuntimeState): ScenarioActorEngineState {
  const state = runtime.actorEngine || {
    surfacedAgendaIds: [],
    receipts: [],
    entitlements: [],
  };
  state.surfacedAgendaIds = Array.isArray(state.surfacedAgendaIds) ? state.surfacedAgendaIds : [];
  state.receipts = Array.isArray(state.receipts) ? state.receipts : [];
  state.entitlements = Array.isArray(state.entitlements) ? state.entitlements : [];
  state.effectAudit = Array.isArray(state.effectAudit) ? state.effectAudit : [];
  state.configMigrations = Array.isArray(state.configMigrations) ? state.configMigrations : [];
  state.actorMemory = state.actorMemory && typeof state.actorMemory === 'object'
    ? state.actorMemory
    : {};
  state.opportunityStates = state.opportunityStates && typeof state.opportunityStates === 'object'
    ? state.opportunityStates
    : {};
  runtime.actorEngine = state;
  return state;
}

function normalizeMemoryEpisodes(episodes: ScenarioNpcMemoryEpisode[]): ScenarioNpcMemoryEpisode[] {
  return structuredClone(episodes)
    .sort((a, b) => b.salience - a.salience || b.occurredAtTurn - a.occurredAtTurn || (a.id < b.id ? -1 : 1))
    .slice(0, 12)
    .sort((a, b) => a.occurredAtTurn - b.occurredAtTurn || (a.id < b.id ? -1 : 1));
}

/** 键序参与 inputHash，落档前统一排序，避免内存对象与 JSON 重载对象产生不同哈希。 */
function sortedNumberMap(source: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(source || {})
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
}

function persistNpcMemory(runtime: RuntimeState, state: ScenarioActorEngineState): void {
  if (!state.npcStates?.length) return;
  const memory = state.actorMemory ||= {};
  for (const actor of state.npcStates) {
    memory[actor.characterId] = {
      relationships: structuredClone(actor.relationships),
      knowledge: [...new Set(actor.knowledge)].sort(),
      episodes: normalizeMemoryEpisodes(actor.memories || []),
      ...(state.anchorEventId ? { runtimeAnchorEventId: state.anchorEventId } : {}),
      resources: sortedNumberMap(actor.resources),
      actionCooldowns: sortedNumberMap(actor.actionCooldowns),
      ...(actor.activeAction ? { activeAction: structuredClone(actor.activeAction) } : {}),
      agendaClocks: sortedNumberMap(
        Object.fromEntries(actor.agendas.map(agenda => [agenda.id, agenda.clock])),
      ),
      updatedAtTurn: settledTurn(runtime),
    };
  }
}

function hydrateNpcActors(
  core: NonNullable<ScenarioModEvent['worldActor']>['decisionCore'],
  memory: Record<string, ScenarioActorMemory> | undefined,
  anchorEventId: string | undefined,
): ScenarioNpcDecisionActor[] {
  if (!core) return [];
  const declaredKnowledge = core.knowledgeFacts ? new Set(Object.keys(core.knowledgeFacts)) : undefined;
  return structuredClone(core.actors).map(actor => {
    const remembered = memory?.[actor.characterId];
    if (!remembered) return actor;
    for (const [targetId, dimensions] of Object.entries(remembered.relationships)) {
      actor.relationships[targetId] = {
        ...(actor.relationships[targetId] || {}),
        ...structuredClone(dimensions),
      };
    }
    actor.knowledge = [...new Set([
      ...actor.knowledge,
      ...remembered.knowledge.filter(factId => !declaredKnowledge || declaredKnowledge.has(factId)),
    ])].sort();
    actor.memories = normalizeMemoryEpisodes(remembered.episodes || []);
    // 换锚点即换合同：资源、冷却、议程时钟与在途行动都属于上一个事件，不得跨事件生效。
    if (!anchorEventId || remembered.runtimeAnchorEventId !== anchorEventId) return actor;
    for (const [key, value] of Object.entries(remembered.resources || {})) {
      if (!(key in actor.resources)) continue;
      actor.resources[key as keyof typeof actor.resources] = Math.max(0, value);
    }
    const cooldowns = sortedNumberMap(remembered.actionCooldowns);
    actor.actionCooldowns = Object.fromEntries(
      Object.entries(cooldowns).filter(([, turns]) => turns > 0),
    );
    for (const agenda of actor.agendas) {
      const clock = remembered.agendaClocks?.[agenda.id];
      if (typeof clock !== 'number') continue;
      agenda.clock = Math.min(agenda.escalation.length, Math.max(0, clock));
    }
    // 配置迁移可能删掉或改写绑定；在途行动一旦失去合同就必须显式作废并落冷却，
    // 否则 decideNpcActions 找不到绑定会静默改选新行动，留下永不消解的僵尸 activeAction。
    const resumed = remembered.activeAction;
    const bindingStillValid = resumed
      && actor.allowedActionIds.includes(resumed.actionId)
      && core.actionBindings.some(binding =>
        binding.actionId === resumed.actionId
        && (!binding.actorIds?.length || binding.actorIds.includes(actor.characterId)));
    if (resumed && bindingStillValid && resumed.remainingTurns > 0) {
      actor.activeAction = structuredClone(resumed);
    } else if (resumed) {
      actor.activeAction = undefined;
      actor.actionCooldowns[resumed.actionId] = 1;
    }
    return actor;
  });
}

function addNpcMemoryEpisodes(
  state: ScenarioActorEngineState,
  actorIds: string[],
  episode: ScenarioNpcMemoryEpisode,
): void {
  const memory = state.actorMemory ||= {};
  for (const actorId of actorIds) {
    const current = memory[actorId] ||= {
      relationships: {},
      knowledge: [],
      episodes: [],
      updatedAtTurn: episode.occurredAtTurn,
    };
    const episodes = Array.isArray(current.episodes) ? current.episodes : [];
    if (!episodes.some(item => item.id === episode.id)) episodes.push(structuredClone(episode));
    current.episodes = normalizeMemoryEpisodes(episodes);
    current.updatedAtTurn = episode.occurredAtTurn;
  }
}

function findOpportunity(event: ScenarioModEvent | undefined, opportunityId: string | undefined): ScenarioStoryOpportunity | undefined {
  if (!event?.worldActor || !opportunityId) return undefined;
  return event.worldActor.opportunities.find(item => item.id === opportunityId);
}

function settledTurn(runtime: RuntimeState): number {
  // divergenceControl 在回合开头先递增 worldTurn；回执记“刚结算完成的回合”，
  // 而 trackedAtTurn 记“玩家开始追踪时的当前回合”，两者纪年语义不同。
  return Math.max(0, (Number(runtime.worldTurn) || 0) - 1);
}

function opportunityTriggered(
  opportunity: ScenarioStoryOpportunity,
  state: ScenarioActorEngineState,
): boolean {
  const trigger = opportunity.trigger;
  if (!trigger) return true;
  const decisions = state.decisions || [];
  const decisionMatch = decisions.some(decision =>
    (!trigger.actorIds?.length || trigger.actorIds.includes(decision.actorId))
    && (!trigger.actionIds?.length || trigger.actionIds.includes(decision.actionId)));
  if ((trigger.actorIds?.length || trigger.actionIds?.length) && !decisionMatch) return false;
  if (trigger.knowledgeFactIds?.length) {
    const known = new Set((state.npcStates || []).flatMap(actor => actor.knowledge));
    if (!trigger.knowledgeFactIds.every(factId => known.has(factId))) return false;
  }
  return true;
}

function refreshOpportunityStates(
  runtime: RuntimeState,
  event: ScenarioModEvent,
  state: ScenarioActorEngineState,
): void {
  const states = state.opportunityStates ||= {};
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  for (const opportunity of event.worldActor?.opportunities || []) {
    const current = states[opportunity.id];
    if (!current && opportunityTriggered(opportunity, state)) {
      states[opportunity.id] = { status: 'available', surfacedAtTurn: turn };
      continue;
    }
    const persistent = opportunity.completionContract?.expiry === 'persistent';
    const trackedExpired = !persistent && current?.trackedAtTurn !== undefined
      && turn - current.trackedAtTurn >= TRACKED_OPPORTUNITY_MAX_TURNS;
    const untrackedExpired = !persistent && current?.status === 'available'
      && current.trackedAtTurn === undefined
      && opportunity.expiresAfterTurns !== undefined
      && turn - current.surfacedAtTurn >= opportunity.expiresAfterTurns;
    if (
      current
      && ['available', 'tracked'].includes(current.status)
      && (trackedExpired || untrackedExpired)
    ) {
      current.status = 'expired';
      current.resolvedAtTurn = turn;
      if (state.trackedOpportunityId === opportunity.id) {
        state.trackedOpportunityId = undefined;
        state.trackedAtTurn = undefined;
      }
    }
  }
}

function recordDecisionEpisodes(
  runtime: RuntimeState,
  state: ScenarioActorEngineState,
  eventId: string,
  decisions: NpcDecisionReceipt[],
): void {
  const turn = settledTurn(runtime);
  for (const decision of decisions) {
    if (!['instant', 'started'].includes(decision.phase)) continue;
    const episode: ScenarioNpcMemoryEpisode = {
      id: `memory.${eventId}.${state.decisionRound || 0}.${decision.actorId}.${decision.actionId}.${decision.outcome}`,
      eventId,
      summary: `${decision.label}（${decision.outcome}）`,
      tags: [
        `event:${eventId}`,
        `action:${decision.actionId}`,
        `outcome:${decision.outcome}`,
        ...(decision.conflict ? [`conflict:${decision.conflict.domain}`] : []),
      ],
      salience: decision.outcome === 'succeeded' ? 80 : decision.outcome === 'blocked' ? 60 : 65,
      occurredAtTurn: turn,
    };
    addNpcMemoryEpisodes(state, [decision.actorId], episode);
    const actor = state.npcStates?.find(item => item.characterId === decision.actorId);
    if (actor) actor.memories = structuredClone(state.actorMemory?.[decision.actorId]?.episodes || []);
  }
}

function hasPartialOpportunityProgress(
  state: ScenarioOpportunityState | undefined,
  opportunity: ScenarioStoryOpportunity | undefined,
): boolean {
  const completedSteps = Math.max(0, Number(state?.completionStepIndex) || 0);
  const totalSteps = opportunity?.completionContract?.steps.length || 0;
  return completedSteps > 0 && completedSteps < totalSteps && state?.completionReadyAtTurn === undefined;
}

function syncActorEngine(runtime: RuntimeState): void {
  const state = ensureActorEngine(runtime);
  const anchor = getScenarioFocusEvent(runtime);
  const previousAnchor = state.anchorEventId
    ? runtime.events.find(event => event.id === state.anchorEventId)
    : undefined;

  if (state.anchorEventId && state.anchorEventId !== anchor?.id) {
    persistNpcMemory(runtime, state);
    const offscreen = runtime.offscreenResolvedEventIds?.includes(state.anchorEventId);
    const trackedOpportunity = findOpportunity(previousAnchor, state.trackedOpportunityId);
    const partialOpportunity = offscreen
      ? previousAnchor?.worldActor?.opportunities.find(item =>
        hasPartialOpportunityProgress(state.opportunityStates?.[item.id], item))
      : undefined;
    const opportunity = trackedOpportunity || partialOpportunity;
    if (offscreen && !opportunity) {
      const receiptId = `actor.receipt.${state.anchorEventId}.offscreen`;
      if (!state.receipts.some(item => item.id === receiptId)) {
        state.receipts.push({
          id: receiptId,
          anchorEventId: state.anchorEventId,
          title: `世界已推进：${previousAnchor?.name || state.anchorEventId}`,
          detail: '该承重拍由世界场外推进；未伪记为玩家亲历，介入机会均已关闭且未授予权限。',
          outcome: 'offscreen',
          resolvedAtTurn: settledTurn(runtime),
        });
      }
    }
    if (opportunity) {
      const participated = runtime.completedEventIds.includes(state.anchorEventId);
      const opportunityState = state.opportunityStates?.[opportunity.id];
      const partial = Boolean(offscreen && !participated && hasPartialOpportunityProgress(opportunityState, opportunity));
      const resolution: ScenarioActorReceipt['outcome'] = participated
        ? 'participated'
        : partial ? 'partial' : 'offscreen';
      const receiptId = `actor.receipt.${state.anchorEventId}.${opportunity.id}.${resolution}`;
      if ((participated || offscreen) && !state.receipts.some(item => item.id === receiptId)) {
        state.receipts.push({
          id: receiptId,
          anchorEventId: state.anchorEventId,
          opportunityId: opportunity.id,
          title: participated
            ? `已兑现：${opportunity.title}`
            : partial ? `部分参与：${opportunity.title}` : `世界已推进：${opportunity.title}`,
          detail: participated
            ? `你亲历完成当前承重拍，获得行为权限：${opportunity.rewardLabel}`
            : partial
              ? `你完成了 ${Math.max(0, Number(opportunityState?.completionStepIndex) || 0)}/${opportunity.completionContract?.steps.length || 0} 个有效步骤；局部参与被保留，但完整权限未授予。`
              : '该机会随世界场外推进而关闭；未伪记为玩家亲历，也未授予权限。',
          outcome: resolution,
          resolvedAtTurn: settledTurn(runtime),
        });
      }
      if (participated && !state.entitlements.some(item => item.key === opportunity.rewardKey)) {
        state.entitlements.push({
          key: opportunity.rewardKey,
          label: opportunity.rewardLabel,
          sourceOpportunityId: opportunity.id,
          earnedAtTurn: settledTurn(runtime),
        });
      }
      if (opportunityState && (participated || offscreen)) {
        opportunityState.status = resolution;
        opportunityState.resolvedAtTurn = settledTurn(runtime);
      }
      if (participated || offscreen) {
        addNpcMemoryEpisodes(state, opportunity.characterIds, {
          id: `memory.${state.anchorEventId}.${opportunity.id}.${resolution}`,
          eventId: state.anchorEventId,
          summary: participated
            ? `玩家介入并兑现“${opportunity.title}”`
            : partial
              ? `玩家部分介入“${opportunity.title}”，其余由世界场外推进`
              : `玩家未介入，“${opportunity.title}”由世界场外推进`,
          tags: [
            `event:${state.anchorEventId}`,
            `opportunity:${opportunity.id}`,
            `player:${resolution}`,
          ],
          salience: participated ? 100 : partial ? 85 : 70,
          occurredAtTurn: settledTurn(runtime),
        });
      }
    }
    for (const item of previousAnchor?.worldActor?.opportunities || []) {
      const opportunityState = state.opportunityStates?.[item.id];
      if (opportunityState && ['available', 'tracked'].includes(opportunityState.status)) {
        opportunityState.status = offscreen ? 'offscreen' : 'expired';
        opportunityState.resolvedAtTurn = settledTurn(runtime);
      }
    }
    state.anchorEventId = undefined;
    state.pressureId = undefined;
    state.activeAgendaId = undefined;
    state.surfacedAgendaIds = [];
    state.trackedOpportunityId = undefined;
    state.trackedAtTurn = undefined;
    state.lastHandledWorldPushTurn = undefined;
    state.decisionInputHash = undefined;
    state.decisionConfigHash = undefined;
    state.decisions = undefined;
    state.visibleDecisionIds = undefined;
    state.wakeAudit = undefined;
    state.situationValues = undefined;
    state.npcStates = undefined;
    state.decisionRound = undefined;
  }

  const contract = anchor?.worldActor;
  if (!anchor || !contract) return;
  const wakeContext = (round: number, majorEvent = false): NpcWakeContext => {
    const tracked = findOpportunity(anchor, state.trackedOpportunityId);
    return {
      round,
      currentLocationId: anchor.locationId,
      presentCharacterIds: anchor.relatedCharacterIds,
      affectedFactionIds: [...new Set([
        ...(anchor.relatedFactionIds || []),
        ...(contract.pressure.factionIds || []),
      ])],
      namedCharacterIds: tracked?.characterIds,
      majorEvent,
    };
  };
  const configHash = contract.decisionCore ? npcDecisionConfigHash(contract.decisionCore) : undefined;
  if (
    state.anchorEventId === anchor.id
    && contract.decisionCore
    && state.decisionConfigHash !== configHash
  ) {
    persistNpcMemory(runtime, state);
    const fromHash = state.decisionConfigHash || 'legacy-unversioned';
    if (!state.configMigrations!.some(item =>
      item.anchorEventId === anchor.id && item.fromHash === fromHash && item.toHash === configHash
    )) {
      state.configMigrations!.push({
        anchorEventId: anchor.id,
        fromHash,
        toHash: configHash!,
        migratedAtTurn: Number(runtime.worldTurn) || 0,
      });
      if (state.configMigrations!.length > 20) state.configMigrations = state.configMigrations!.slice(-20);
      if (typeof console !== 'undefined' && console.info) {
        console.info(`[NPC Decision Core] config migrated ${fromHash} -> ${configHash}`);
      }
    }
    state.npcStates = hydrateNpcActors(contract.decisionCore, state.actorMemory, anchor.id);
    state.situationValues = { ...contract.decisionCore.situation.initialValues };
    const round = decideNpcActions(
      contract.decisionCore,
      state.situationValues,
      state.npcStates,
      wakeContext(0, true),
    );
    state.decisionInputHash = round.inputHash;
    state.decisionConfigHash = configHash;
    state.decisions = round.decisions;
    state.wakeAudit = round.wakeAudit;
    state.visibleDecisionIds = selectVisibleNpcDecisionIds(round.decisions, contract.decisionCore.maxVisibleActions);
    state.decisionRound = 0;
    state.lastHandledWorldPushTurn = undefined;
    refreshOpportunityStates(runtime, anchor, state);
  }
  if (state.anchorEventId !== anchor.id) {
    state.anchorEventId = anchor.id;
    state.pressureId = contract.pressure.id;
    state.activeAgendaId = contract.agendas?.[0]?.id;
    state.surfacedAgendaIds = state.activeAgendaId ? [state.activeAgendaId] : [];
    if (contract.decisionCore) {
      state.npcStates = hydrateNpcActors(contract.decisionCore, state.actorMemory, anchor.id);
      const round = decideNpcActions(
        contract.decisionCore,
        contract.decisionCore.situation.initialValues,
        state.npcStates,
        wakeContext(0, true),
      );
      state.decisionInputHash = round.inputHash;
      state.decisionConfigHash = configHash;
      state.decisions = round.decisions;
      state.wakeAudit = round.wakeAudit;
      state.visibleDecisionIds = selectVisibleNpcDecisionIds(round.decisions, contract.decisionCore.maxVisibleActions);
      state.situationValues = { ...contract.decisionCore.situation.initialValues };
      state.decisionRound = 0;
      state.activeAgendaId = undefined;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[NPC Decision Core]', round);
      }
      refreshOpportunityStates(runtime, anchor, state);
    }
  }
  const pushTurn = runtime.worldPush?.due ? runtime.worldPush.scheduledAtTurn : undefined;
  if (pushTurn !== undefined && state.lastHandledWorldPushTurn !== pushTurn && contract.decisionCore) {
    const situation = state.situationValues || { ...contract.decisionCore.situation.initialValues };
    const npcStates = state.npcStates || hydrateNpcActors(contract.decisionCore, state.actorMemory, anchor.id);
    const round = decideNpcActions(
      contract.decisionCore,
      situation,
      npcStates,
      wakeContext(state.decisionRound || 0),
    );
    state.decisionInputHash = round.inputHash;
    state.decisions = round.decisions;
    state.wakeAudit = round.wakeAudit;
    state.visibleDecisionIds = selectVisibleNpcDecisionIds(round.decisions, contract.decisionCore.maxVisibleActions);
    const effectApplication = applyNpcDecisionEffectsWithAudit(contract.decisionCore, situation, round.decisions);
    state.situationValues = effectApplication.situationValues;
    if (effectApplication.rejectedEffects.length) {
      const detectedAtTurn = settledTurn(runtime);
      state.effectAudit = [
        ...(state.effectAudit || []),
        ...effectApplication.rejectedEffects.map(item => ({ ...item, detectedAtTurn })),
      ].slice(-50);
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[NPC Decision Core] skipped invalid legacy effects', effectApplication.rejectedEffects);
      }
    }
    state.npcStates = applyNpcDecisionActorState(contract.decisionCore, npcStates, round.decisions);
    recordDecisionEpisodes(runtime, state, anchor.id, round.decisions);
    persistNpcMemory(runtime, state);
    state.decisionRound = (state.decisionRound || 0) + 1;
    state.activeAgendaId = undefined;
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[NPC Decision Core]', round);
    }
    state.lastHandledWorldPushTurn = pushTurn;
    refreshOpportunityStates(runtime, anchor, state);
  } else if (pushTurn !== undefined && state.lastHandledWorldPushTurn !== pushTurn && contract.agendas?.length) {
    const nextAgenda = contract.agendas.find(item => !state.surfacedAgendaIds.includes(item.id))
      || contract.agendas[(pushTurn + contract.agendas.length) % contract.agendas.length];
    state.activeAgendaId = nextAgenda.id;
    if (!state.surfacedAgendaIds.includes(nextAgenda.id)) state.surfacedAgendaIds.push(nextAgenda.id);
    state.lastHandledWorldPushTurn = pushTurn;
    refreshOpportunityStates(runtime, anchor, state);
  }
  refreshOpportunityStates(runtime, anchor, state);
}

/** UI 明确追踪一个机会；只写运行时意图，不直接授奖或改 Canon Rail。 */
export function trackStoryOpportunity(
  saveData: SaveData,
  opportunityId: string,
): { ok: boolean; reason?: string; actionText?: string } {
  const runtime = getRuntime(saveData);
  if (!runtime) return { ok: false, reason: '当前存档没有严格剧本运行时' };
  const anchor = getScenarioFocusEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, opportunityId);
  if (!anchor?.worldActor || !opportunity) return { ok: false, reason: '当前机会已失效' };
  // 先建立完整 round-0 决策态，再写玩家追踪意图，避免 track 提前占用 anchorId
  // 导致首次提示词出现一轮决策空窗。
  syncActorEngine(runtime);
  const state = ensureActorEngine(runtime);
  const opportunityState = state.opportunityStates?.[opportunity.id];
  if (!opportunityState || !['available', 'tracked'].includes(opportunityState.status)) {
    return { ok: false, reason: '当前机会尚未出现或已经关闭' };
  }
  if (state.trackedOpportunityId && state.trackedOpportunityId !== opportunity.id) {
    const previous = state.opportunityStates?.[state.trackedOpportunityId];
    if (previous?.status === 'tracked') {
      previous.status = 'available';
    }
  }
  state.trackedOpportunityId = opportunity.id;
  if (opportunityState.status === 'available') {
    const firstTrackedAt = opportunityState.trackedAtTurn
      ?? Math.max(0, Number(runtime.worldTurn) || 0);
    state.trackedAtTurn = firstTrackedAt;
    opportunityState.status = 'tracked';
    opportunityState.trackedAtTurn = firstTrackedAt;
  } else {
    state.trackedAtTurn = opportunityState.trackedAtTurn ?? state.trackedAtTurn;
  }
  reconcileOpportunityCompletionContract(opportunityState, opportunity);
  if (!state.activeAgendaId) {
    state.activeAgendaId = anchor.worldActor.agendas?.[0]?.id;
    state.surfacedAgendaIds = state.activeAgendaId ? [state.activeAgendaId] : [];
  }
  return { ok: true, actionText: opportunity.actionText };
}

function normalizeOpportunityAction(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

function stableOpportunityContract(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableOpportunityContract).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${key}:${stableOpportunityContract(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function opportunityCompletionContractHash(opportunity: ScenarioStoryOpportunity): string | undefined {
  if (!opportunity.completionContract) return undefined;
  let result = 2166136261;
  for (const char of stableOpportunityContract(opportunity.completionContract)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function stableContractHash(contract: unknown): string {
  let result = 2166136261;
  for (const char of stableOpportunityContract(contract)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function reconcileEventActionContract(runtime: RuntimeState, event: ScenarioModEvent): ScenarioEventActionState | undefined {
  const contract = event.playerCompletionContract;
  if (!contract) return undefined;
  runtime.eventActionStates ||= {};
  const contractHash = stableContractHash(contract);
  const current = runtime.eventActionStates[event.id];
  if (!current || current.contractHash !== contractHash) {
    runtime.eventActionStates[event.id] = { contractHash, attemptCount: 0, preparations: [], attempts: [] };
  }
  return runtime.eventActionStates[event.id];
}

function getCurrentPlayerCompletionEvent(runtime: RuntimeState): ScenarioModEvent | undefined {
  // 世界模式只借用事件的人物/场景素材，绝不开放 Canon Rail 的玩家完成合同。
  if (runtime.storyMode === 'world_sim') return undefined;
  const anchor = getScenarioFocusEvent(runtime);
  if (anchor?.playerCompletionContract) return anchor;
  return runtime.activeEventIds
    .map(id => runtime.events.find(event => event.id === id))
    .filter((event): event is ScenarioModEvent => Boolean(
      event?.playerCompletionContract && !isEventSettled(runtime, event.id),
    ))
    .sort((left, right) =>
      (left.axisSeq ?? Number.MAX_SAFE_INTEGER) - (right.axisSeq ?? Number.MAX_SAFE_INTEGER)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
}

function isAvailableExplorationEvent(runtime: RuntimeState, event: ScenarioModEvent | undefined): event is ScenarioModEvent {
  if (!event?.exploration || event.critical !== false || !event.playerCompletionContract) return false;
  if (!runtime.activeEventIds.includes(event.id) || isEventSettled(runtime, event.id)) return false;
  const chapter = runtime.chapters.find(item => item.id === runtime.currentChapterId);
  return Boolean(chapter?.eventIds?.includes(event.id));
}

function requiredCharactersPresent(
  action: ScenarioPlayerCompletionContract['actions'][number],
  runtime: RuntimeState,
): boolean {
  const required = action.requiresPresentCharacterIds || [];
  if (!required.length) return true;
  const departed = new Set(departedPresentNames(runtime).map(name => String(name || '').trim()).filter(Boolean));
  const characters = Array.isArray(runtime.canon?.characters) ? runtime.canon.characters : [];
  return required.every(characterId => {
    if (departed.has(characterId)) return false;
    const slug = characterId.split('.').filter(Boolean).at(-1) || characterId;
    const status = runtime.flags[`character.${slug}.status`];
    if (typeof status === 'string' && /^(dead|missing)$/i.test(status.trim())) return false;
    const name = String((characters as Array<{ id?: string; name?: string }>).find(item => item.id === characterId)?.name || '').trim();
    return !name || !departed.has(name);
  });
}

function eventActionAvailable(
  action: ScenarioPlayerCompletionContract['actions'][number],
  state: ScenarioEventActionState,
  runtime: RuntimeState,
  saveData?: SaveData,
): boolean {
  const preparations = new Set(state.preparations || []);
  if (action.kind === 'prepare' && action.grantsPreparation && preparations.has(action.grantsPreparation)) return false;
  if (!(action.requiresPreparation || []).every(item => preparations.has(item))) return false;
  if (!requiredCharactersPresent(action, runtime)) return false;
  if (action.visibleWhen?.length) {
    const save = saveData || ({ 世界: { 状态: { 剧本模组: runtime } } } as SaveData);
    if (!conditionsMatch(action.visibleWhen, save, runtime)) return false;
  }
  return true;
}

function isLinearStepContract(contract: ScenarioPlayerCompletionContract): boolean {
  if (contract.actions.length < 2) return false;
  return contract.actions.every((action, index) => {
    if (index === 0) return action.kind === 'prepare' && Boolean(action.grantsPreparation);
    const previousKey = contract.actions[index - 1]?.grantsPreparation;
    if (!previousKey || !(action.requiresPreparation || []).includes(previousKey)) return false;
    return index === contract.actions.length - 1
      || (action.kind === 'prepare' && Boolean(action.grantsPreparation));
  });
}

function currentContractStep(runtime: RuntimeState): ScenarioContractStep | undefined {
  const event = getCurrentPlayerCompletionEvent(runtime);
  const contract = event?.playerCompletionContract;
  if (!event || !contract) return undefined;
  const state = reconcileEventActionContract(runtime, event);
  if (!state || state.readyAtTurn !== undefined) return undefined;
  const action = contract.actions.find(item => eventActionAvailable(item, state, runtime));
  if (!action) return undefined;
  const actionIndex = contract.actions.indexOf(action);
  return {
    eventId: event.id,
    index: actionIndex + 1,
    total: contract.actions.length,
    action: {
      id: action.id,
      label: action.label,
      actionText: action.actionText,
    },
    remainingLabels: contract.actions.slice(actionIndex + 1).map(item => item.label),
    reservedFutureTerms: event.presentation?.stepGuardTerms?.[action.id] || [],
    sequential: isLinearStepContract(contract),
  };
}

/** 当前事件合同的可用步骤；只读合同身份，不以 LLM 正文推断进度。 */
export function getCurrentContractStep(saveData: SaveData): ScenarioContractStep | undefined {
  const runtime = getRuntime(saveData);
  return runtime ? currentContractStep(runtime) : undefined;
}

/** 上一拍尚待下一轮正文承接：prompt 走余波窗；任务栏与主线按钮仍展示，自由输入可落账。 */
export function hasPendingStoryBeatHandoff(saveData: SaveData): boolean {
  const runtime = getRuntime(saveData);
  const handoff = runtime?.lastSettledBeat;
  if (!runtime || !handoff) return false;
  const anchor = getScenarioFocusEvent(runtime);
  if (handoff.targetEventId && anchor?.id !== handoff.targetEventId) return false;
  return handoff.bridgedAtTurn === undefined;
}

/**
 * 成功正文对跨拍状态的唯一消费入口：
 * 首个自由余波回合只标记“已铺垫”，目标事件动作真正触发后才清除。
 */
export function acknowledgeStoryBeatHandoff(
  saveData: SaveData,
  fromEventId: string,
  triggeredEventId?: string,
): 'none' | 'bridged' | 'consumed' {
  const runtime = getRuntime(saveData);
  const handoff = runtime?.lastSettledBeat;
  if (!runtime || !handoff || handoff.eventId !== fromEventId) return 'none';
  if (triggeredEventId && (!handoff.targetEventId || handoff.targetEventId === triggeredEventId)) {
    delete runtime.lastSettledBeat;
    return 'consumed';
  }
  if (handoff.bridgedAtTurn === undefined) {
    handoff.bridgedAtTurn = Math.max(0, Number(runtime.worldTurn) || 0);
    return 'bridged';
  }
  return 'none';
}

function ensureActorMemoryEntry(state: ScenarioActorEngineState, actorId: string, turn: number): ScenarioActorMemory {
  const memory = state.actorMemory ||= {};
  const entry = memory[actorId] ||= {
    relationships: {},
    knowledge: [],
    episodes: [],
    updatedAtTurn: turn,
  };
  entry.relationships = entry.relationships && typeof entry.relationships === 'object' ? entry.relationships : {};
  entry.knowledge = Array.isArray(entry.knowledge) ? entry.knowledge : [];
  entry.episodes = Array.isArray(entry.episodes) ? entry.episodes : [];
  return entry;
}

function applyStoryEventOutcomeEffects(
  saveData: SaveData,
  runtime: RuntimeState,
  event: ScenarioModEvent,
  actionId: string,
  outcome: ScenarioPlayerCompletionOutcome,
  effects: ScenarioPlayerCompletionEffects | undefined,
  attemptNumber: number,
): ScenarioInventorySettlement[] {
  if (!effects) return [];
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  const actorState = ensureActorEngine(runtime);
  const inventorySettlements = settleScenarioInventoryTransfers(saveData, runtime, effects, {
    eventId: event.id,
    actionId,
    outcome,
  });
  for (const relationship of effects.relationships || []) {
    const actor = ensureActorMemoryEntry(actorState, relationship.actorId, turn);
    const target = actor.relationships[relationship.targetCharacterId] ||= {};
    target[relationship.dimension] = Math.min(100, Math.max(-100,
      (Number(target[relationship.dimension]) || 0) + relationship.delta));
    actor.updatedAtTurn = turn;
  }
  for (const knowledge of effects.npcKnowledge || []) {
    for (const actorId of knowledge.actorIds) {
      const actor = ensureActorMemoryEntry(actorState, actorId, turn);
      actor.knowledge = [...new Set([...actor.knowledge, knowledge.factId])].sort();
      actor.updatedAtTurn = turn;
    }
  }
  runtime.playerKnowledge ||= {};
  for (const knowledge of effects.playerKnowledge || []) {
    runtime.playerKnowledge[knowledge.factId] ||= {
      ...structuredClone(knowledge),
      learnedAtTurn: turn,
      sourceEventId: event.id,
    };
  }
  runtime.pathReceipts ||= {};
  for (const receipt of effects.pathReceipts || []) {
    runtime.pathReceipts[receipt.receiptId] ||= {
      ...structuredClone(receipt),
      sourceEventId: event.id,
      choiceId: actionId,
      selectedAtTurn: turn,
    };
  }
  for (const [index, memory] of (effects.memories || []).entries()) {
    addNpcMemoryEpisodes(actorState, memory.actorIds, {
      id: `memory.${event.id}.${actionId}.${outcome}.${attemptNumber}.${index}`,
      eventId: event.id,
      summary: memory.summary,
      tags: [...new Set([
        `event:${event.id}`,
        `action:${actionId}`,
        `outcome:${outcome}`,
        ...memory.tags,
      ])].sort(),
      salience: memory.salience,
      occurredAtTurn: turn,
    });
  }
  return inventorySettlements;
}

function hasPathReceiptConflict(
  runtime: RuntimeState,
  event: ScenarioModEvent,
  effects: ScenarioPlayerCompletionEffects | undefined,
): boolean {
  return (effects?.pathReceipts || []).some(receipt => Object.values(runtime.pathReceipts || {}).some(existing =>
    existing.sourceEventId === event.id
    && existing.mutexGroupId === receipt.mutexGroupId
    && existing.receiptId !== receipt.receiptId,
  ));
}

const INTERACTION_VERB_LABELS: Record<ScenarioInteractionVerb, string> = {
  observe: '观察',
  talk: '交谈',
  act: '行动',
  use: '使用',
  rest: '修整',
  move: '前往',
  attack: '攻击',
};

function deriveInteractionVerb(text: string): ScenarioInteractionVerb {
  if (
    !/(?:躲避|避开|规避|防备|不被)/u.test(text)
    && /(?:击退|迎战|攻击|斩杀|搏杀|交锋|制伏|制服)/u.test(text)
  ) return 'attack';
  if (/(?:使用|服用|取出|祭出|装备|交付).{0,10}(?:道具|药|丹|符|器|物|信|令)/u.test(text)) return 'use';
  if (/(?:前往|赶往|赶赴|动身|启程|进入|离开|随.{0,8}前往)/u.test(text)) return 'move';
  if (/(?:请求|询问|交谈|对话|商议|交涉|说服|劝说|告知|陪.{0,8}送别)/u.test(text)) return 'talk';
  if (/(?:观察|察看|查看|留意|见证|确认|调查|探查|打量|查明|查清|识别|辨认)/u.test(text)) return 'observe';
  if (/(?:休息|休整|修炼|调息|疗伤|打坐)/u.test(text)) return 'rest';
  return 'act';
}

/**
 * ⚠ **隐式契约：动作按钮的「动词 · 对象」是从文案反推的，不是独立字段。**
 * （标注于 2026-08-19，用户裁定「可以标注，具体任务内容修改之后再扩展」。）
 *
 * 玩家看到的按钮＝`动词 · 对象（第 N/M 步）`，两半都来自 `label + actionText`：
 *   · **动词**由 `deriveInteractionVerb` 的正则判定——
 *     「询问／交谈／商议／交涉／说服」→ 交谈；「观察／查看／确认／查明／查清／辨认」→ 观察；
 *     「击退／斩杀／制伏」→ 攻击；「前往／赶赴／进入」→ 前往；都不命中则落 `act`（行动）。
 *   · **对象**是拿这段文本去和本关 `canon.characters` 的名字做匹配，**取文本里最先出现的那个**。
 *
 * 两个后果，改文案的人必须知道：
 *   1. **`label` 里不写人名，按钮就没有对象**，只剩一个光秃秃的「交谈」。
 *      这不只是可读性问题——它直接决定玩家看到的东西。
 *   2. **把标题从「确认 X 的下场」改成「拦下 X」，会把按钮从「观察」变成「行动」。**
 *      2026-08-19 改太泉那 4 条标题时正是如此；当时只按读感改，改对是巧合不是判断。
 *
 * 故：写标题时同时想两件事——玩家读到什么，以及**它会被推成哪个动词、指向谁**。
 * ⏳ 待扩：日后若要精确控制，应当给动作加显式的 verb/target 字段，
 * 而不是继续加正则（现在这套是启发式，改一个词就可能换一个动词）。
 */
function deriveInteraction(
  runtime: RuntimeState,
  event: ScenarioModEvent,
  label: string,
  actionText: string,
): ScenarioInteractionAffordance {
  const text = `${label}\n${actionText}`;
  const verb = deriveInteractionVerb(text);
  const candidates = (runtime.canon?.characters || [])
    .filter(character => character?.id && character?.name && text.includes(character.name))
    .sort((left, right) =>
      text.indexOf(left.name) - text.indexOf(right.name)
      || right.name.length - left.name.length
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const target = candidates[0];
  const textualTarget = verb === 'talk'
    ? label.match(/陪(.{2,6}?)(?:完成|送别|交谈|$)/u)?.[1]
      || label.match(/请求(.{2,6}?)(?:为|替|诊治|救治|$)/u)?.[1]
    : undefined;
  const explicitTarget = event.presentation?.targetLabel?.trim();
  const eventName = String(event.name || '').trim();
  // ⚠ 事件名**不能**当按钮对象。事件名是内部标题（「段强被射杀」「王哲传功与托付」），
  // 写的是这一拍的结果；拿它当对象等于把结局印在按钮上。
  //
  // 真机实测（2026-08-19）：objective 与 action label 都已清理成
  // 「草原上半兽人突然杀到，先保住自己和身边的人」，玩家看到的按钮却是
  // **「行动 · 段强被射杀」**——我们把剧透从 objective 里清掉，它又从事件名绕回了按钮。
  //
  // 对象只认两个来源：`presentation.targetLabel`（作者显式指定）与本关 canon.characters
  // 里被文案点到的人名。都没有就不给对象——按钮只剩动词，难看但不撒谎。
  const fallbackTarget = undefined;
  return {
    verb,
    targetLabel: explicitTarget || target?.name || textualTarget || fallbackTarget,
    ...(target ? { targetId: target.id } : {}),
  };
}

function derivePlayerLine(event: ScenarioModEvent, actionText: string): string {
  const explicitLine = event.presentation?.playerLine?.trim();
  if (explicitLine) return explicitLine;
  const fixedObjective = resolveFixedQuestObjective(event);
  if (fixedObjective && fixedObjective !== String(event.objective || '').trim()) {
    return `我${fixedObjective}`;
  }
  const templatedPrefix = '我按当前主线目标行动：';
  if (actionText.startsWith(templatedPrefix)) {
    const objective = actionText.slice(templatedPrefix.length).trim();
    return objective ? `我${objective}` : actionText;
  }
  return actionText;
}

/** 当前非机会卡承重事件的本地动作；按钮身份来自事件合同，不来自 LLM。 */
export function getCurrentStoryEventActions(saveData: SaveData): ScenarioEventActionSelection[] {
  const runtime = getRuntime(saveData);
  if (!runtime) return [];
  const event = getCurrentPlayerCompletionEvent(runtime);
  const contract = event?.playerCompletionContract;
  if (!event || !contract) return [];
  const state = reconcileEventActionContract(runtime, event);
  if (!state || state.readyAtTurn !== undefined) return [];
  const timeline = eventTimelineState(runtime, event.id);
  const remainingTurns = event.timeline?.deadlineTurns !== undefined && timeline
    ? Math.max(0, timeline.eligibleAtTurn + event.timeline.deadlineTurns - (Number(runtime.worldTurn) || 0))
    : undefined;
  const contractStep = currentContractStep(runtime);
  const steps: ScenarioEventActionSelection[] = contract.actions.filter(action => eventActionAvailable(action, state, runtime, saveData)).map(action => {
    const expectedOutcome: ScenarioPlayerCompletionOutcome = contract.kind === 'objective_action'
      ? 'success'
      : conditionsMatch(action.successWhen, saveData, runtime) ? 'success' : action.unmetOutcome || 'failure';
    const interaction = deriveInteraction(runtime, event, action.label, action.actionText);
    const isCurrentSequentialStep = Boolean(
      contractStep?.sequential
      && contractStep.eventId === event.id
      && contractStep.action.id === action.id,
    );
    const targetSuffix = interaction.targetLabel ? ` · ${interaction.targetLabel}` : '';
    const stepSuffix = isCurrentSequentialStep ? `（第 ${contractStep!.index}/${contractStep!.total} 步）` : '';
    const atLocationId = playerLocationId(saveData, runtime);
    const traveling = Boolean(event.locationId && event.locationId !== atLocationId);
    const compass = traveling ? formatQuestCompass(event, runtime, atLocationId) : '';
    const derivedLabel = `${INTERACTION_VERB_LABELS[interaction.verb]}${targetSuffix}${stepSuffix}`;
    const useCompass = Boolean(compass && !isLinearStepContract(contract));
    return {
      source: 'event_engine' as const,
      eventId: event.id,
      actionId: action.id,
      label: useCompass ? compass : derivedLabel,
      actionText: action.actionText,
      playerLine: useCompass ? compass : derivePlayerLine(event, action.actionText),
      timeCost: action.timeCost,
      contractHash: state.contractHash,
      expectedOutcome,
      outcomeText: action.outcomeText[expectedOutcome],
      interaction,
      ...(isCurrentSequentialStep ? {
        stepIndex: contractStep!.index,
        stepTotal: contractStep!.total,
      } : {}),
      ...(remainingTurns !== undefined ? { remainingTurns } : {}),
      ...(action.judgement ? { judgement: structuredClone(action.judgement) } : {}),
    };
  });
  // 玩家主动走绝路的选项与正常动作并列。它们不进合同、不影响 contractHash、
  // 也不推进本拍——选中即本局结束。放在最后，避免挤掉当前该做的那一步。
  const fatalChoices = (event.fatalOutcomes?.choices || []).map(choice => {
    const interaction = deriveInteraction(runtime, event, choice.label, choice.actionText);
    const targetSuffix = interaction.targetLabel ? ` · ${interaction.targetLabel}` : '';
    return {
      source: 'event_engine' as const,
      eventId: event.id,
      actionId: choice.id,
      label: `${INTERACTION_VERB_LABELS[interaction.verb]}${targetSuffix}`,
      actionText: choice.actionText,
      playerLine: choice.actionText,
      timeCost: 1 as const,
      contractHash: state.contractHash,
      expectedOutcome: 'success' as ScenarioPlayerCompletionOutcome,
      outcomeText: choice.ending.title,
      interaction,
    };
  });
  return [...steps, ...fatalChoices];
}

function normalizeEventActionIntent(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

/**
 * 把玩家的自然行动句保守映射回当前本地事件动作。
 * 只认作者显式声明的短语；否定优先、歧义关闭，不读取 LLM 也不写任何真值。
 */
export function resolveStoryEventActionFromPlayerText(
  saveData: SaveData,
  playerText: string,
): ScenarioEventActionSelection | undefined {
  // 交接窗只藏下一拍按钮，不挡自由输入（TES：去帅帐/见月霜仍须能落账）。
  if (typeof playerText !== 'string' || !playerText.trim()) return undefined;
  const runtime = getRuntime(saveData);
  const event = runtime ? getCurrentPlayerCompletionEvent(runtime) : undefined;
  const contract = event?.playerCompletionContract;
  if (!runtime || !event || !contract) return undefined;
  const normalized = normalizeEventActionIntent(playerText);
  if (!normalized) return undefined;

  const selections = getCurrentStoryEventActions(saveData);
  const rejectedBy = (selection: ScenarioEventActionSelection): boolean => {
    const action = contract.actions.find(item => item.id === selection.actionId);
    const rejected = (action?.intentMatch?.rejectIf || []).map(normalizeEventActionIntent).filter(Boolean);
    return rejected.some(phrase => normalized.includes(phrase));
  };
  const matches = selections.filter(selection => {
    const action = contract.actions.find(item => item.id === selection.actionId);
    const intent = action?.intentMatch;
    if (!intent || rejectedBy(selection)) return false;
    const any = (intent.matchAny || []).map(normalizeEventActionIntent).filter(Boolean);
    const all = (intent.matchAll || []).map(normalizeEventActionIntent).filter(Boolean);
    if (any.length > 0 && !any.some(phrase => normalized.includes(phrase))) return false;
    if (all.length > 0 && !all.every(phrase => normalized.includes(phrase))) return false;
    return any.length > 0 || all.length > 0;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return undefined;
  if (event.id === 'lcq.event.s02_04') {
    const travelToCity = /去五原|前往五原|去市集/.test(normalized);
    if (travelToCity) return undefined;
  }
  const pointers = questCompassPhrases(event, runtime, playerLocationId(saveData, runtime))
    .map(normalizeEventActionIntent)
    .filter(Boolean);
  if (!pointers.length) return undefined;
  const fatalIds = new Set((event.fatalOutcomes?.choices || []).map(item => item.id));
  const pointerMatches = selections.filter(selection =>
    selection.source === 'event_engine'
    && !fatalIds.has(selection.actionId)
    && !rejectedBy(selection)
    && pointers.some(phrase => normalized.includes(phrase)),
  );
  return pointerMatches.length === 1 ? pointerMatches[0] : undefined;
}

/** 当前章节显式开放的非承重探索动作；可忽略，且永远不能替代唯一主线锚点。 */
export function getCurrentStoryExplorationActions(saveData: SaveData): ScenarioEventActionSelection[] {
  const runtime = getRuntime(saveData);
  if (!runtime || runtime.storyMode === 'world_sim') return [];
  const anchorId = getNarrativeAnchorEvent(runtime)?.id;
  return runtime.activeEventIds
    .map(id => runtime.events.find(event => event.id === id))
    .filter((event): event is ScenarioModEvent => isAvailableExplorationEvent(runtime, event) && event.id !== anchorId)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .flatMap(event => {
      const contract = event.playerCompletionContract!;
      const state = reconcileEventActionContract(runtime, event);
      if (!state || state.readyAtTurn !== undefined) return [];
      return contract.actions.filter(action => eventActionAvailable(action, state, runtime, saveData)).map(action => {
        const expectedOutcome: ScenarioPlayerCompletionOutcome = contract.kind === 'objective_action'
          ? 'success'
          : conditionsMatch(action.successWhen, saveData, runtime) ? 'success' : action.unmetOutcome || 'failure';
        const interaction = deriveInteraction(runtime, event, action.label, action.actionText);
        const targetSuffix = interaction.targetLabel ? ` · ${interaction.targetLabel}` : '';
        return {
          source: 'exploration_engine' as const,
          eventId: event.id,
          actionId: action.id,
          label: `${INTERACTION_VERB_LABELS[interaction.verb]}${targetSuffix}`,
          actionText: action.actionText,
          playerLine: action.actionText,
          timeCost: action.timeCost,
          contractHash: state.contractHash,
          expectedOutcome,
          outcomeText: action.outcomeText[expectedOutcome],
          interaction,
        };
      });
    });
}

/** 跨关启程是直接命令，不属于事件动作，也不消耗叙事回合。 */
export function getStageDepartureOffer(saveData: SaveData): ScenarioStageDepartureOffer | null {
  const runtime = getRuntime(saveData);
  if (
    !runtime?.nextStageId
    || runtime.nextStageReadyId !== runtime.nextStageId
  ) return null;
  return {
    nextStageId: runtime.nextStageId,
    label: '收拾行装，继续旅程',
  };
}

/** 切关后尚未被首个新关正文消费的确定性阅读面落点。 */
export function getStageEntryPresentation(saveData: SaveData): ScenarioStageEntryPresentation | null {
  const runtime = getRuntime(saveData);
  const entry = runtime?.stageEntryPresentation;
  if (
    !runtime?.modId
    || !entry
    || entry.toStageId !== runtime.modId
    || typeof entry.text !== 'string'
    || !entry.text.trim()
  ) return null;
  return structuredClone(entry);
}

/** 首个新关正文成功落账后消费展示态；旧关或重复响应不能误清。 */
export function acknowledgeStageEntryPresentation(saveData: SaveData, toStageId: string): boolean {
  const runtime = getRuntime(saveData);
  if (!runtime?.stageEntryPresentation || runtime.stageEntryPresentation.toStageId !== toStageId) return false;
  delete runtime.stageEntryPresentation;
  return true;
}

const SILK_POUCH_TAKE_RE = /(?:获得|接过|收下|王哲递给|放入背包|收入背包).{0,12}锦囊|锦囊.{0,12}(?:获得|接过|收下|放入背包|收入背包)/;
const SILK_POUCH_UNOBTAINED = '锦囊仍未到手。案上的锦囊没有因为这句话变成你的东西。';
const JIN_NANG_TRANSFER_ID = 'lcq.event.s02_01.inventory.jin_nang';
const SILK_POUCH_ALREADY_HELD_NEXT = '锦囊已经收妥，接下来需要认下托付。';
const SILK_POUCH_ALREADY_HELD = '锦囊已经收妥。';
const SILK_POUCH_CLAIM_STEP_IDS = new Set(['take_bag', 'hold_bag']);

/** After local inventory settlement: if the bag has no 锦囊, Legacy must not write that it was obtained. */
export function clarifyUnobtainedSilkPouchNarrative(saveData: SaveData, text: string): string {
  if (!text) return text;
  const qty = Number((saveData as { 角色?: { 背包?: { 物品?: Record<string, { 数量?: number }> } } })
    ?.角色?.背包?.物品?.['lcq.item.jin_nang']?.数量) || 0;
  if (qty > 0) return text;
  if (!SILK_POUCH_TAKE_RE.test(text)) return text;
  return SILK_POUCH_UNOBTAINED;
}

function hasJinNangTransferReceipt(saveData: SaveData): boolean {
  return (getRuntime(saveData)?.inventoryTransferReceipts || [])
    .some(item => item.transferId === JIN_NANG_TRANSFER_ID);
}

function isSilkPouchClaimIntent(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;
  return SILK_POUCH_TAKE_RE.test(raw) || normalizeOpportunityAction(raw).includes('收下锦囊');
}

function repeatSilkPouchHeldText(saveData: SaveData): string {
  const next = getTrackedStoryOpportunityActions(saveData);
  if (next.some(item => /认下托付/.test(item.label) || item.stepId === 'own_charge')) {
    return SILK_POUCH_ALREADY_HELD_NEXT;
  }
  return SILK_POUCH_ALREADY_HELD;
}

/**
 * 锦囊回执已在时，重复领取意图不再进 Legacy。
 * 不推进 2/2，不补第二只锦囊，也不发明令牌或路线。
 */
export function previewRepeatSilkPouchClaimNarrative(
  saveData: SaveData,
  input: {
    playerActionText?: string;
    opportunityAction?: ScenarioOpportunityActionSelection;
  } = {},
): string {
  if (!hasJinNangTransferReceipt(saveData)) return '';
  const structured = input.opportunityAction;
  if (structured?.source === 'opportunity_engine') {
    if (SILK_POUCH_CLAIM_STEP_IDS.has(structured.stepId) || isSilkPouchClaimIntent(structured.actionText)) {
      return repeatSilkPouchHeldText(saveData);
    }
    return '';
  }
  if (!isSilkPouchClaimIntent(input.playerActionText || '')) return '';
  return repeatSilkPouchHeldText(saveData);
}

/**
 * 在成功 AI 回合后消费一次非机会卡事件动作，并只依据存档状态执行本地判定。
 * LLM 正文、命令和自报结果均不参与 success/partial/failure 裁定。
 */
function eventOutcomeFromJudgement(
  action: ScenarioPlayerCompletionContract['actions'][number],
  resolution: JudgementResolution,
): ScenarioPlayerCompletionOutcome {
  const successOutcomes = new Set(action.judgement?.successOutcomes || ['success', 'great_success', 'perfect']);
  if (resolution.outcome && successOutcomes.has(resolution.outcome)) return 'success';
  if (resolution.outcome === 'partial') return 'partial';
  return action.unmetOutcome || 'failure';
}

const XIEYI_ENTRUSTMENT_EVENT_ID = 'lcq.event.xieyi_entrustment';
const XIEYI_RESCUE_ACTION_ID = 'rescue_xieyi';
const S06_03_EVENT_ID = 'lcq.event.s06_03';
const XIEYI_ASHES_ITEM_ID = 'lcq.item.xieyi_ashes';
const XIEYI_ASHES_TRANSFER_ID = 'lcq.event.xieyi_entrustment.inventory.xieyi_ashes';
const XIEYI_ASHES_FLAG = 'world.xieyi_ashes.generated';

function xieyiFateAlreadyMapped(runtime: RuntimeState): boolean {
  return runtime.flags['event.s06_03.done'] === true || runtime.flags['event.s06_03.void'] === true;
}

function grantXieyiAshesOnce(saveData: SaveData, runtime: RuntimeState): void {
  if (runtime.flags[XIEYI_ASHES_FLAG] === true) return;
  settleScenarioInventoryTransfers(saveData, runtime, {
    inventoryTransfers: [{
      transferId: XIEYI_ASHES_TRANSFER_ID,
      itemId: XIEYI_ASHES_ITEM_ID,
      quantity: 1,
    }],
  }, {
    eventId: XIEYI_ENTRUSTMENT_EVENT_ID,
    actionId: 'accept_entrustment',
    outcome: 'success',
  });
  runtime.flags[XIEYI_ASHES_FLAG] = true;
}

/** 判定引擎不写 flags；命运映射与事件结算同事务提交。本纵切不生成 missing。 */
function applyXieyiEntrustmentFateMapping(
  runtime: RuntimeState,
  input: {
    actionId: string;
    judgementOutcome?: JudgementOutcome;
    evidence: string;
  },
  saveData?: SaveData,
): void {
  if (xieyiFateAlreadyMapped(runtime)) return;
  const judgementOutcome = input.judgementOutcome;
  const longrest = input.actionId === XIEYI_RESCUE_ACTION_ID
    && (judgementOutcome === 'success' || judgementOutcome === 'great_success' || judgementOutcome === 'perfect');
  if (longrest) {
    runtime.flags['event.s06_03.void'] = true;
    recordReconcileDivergences(runtime, [{
      id: S06_03_EVENT_ID,
      verdict: 'void',
      evidence: input.evidence,
      worldDelta: input.evidence,
      characterStates: { 'liuchao.character.xie_yi': 'longrest' },
    }]);
    return;
  }
  runtime.flags['event.s06_03.done'] = true;
  runtime.flags['character.xie_yi.status'] = 'dead';
  if (saveData) grantXieyiAshesOnce(saveData, runtime);
}

export function recordStoryEventStructuredAction(
  saveData: SaveData,
  selection: ScenarioEventActionSelection,
  options?: { judgementResolution?: JudgementResolution },
): {
  attempted: boolean;
  completed: boolean;
  eventId?: string;
  actionId?: string;
  outcome?: ScenarioPlayerCompletionOutcome;
  reason?: string;
  inventorySettlements?: ScenarioInventorySettlement[];
} {
  const runtime = getRuntime(saveData);
  if (!runtime || !['event_engine', 'exploration_engine'].includes(selection?.source)) {
    return { attempted: false, completed: false, reason: 'invalid_selection' };
  }
  if (runtime.storyMode === 'world_sim') {
    return { attempted: false, completed: false, reason: 'world_sim' };
  }
  const event = selection.source === 'exploration_engine'
    ? runtime.events.find(item => item.id === selection.eventId && item.exploration !== undefined)
    : getCurrentPlayerCompletionEvent(runtime);
  const contract = event?.playerCompletionContract;
  if (!event || !contract || event.id !== selection.eventId) {
    return { attempted: false, completed: false, reason: 'stale_event' };
  }
  const state = reconcileEventActionContract(runtime, event);
  if (!state || state.contractHash !== selection.contractHash) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_contract' };
  }
  // 绝路选项先于合同动作判定：它不推进本拍，直接结束本局。
  const fatalChoice = (event.fatalOutcomes?.choices || []).find(item => item.id === selection.actionId);
  if (fatalChoice) {
    if (fatalChoice.actionText !== selection.actionText) {
      return { attempted: false, completed: false, eventId: event.id, reason: 'stale_action' };
    }
    runtime.gameOver = {
      endingId: fatalChoice.ending.id,
      title: fatalChoice.ending.title,
      facts: [...fatalChoice.ending.facts],
      sourceEventId: event.id,
      atTurn: Math.max(0, Number(runtime.worldTurn) || 0),
    };
    return { attempted: true, completed: false, eventId: event.id, actionId: fatalChoice.id, outcome: 'success' };
  }
  const action = contract.actions.find(item => item.id === selection.actionId);
  if (!action || action.timeCost !== selection.timeCost || action.actionText !== selection.actionText) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_action' };
  }
  if (state.readyAtTurn !== undefined) {
    return { attempted: false, completed: true, eventId: event.id, reason: 'already_completed' };
  }
  const eventId = event.id;
  if (selection.source === 'exploration_engine' && !isAvailableExplorationEvent(runtime, event)) {
    return { attempted: false, completed: false, eventId, reason: 'stale_event' };
  }
  if (!eventActionAvailable(action, state, runtime, saveData)) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'action_unavailable' };
  }
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  if (state.lastAttemptAtTurn === turn) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'already_attempted' };
  }
  if (event.id === 'lcq.event.s02_04' && !wuyuanS0204MapContractMet(runtime)) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'open_world_prerequisites' };
  }
  let outcome: ScenarioPlayerCompletionOutcome;
  if (action.judgement) {
    const resolution = options?.judgementResolution;
    if (!resolution || resolution.status !== 'resolved') {
      return { attempted: false, completed: false, eventId: event.id, reason: 'judgement_required' };
    }
    if (
      resolution.authorityReceipt?.kind !== 'event_action_judgement'
      || resolution.authorityReceipt.eventId !== event.id
      || resolution.authorityReceipt.actionId !== action.id
      || resolution.authorityReceipt.contractHash !== selection.contractHash
    ) {
      return { attempted: false, completed: false, eventId: event.id, reason: 'stale_judgement' };
    }
    outcome = eventOutcomeFromJudgement(action, resolution);
  } else {
    const success = contract.kind === 'objective_action' || conditionsMatch(action.successWhen, saveData, runtime);
    outcome = success ? 'success' : action.unmetOutcome || 'failure';
  }
  const detail = action.outcomeText[outcome];
  if (!action.judgement && (selection.expectedOutcome !== outcome || selection.outcomeText !== detail)) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_condition' };
  }
  if (hasPathReceiptConflict(runtime, event, action.outcomeEffects?.[outcome])) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'path_conflict' };
  }
  state.lastAttemptAtTurn = turn;
  state.lastOutcome = outcome;
  const attemptNumber = Math.max(0, Number(state.attemptCount) || 0) + 1;
  state.attemptCount = attemptNumber;
  const factReceipts = (event.narrativeFactReceipts || [])
    .filter(receipt => receipt.actionId === action.id && receipt.outcome === outcome)
    .map(receipt => structuredClone(receipt));
  state.attempts.push({
    actionId: action.id,
    outcome,
    attemptedAtTurn: turn,
    detail,
    ...(factReceipts.length ? { factReceipts } : {}),
  });
  state.attempts = state.attempts.slice(-8);
  if (action.kind === 'prepare' && outcome === 'success' && action.grantsPreparation) {
    state.preparations = [...new Set([...(state.preparations || []), action.grantsPreparation])].sort();
  }
  const inventorySettlements = applyStoryEventOutcomeEffects(
    saveData,
    runtime,
    event,
    action.id,
    outcome,
    action.outcomeEffects?.[outcome],
    attemptNumber,
  );
  const completed = action.kind !== 'prepare' && contract.settleOn.includes(outcome);
  if (completed) state.readyAtTurn = turn;
  if (completed) stampDepartedCast(runtime);
  if (completed && event.id === XIEYI_ENTRUSTMENT_EVENT_ID) {
    applyXieyiEntrustmentFateMapping(runtime, {
      actionId: action.id,
      judgementOutcome: action.judgement ? options?.judgementResolution?.outcome : undefined,
      evidence: detail,
    }, saveData);
  }
  if (event.locationId) movePlayerToEventLocation(saveData, runtime, event.locationId);
  return {
    attempted: true,
    completed,
    eventId: event.id,
    actionId: action.id,
    outcome,
    ...(inventorySettlements.length ? { inventorySettlements } : {}),
  };
}

function reconcileOpportunityCompletionContract(
  state: ScenarioOpportunityState,
  opportunity: ScenarioStoryOpportunity,
): void {
  const nextHash = opportunityCompletionContractHash(opportunity);
  if (!nextHash) return;
  if (state.completionContractHash && state.completionContractHash !== nextHash) {
    state.completionStepIndex = 0;
    state.lastCompletionActionKey = undefined;
    state.lastCompletionProgressAtTurn = undefined;
    state.completionReadyAtTurn = undefined;
    state.completionChoices = {};
  }
  state.completionContractHash = nextHash;
}

function settleOpportunityStepInventory(
  saveData: SaveData,
  runtime: RuntimeState,
  event: ScenarioModEvent,
  step: NonNullable<ScenarioStoryOpportunity['completionContract']>['steps'][number],
  actionId: string,
): ScenarioInventorySettlement[] {
  return settleScenarioInventoryTransfers(saveData, runtime, step.outcomeEffects, {
    eventId: event.id,
    actionId,
    outcome: 'success',
  });
}

/** 当前步骤的结构化推进动作；只由本地合同生成，不依赖 LLM action_options。 */
export function getTrackedStoryOpportunityActions(saveData: SaveData): ScenarioOpportunityActionSelection[] {
  const runtime = getRuntime(saveData);
  const state = runtime?.actorEngine;
  if (!runtime || !state?.trackedOpportunityId) return [];
  const anchor = getScenarioFocusEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  const contract = opportunity?.completionContract;
  if (!opportunity || !contract || opportunityState?.status !== 'tracked') return [];
  reconcileOpportunityCompletionContract(opportunityState, opportunity);
  const stepIndex = Math.max(0, Number(opportunityState.completionStepIndex) || 0);
  const step = contract.steps[stepIndex];
  const contractHash = opportunityState.completionContractHash;
  if (!step?.actions?.length || !contractHash) return [];
  return step.actions.map(action => ({
    source: 'opportunity_engine',
    opportunityId: opportunity.id,
    stepId: step.id,
    actionId: action.id,
    label: `【推进·${stepIndex + 1}/${contract.steps.length}】${action.label}`,
    actionText: action.actionText,
    timeCost: action.timeCost,
    contractHash,
  }));
}

/** 成功 AI 回合后消费结构化动作；过期、跨步骤或热更前选项一律拒绝。 */
export function recordStoryOpportunityStructuredAction(
  saveData: SaveData,
  selection: ScenarioOpportunityActionSelection,
): {
  progressed: boolean;
  completed: boolean;
  opportunityId?: string;
  stepId?: string;
  reason?: string;
  inventorySettlements?: ScenarioInventorySettlement[];
} {
  const runtime = getRuntime(saveData);
  const state = runtime?.actorEngine;
  if (!runtime || !state || selection?.source !== 'opportunity_engine') {
    return { progressed: false, completed: false, reason: 'invalid_selection' };
  }
  const anchor = getScenarioFocusEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  const contract = opportunity?.completionContract;
  if (!anchor || !opportunity || !contract || opportunity.id !== selection.opportunityId || opportunityState?.status !== 'tracked') {
    return { progressed: false, completed: false, reason: 'stale_opportunity' };
  }
  reconcileOpportunityCompletionContract(opportunityState, opportunity);
  if (opportunityState.completionContractHash !== selection.contractHash) {
    return { progressed: false, completed: false, opportunityId: opportunity.id, reason: 'stale_contract' };
  }
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  if (opportunityState.lastCompletionProgressAtTurn === turn) {
    return { progressed: false, completed: opportunityState.completionReadyAtTurn !== undefined, opportunityId: opportunity.id, reason: 'already_progressed' };
  }
  const index = Math.max(0, Number(opportunityState.completionStepIndex) || 0);
  const step = contract.steps[index];
  const action = step?.actions?.find(item => item.id === selection.actionId);
  if (!step || step.id !== selection.stepId || !action || action.timeCost !== selection.timeCost) {
    return { progressed: false, completed: false, opportunityId: opportunity.id, reason: 'stale_step' };
  }
  opportunityState.completionStepIndex = index + 1;
  opportunityState.lastCompletionProgressAtTurn = turn;
  opportunityState.lastCompletionActionKey = `${turn}:structured:${selection.actionId}`;
  opportunityState.completionChoices ||= {};
  opportunityState.completionChoices[step.id] = action.id;
  const inventorySettlements = settleOpportunityStepInventory(saveData, runtime, anchor, step, action.id);
  const completed = opportunityState.completionStepIndex >= contract.steps.length;
  if (completed) opportunityState.completionReadyAtTurn = turn;
  return {
    progressed: true,
    completed,
    opportunityId: opportunity.id,
    stepId: step.id,
    ...(inventorySettlements.length ? { inventorySettlements } : {}),
  };
}

function opportunityStepMatches(
  action: string,
  step: NonNullable<ScenarioStoryOpportunity['completionContract']>['steps'][number],
): boolean {
  const normalized = normalizeOpportunityAction(action);
  const any = (step.matchAny || []).map(normalizeOpportunityAction);
  const all = (step.matchAll || []).map(normalizeOpportunityAction);
  const rejected = (step.rejectIf || []).map(normalizeOpportunityAction);
  if (rejected.some(item => normalized.includes(item))) return false;
  if (any.length > 0 && !any.some(item => normalized.includes(item))) return false;
  if (all.length > 0 && !all.every(item => normalized.includes(item))) return false;
  return any.length > 0 || all.length > 0;
}

/**
 * 在一次 AI 回合成功返回后记录玩家本人的行动证据。
 *
 * 该函数不读 LLM 正文、命令或评价；一次调用最多推进一个 step。全部满足后只标记
 * ready，事件完成 flag 仍由下一次 advanceScenarioRuntime 在引擎事务内独占写入。
 */
export function recordStoryOpportunityPlayerAction(
  saveData: SaveData,
  playerAction: string,
): {
  progressed: boolean;
  completed: boolean;
  opportunityId?: string;
  stepId?: string;
  inventorySettlements?: ScenarioInventorySettlement[];
} {
  const runtime = getRuntime(saveData);
  if (!runtime || typeof playerAction !== 'string' || !playerAction.trim()) {
    return { progressed: false, completed: false };
  }
  syncActorEngine(runtime);
  const state = ensureActorEngine(runtime);
  const anchor = getScenarioFocusEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const contract = opportunity?.completionContract;
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  if (!anchor || !opportunity || !contract || opportunityState?.status !== 'tracked') {
    return { progressed: false, completed: false };
  }
  reconcileOpportunityCompletionContract(opportunityState, opportunity);

  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  const normalizedAction = normalizeOpportunityAction(playerAction);
  const actionKey = `${turn}:${normalizedAction}`;
  if (
    opportunityState.lastCompletionActionKey === actionKey
    || opportunityState.lastCompletionProgressAtTurn === turn
  ) {
    return {
      progressed: false,
      completed: opportunityState.completionReadyAtTurn !== undefined,
      opportunityId: opportunity.id,
    };
  }
  opportunityState.lastCompletionActionKey = actionKey;

  const index = Math.max(0, Number(opportunityState.completionStepIndex) || 0);
  const step = contract.steps[index];
  if (!step || !opportunityStepMatches(playerAction, step)) {
    return {
      progressed: false,
      completed: opportunityState.completionReadyAtTurn !== undefined,
      opportunityId: opportunity.id,
    };
  }

  opportunityState.completionStepIndex = index + 1;
  opportunityState.lastCompletionProgressAtTurn = turn;
  const actionId = step.actions?.length === 1 ? step.actions[0].id : step.id;
  const inventorySettlements = settleOpportunityStepInventory(saveData, runtime, anchor, step, actionId);
  const completed = opportunityState.completionStepIndex >= contract.steps.length;
  if (completed) opportunityState.completionReadyAtTurn = turn;
  return {
    progressed: true,
    completed,
    opportunityId: opportunity.id,
    stepId: step.id,
    ...(inventorySettlements.length ? { inventorySettlements } : {}),
  };
}

function settleReadyOpportunityCompletionFlags(runtime: RuntimeState): void {
  const state = runtime.actorEngine;
  if (!state?.trackedOpportunityId) return;
  const anchor = getScenarioFocusEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  if (
    !opportunity?.completionContract
    || opportunityState?.status !== 'tracked'
    || opportunityState.completionReadyAtTurn === undefined
  ) return;
  if (
    opportunity.completionContract.settlement === 'timeline_deadline'
    && !eventTimelineDeadlineDue(runtime, anchor || undefined)
  ) return;
  const completion = anchor?.completion || [];
  if (
    completion.length !== 1
    || !completion[0].path.startsWith('flags.')
    || completion[0].operator !== 'eq'
    || completion[0].value !== true
  ) return;
  runtime.flags[completion[0].path.slice('flags.'.length)] = true;
}

function settleReadyEventActionCompletionFlags(runtime: RuntimeState): void {
  for (const eventId of runtime.activeEventIds) {
    const event = runtime.events.find(item => item.id === eventId);
    const state = event && runtime.eventActionStates?.[event.id];
    if (!event?.playerCompletionContract || state?.readyAtTurn === undefined) continue;
    const completion = event.completion || [];
    if (
      completion.length !== 1
      || !completion[0].path.startsWith('flags.')
      || completion[0].operator !== 'eq'
      || completion[0].value !== true
    ) continue;
    runtime.flags[completion[0].path.slice('flags.'.length)] = true;
  }
}

function readPath(root: unknown, path: string[]): unknown {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function playerLocationId(saveData: SaveData, runtime: RuntimeState): string {
  return resolveLocationIdFromPosition(
    (saveData as { 角色?: { 位置?: { 描述?: unknown } } })?.角色?.位置?.描述,
    runtime.canon?.locations,
  ) || '';
}

function movePlayerToEventLocation(saveData: SaveData, runtime: RuntimeState, locationId: string): void {
  if (playerLocationId(saveData, runtime) === locationId) return;
  const loc = (runtime.canon?.locations || []).find(item => item.id === locationId) as
    | { id?: string; name?: string; coordinates?: { x?: number; y?: number } }
    | undefined;
  const name = String(loc?.name || '').trim();
  if (!name) return;
  const position = (saveData as { 角色?: { 位置?: { 描述?: unknown; x?: number; y?: number } } }).角色?.位置;
  if (!position || typeof position !== 'object') return;
  const current = String(position.描述 || '');
  const continent = current.includes('·') ? current.slice(0, current.indexOf('·')) : '';
  position.描述 = continent ? `${continent}·${name}` : name;
  if (typeof loc?.coordinates?.x === 'number') position.x = loc.coordinates.x;
  if (typeof loc?.coordinates?.y === 'number') position.y = loc.coordinates.y;
}

function rememberEventActivationLocation(saveData: SaveData, runtime: RuntimeState, eventId: string): void {
  runtime.eventActivatedAtLocation ||= {};
  if (runtime.eventActivatedAtLocation[eventId] !== undefined) return;
  runtime.eventActivatedAtLocation[eventId] = playerLocationId(saveData, runtime);
}

function settleArrivalObjective(saveData: SaveData, runtime: RuntimeState): void {
  const locId = playerLocationId(saveData, runtime);
  if (!locId) return;
  const event = getCurrentPlayerCompletionEvent(runtime);
  if (!event?.locationId || event.locationId !== locId) return;
  if (event.id === 'lcq.event.s02_04') return;
  const startedAt = runtime.eventActivatedAtLocation?.[event.id];
  if (startedAt === undefined || startedAt === event.locationId) return;
  const fatalIds = new Set((event.fatalOutcomes?.choices || []).map(item => item.id));
  const selection = getCurrentStoryEventActions(saveData).find(item =>
    item.source === 'event_engine' && item.eventId === event.id && !fatalIds.has(item.actionId),
  );
  if (!selection) return;
  recordStoryEventStructuredAction(saveData, selection);
}

function settleAbandonedXieyiEntrustment(saveData: SaveData, runtime: RuntimeState): void {
  if (isEventSettled(runtime, XIEYI_ENTRUSTMENT_EVENT_ID) || !runtime.activeEventIds.includes(XIEYI_ENTRUSTMENT_EVENT_ID)) return;
  const event = runtime.events.find(item => item.id === XIEYI_ENTRUSTMENT_EVENT_ID);
  if (!event?.locationId) return;
  const startedAt = runtime.eventActivatedAtLocation?.[event.id];
  if (startedAt === undefined || startedAt !== event.locationId) return;
  const locId = playerLocationId(saveData, runtime);
  if (!locId || locId === event.locationId) return;
  const selection = getCurrentStoryEventActions(saveData).find(item => (
    item.source === 'event_engine' && item.eventId === event.id && item.actionId === 'accept_entrustment'
  ));
  if (!selection) return;
  recordStoryEventStructuredAction(saveData, selection);
}

const WUYUAN_S02_04_PASTRY_ZONE = 'lcq.zone.wuyuan.pastry_shop';
const WUYUAN_S02_04_PLAYER_ROUTES = new Set([
  'lcq.route.wuyuan.market_to_pastry_street',
  'lcq.route.wuyuan.market_to_pastry_alley',
]);
const WUYUAN_S02_04_LOCAL_ACTIONS = new Set([
  'lcq.action.wuyuan.delay_and_observe',
  'lcq.action.wuyuan.break_for_exit',
]);

function wuyuanS0204MapContractMet(runtime: RuntimeState): boolean {
  const slice = (runtime as RuntimeState & {
    openWorldSlice?: {
      currentZoneId?: string;
      travelReceipts?: Array<{ routeId?: string; mode?: string }>;
      actionReceipts?: Array<{ actionId?: string }>;
    };
  }).openWorldSlice;
  if (!slice || slice.currentZoneId !== WUYUAN_S02_04_PASTRY_ZONE) return false;
  const hasPlayerHop = (slice.travelReceipts || []).some(item => (
    item.mode === 'player' && WUYUAN_S02_04_PLAYER_ROUTES.has(String(item.routeId || ''))
  ));
  const hasLocal = (slice.actionReceipts || []).some(item => (
    WUYUAN_S02_04_LOCAL_ACTIONS.has(String(item.actionId || ''))
  ));
  return hasPlayerHop && hasLocal;
}

function getRuntime(saveData: SaveData): RuntimeState | null {
  const value = readPath(saveData, ['世界', '状态', '剧本模组']);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const runtime = value as Record<string, unknown>;
  if (!runtime.flags || typeof runtime.flags !== 'object') return null;
  return runtime as unknown as RuntimeState;
}

function resolveConditionValue(condition: ScenarioCondition, saveData: SaveData, runtime: RuntimeState): unknown {
  if (condition.path === 'flags') return runtime.flags;
  if (condition.path.startsWith('flags.')) {
    const flagPath = condition.path.slice('flags.'.length);
    // LLM 的 set 指令按嵌套路径写入（flags.event.x.done → {event:{x:{done}}}），
    // 而 initialFlags 是扁平点号键。嵌套值是较新的写入 → 嵌套优先，扁平兜底。
    const nested = readPath(runtime.flags, flagPath.split('.'));
    if (nested !== undefined) return nested;
    if (Object.prototype.hasOwnProperty.call(runtime.flags, flagPath)) return runtime.flags[flagPath];
    return undefined;
  }
  if (condition.path.startsWith('pathReceipts.')) {
    const receiptId = condition.path.slice('pathReceipts.'.length);
    return Boolean(runtime.pathReceipts?.[receiptId]);
  }
  return readPath(saveData, condition.path.split('.'));
}

// LLM 偶尔把布尔写成字符串（"true"/"false"）——eq/neq 比较前归一。
function coerceScalar(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function evaluateScenarioCondition(
  condition: ScenarioCondition,
  saveData: SaveData,
  runtime: RuntimeState,
): boolean {
  const actual = resolveConditionValue(condition, saveData, runtime);
  switch (condition.operator) {
    case 'eq': return coerceScalar(actual) === condition.value;
    case 'neq': return coerceScalar(actual) !== condition.value;
    case 'gt': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'gte': return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lt': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'lte': return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    case 'includes':
      return (Array.isArray(actual) && actual.includes(condition.value)) ||
        (typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value));
    case 'exists': return actual !== undefined;
    default: return false;
  }
}

function conditionsMatch(
  conditions: ScenarioCondition[] | undefined,
  saveData: SaveData,
  runtime: RuntimeState,
): boolean {
  return !conditions?.length || conditions.every(condition => evaluateScenarioCondition(condition, saveData, runtime));
}

function hasCompletion(conditions: ScenarioCondition[] | undefined): conditions is ScenarioCondition[] {
  return Array.isArray(conditions) && conditions.length > 0;
}

function isCriticalStoryEvent(event: ScenarioModEvent): boolean {
  if (event.critical !== undefined) return event.critical;
  if (event.axisMethod === 'reviewed-no-anchor' || event.axisId === null) return false;
  return Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
}

/** 当前生产可达：rail 拍、已 active、或当前章 eventIds。未挂章 critical 不能挡切关。 */
export function isProductionReachableStoryEvent(
  runtime: Pick<RuntimeState, 'activeEventIds' | 'currentChapterId' | 'chapters'>,
  event: Pick<ScenarioModEvent, 'id'>,
  railProfile: CanonRailProfile | null,
): boolean {
  if (railProfile?.orderedEventIds.includes(event.id)) return true;
  if ((runtime.activeEventIds || []).includes(event.id)) return true;
  const current = (runtime.chapters || []).find(chapter => chapter.id === runtime.currentChapterId);
  return Boolean(current?.eventIds?.includes(event.id));
}

export function hasPendingProductionCriticalEvent(
  runtime: RuntimeState,
  railProfile: CanonRailProfile | null = getCanonRailProfile(runtime),
): boolean {
  return (runtime.events || []).some(event =>
    isCriticalStoryEvent(event)
    && !isEventSettled(runtime, event.id)
    && isProductionReachableStoryEvent(runtime, event, railProfile),
  );
}

export const OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD = 10;
export const TRACKED_OPPORTUNITY_MAX_TURNS = 6;

function isEventSettled(runtime: RuntimeState, eventId: string): boolean {
  if (runtime.completedEventIds.includes(eventId)
    || (runtime.offscreenResolvedEventIds || []).includes(eventId)) return true;
  // 可达命运拍已经映射过冻结锚后，隔离 stage_06 不得再激活辞世。
  if (eventId === S06_03_EVENT_ID && xieyiFateAlreadyMapped(runtime)) return true;
  const event = runtime.events.find(item => item.id === eventId);
  const completion = event?.completion?.[0];
  if (
    completion?.path?.startsWith('flags.')
    && completion.path.endsWith('.done')
    && runtime.flags[completion.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true
  ) return true;
  return false;
}

function eventTimelineState(runtime: RuntimeState, eventId: string): ScenarioEventTimelineState | undefined {
  return runtime.eventTimeline?.[eventId];
}

function eventIsKnownToPlayer(runtime: RuntimeState, eventId: string): boolean {
  const event = runtime.events.find(item => item.id === eventId);
  if (!event?.timeline) return true;
  return eventTimelineState(runtime, eventId)?.playerLearnedAtTurn !== undefined;
}

/**
 * 第一版只从强证据建立“认识该实体”事实：主角档案记忆、开场明示、已亲历且玩家已获知的事件。
 * canon 列表只作为名字词典，不因“实体存在”自动授予知识；关系网络完全不参与。
 */
function syncPlayerKnowledgeLedger(runtime: RuntimeState): void {
  const ledger = runtime.playerKnowledge ||= {};
  const seenKnownFacts = new Set<string>();
  for (const [factId, fact] of Object.entries(ledger).sort(([, left], [, right]) =>
    left.learnedAtTurn - right.learnedAtTurn
    || left.factId.length - right.factId.length
    || (left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0)
  )) {
    if (fact.predicate !== 'known') continue;
    const semanticKey = [
      fact.subjectId,
      fact.predicate,
      fact.objectId || '',
      fact.status,
      fact.disclosureScope,
    ].join('\u0000');
    if (seenKnownFacts.has(semanticKey)) delete ledger[factId];
    else seenKnownFacts.add(semanticKey);
  }
  const characters = runtime.canon?.characters || [];
  const factions = runtime.canon?.factions || [];
  const player = characters.find(item => item.id === runtime.opening?.playerCharacterId);
  const sources: Array<{ text: string; turn: number; sourceEventId?: string }> = [
    ...((player?.profile?.memories || []).map(text => ({ text, turn: 0 }))),
    ...(runtime.opening?.text ? [{ text: runtime.opening.text, turn: 0 }] : []),
  ];
  for (const event of runtime.events) {
    if (!runtime.completedEventIds.includes(event.id) || !eventIsKnownToPlayer(runtime, event.id)) continue;
    sources.push({
      text: [event.name, event.description, event.axisBeat, event.objective].filter(Boolean).join('；'),
      turn: eventTimelineState(runtime, event.id)?.playerLearnedAtTurn ?? 0,
      sourceEventId: event.id,
    });
  }
  for (const entity of [...characters, ...factions]) {
    const source = sources.find(item => item.text.includes(entity.name));
    if (!source) continue;
    const alreadyConfirmed = Object.values(ledger).some(fact =>
      fact.subjectId === entity.id
      && fact.predicate === 'known'
      && fact.objectId === undefined
      && fact.status === 'confirmed'
      && (fact.disclosureScope === 'player' || fact.disclosureScope === 'public')
    );
    if (alreadyConfirmed) continue;
    const factId = `knowledge.player.entity.${entity.id}`;
    ledger[factId] ||= {
      factId,
      subjectId: entity.id,
      predicate: 'known',
      status: 'confirmed',
      disclosureScope: 'player',
      learnedAtTurn: source.turn,
      ...(source.sourceEventId ? { sourceEventId: source.sourceEventId } : {}),
    };
  }
}

function syncEventTimelineEligibility(saveData: SaveData, runtime: RuntimeState): void {
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  const rail = getCanonRailProfile(runtime);
  const nextRailId = rail?.orderedEventIds.find(id => !isEventSettled(runtime, id));
  runtime.eventTimeline ||= {};
  for (const event of runtime.events) {
    if (!event.timeline) continue;
    if (isEventSettled(runtime, event.id)) {
      if (!runtime.eventTimeline[event.id]) {
        runtime.eventTimeline[event.id] = {
          eligibleAtTurn: now,
          activatedAtTurn: now,
          occurredAtTurn: now,
          outcome: runtime.completedEventIds.includes(event.id) ? 'participated' : 'offscreen',
        };
      }
      continue;
    }
    const structurallyEligible = rail?.orderedEventIds.includes(event.id)
      ? event.id === nextRailId
      : conditionsMatch(event.conditions, saveData, runtime);
    if (!structurallyEligible) continue;
    if (!runtime.eventTimeline[event.id]) {
      // 旧档已在事件中途时用 stall 回推资格起点，避免热更后时间窗从零重算。
      const legacyAge = runtime.activeEventIds.includes(event.id)
        ? Math.max(0, Number(runtime.stallTurns) || 0)
        : 0;
      runtime.eventTimeline[event.id] = {
        eligibleAtTurn: Math.max(0, now - legacyAge),
        ...(runtime.activeEventIds.includes(event.id) ? { activatedAtTurn: Math.max(0, now - legacyAge) } : {}),
      };
    }
  }
}

function eventTimelineOpen(runtime: RuntimeState, event: ScenarioModEvent): boolean {
  if (!event.timeline) return true;
  const state = eventTimelineState(runtime, event.id);
  if (!state) return false;
  const age = Math.max(0, (Number(runtime.worldTurn) || 0) - state.eligibleAtTurn);
  return age >= event.timeline.notBeforeTurns;
}

function eventTimelineDeadlineDue(runtime: RuntimeState, event: ScenarioModEvent | undefined): boolean {
  if (!event?.timeline || event.timeline.deadlineTurns === undefined) return false;
  const state = eventTimelineState(runtime, event.id);
  if (!state) return false;
  return (Number(runtime.worldTurn) || 0) - state.eligibleAtTurn >= event.timeline.deadlineTurns;
}

function markEventTimelineOccurred(
  runtime: RuntimeState,
  eventId: string,
  outcome: 'participated' | 'offscreen',
): void {
  const event = runtime.events.find(item => item.id === eventId);
  if (!event?.timeline) return;
  runtime.eventTimeline ||= {};
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  const state = runtime.eventTimeline[eventId] ||= { eligibleAtTurn: now };
  if (state.occurredAtTurn === undefined) state.occurredAtTurn = now;
  state.outcome ||= outcome;
}

function refreshEventTimelineRevelations(
  runtime: RuntimeState,
  transitions: ScenarioRuntimeTransition[],
): void {
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  for (const event of runtime.events) {
    const contract = event.timeline;
    const state = eventTimelineState(runtime, event.id);
    if (!contract || state?.occurredAtTurn === undefined) continue;
    if (
      contract.reveal.publicAfterTurns !== undefined
      && state.publiclyRevealedAtTurn === undefined
      && now - state.occurredAtTurn >= contract.reveal.publicAfterTurns
    ) {
      state.publiclyRevealedAtTurn = now;
    }
    const learned = contract.reveal.playerKnowledge === 'immediate'
      || (
        contract.reveal.playerKnowledge === 'public_report'
        && state.publiclyRevealedAtTurn !== undefined
      )
      || (
        contract.reveal.playerKnowledge === 'permission'
        && Boolean(runtime.actorEngine?.entitlements.some(item => item.key === contract.reveal.permissionKey))
      );
    if (learned && state.playerLearnedAtTurn === undefined) {
      state.playerLearnedAtTurn = now;
      const factId = `knowledge.player.event.${event.id}`;
      runtime.playerKnowledge ||= {};
      runtime.playerKnowledge[factId] ||= {
        factId,
        subjectId: event.id,
        predicate: 'occurred',
        status: 'confirmed',
        disclosureScope: state.publiclyRevealedAtTurn !== undefined ? 'public' : 'player',
        learnedAtTurn: now,
        sourceEventId: event.id,
      };
      transitions.push({ type: 'event_revealed', id: event.id });
    }
  }
  for (const divergence of runtime.divergences || []) {
    if (divergence.revealed === false && eventIsKnownToPlayer(runtime, divergence.eventId)) {
      divergence.revealed = true;
    }
  }
}

function legacyOffscreenResolution(runtime: RuntimeState): NonNullable<ScenarioModEvent['offscreenResolution']> | undefined {
  if (runtime.modId !== 'lcq.stage_11_lieshan_battle') return undefined;
  const resolvedEventIds = runtime.events
    .filter(event => event.id.startsWith('lcq.event.s11_') && isCriticalStoryEvent(event))
    .map(event => event.id);
  return resolvedEventIds.length ? {
    id: 'offscreen.lcq.xingyuehu_war', afterStallTurns: OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD,
    flagKey: 'world.xingyuehu_war.offscreen_resolved', resolvedEventIds,
    worldDelta: '你未赴烈山，星月湖与宋军的战争仍自行推进；前锋伤亡更重，江州提前戒严，粮线告急的战报送到了你面前。',
    evidence: '引擎按星月湖战争脊柱结算玩家缺席后的战报与余波。',
  } : undefined;
}

/** 世界级事件不等玩家领取任务；合同来自事件数据，旧存档由兼容层补齐。 */
function resolveOffscreenWorldEvents(
  runtime: RuntimeState,
  transitions: ScenarioRuntimeTransition[],
  currentLocationId?: string,
  saveData?: SaveData,
): void {
  const declared = runtime.events.map(event => event.offscreenResolution).filter(Boolean) as NonNullable<ScenarioModEvent['offscreenResolution']>[];
  const resolutions = declared.length ? declared : [legacyOffscreenResolution(runtime)].filter(Boolean) as NonNullable<ScenarioModEvent['offscreenResolution']>[];
  for (const resolution of resolutions) {
    const knownIds = resolution.resolvedEventIds.filter(id => runtime.events.some(event => event.id === id));
    if (!knownIds.length) continue;
    // 正式 IF 会把被替代的源事件写入统一 settlement registry。必须在检查期限前
    // 跳过，否则“确认生还”和“下一轮默认死亡”会在 active 清理的竞态窗口并存。
    // 多事件合同只结算仍未落账的成员：既不能重写已由玩家/IF 结算的成员，也不能因
    // 其中一个成员已结算而永久遗留同组其余世界事件。
    const unresolvedIds = knownIds.filter(id => !isEventSettled(runtime, id));
    if (!unresolvedIds.length) continue;
    const owner = runtime.events.find(event => event.offscreenResolution?.id === resolution.id)
      || runtime.events.find(event => knownIds.includes(event.id));
    // worldActor 合同的玩家介入判定发生在当前轮，故需要预判本轮即将增加的 stall；
    // 旧世界事件合同沿用“已完整停滞轮数”语义，避免改变既有结算时点。
    const actorDrivenResolution = unresolvedIds.every(id =>
      Boolean(runtime.events.find(event => event.id === id)?.worldActor),
    );
    const effectiveStall = (runtime.stallTurns || 0)
      + (actorDrivenResolution && (runtime.steeringCooldown || 0) === 0 ? 1 : 0);
    const trackedAtTurn = Number(runtime.actorEngine?.trackedAtTurn);
    // 旧档可能只有 trackedOpportunityId 而没有 trackedAtTurn；这种不完整追踪
    // 必须立即视为过期，不能再次形成永久冻结场外结算的死锁。
    const trackedAge = Number.isFinite(trackedAtTurn)
      ? (Number(runtime.worldTurn) || 0) - trackedAtTurn
      : Number.POSITIVE_INFINITY;
    const hasTrackedIntervention = Boolean(
      runtime.actorEngine?.trackedOpportunityId
      && resolution.resolvedEventIds.includes(runtime.actorEngine.anchorEventId || '')
      && trackedAge < TRACKED_OPPORTUNITY_MAX_TURNS
    );
    // 配了 `pressure` 的拍：落定也走**事件自己的时钟**，与逼近提示同一把尺。
    // 否则逼近按事件龄推进、落定按全局 stall 判定，玩家做点别的就两边脱节
    // （制作人 2026-08-20 指出「铆定对应的 event，一旦触发之后就进入计数」）。
    const pressureStartedAt = owner?.pressure ? runtime.pressureStartedAt?.[owner.id] : undefined;
    const forced = Boolean(owner && (runtime.forcedWorldEventIds || []).includes(owner.id));
    const due = forced || (owner?.timeline?.deadlineTurns !== undefined
      ? eventTimelineDeadlineDue(runtime, owner)
      : pressureStartedAt !== undefined
        // 压力锚记在激活当轮 worldTurn++ 之后；到点检查在下一轮 ++ 之前。
        // 不加这一拍，afterStallTurns=4 的段强之死要第 5 次自由输入才落账。
        ? (Number(runtime.worldTurn) || 0) - pressureStartedAt + 1 >= resolution.afterStallTurns
        : effectiveStall >= resolution.afterStallTurns);
    if (forced && owner) {
      runtime.forcedWorldEventIds = (runtime.forcedWorldEventIds || []).filter(id => id !== owner.id);
    }
    const trackedOpportunity = findOpportunity(owner, runtime.actorEngine?.trackedOpportunityId);
    const trackedOpportunityState = trackedOpportunity
      ? runtime.actorEngine?.opportunityStates?.[trackedOpportunity.id]
      : undefined;
    const ownerReadyByContract = Boolean(
      owner?.id === runtime.actorEngine?.anchorEventId
      && trackedOpportunity?.completionContract
      && trackedOpportunityState?.completionReadyAtTurn !== undefined,
    );
    const localActionState = owner ? runtime.eventActionStates?.[owner.id] : undefined;
    const ownerReadyByLocalContract = Boolean(
      owner?.playerCompletionContract
      && localActionState?.contractHash === stableContractHash(owner.playerCompletionContract)
      && localActionState.readyAtTurn !== undefined,
    );
    if (
      !due
      || runtime.flags[resolution.flagKey] === true
      || hasTrackedIntervention
      || ownerReadyByContract
      || ownerReadyByLocalContract
    ) continue;
    // 数据增量会把一个关卡拆成多个场外合同；只允许当前已经激活的世界事件启动结算，
    // 否则同一 stall 阈值会把整关未来事件一次烧完。多事件战争合同仍由首个活跃节点启动整组。
    if (!unresolvedIds.some(id => runtime.activeEventIds.includes(id))) continue;
    // 线承重事件冻结：玩家没到现场，世界不许替他把帝统这类事办了（用户裁定 2026-08-16）。
    // 只冻 `LINE_CRITICAL_EVENTS` 里审核过的那批；到场之后照常规走，
    // 玩家可以介入、也可以放着让它结算——冻结只保证"有得选"，不保证"一定参与"。
    if (unresolvedIds.some(id => {
      const event = runtime.events.find(item => item.id === id);
      return event
        ? lineCriticalFrozen(event, runtime.modId, currentLocationId, Boolean(runtime.canon?.locations?.length))
        : false;
    })) continue;
    // 强制在场的拍：到点是**当场演完**，不是场外结算。
    // 用户 2026-08-20 裁定（段强之死这一拍）：「是需要当场演完的，因为我们在现场」。
    // 差别不只是文案——`offscreen` 这个 outcome 会让 `recordSettledBeatHandoff` 跳过这一拍，
    // 于是镜头明明在场，交接却按"你不在"处理。故在场版走 participated。
    const onScene = unresolvedIds.every(id =>
      runtime.events.find(item => item.id === id)?.playerPresence === 'required');
    runtime.flags[resolution.flagKey] = true;
    if (unresolvedIds.includes(XIEYI_ENTRUSTMENT_EVENT_ID)) {
      applyXieyiEntrustmentFateMapping(runtime, {
        actionId: 'accept_entrustment',
        evidence: (onScene && resolution.onSceneDelta) || resolution.worldDelta,
      }, saveData);
    }
    if (!onScene) {
      runtime.offscreenResolvedEventIds = [...new Set([...(runtime.offscreenResolvedEventIds || []), ...unresolvedIds])];
    } else {
      for (const id of unresolvedIds) if (!runtime.completedEventIds.includes(id)) runtime.completedEventIds.push(id);
    }
    runtime.activeEventIds = runtime.activeEventIds.filter(id => !unresolvedIds.includes(id));
    for (const eventId of unresolvedIds) markEventTimelineOccurred(runtime, eventId, onScene ? 'participated' : 'offscreen');
    refreshEventTimelineRevelations(runtime, transitions);
    recordOffscreenDivergence(runtime, {
      id: resolution.id, eventId: unresolvedIds[0],
      worldDelta: (onScene && resolution.onSceneDelta) || resolution.worldDelta, evidence: resolution.evidence,
      revealed: unresolvedIds.every(id => eventIsKnownToPlayer(runtime, id)),
    });
    transitions.push({ type: 'world_event_resolved', id: resolution.id });
  }
}

function appendChronicleEntry(
  runtime: RuntimeState,
  entry: Omit<ScenarioChronicleEntry, 'sequence'>,
): void {
  const chronicle = runtime.chronicle ??= [];
  if (chronicle.some(item => item.id === entry.id)) return;
  chronicle.push({ ...entry, sequence: chronicle.length + 1 });
}

/**
 * 绝路结算：危险逐轮逼近，到点吞没，本局结束。
 *
 * 时钟起点＝`afterActionId` 那一步成功的回合（省略则用本拍激活回合）——
 * 「王哲自爆」那一拍要的是**自爆之后**焰浪才开始逼近，不是一进场就开始倒数。
 * 逼近只送可观察事实，不预告死亡；到点才落 `gameOver`（裁定 #155：不用 UI 倒计时代替叙事）。
 */
function settleFatalDeadlines(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  if (runtime.gameOver) return;
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  if (runtime.pendingFatalApproach && runtime.pendingFatalApproach.atTurn !== now) {
    delete runtime.pendingFatalApproach;   // 上一轮的逼近不再重演
  }
  runtime.fatalApproachDelivered = Array.isArray(runtime.fatalApproachDelivered) ? runtime.fatalApproachDelivered : [];
  for (const eventId of runtime.activeEventIds) {
    const event = runtime.events.find(item => item.id === eventId);
    const deadline = event?.fatalOutcomes?.deadline;
    if (!event || !deadline || isEventSettled(runtime, eventId)) continue;
    let startedAt: number | undefined;
    if (deadline.afterActionId) {
      const attempt = (runtime.eventActionStates?.[eventId]?.attempts || [])
        .find(item => item.actionId === deadline.afterActionId && item.outcome !== 'failure');
      startedAt = attempt?.attemptedAtTurn;
    } else {
      startedAt = eventTimelineState(runtime, eventId)?.activatedAtTurn;
    }
    if (startedAt === undefined) continue;      // 危险还没开始，不计时
    const age = now - startedAt;
    if (age >= deadline.turns) {
      runtime.gameOver = {
        endingId: deadline.ending.id,
        title: deadline.ending.title,
        facts: [...deadline.ending.facts],
        sourceEventId: eventId,
        atTurn: now,
      };
      transitions.push({ type: 'game_over', id: deadline.ending.id });
      return;
    }
    const step = age - 1;                        // age 1 → approach[0]
    if (step < 0 || step >= deadline.approach.length) continue;
    const key = `${eventId}#${step}`;
    if (runtime.fatalApproachDelivered.includes(key)) continue;
    runtime.fatalApproachDelivered.push(key);
    // transition 只带内部 id，喂不到模型；正文必须另走一条能进提示词的路。
    runtime.pendingFatalApproach = {
      texts: [...(runtime.pendingFatalApproach?.atTurn === now ? runtime.pendingFatalApproach.texts : []), deadline.approach[step]],
      atTurn: now,
    };
    transitions.push({ type: 'fatal_approach', id: key, detail: deadline.approach[step] });
  }
}

/**
 * 场景压力：与绝路共用同一条送达路径，但到点不结束本局——
 * 到点由既有的 `offscreenResolution` 把这一拍按默认结果落定。
 *
 * 立项由来（2026-08-19）：制作人真机试玩后指出「玩家可以毫无止境地在中州草原闲逛，
 * 而不触发段强的死……这是战争场景不是日常，应该给到紧迫感」。
 * 查证：机制其实在（`afterStallTurns: 8`），但**8 轮里零信号**——
 * 引擎知道时钟在走，玩家不知道。与倒计时那个问题同一类：不喂到正文等于没有。
 */
function settleScenePressure(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  // 只在本局已结束时跳过。**不再因为绝路逼近已占槽而整段跳过**——
  // 那是单值时代的让位写法，会让同轮的场景压力静默消失；现在是队列，两者可以并存。
  if (runtime.gameOver) return;
  const now = Math.max(0, Number(runtime.worldTurn) || 0);
  runtime.fatalApproachDelivered = Array.isArray(runtime.fatalApproachDelivered) ? runtime.fatalApproachDelivered : [];
  runtime.pressureStartedAt = runtime.pressureStartedAt && typeof runtime.pressureStartedAt === 'object' ? runtime.pressureStartedAt : {};
  for (const eventId of runtime.activeEventIds) {
    const event = runtime.events.find(item => item.id === eventId);
    const pressure = event?.pressure;
    if (!event || !pressure || isEventSettled(runtime, eventId)) continue;
    // ⚠ 时钟**锚在这一拍上**，不用全局 `stallTurns`，也不用 `activatedAtTurn`。
    //
    // · `activatedAtTurn` 只对配了 `timeline` 字段的 event 存在（`syncEventTimelineEligibility`
    //   只给它们建状态），战场这些拍都没有 → 初版据此取值，逼近一次都发不出来。
    // · 换成 `stallTurns` 能发了，但制作人 2026-08-20 指出更根本的问题：
    //   「是不是需要铆定对应的 event，一旦触发之后就进入计数」——对。
    //   `stallTurns` 是**全局**计数，玩家顺手完成别的事就归零，
    //   于是焰浪从「远处喊杀换了方向」重新开始——**危险倒退了**；
    //   `steeringCooldown` 一开还会把它冻住。
    //
    // 故自建 `pressureStartedAt`：这一拍第一次激活时记下回合，此后单调递增，不受别处影响。
    const startedAt = runtime.pressureStartedAt[eventId] ?? now;
    if (runtime.pressureStartedAt[eventId] === undefined) runtime.pressureStartedAt[eventId] = now;
    const step = now - startedAt - pressure.afterTurns;
    if (step < 0 || step >= pressure.approach.length) continue;
    const key = `pressure:${eventId}#${step}`;
    if (runtime.fatalApproachDelivered.includes(key)) continue;
    runtime.fatalApproachDelivered.push(key);
    runtime.pendingFatalApproach = {
      texts: [...(runtime.pendingFatalApproach?.atTurn === now ? runtime.pendingFatalApproach.texts : []), pressure.approach[step]],
      atTurn: now,
    };
    transitions.push({ type: 'fatal_approach', id: key, detail: pressure.approach[step] });
  }
}

function recordSettledBeatHandoff(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  const completed = transitions
    .filter(transition => transition.type === 'event_completed')
    .map(transition => runtime.events.find(item => item.id === transition.id))
    .filter((event): event is ScenarioModEvent => {
      if (!event?.playerCompletionContract || event.exploration) return false;
      if (runtime.eventTimeline?.[event.id]?.outcome === 'offscreen') return false;
      return runtime.eventActionStates?.[event.id]?.readyAtTurn !== undefined;
    })
    .sort((left, right) =>
      (left.axisSeq ?? Number.NEGATIVE_INFINITY) - (right.axisSeq ?? Number.NEGATIVE_INFINITY)
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const event = completed.at(-1);
  if (!event) return;
  const actionState = runtime.eventActionStates?.[event.id];
  const settledAttempt = [...(actionState?.attempts || [])]
    .reverse()
    .find(attempt => attempt.attemptedAtTurn === actionState?.readyAtTurn);
  runtime.lastSettledBeat = {
    eventId: event.id,
    settledAtTurn: Math.max(0, Number(runtime.worldTurn) || 0),
    ...(settledAttempt?.factReceipts?.length
      ? { factReceipts: structuredClone(settledAttempt.factReceipts) }
      : {}),
    ...(() => {
      const target = getNarrativeAnchorEvent(runtime);
      return target && target.id !== event.id ? { targetEventId: target.id } : {};
    })(),
  };
}

function recordChronicleTransitions(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  const revealedEventIds = new Set(
    transitions.filter(item => item.type === 'event_revealed').map(item => item.id),
  );
  for (const transition of transitions) {
    if (transition.type === 'event_completed') {
      if (!eventIsKnownToPlayer(runtime, transition.id)) continue;
      const event = runtime.events.find(item => item.id === transition.id);
      appendChronicleEntry(runtime, {
        id: `chronicle.${runtime.modId || 'unknown'}.${transition.id}`,
        type: 'event', stageId: runtime.modId || '',
        title: event?.name || transition.id,
        detail: event?.objective || event?.axisBeat || event?.description,
      });
    } else if (transition.type === 'world_event_resolved') {
      const divergence = runtime.divergences?.find(item => item.id === transition.id);
      if (divergence?.revealed === false) continue;
      // 同一推进批次内玩家已经通过“消息传来”获知结果时，只留认识论正确的消息条目。
      // 否则相同 worldDelta 会同时显示成“消息传来”与“世界自行推进”。
      if (divergence?.eventId && revealedEventIds.has(divergence.eventId)) continue;
      appendChronicleEntry(runtime, {
        id: `chronicle.${runtime.modId || 'unknown'}.${transition.id}`,
        type: 'world', stageId: runtime.modId || '',
        title: '世界自行推进', detail: divergence?.worldDelta || transition.id,
      });
    } else if (transition.type === 'event_revealed') {
      const event = runtime.events.find(item => item.id === transition.id);
      const timeline = eventTimelineState(runtime, transition.id);
      if (timeline?.outcome === 'offscreen') {
        const divergence = runtime.divergences?.find(item => item.eventId === transition.id);
        const presentation = event?.timeline?.reveal.presentation;
        appendChronicleEntry(runtime, {
          id: `chronicle.${runtime.modId || 'unknown'}.${divergence?.id || transition.id}.revealed`,
          type: 'world', stageId: runtime.modId || '',
          title: presentation?.title || '来报', detail: divergence?.worldDelta || event?.description || transition.id,
        });
      } else {
        appendChronicleEntry(runtime, {
          id: `chronicle.${runtime.modId || 'unknown'}.${transition.id}`,
          type: 'event', stageId: runtime.modId || '',
          title: event?.name || transition.id,
          detail: event?.objective || event?.axisBeat || event?.description,
        });
      }
    } else if (transition.type === 'event_omen') {
      continue;
    }
  }
}

function backfillCompletedEventChronicle(runtime: RuntimeState): void {
  for (const eventId of runtime.completedEventIds || []) {
    if (!eventIsKnownToPlayer(runtime, eventId)) continue;
    const event = runtime.events.find(item => item.id === eventId);
    appendChronicleEntry(runtime, {
      id: `chronicle.${runtime.modId || 'unknown'}.${eventId}`,
      type: 'event', stageId: runtime.modId || '',
      title: event?.name || eventId,
      detail: event?.objective || event?.axisBeat || event?.description,
    });
  }
}

/** 唯一主线锚点：最早的已激活、未完成承重事件。
 *
 * 普通剧本以当前章节为边界。Canon Rail 则以原文 source-axis 为唯一
 * 顺序依据：旧生成稿的章节分组可能交错，不能让它反过来打乱正典拍点。
 * runtime 可同时保留资料/并行事件，但主叙事、UI 与 LLM 完成权限只能围绕这一拍推进。 */
export function getNarrativeAnchorEvent(runtime: Pick<RuntimeState, 'chapters' | 'events' | 'currentChapterId' | 'activeEventIds' | 'completedEventIds'> & Partial<Pick<RuntimeState, 'modId'>>): ScenarioModEvent | null {
  const chapter = (runtime.chapters || []).find(item => item.id === runtime.currentChapterId);
  const active = new Set(runtime.activeEventIds || []);
  const completed = new Set(runtime.completedEventIds || []);
  const order = new Map((chapter?.eventIds || []).map((id, index) => [id, index]));
  const railProfile = getCanonRailProfile(runtime);
  const chapterHasCritical = (runtime.events || []).some(event => order.has(event.id) && isCriticalStoryEvent(event));
  const railOrder = getCanonRailOrder(railProfile);
  const candidates = (runtime.events || [])
    .filter(event => active.has(event.id) && !completed.has(event.id)
      && (Boolean(railProfile?.orderedEventIds.includes(event.id)) || order.has(event.id)));
  const anchored = candidates.filter(isCriticalStoryEvent);
  if (railProfile) {
    return anchored
      .sort((a, b) => (railOrder.get(a.id) ?? Infinity) - (railOrder.get(b.id) ?? Infinity)
        || (a.axisSeq ?? Infinity) - (b.axisSeq ?? Infinity)
        || (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))[0] || null;
  }
  // 有承重链的章节绝不让资料/彩蛋事件顶替主线；承重链完成后交给 runtime 自动收章。
  return (chapterHasCritical ? anchored : candidates)
    .sort((a, b) => (railOrder.get(a.id) ?? Infinity) - (railOrder.get(b.id) ?? Infinity)
      || (a.axisSeq ?? Infinity) - (b.axisSeq ?? Infinity)
      || (order.get(a.id)! - order.get(b.id)!))[0] || null;
}

/**
 * 当前叙事中心。同行线仍是唯一 Canon Rail；世界模式只读当前未结局势所引用的
 * 既有事件资产。合同缺失、引用失效或局势耗尽时返回 null，不能静默复活 Rail 完成权。
 */
export function getScenarioFocusEvent(runtime: RuntimeState): ScenarioModEvent | null {
  if (runtime.storyMode === 'world_sim') return getWorldSimulationFocusEvent(runtime as any) || null;
  return getNarrativeAnchorEvent(runtime);
}

export function createScenarioProgress(mod: ScenarioMod): ScenarioProgressState {
  const chapters = structuredClone(mod.scenario.chapters || []);
  const events = structuredClone(mod.scenario.events || []);
  const runtimeForInitialFlags = {
    chapters,
    events,
    completedChapterIds: [],
    activeEventIds: [],
    completedEventIds: [],
    currentChapterId: null,
    flags: { ...(mod.scenario.initialFlags || {}) },
  } as RuntimeState;
  const emptySave = {} as SaveData;
  // initialFlags 描述的是开场前已经发生的事实。必须在第一次 Rail 选锚前
  // 把对应事件写入 completedEventIds；否则 UI 会先激活并展示一个 flag
  // 已经为 true 的旧事件，直到玩家完成首轮操作后才被运行时清算。
  const completedEventIds = events
    .filter(event => hasCompletion(event.completion)
      && conditionsMatch(event.completion, emptySave, runtimeForInitialFlags))
    .map(event => event.id);
  return {
    chapters,
    events,
    // 主角尚不自知的自身设定：必须随 runtime 走，storyContext 才看得到（否则禁令永不生效）。
    ...(mod.scenario.undisclosedSelfFacts?.length
      ? { undisclosedSelfFacts: structuredClone(mod.scenario.undisclosedSelfFacts) }
      : {}),
    completedChapterIds: [],
    activeEventIds: [],
    completedEventIds,
    playerKnowledge: createInitialPlayerKnowledge(mod),
    pathReceipts: {},
    npcPrivateKnowledge: createInitialNpcPrivateKnowledge(mod),
    inventoryTransferReceipts: [],
  };
}

export function getInitialScenarioChapterId(mod: ScenarioMod): string | null {
  const progress = createScenarioProgress(mod);
  const runtime: RuntimeState = {
    ...progress,
    currentChapterId: null,
    flags: { ...(mod.scenario.initialFlags || {}) },
  };
  const emptySave = {} as SaveData;
  return runtime.chapters.find(chapter => conditionsMatch(chapter.activation, emptySave, runtime))?.id || null;
}

// 把 LLM 写成嵌套的 flags 摊平回扁平点号键（嵌套值较新、优先），并归一 "true"/"false" 字符串。
// 避免 flags 里同键扁平/嵌套双写矛盾（扁平陈旧 false + 嵌套 true），也让 prompt 的「剧情标记」显示一致。
function normalizeRuntimeFlags(runtime: RuntimeState): void {
  const flags = runtime.flags as Record<string, unknown>;
  const flatten = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value as Record<string, unknown>, path);
      else flags[path] = coerceScalar(value);
    }
  };
  for (const [key, value] of Object.entries(flags)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, key);
      delete flags[key];
    } else {
      flags[key] = coerceScalar(value);
    }
  }
}

/** 当一章列出的事件均已完成时，补上该章的标准完成 flag。
 *
 * 事件完成由 LLM 指令或事件对账落账；章节 flag 却没有独立叙事事实，继续让模型额外填写会
 * 造成“所有事件已完成但章节永远不切换”的死锁。只处理标准的 flags.<key> = true 完成条件，
 * 其他自定义条件仍保留原有显式判定，避免覆盖作者定义的额外门槛。
 */
function settleCompletedChapterFlags(runtime: RuntimeState): void {
  const completed = new Set(runtime.completedEventIds || []);
  const flags = runtime.flags as Record<string, unknown>;
  for (const chapter of runtime.chapters || []) {
    const profile = getCanonRailProfile(runtime);
    if (isCanonRailChapter(profile, chapter.id) && !profile!.orderedEventIds.every(id => completed.has(id))) continue;
    const listedIds = chapter.eventIds || [];
    const criticalIds = listedIds.filter(id => {
      const event = runtime.events.find(item => item.id === id);
      return Boolean(event && isCriticalStoryEvent(event));
    });
    const eventIds = criticalIds.length ? criticalIds : listedIds;
    const completion = chapter.completion || [];
    const standardFlagCompletion = completion.length > 0 && completion.every(condition =>
      condition.path.startsWith('flags.') && condition.operator === 'eq' && condition.value === true,
    );
    if (!eventIds.length || !standardFlagCompletion || !eventIds.every(id => completed.has(id))) continue;
    for (const condition of completion) {
      flags[condition.path.slice('flags.'.length)] = true;
    }
  }
}

// 旧档 reconcile：registry 版本变更后，把烘焙在存档里的正典对齐到最新（保守，只动正典派生物）。
// ① canon.characters 用 resolver 重投影（personality 卡为准 / 派生 notes 重建 / 历程等新字段带上）
// ② 世界.信息.地点信息 补缺失的地图点位（此前太泉古阵类缺点只能手工修档）
// 惰性加载：builtins 用 require.context(仅 webpack 可用)、resolver 引 registry JSON——
// node 测试环境加载不了 → 安全降级为 no-op(不 stamp,真实环境仍会对齐)。
function getReconcileDeps(): { version: string; resolve: (c: unknown[] | undefined, id: string) => number; mods: ScenarioMod[] } | null {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports -- Webpack-only builtins must remain lazy for the Node test harness. */
    const resolver = require('./characterResolver') as { REGISTRY_VERSION: string; resolveScenarioCharacters: (c: unknown[] | undefined, id: string) => number };
    const builtins = require('./builtins') as { BUILTIN_SCENARIO_MODS: ScenarioMod[] };
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { version: resolver.REGISTRY_VERSION, resolve: resolver.resolveScenarioCharacters, mods: builtins.BUILTIN_SCENARIO_MODS || [] };
  } catch { return null; }
}

/**
 * 旧档会把事件合同烘焙进 runtime。后续新增的知情表现若只存在于内置 Mod，旧档即使继续游玩也
 * 只能回落到通用“消息传来”。这里只补缺失的表现元数据：不新增／改写 timeline 规则，
 * 不覆盖已有 presentation，更不触碰事件、世界回合或玩家状态。
 */
export function backfillRuntimeEventRevealPresentations(
  runtime: Pick<RuntimeState, 'events'>,
  canonicalEvents: ScenarioModEvent[],
): number {
  const canonicalById = new Map(canonicalEvents.map(event => [event.id, event]));
  let updated = 0;
  for (const savedEvent of runtime.events || []) {
    const savedReveal = savedEvent.timeline?.reveal;
    const canonicalPresentation = canonicalById.get(savedEvent.id)?.timeline?.reveal?.presentation;
    if (!savedReveal || savedReveal.presentation || !canonicalPresentation) continue;
    savedReveal.presentation = structuredClone(canonicalPresentation);
    updated += 1;
  }
  return updated;
}

/**
 * 旧档只补缺失的事前征兆合同。不改期限/知情规则，不把已结算事件倒带回放，
 * 已结算事件只把对应 ID 记作过期，防止后续配置迁移倒带补播。
 */
export function backfillRuntimeWorldOmens(
  runtime: Pick<RuntimeState, 'events' | 'worldSimulation' | 'storyMode'>,
  canonicalEvents: ScenarioModEvent[],
  canonicalWorldSimulation?: ScenarioWorldSimulation,
): number {
  let updated = 0;
  // 全 stage baseline 发布前已经创建的 world_sim 旧档可能没有合同快照；
  // 只对显式 world_sim 补入当前 stage 的合同，兼容模式绝不被升级。
  if (runtime.storyMode === 'world_sim' && !runtime.worldSimulation && canonicalWorldSimulation) {
    runtime.worldSimulation = structuredClone(canonicalWorldSimulation);
    updated += canonicalWorldSimulation.situations?.length || 1;
  }
  const canonicalById = new Map(canonicalEvents.map(event => [event.id, event]));
  for (const savedEvent of runtime.events || []) {
    const savedTimeline = savedEvent.timeline;
    const canonicalOmen = canonicalById.get(savedEvent.id)?.timeline?.omen;
    if (!savedTimeline || savedTimeline.omen || !canonicalOmen) continue;
    savedTimeline.omen = structuredClone(canonicalOmen);
    updated += 1;
  }
  const savedSituations = runtime.worldSimulation?.situations;
  if (savedSituations && canonicalWorldSimulation?.situations) {
    const canonicalSituationById = new Map(canonicalWorldSimulation.situations.map(item => [item.id, item]));
    for (const situation of savedSituations) {
      const canonicalOmen = canonicalSituationById.get(situation.id)?.omen;
      if (situation.omen || !canonicalOmen) continue;
      situation.omen = structuredClone(canonicalOmen);
      updated += 1;
    }
  }
  return updated;
}

function reconcileSaveWithRegistry(saveData: SaveData, runtime: RuntimeState & { modId?: string; reconciledRegistryVersion?: string; canon?: { characters?: unknown[] } }): void {
  const deps = getReconcileDeps();
  if (!deps) return;
  const modId = String((runtime as { modId?: string }).modId || '');
  const mod = deps.mods.find(item => item.manifest?.id === modId);
  // 新增显式知情声明必须能补进已存在的关卡存档；只补缺失 factId，不覆盖玩家
  // 游玩过程中已经携带的来源/轮次，也不因热更删除而静默擦除历史。
  if (mod) {
    const ledger = runtime.npcPrivateKnowledge ||= {};
    for (const [factId, fact] of Object.entries(createInitialNpcPrivateKnowledge(mod))) {
      ledger[factId] ||= fact;
    }
    backfillRuntimeEventRevealPresentations(runtime, mod.scenario.events || []);
    backfillRuntimeWorldOmens(runtime, mod.scenario.events || [], mod.scenario.worldSimulation);
  }
  if (runtime.reconciledRegistryVersion === deps.version) return;
  try {
    deps.resolve((runtime as { canon?: { characters?: any[] } }).canon?.characters, modId);
    const worldInfo = readPath(saveData, ['世界', '信息']) as Record<string, unknown> | undefined;
    const saveLocations = worldInfo?.地点信息;
    if (mod && Array.isArray(saveLocations)) {
      const byName = new Map<string, any>();
      for (const item of saveLocations as any[]) {
        const n = item?.名称;
        if (typeof n === 'string' && n && !byName.has(n)) byName.set(n, item);
      }
      for (const loc of (mod.canon?.locations || []) as Array<{ name?: string; description?: string; type?: string; coordinates?: { x: number; y: number } }>) {
        if (!loc?.name || !loc.coordinates) continue;
        const found = byName.get(loc.name);
        if (found) {
          // 已存在：坐标是正典派生物（非玩家状态），按最新正典强制对齐——
          // 否则旧档带着修正前的错坐标（实测：建康钉在宋境）永远不更新。
          const cur = (found as any).coordinates || (found as any).坐标;
          if (!cur || cur.x !== loc.coordinates.x || cur.y !== loc.coordinates.y) {
            (found as any).coordinates = { ...loc.coordinates };
            (found as any).坐标 = { ...loc.coordinates };
          }
          continue;
        }
        byName.set(loc.name, null);
        saveLocations.push({
          名称: loc.name, 位置: '', coordinates: { ...loc.coordinates }, 坐标: { ...loc.coordinates },
          描述: loc.description || '', 特色: '', 安全等级: '较安全', 开放状态: '开放', 相关势力: [], 类型: loc.type || '城池',
        });
      }
    }
    console.info(`[剧本reconcile] 存档正典已对齐 registry ${deps.version}`);
  } catch (error) {
    console.warn('[剧本reconcile] 失败(不影响游戏):', error);
  }
  runtime.reconciledRegistryVersion = deps.version;
}

// 正典人格底线投影：把 registry principles 落到 社交.关系.<NPC>.人格底线（UI 显示 + 触犯好感暴跌机制）。
// 与提示词侧一致地按关系门控——达「信重」档或"自己人类"关系才揭示（陌生/敌对时保持"未记录"=尚未摸透）。
// 只填空的，不覆盖 LLM/玩家已写的底线；每回合运行(好感是动态的,跨过阈值即补)。
// ⚠️ 阈值必须与 storyContext 的提示词侧门控同源：两边曾各写死 30，R3-9 迁移时只改了提示词侧
// 变成 40，持久化侧仍是 30，同一个「底线揭示」概念两侧脱钩（独立二审 P1 抓到）。此后只引用常量。
const 底线揭示好感 = AFFINITY_THRESHOLDS.bottomLineReveal;
const 自己人关系 = /同伴|伙伴|队友|道侣|伴侣|挚友|知己|情人|爱慕|恋|妾|后宫|侍妾|奴|婢|主仆|仆|结义|亲密|归顺|臣服|忠/;
function projectBottomLinesToNpcs(saveData: SaveData): void {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports -- keep registry loading optional outside the Webpack runtime. */
    const { getRegistryBottomLine } = require('./characterResolver') as { getRegistryBottomLine: (name: string) => string[] };
    /* eslint-enable @typescript-eslint/no-require-imports */
    const relations = readPath(saveData, ['社交', '关系']) as Record<string, any> | undefined;
    if (!relations || typeof relations !== 'object') return;
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object' || key.startsWith('_')) continue;
      if (Array.isArray(npc.人格底线) && npc.人格底线.length) continue; // 不覆盖已有
      const fav = Number(npc.好感度) || 0;
      const label = String(npc.与玩家关系 || '');
      if (fav < 底线揭示好感 && !自己人关系.test(label)) continue; // 未达揭示条件 → 保持未记录
      const name = String(npc.名字 || key);
      const canon = getRegistryBottomLine(name);
      if (canon.length) npc.人格底线 = canon;
    }
  } catch { /* 惰性 require 在 node 测试环境不可用 → 安全跳过 */ }
}

/**
 * 玩家主动偏移主线时置入的引子静默轮数。
 * 语义：置入当轮 advanceScenarioRuntime 会立即递减 1，故净静默约 (N-1) 轮；取 4 → 净静默约 3 轮，落在"3~4 轮"目标区间。
 *
 * 【判定归乙】玩家是否"主动偏移主线"由乙（分步第2步 LLM，写布尔 系统.扩展.任务追踪.主线偏移提议）判定：
 * 这需要理解整句意图（是闲逛偏离，还是借闲逛措辞执行主线目标），依赖 NPC/目标/上下文语义。
 * 曾尝试过关键词正则快判(甲)，经 Codex 五轮复审确认——正则永远追不上自然语言的否定/复合/语义，故废弃。
 * 引擎只据乙的布尔信号确定性置入本冷却值（见 AIBidirectionalSystem.processGmResponse）。
 */
export const STEERING_DIVERGENCE_COOLDOWN = 4;

/**
 * 相识账本同步（R3-12）。每回合推进时把"玩家见过谁"落进存档。
 *
 * 与 `collectIntroducedCharacterIds` 的关键区别：那个只算进 prompt 副本、切关即失；
 * 本账本写进 runtime 并由 initializer 跨关继承，因为"认识过"是不会因为换了一关就消失的事实。
 * 首次写入（账本为空且已有完成事件）标 `backfilled`，表示是从既有进度近似回填而非实时记录。
 */
function updateAcquaintanceLedger(saveData: SaveData, runtime: RuntimeState & { modId?: string }): void {
  try {
    const rt = runtime as unknown as {
      acquaintances?: AcquaintanceLedger;
      canon?: { characters?: Array<{ id: string; name: string; role?: string; description?: string }> };
      opening?: { featuredCharacterIds?: string[] };
      events?: Array<{ id: string; relatedCharacterIds?: string[] }>;
      activeEventIds?: string[];
      completedEventIds?: string[];
      worldTurn?: number;
      modId?: string;
    };
    const characters = rt.canon?.characters || [];
    if (!characters.length) return;
    const isFirstWrite = !rt.acquaintances || !Object.keys(rt.acquaintances).length;
    const hasProgress = Boolean(rt.completedEventIds?.length);
    rt.acquaintances = rt.acquaintances && typeof rt.acquaintances === 'object' ? rt.acquaintances : {};

    // ⚠ 只认**已完成**的事件。事件"激活"只表示这一拍开始了，玩家还没见到人——
    // 若把 activeEventIds 也算进来，账本会在该拍第一轮就把人记成 encountered，
    // 名字因此比见面早整整一拍（2026-08-20 做反例测试时查出：`太乙真宗介入` 一激活，
    // 蔺采泉／商乐轩／卓云君／月霜 立刻全部解禁；`程宗扬见王哲` 一激活王哲立刻解禁）。
    // 正在进行的那一拍里，人物由正文按外观指代；拍一落定就记账，此后可以直呼其名。
    const seen = new Set(rt.completedEventIds || []);
    // 记住"是哪个事件带来的相识"——处境不必另建枚举推导，事件语境本身就是处境。
    const metIds = new Map<string, string>();
    for (const event of rt.events || []) {
      if (!seen.has(event.id)) continue;
      for (const id of event.relatedCharacterIds || []) if (!metIds.has(id)) metIds.set(id, event.id);
    }
    // 相遇当时她是谁：本关投影身份（characters 已经过 resolveScenarioCharacters 还原）。
    const identities = new Map<string, string>();
    for (const item of characters as Array<{ id: string; role?: string; description?: string }>) {
      const identity = String(item.role || item.description || '').trim();
      if (identity) identities.set(item.id, identity.slice(0, 60));
    }
    syncAcquaintanceLedger({
      ledger: rt.acquaintances,
      stageId: rt.modId,
      worldTurn: rt.worldTurn,
      characterNames: new Map(characters.map(item => [item.id, item.name])),
      characterIdentities: identities,
      metCharacterIds: metIds,
      featuredCharacterIds: rt.opening?.featuredCharacterIds,
      relations: (saveData as unknown as { 社交?: { 关系?: Record<string, unknown> } })?.社交?.关系,
      backfilled: isFirstWrite && hasProgress,
      playerName: String(
        (saveData as unknown as { 角色?: { 身份?: { 名字?: unknown } } })?.角色?.身份?.名字 || '',
      ).trim() || undefined,
    });
  } catch (error) {
    console.warn('[剧本模组] 相识账本同步失败（不阻断回合）:', error);
  }
}

/**
 * 关系姿态滞回推进（R3-9 G1）。
 *
 * 路线图明确要求"避免好感增减 1 点造成角色瞬间翻脸"。滞回需要记住上一次的姿态，
 * 所以状态必须持久化——`storyContext` 是只读的 prompt 构建层，不能在那里算。
 * 这里每回合按当前好感推进一次，`storyContext` 只读结果。
 *
 * 与相识账本同构：写 runtime、跨关继承（见 strictInitializer）。
 */
function updateStanceStates(saveData: SaveData, runtime: RuntimeState & { modId?: string }): void {
  try {
    const rt = runtime as unknown as { stanceStates?: Record<string, StanceState> };
    const relations = (saveData as unknown as { 社交?: { 关系?: Record<string, unknown> } })?.社交?.关系;
    if (!relations || typeof relations !== 'object') return;
    const day = gameDayOf(
      (saveData as unknown as { 元数据?: { 时间?: { 年?: unknown; 月?: unknown; 日?: unknown } } })?.元数据?.时间,
    );
    rt.stanceStates = rt.stanceStates && typeof rt.stanceStates === 'object' ? rt.stanceStates : {};
    for (const [key, npc] of Object.entries(relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const name = String((npc as { 名字?: unknown }).名字 || key);
      const favorability = Number((npc as { 好感度?: unknown }).好感度) || 0;
      rt.stanceStates[name] = projectStance(favorability, rt.stanceStates[name], day);
    }
  } catch (error) {
    console.warn('[剧本模组] 关系姿态推进失败（不阻断回合）:', error);
  }
}

/**
 * 共历事件的好感结算（R3-9 §7「正典锚点」）。
 *
 * 一起经历过的事，关系就该有变化——这是好感变化**唯一确定的因果来源**，
 * 其余仍由模型在 ±15 内裁量。三条纪律：
 *
 *   1. **只算玩家亲历**：`offscreenResolvedEventIds` 里的场外结算不给分。
 *      没参与的事凭什么拉近关系。
 *   2. **每个事件只结算一次**：已结算的记进 `affinityGrantedEventIds`，
 *      避免每回合重复给分（completedEventIds 是累积的）。
 *   3. **仍受 cap 约束**：立场先于情感的角色不会因为一起做了事就突破天花板。
 *
 * 走引擎通道，不占模型的 ±15 单回合预算——否则引擎给的分会被日常加减挤掉。
 */
export interface SharedExperienceGrant {
  name: string;
  from: number;
  to: number;
  eventId: string;
  eventName?: string;
}

/**
 * 事件驱动的声望结算（P1-4）——把扬名从模型自觉改成引擎因果。
 *
 * 与 `settleSharedExperienceAffinity` 同构，三条纪律照搬：
 *   1. **只算玩家亲历**：`offscreenResolvedEventIds` 里的场外结算不给分。
 *      人不在场，名声凭什么算到他头上。
 *   2. **每个事件只结算一次**：已结算的记进 `reputationGrantedEventIds`。
 *   3. **旧档首次结算只登记、不补发**：存档里的声望值已经包含那些事件的影响
 *      （当时由模型一路加上来），补发等于重复计算——好感那边真机踩过这个坑。
 *
 * 立项理由与数值标定见 `reputationLedger.ts`。模型仍可为事件之外的扬名／败名写声望
 * （`storyContext` 的 reputationLine 指引不变），引擎只负责承重事件这条确定线。
 */
function settleEventReputation(
  saveData: SaveData,
  runtime: RuntimeState & { modId?: string },
): ReputationGrant[] {
  const grants: ReputationGrant[] = [];
  try {
    const rt = runtime as unknown as {
      reputationGrantedEventIds?: string[];
      completedEventIds?: string[];
      offscreenResolvedEventIds?: string[];
      events?: ScenarioModEvent[];
    };
    const attrs = (saveData as unknown as { 角色?: { 属性?: Record<string, unknown> } })?.角色?.属性;
    if (!attrs || typeof attrs !== 'object') return grants;

    const isFirstSettlement = rt.reputationGrantedEventIds === undefined;
    const granted = new Set(rt.reputationGrantedEventIds || []);
    const offscreen = new Set(rt.offscreenResolvedEventIds || []);
    const pending = (rt.completedEventIds || []).filter(id => !granted.has(id) && !offscreen.has(id));
    if (!pending.length) {
      if (isFirstSettlement) rt.reputationGrantedEventIds = [];
      return grants;
    }
    if (isFirstSettlement) {
      rt.reputationGrantedEventIds = [...new Set([...(rt.completedEventIds || [])])];
      return grants;
    }

    const eventById = new Map((rt.events || []).map(event => [event.id, event]));
    for (const eventId of pending) {
      const event = eventById.get(eventId);
      granted.add(eventId);
      if (!event) continue;
      const amount = isCriticalStoryEvent(event)
        ? REPUTATION_EVENT_GRANT.critical
        : REPUTATION_EVENT_GRANT.normal;
      const current = Number(attrs.声望) || 0;
      const settled = current + amount;
      attrs.声望 = settled;
      // 引擎侧的变化必须能进玩家可见的状态流，否则因果只存在于代码里。
      // 地区立足度不在这里累加——它是**派生量**，见 `reputationLedger.regionStanding()`。
      grants.push({ from: current, to: settled, eventId, eventName: event.name, amount });
    }
    rt.reputationGrantedEventIds = [...granted];
  } catch (error) {
    console.warn('[剧本模组] 事件声望结算失败（不阻断回合）:', error);
  }
  return grants;
}

function settleSharedExperienceAffinity(
  saveData: SaveData,
  runtime: RuntimeState & { modId?: string },
): SharedExperienceGrant[] {
  const grants: SharedExperienceGrant[] = [];
  try {
    const rt = runtime as unknown as {
      affinityGrantedEventIds?: string[];
      completedEventIds?: string[];
      offscreenResolvedEventIds?: string[];
      events?: ScenarioModEvent[];
      canon?: { characters?: Array<{ id: string; name: string }> };
    };
    const relations = (saveData as unknown as { 社交?: { 关系?: Record<string, unknown> } })?.社交?.关系;
    if (!relations || typeof relations !== 'object') return grants;

    // 旧档首次结算：**只登记不补发**。存档里的好感值本身已经包含那些事件的影响
    // （当时由模型一路加上来），补发等于重复计算。真机实测过一次：某旧档已完成 7 个事件，
    // 首次结算让小紫 40→64，一次跳两档。与相识账本的 backfilled 同构，只是这里后果更实——
    // 账本回填只是记录，好感补发直接改数值。
    const isFirstSettlement = rt.affinityGrantedEventIds === undefined;
    const granted = new Set(rt.affinityGrantedEventIds || []);
    const offscreen = new Set(rt.offscreenResolvedEventIds || []);
    const pending = (rt.completedEventIds || []).filter(id => !granted.has(id) && !offscreen.has(id));
    if (!pending.length) {
      if (isFirstSettlement) rt.affinityGrantedEventIds = [];
      return grants;
    }
    if (isFirstSettlement) {
      rt.affinityGrantedEventIds = [...new Set([...(rt.completedEventIds || [])])];
      return grants;
    }

    const nameById = new Map((rt.canon?.characters || []).map(item => [item.id, item.name]));
    const eventById = new Map((rt.events || []).map(event => [event.id, event]));

    for (const eventId of pending) {
      const event = eventById.get(eventId);
      granted.add(eventId);
      if (!event) continue;
      const grant = isCriticalStoryEvent(event) ? AFFINITY_EVENT_GRANT.critical : AFFINITY_EVENT_GRANT.normal;
      for (const characterId of event.relatedCharacterIds || []) {
        const name = nameById.get(characterId);
        if (!name) continue;
        const npc = relations[name] as { 好感度?: unknown; 与玩家关系?: unknown } | undefined;
        if (!npc || typeof npc !== 'object') continue;
        const current = Number(npc.好感度) || 0;
        const label = typeof npc.与玩家关系 === 'string' ? npc.与玩家关系 : undefined;
        const cap = affinityCapFor(name, label);
        const ceiling = cap ? cap.cap : 100;
        if (current >= ceiling) continue;
        const settled = clampAffinity(Math.min(ceiling, current + grant));
        npc.好感度 = settled;
        // 记录明细：引擎侧的变化必须能进玩家可见的状态流，否则因果只存在于代码里。
        grants.push({ name, from: current, to: settled, eventId, eventName: event.name });
      }
    }
    rt.affinityGrantedEventIds = [...granted];
  } catch (error) {
    console.warn('[剧本模组] 共历事件好感结算失败（不阻断回合）:', error);
  }
  return grants;
}

/** 本轮按该拍已有的在场/场外合同结算，不拨时钟。事件未激活或已结清时返回 false。 */
export function forceActiveWorldEventResolution(saveData: SaveData, eventId: string): boolean {
  const runtime = getRuntime(saveData);
  if (!runtime || !eventId) return false;
  if (isEventSettled(runtime, eventId)) return false;
  if (!runtime.activeEventIds.includes(eventId)) return false;
  const event = runtime.events.find(item => item.id === eventId);
  if (!event?.offscreenResolution) return false;
  runtime.forcedWorldEventIds = [...new Set([...(runtime.forcedWorldEventIds || []), eventId])];
  return true;
}

export interface ImminentWorldResolution {
  eventId: string;
  eventName: string;
  ending: string;
  afterStallTurns: number;
}

/** 只读：本轮 advance 会按在场/场外合同收束哪一拍。不改传入存档。 */
export function peekImminentWorldResolution(saveData: SaveData): ImminentWorldResolution | null {
  const runtime = getRuntime(saveData);
  if (!runtime) return null;
  const beforeIds = [...runtime.activeEventIds];
  const { saveData: after, transitions } = advanceScenarioRuntime(saveData);
  if (!transitions.some(item => item.type === 'world_event_resolved')) return null;
  const afterRuntime = getRuntime(after);
  if (!afterRuntime) return null;
  const event = runtime.events.find(item => (
    beforeIds.includes(item.id)
    && Boolean(item.offscreenResolution)
    && isEventSettled(afterRuntime, item.id)
  ));
  if (!event?.offscreenResolution) return null;
  const onScene = event.playerPresence === 'required';
  const ending = String((onScene && event.offscreenResolution.onSceneDelta) || event.offscreenResolution.worldDelta || '').trim();
  if (!ending) return null;
  return {
    eventId: event.id,
    eventName: String(event.name || ''),
    ending,
    afterStallTurns: event.offscreenResolution.afterStallTurns,
  };
}

export function advanceScenarioRuntime(saveData: SaveData): {
  saveData: SaveData;
  transitions: ScenarioRuntimeTransition[];
  /** 本轮共历事件带来的好感变动，供调用方推进玩家可见的状态流。 */
  affinityGrants?: SharedExperienceGrant[];
  /** 本轮承重事件带来的声望变动（P1-4），同样进玩家可见状态流。 */
  reputationGrants?: ReputationGrant[];
} {
  const next = structuredClone(saveData);
  const runtime = getRuntime(next);
  if (!runtime) return { saveData: next, transitions: [] };
  // 本局已结束：不再推进任何进度，也不再激活新拍。玩家只能读档。
  if ((runtime as RuntimeState).gameOver) return { saveData: next, transitions: [] };
  reconcileSaveWithRegistry(next, runtime as RuntimeState & { modId?: string });
  projectBottomLinesToNpcs(next);
  updateAcquaintanceLedger(next, runtime as RuntimeState & { modId?: string });
  const affinityGrants = settleSharedExperienceAffinity(next, runtime as RuntimeState & { modId?: string });
  const reputationGrants = settleEventReputation(next, runtime as RuntimeState & { modId?: string });
  updateStanceStates(next, runtime as RuntimeState & { modId?: string });
  normalizeRuntimeFlags(runtime);
  settleReadyOpportunityCompletionFlags(runtime);
  settleReadyEventActionCompletionFlags(runtime);

  runtime.chapters = Array.isArray(runtime.chapters) ? runtime.chapters : [];
  runtime.events = Array.isArray(runtime.events) ? runtime.events : [];
  runtime.completedChapterIds = Array.isArray(runtime.completedChapterIds) ? runtime.completedChapterIds : [];
  runtime.activeEventIds = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  runtime.completedEventIds = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  runtime.eventActivatedAtLocation = runtime.eventActivatedAtLocation && typeof runtime.eventActivatedAtLocation === 'object'
    ? runtime.eventActivatedAtLocation
    : {};
  for (const eventId of runtime.activeEventIds) rememberEventActivationLocation(next, runtime, eventId);
  settleArrivalObjective(next, runtime);
  settleAbandonedXieyiEntrustment(next, runtime);
  settleReadyEventActionCompletionFlags(runtime);
  runtime.offscreenResolvedEventIds = Array.isArray(runtime.offscreenResolvedEventIds) ? runtime.offscreenResolvedEventIds : [];
  runtime.eventTimeline = runtime.eventTimeline && typeof runtime.eventTimeline === 'object'
    ? runtime.eventTimeline
    : {};
  runtime.playerKnowledge = runtime.playerKnowledge && typeof runtime.playerKnowledge === 'object'
    ? runtime.playerKnowledge
    : {};
  runtime.pathReceipts = runtime.pathReceipts && typeof runtime.pathReceipts === 'object'
    ? runtime.pathReceipts
    : {};
  runtime.npcPrivateKnowledge = runtime.npcPrivateKnowledge && typeof runtime.npcPrivateKnowledge === 'object'
    ? runtime.npcPrivateKnowledge
    : {};
  runtime.eventActionStates = runtime.eventActionStates && typeof runtime.eventActionStates === 'object'
    ? runtime.eventActionStates
    : {};
  const transitions: ScenarioRuntimeTransition[] = [];
  const railProfile = getCanonRailProfile(runtime);

  syncEventTimelineEligibility(next, runtime);
  refreshEventTimelineRevelations(runtime, transitions);
  syncPlayerKnowledgeLedger(runtime);
  backfillCompletedEventChronicle(runtime);
  resolveOffscreenWorldEvents(
    runtime,
    transitions,
    resolveLocationIdFromPosition(
      (next as unknown as { 角色?: { 位置?: { 描述?: unknown } } })?.角色?.位置?.描述,
      runtime.canon?.locations,
    ),
    next,
  );

  const current = runtime.chapters.find(chapter => chapter.id === runtime.currentChapterId);
  const currentEventIds = new Set(current?.eventIds || []);
  for (const activeId of [...runtime.activeEventIds]) {
    const event = runtime.events.find(item => item.id === activeId);
    const isRailEvent = Boolean(railProfile?.orderedEventIds.includes(activeId));
    if (!event || (!isRailEvent && !currentEventIds.has(activeId))) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== activeId);
      continue;
    }
    if (isEventSettled(runtime, activeId)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== activeId);
      continue;
    }
    if (hasCompletion(event.completion) && conditionsMatch(event.completion, next, runtime)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== activeId);
      if (!runtime.completedEventIds.includes(activeId)) runtime.completedEventIds.push(activeId);
      markEventTimelineOccurred(runtime, activeId, 'participated');
      transitions.push({ type: 'event_completed', id: activeId });
    }
  }

  // 清算未曾活跃但完成条件已满足的事件（LLM 可能提前/越序 set 了 done flag）。
  // 否则章节一完成清空 activeEventIds 后，这些 critical 事件永远进不了 completedEventIds → stage_ready 死锁。
  for (const event of runtime.events) {
    if (railProfile?.orderedEventIds.includes(event.id)) continue;
    if (isEventSettled(runtime, event.id)) continue;
    if (hasCompletion(event.completion) && conditionsMatch(event.completion, next, runtime)) {
      runtime.activeEventIds = runtime.activeEventIds.filter(id => id !== event.id);
      runtime.completedEventIds.push(event.id);
      markEventTimelineOccurred(runtime, event.id, 'participated');
      transitions.push({ type: 'event_completed', id: event.id });
    }
  }

  // 事件落账后立即派生本章完成 flag，保证后续章节 activation 能在同一轮生效。
  settleCompletedChapterFlags(runtime);
  stampDepartedCast(runtime);
  syncNpcPrivateKnowledgeUnlocks(runtime);

  const railStageComplete = Boolean(railProfile
    && railProfile.orderedEventIds.every(id => isEventSettled(runtime, id)));
  // Rail is one source-ordered story line even when legacy generated chapters
  // cross-cut those beats. Once every fixed beat is complete, close the whole
  // stage deterministically; do not let a missing legacy chapter completion
  // condition trap the player before stage_ready.
  if (railStageComplete) {
    for (const chapter of runtime.chapters) {
      if (runtime.completedChapterIds.includes(chapter.id)) continue;
      runtime.completedChapterIds.push(chapter.id);
      transitions.push({ type: 'chapter_completed', id: chapter.id });
    }
    runtime.currentChapterId = null;
    runtime.activeEventIds = [];
  } else if (current && hasCompletion(current.completion) && !isCanonRailChapter(railProfile, current.id) && conditionsMatch(current.completion, next, runtime)) {
    if (!runtime.completedChapterIds.includes(current.id)) runtime.completedChapterIds.push(current.id);
    transitions.push({ type: 'chapter_completed', id: current.id });
    runtime.currentChapterId = null;
    runtime.activeEventIds = [];
  }

  if (!runtime.currentChapterId) {
    const nextChapter = runtime.chapters.find(chapter =>
      !runtime.completedChapterIds.includes(chapter.id) && conditionsMatch(chapter.activation, next, runtime),
    );
    if (nextChapter) {
      runtime.currentChapterId = nextChapter.id;
      transitions.push({ type: 'chapter_activated', id: nextChapter.id });
    }
  }

  const activeChapter = runtime.chapters.find(chapter => chapter.id === runtime.currentChapterId);
  const chapterEventIds = new Set(activeChapter?.eventIds || []);
  syncEventTimelineEligibility(next, runtime);
  if (isCanonRailChapter(railProfile, activeChapter?.id)) {
    const nextRailEventId = railProfile!.orderedEventIds.find(id => !isEventSettled(runtime, id));
    const nextRailEvent = runtime.events.find(item => item.id === nextRailEventId);
    if (
      nextRailEventId
      && nextRailEvent
      && eventTimelineOpen(runtime, nextRailEvent)
      && !runtime.activeEventIds.includes(nextRailEventId)
    ) {
      runtime.activeEventIds.push(nextRailEventId);
      const state = eventTimelineState(runtime, nextRailEventId);
      if (state && state.activatedAtTurn === undefined) state.activatedAtTurn = Math.max(0, Number(runtime.worldTurn) || 0);
      rememberEventActivationLocation(next, runtime, nextRailEventId);
      transitions.push({ type: 'event_activated', id: nextRailEventId });
    }
  }
  for (const eventId of chapterEventIds) {
    if (runtime.activeEventIds.includes(eventId) || isEventSettled(runtime, eventId)) continue;
    if (railProfile?.orderedEventIds.includes(eventId)) continue;
    const event = runtime.events.find(item => item.id === eventId);
    if (event && conditionsMatch(event.conditions, next, runtime) && eventTimelineOpen(runtime, event)) {
      runtime.activeEventIds.push(eventId);
      const state = eventTimelineState(runtime, eventId);
      if (state && state.activatedAtTurn === undefined) state.activatedAtTurn = Math.max(0, Number(runtime.worldTurn) || 0);
      rememberEventActivationLocation(next, runtime, eventId);
      transitions.push({ type: 'event_activated', id: eventId });
    }
  }

  const hasPendingCriticalEvent = hasPendingProductionCriticalEvent(runtime, railProfile);
  if (
    runtime.nextStageId &&
    !runtime.currentChapterId &&
    runtime.activeEventIds.length === 0 &&
    !hasPendingCriticalEvent &&
    runtime.nextStageReadyId !== runtime.nextStageId
  ) {
    runtime.nextStageReadyId = runtime.nextStageId;
    transitions.push({ type: 'stage_ready', id: runtime.nextStageId });
  }

  // 剧情停滞计数：有待推进内容却本轮无任何推进 → +1；推进/无内容 → 清零。供收束提示分档。
  const progressed = transitions.some(t =>
    t.type === 'event_completed' || t.type === 'chapter_completed' || t.type === 'stage_ready' || t.type === 'world_event_resolved',
  );
  const hasPendingWork = Boolean(runtime.currentChapterId) || runtime.activeEventIds.length > 0 || hasPendingCriticalEvent;
  // 主线偏移冷却（runtime 专属字段 steeringCooldown，由 processGmResponse 甲/乙确定性置入）：
  // 冷却期间暂停 stall 计数（玩家主动选支线，不算"迷路"）、抑制引子(见 storyContext)，引擎逐轮递减至 0。
  const steeringCooldown = typeof runtime.steeringCooldown === 'number' && runtime.steeringCooldown > 0 ? runtime.steeringCooldown : 0;
  if (progressed || !hasPendingWork) {
    runtime.stallTurns = 0;
  } else if (steeringCooldown === 0) {
    runtime.stallTurns = (runtime.stallTurns || 0) + 1;
  } // 冷却期：保持 stallTurns 不变（暂停累加）
  if (steeringCooldown > 0) {
    runtime.steeringCooldown = steeringCooldown - 1;
  }

  deliverDueWorldOmens(runtime, transitions);
  updateDivergenceControl(next, progressed);
  syncActorEngine(runtime);
  refreshEventTimelineRevelations(runtime, transitions);
  settleFatalDeadlines(runtime, transitions);
  settleScenePressure(runtime, transitions);
  recordSettledBeatHandoff(runtime, transitions);
  recordChronicleTransitions(runtime, transitions);

  return { saveData: next, transitions, affinityGrants, reputationGrants };
}
