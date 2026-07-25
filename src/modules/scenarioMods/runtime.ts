import type { SaveData } from '@/types/game';

import type {
  ScenarioCondition,
  ScenarioFlagValue,
  ScenarioMod,
  ScenarioModChapter,
  ScenarioModEvent,
  ScenarioNpcDecisionActor,
  ScenarioNpcMemoryEpisode,
  ScenarioPlayerCompletionContract,
  ScenarioPlayerCompletionEffects,
  ScenarioPlayerCompletionOutcome,
  ScenarioPlayerKnowledgeFact,
  ScenarioStoryOpportunity,
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
import { recordOffscreenDivergence, type ScenarioDivergence } from './divergenceLedger';
import { getCanonRailOrder, getCanonRailProfile, isCanonRailChapter } from './canonRail';
import { updateDivergenceControl, type DivergenceSignal, type WorldPushState } from './divergenceControl';


export interface ScenarioProgressState {
  chapters: ScenarioModChapter[];
  events: ScenarioModEvent[];
  completedChapterIds: string[];
  activeEventIds: string[];
  completedEventIds: string[];
  playerKnowledge?: Record<string, ScenarioPlayerKnowledgeFact>;
}

export interface ScenarioRuntimeTransition {
  type: 'chapter_activated' | 'chapter_completed' | 'event_activated' | 'event_completed' | 'event_revealed' | 'stage_ready' | 'world_event_resolved';
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
  source: 'event_engine';
  eventId: string;
  actionId: string;
  label: string;
  actionText: string;
  timeCost: 1;
  contractHash: string;
  expectedOutcome: ScenarioPlayerCompletionOutcome;
  outcomeText: string;
  remainingTurns?: number;
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
  nextStageId?: string | null;
  nextStageReadyId?: string | null;
  /** 剧情停滞轮数：连续多少轮无事件/章节推进（供收束提示分档），推进即清零 */
  stallTurns?: number;
  /** 回主线引子偏移冷却：玩家主动偏移主线时置 N，引擎逐轮递减、期间暂停 stall 并静默引子。
   *  存于 runtime(世界.状态.剧本模组)——引擎专属字段，canonGuard 保护、LLM 命令写不到。 */
  steeringCooldown?: number;
  /** 玩家造成的世界线差异；本地对账引擎独占写入，LLM 只读。 */
  divergences?: ScenarioDivergence[];
  /** 场外世界事件已结算的原事件；与 completedEventIds 分离，防止把玩家未参与的原著拍伪记为完成。 */
  offscreenResolvedEventIds?: string[];
  /** 玩家可回看的战役编年史；只记已结算事实，跨关继承。 */
  chronicle?: ScenarioChronicleEntry[];
  /** 玩家认知与世界真值、NPC 知识分账；旧档可缺省。 */
  playerKnowledge?: Record<string, ScenarioPlayerKnowledgeFact>;
  /** 非机会卡事件的本地尝试、判定与完成状态。 */
  eventActionStates?: Record<string, ScenarioEventActionState>;
  canon?: {
    characters?: Array<{ id: string; name: string; profile?: { memories?: string[] } }>;
    factions?: Array<{ id: string; name: string }>;
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
  /** 上一拍刚结算的主线节点；供下一轮叙事先接住再进新拍，消费一次即清。 */
  lastSettledBeat?: {
    eventId: string;
    name: string;
    beat: string;
    locationId?: string;
    characterIds?: string[];
    settledAtTurn: number;
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
  const anchor = getNarrativeAnchorEvent(runtime);
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
  const anchor = getNarrativeAnchorEvent(runtime);
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
  const anchor = getNarrativeAnchorEvent(runtime);
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

function eventActionAvailable(
  action: ScenarioPlayerCompletionContract['actions'][number],
  state: ScenarioEventActionState,
): boolean {
  const preparations = new Set(state.preparations || []);
  if (action.kind === 'prepare' && action.grantsPreparation && preparations.has(action.grantsPreparation)) return false;
  return (action.requiresPreparation || []).every(item => preparations.has(item));
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
  runtime: RuntimeState,
  event: ScenarioModEvent,
  actionId: string,
  outcome: ScenarioPlayerCompletionOutcome,
  effects: ScenarioPlayerCompletionEffects | undefined,
  attemptNumber: number,
): void {
  if (!effects) return;
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  const actorState = ensureActorEngine(runtime);
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
}

/** 模板化推进按钮的固定前缀：文案只把 objective 复述一遍，读起来像一句机器传送指令。 */
export const TEMPLATED_OBJECTIVE_ACTION_PREFIX = '我按当前主线目标行动：';

/**
 * 模板化单动作推进拍：actionText 只是 objective 的复述，且本合同没有分步演出链。
 * 点这类按钮＝直接向叙事模型提交一句传送指令，跨拍衔接必然生硬（上一拍还在岸边送别，
 * 下一拍按钮已经是给凝羽解毒）。屏蔽后事件回落到「玩家自由行动 + 事件对账追认」：
 * 事件完成只看 completion flag（见 advanceScenarioRuntime），对账候选链也不排除本地合同
 * 事件（见 eventReconcileService.buildChainCandidates），因此主线不会因此卡死。
 * 带 prepare 链的半预制高光是逐拍演出合同，不在屏蔽范围内。
 */
function isTemplatedObjectiveAction(
  contract: ScenarioPlayerCompletionContract,
  action: ScenarioPlayerCompletionContract['actions'][number],
): boolean {
  if (contract.kind !== 'objective_action') return false;
  if (contract.actions.some(item => item.kind === 'prepare')) return false;
  return String(action.actionText || '').startsWith(TEMPLATED_OBJECTIVE_ACTION_PREFIX);
}

/**
 * 当前非机会卡承重事件的本地动作；按钮身份来自事件合同，不来自 LLM。
 * hideTemplatedObjectiveActions 默认关：模块保持既有行为，由 UI 层按玩家设置传入。
 */
export function getCurrentStoryEventActions(
  saveData: SaveData,
  options?: { hideTemplatedObjectiveActions?: boolean },
): ScenarioEventActionSelection[] {
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
  const hideTemplated = options?.hideTemplatedObjectiveActions === true;
  return contract.actions.filter(action =>
    eventActionAvailable(action, state)
    && !(hideTemplated && isTemplatedObjectiveAction(contract, action)),
  ).map(action => {
    const expectedOutcome: ScenarioPlayerCompletionOutcome = contract.kind === 'objective_action'
      ? 'success'
      : conditionsMatch(action.successWhen, saveData, runtime) ? 'success' : action.unmetOutcome || 'failure';
    return {
      source: 'event_engine',
      eventId: event.id,
      actionId: action.id,
      label: `${contract.kind === 'objective_action' ? '【主线推进】' : '【主线判定】'}${action.label}`,
      actionText: action.actionText,
      timeCost: action.timeCost,
      contractHash: state.contractHash,
      expectedOutcome,
      outcomeText: action.outcomeText[expectedOutcome],
      ...(remainingTurns !== undefined ? { remainingTurns } : {}),
    };
  });
}

/**
 * 在成功 AI 回合后消费一次非机会卡事件动作，并只依据存档状态执行本地判定。
 * LLM 正文、命令和自报结果均不参与 success/partial/failure 裁定。
 */
export function recordStoryEventStructuredAction(
  saveData: SaveData,
  selection: ScenarioEventActionSelection,
): { attempted: boolean; completed: boolean; eventId?: string; actionId?: string; outcome?: ScenarioPlayerCompletionOutcome; reason?: string } {
  const runtime = getRuntime(saveData);
  if (!runtime || selection?.source !== 'event_engine') {
    return { attempted: false, completed: false, reason: 'invalid_selection' };
  }
  const event = getCurrentPlayerCompletionEvent(runtime);
  const contract = event?.playerCompletionContract;
  if (!event || !contract || event.id !== selection.eventId) {
    return { attempted: false, completed: false, reason: 'stale_event' };
  }
  const state = reconcileEventActionContract(runtime, event);
  if (!state || state.contractHash !== selection.contractHash) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_contract' };
  }
  const action = contract.actions.find(item => item.id === selection.actionId);
  if (!action || action.timeCost !== selection.timeCost || action.actionText !== selection.actionText) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_action' };
  }
  if (!eventActionAvailable(action, state)) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'action_unavailable' };
  }
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);
  if (state.readyAtTurn !== undefined) {
    return { attempted: false, completed: true, eventId: event.id, reason: 'already_completed' };
  }
  if (state.lastAttemptAtTurn === turn) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'already_attempted' };
  }
  const success = contract.kind === 'objective_action' || conditionsMatch(action.successWhen, saveData, runtime);
  const outcome: ScenarioPlayerCompletionOutcome = success ? 'success' : action.unmetOutcome || 'failure';
  const detail = action.outcomeText[outcome];
  if (selection.expectedOutcome !== outcome || selection.outcomeText !== detail) {
    return { attempted: false, completed: false, eventId: event.id, reason: 'stale_condition' };
  }
  state.lastAttemptAtTurn = turn;
  state.lastOutcome = outcome;
  const attemptNumber = Math.max(0, Number(state.attemptCount) || 0) + 1;
  state.attemptCount = attemptNumber;
  state.attempts.push({ actionId: action.id, outcome, attemptedAtTurn: turn, detail });
  state.attempts = state.attempts.slice(-8);
  if (action.kind === 'prepare' && outcome === 'success' && action.grantsPreparation) {
    state.preparations = [...new Set([...(state.preparations || []), action.grantsPreparation])].sort();
  }
  applyStoryEventOutcomeEffects(runtime, event, action.id, outcome, action.outcomeEffects?.[outcome], attemptNumber);
  const completed = action.kind !== 'prepare' && outcome !== 'failure' && contract.settleOn.includes(outcome);
  if (completed) state.readyAtTurn = turn;
  return { attempted: true, completed, eventId: event.id, actionId: action.id, outcome };
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

/** 当前步骤的结构化推进动作；只由本地合同生成，不依赖 LLM action_options。 */
export function getTrackedStoryOpportunityActions(saveData: SaveData): ScenarioOpportunityActionSelection[] {
  const runtime = getRuntime(saveData);
  const state = runtime?.actorEngine;
  if (!runtime || !state?.trackedOpportunityId) return [];
  const anchor = getNarrativeAnchorEvent(runtime);
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
): { progressed: boolean; completed: boolean; opportunityId?: string; stepId?: string; reason?: string } {
  const runtime = getRuntime(saveData);
  const state = runtime?.actorEngine;
  if (!runtime || !state || selection?.source !== 'opportunity_engine') {
    return { progressed: false, completed: false, reason: 'invalid_selection' };
  }
  const anchor = getNarrativeAnchorEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  const contract = opportunity?.completionContract;
  if (!opportunity || !contract || opportunity.id !== selection.opportunityId || opportunityState?.status !== 'tracked') {
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
  const completed = opportunityState.completionStepIndex >= contract.steps.length;
  if (completed) opportunityState.completionReadyAtTurn = turn;
  return { progressed: true, completed, opportunityId: opportunity.id, stepId: step.id };
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
): { progressed: boolean; completed: boolean; opportunityId?: string; stepId?: string } {
  const runtime = getRuntime(saveData);
  if (!runtime || typeof playerAction !== 'string' || !playerAction.trim()) {
    return { progressed: false, completed: false };
  }
  syncActorEngine(runtime);
  const state = ensureActorEngine(runtime);
  const anchor = getNarrativeAnchorEvent(runtime);
  const opportunity = findOpportunity(anchor || undefined, state.trackedOpportunityId);
  const contract = opportunity?.completionContract;
  const opportunityState = opportunity && state.opportunityStates?.[opportunity.id];
  if (!opportunity || !contract || opportunityState?.status !== 'tracked') {
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
  const completed = opportunityState.completionStepIndex >= contract.steps.length;
  if (completed) opportunityState.completionReadyAtTurn = turn;
  return { progressed: true, completed, opportunityId: opportunity.id, stepId: step.id };
}

function settleReadyOpportunityCompletionFlags(runtime: RuntimeState): void {
  const state = runtime.actorEngine;
  if (!state?.trackedOpportunityId) return;
  const anchor = getNarrativeAnchorEvent(runtime);
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

export const OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD = 10;
export const TRACKED_OPPORTUNITY_MAX_TURNS = 6;

function isEventSettled(runtime: RuntimeState, eventId: string): boolean {
  return runtime.completedEventIds.includes(eventId)
    || (runtime.offscreenResolvedEventIds || []).includes(eventId);
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
function resolveOffscreenWorldEvents(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  const declared = runtime.events.map(event => event.offscreenResolution).filter(Boolean) as NonNullable<ScenarioModEvent['offscreenResolution']>[];
  const resolutions = declared.length ? declared : [legacyOffscreenResolution(runtime)].filter(Boolean) as NonNullable<ScenarioModEvent['offscreenResolution']>[];
  for (const resolution of resolutions) {
    const knownIds = resolution.resolvedEventIds.filter(id => runtime.events.some(event => event.id === id));
    if (!knownIds.length) continue;
    const owner = runtime.events.find(event => event.offscreenResolution?.id === resolution.id)
      || runtime.events.find(event => knownIds.includes(event.id));
    // worldActor 合同的玩家介入判定发生在当前轮，故需要预判本轮即将增加的 stall；
    // 旧世界事件合同沿用“已完整停滞轮数”语义，避免改变既有结算时点。
    const actorDrivenResolution = knownIds.every(id =>
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
    const due = owner?.timeline?.deadlineTurns !== undefined
      ? eventTimelineDeadlineDue(runtime, owner)
      : effectiveStall >= resolution.afterStallTurns;
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
    if (!knownIds.some(id => runtime.activeEventIds.includes(id))) continue;
    runtime.flags[resolution.flagKey] = true;
    runtime.offscreenResolvedEventIds = [...new Set([...(runtime.offscreenResolvedEventIds || []), ...knownIds])];
    runtime.activeEventIds = runtime.activeEventIds.filter(id => !knownIds.includes(id));
    for (const eventId of knownIds) markEventTimelineOccurred(runtime, eventId, 'offscreen');
    refreshEventTimelineRevelations(runtime, transitions);
    recordOffscreenDivergence(runtime, {
      id: resolution.id, eventId: knownIds[0],
      worldDelta: resolution.worldDelta, evidence: resolution.evidence,
      revealed: knownIds.every(id => eventIsKnownToPlayer(runtime, id)),
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
 * 记下本轮刚结算的主线拍点，供下一轮叙事先接住上一拍再进入新拍。
 * 挂在 event_completed 汇总处而不是按钮结算处：按钮结算与事件对账补落 flag 最终都走
 * 同一条完成路径，两种推进方式都能拿到交接合同（屏蔽模板按钮后尤其重要）。
 */
function recordSettledBeatHandoff(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
  const completed = transitions
    .filter(transition => transition.type === 'event_completed')
    .map(transition => runtime.events.find(item => item.id === transition.id))
    .filter((event): event is ScenarioModEvent => Boolean(event));
  if (!completed.length) return;
  // 同轮多拍落账时取链序最后一拍：玩家眼下停在那儿。
  const event = completed
    .slice()
    .sort((left, right) => (left.axisSeq ?? -Infinity) - (right.axisSeq ?? -Infinity))[completed.length - 1];
  runtime.lastSettledBeat = {
    eventId: event.id,
    name: event.name,
    beat: String(event.axisBeat || event.description || '').slice(0, 160),
    ...(event.locationId ? { locationId: event.locationId } : {}),
    ...(event.relatedCharacterIds?.length ? { characterIds: event.relatedCharacterIds.slice(0, 6) } : {}),
    settledAtTurn: Math.max(0, Number(runtime.worldTurn) || 0),
  };
}

function recordChronicleTransitions(runtime: RuntimeState, transitions: ScenarioRuntimeTransition[]): void {
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
        appendChronicleEntry(runtime, {
          id: `chronicle.${runtime.modId || 'unknown'}.${divergence?.id || transition.id}.revealed`,
          type: 'world', stageId: runtime.modId || '',
          title: '消息传来', detail: divergence?.worldDelta || event?.description || transition.id,
        });
      } else {
        appendChronicleEntry(runtime, {
          id: `chronicle.${runtime.modId || 'unknown'}.${transition.id}`,
          type: 'event', stageId: runtime.modId || '',
          title: event?.name || transition.id,
          detail: event?.objective || event?.axisBeat || event?.description,
        });
      }
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
    completedChapterIds: [],
    activeEventIds: [],
    completedEventIds,
    playerKnowledge: createInitialPlayerKnowledge(mod),
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

function reconcileSaveWithRegistry(saveData: SaveData, runtime: RuntimeState & { modId?: string; reconciledRegistryVersion?: string; canon?: { characters?: unknown[] } }): void {
  const deps = getReconcileDeps();
  if (!deps) return;
  if (runtime.reconciledRegistryVersion === deps.version) return;
  try {
    const modId = String((runtime as { modId?: string }).modId || '');
    deps.resolve((runtime as { canon?: { characters?: any[] } }).canon?.characters, modId);
    const mod = deps.mods.find(item => item.manifest?.id === modId);
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
// 与提示词侧一致地按关系门控——好感≥30 或"自己人类"关系才揭示（陌生/敌对时保持"未记录"=尚未摸透）。
// 只填空的，不覆盖 LLM/玩家已写的底线；每回合运行(好感是动态的,跨过阈值即补)。
const 底线揭示好感 = 30;
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

export function advanceScenarioRuntime(saveData: SaveData): {
  saveData: SaveData;
  transitions: ScenarioRuntimeTransition[];
} {
  const next = structuredClone(saveData);
  const runtime = getRuntime(next);
  if (!runtime) return { saveData: next, transitions: [] };
  reconcileSaveWithRegistry(next, runtime as RuntimeState & { modId?: string });
  projectBottomLinesToNpcs(next);
  normalizeRuntimeFlags(runtime);
  settleReadyOpportunityCompletionFlags(runtime);
  settleReadyEventActionCompletionFlags(runtime);

  runtime.chapters = Array.isArray(runtime.chapters) ? runtime.chapters : [];
  runtime.events = Array.isArray(runtime.events) ? runtime.events : [];
  runtime.completedChapterIds = Array.isArray(runtime.completedChapterIds) ? runtime.completedChapterIds : [];
  runtime.activeEventIds = Array.isArray(runtime.activeEventIds) ? runtime.activeEventIds : [];
  runtime.completedEventIds = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  runtime.offscreenResolvedEventIds = Array.isArray(runtime.offscreenResolvedEventIds) ? runtime.offscreenResolvedEventIds : [];
  runtime.eventTimeline = runtime.eventTimeline && typeof runtime.eventTimeline === 'object'
    ? runtime.eventTimeline
    : {};
  runtime.playerKnowledge = runtime.playerKnowledge && typeof runtime.playerKnowledge === 'object'
    ? runtime.playerKnowledge
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
  resolveOffscreenWorldEvents(runtime, transitions);

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
      transitions.push({ type: 'event_activated', id: eventId });
    }
  }

  const hasPendingCriticalEvent = runtime.events.some(event =>
    isCriticalStoryEvent(event) && !isEventSettled(runtime, event.id),
  );
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

  updateDivergenceControl(next, progressed);
  syncActorEngine(runtime);
  refreshEventTimelineRevelations(runtime, transitions);
  recordSettledBeatHandoff(runtime, transitions);
  recordChronicleTransitions(runtime, transitions);

  return { saveData: next, transitions };
}
