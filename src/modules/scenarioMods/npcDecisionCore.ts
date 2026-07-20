import type {
  ScenarioNpcDecisionActionBinding,
  ScenarioNpcDecisionActor,
  ScenarioNpcDecisionCore,
  ScenarioNpcDecisionResource,
  ScenarioNpcDecisionStateEffects,
} from './schema';

type UtilityVector = {
  personality?: Record<string, number>;
  motives?: Record<string, number>;
  relationship?: Record<string, number>;
  baseUrgency: number;
  baseBenefit: number;
  baseRisk: number;
};

export interface NpcActionTemplate extends UtilityVector {
  id: string;
}

export interface NpcCandidateScore {
  actionId: string;
  label: string;
  eligible: boolean;
  eliminatedReason?: string;
  score?: number;
  breakdown: {
    urgency: number;
    personalityFit: number;
    motiveFit: number;
    factionGoal: number;
    relationshipMotive: number;
    expectedBenefit: number;
    situationFit: number;
    escalationPressure: number;
    resourceCost: number;
    failureRisk: number;
  };
}

export interface NpcDecisionReceipt {
  id: string;
  actorId: string;
  actionId: string;
  label: string;
  reason: string;
  knownFactIds: string[];
  knownFacts: string[];
  attitudes: Array<{ targetCharacterId: string; dimension: string; value: number }>;
  mustNotInvent: string[];
  visibleSignal: string;
  offscreenAction: string;
  visibility: 'public' | 'rumor' | 'hidden';
  durationTurns: number;
  score: number;
  candidates: NpcCandidateScore[];
  effects: Record<string, number>;
  stateEffects?: ScenarioNpcDecisionStateEffects;
}

export interface NpcDecisionRound {
  inputHash: string;
  decisions: NpcDecisionReceipt[];
}

export interface RejectedNpcDecisionEffect {
  decisionId: string;
  key: string;
  delta: number;
  reason: 'effect_not_whitelisted';
}

export interface NpcDecisionEffectApplication {
  situationValues: Record<string, number>;
  rejectedEffects: RejectedNpcDecisionEffect[];
}

export const NPC_ACTION_LIBRARY_VERSION = 'r2-10d.1';

// 通用行动词表保持小而可复用；stage 只绑定其中适用项及白名单 effects。
// 32 项满足首批 30–50 的规格边界，未绑定的行动不会进入该 stage 候选池。
export const NPC_ACTION_LIBRARY: readonly NpcActionTemplate[] = [
  { id: 'gather_intelligence', baseUrgency: 3, baseBenefit: 5, baseRisk: 1, personality: { caution: 2 }, motives: { control: 1 } },
  { id: 'verify_rumor', baseUrgency: 2, baseBenefit: 4, baseRisk: 1, personality: { caution: 2 }, motives: { stability: 1 } },
  { id: 'recruit_insider', baseUrgency: 3, baseBenefit: 6, baseRisk: 3, personality: { ambition: 1 }, motives: { control: 2 } },
  { id: 'request_audience', baseUrgency: 4, baseBenefit: 5, baseRisk: 2, personality: { honor: 2 }, motives: { legitimacy: 2 } },
  { id: 'public_declaration', baseUrgency: 5, baseBenefit: 6, baseRisk: 4, personality: { aggression: 1, honor: 1 }, motives: { legitimacy: 2 } },
  { id: 'secret_alliance', baseUrgency: 3, baseBenefit: 7, baseRisk: 5, personality: { caution: 1, ambition: 2 }, motives: { control: 1 } },
  { id: 'mobilize_forces', baseUrgency: 6, baseBenefit: 7, baseRisk: 5, personality: { aggression: 3 }, motives: { control: 2 } },
  { id: 'secure_palace_access', baseUrgency: 7, baseBenefit: 8, baseRisk: 3, personality: { aggression: 2, ambition: 2 }, motives: { control: 3, legitimacy: 1 } },
  { id: 'block_road', baseUrgency: 5, baseBenefit: 5, baseRisk: 4, personality: { aggression: 2, caution: 1 }, motives: { control: 2 } },
  { id: 'open_safe_route', baseUrgency: 5, baseBenefit: 7, baseRisk: 2, personality: { caution: 2, honor: 1 }, motives: { stability: 3 } },
  { id: 'spread_message', baseUrgency: 4, baseBenefit: 5, baseRisk: 3, personality: { ambition: 1 }, motives: { legitimacy: 2 } },
  { id: 'counter_message', baseUrgency: 3, baseBenefit: 5, baseRisk: 2, personality: { caution: 2 }, motives: { stability: 2 } },
  { id: 'test_loyalty', baseUrgency: 5, baseBenefit: 7, baseRisk: 3, personality: { caution: 2, ambition: 1 }, motives: { control: 3 } },
  { id: 'offer_patronage', baseUrgency: 3, baseBenefit: 6, baseRisk: 2, personality: { ambition: 1 }, motives: { legitimacy: 1 } },
  { id: 'trade_favor', baseUrgency: 3, baseBenefit: 5, baseRisk: 2, personality: { caution: 1 }, motives: { control: 1 } },
  { id: 'call_in_obligation', baseUrgency: 5, baseBenefit: 6, baseRisk: 3, personality: { honor: 1 }, motives: { legitimacy: 1 }, relationship: { obligation: 2 } },
  { id: 'negotiate_court_procedure', baseUrgency: 6, baseBenefit: 8, baseRisk: 2, personality: { honor: 3, caution: 1 }, motives: { legitimacy: 3, stability: 2 } },
  { id: 'propose_compromise', baseUrgency: 4, baseBenefit: 7, baseRisk: 2, personality: { caution: 2, honor: 1 }, motives: { stability: 3 } },
  { id: 'prepare_fallback_route', baseUrgency: 5, baseBenefit: 8, baseRisk: 1, personality: { caution: 4 }, motives: { stability: 2, control: 1 } },
  { id: 'delay_commitment', baseUrgency: 2, baseBenefit: 4, baseRisk: 2, personality: { caution: 3 }, motives: { stability: 1 } },
  { id: 'accelerate_agenda', baseUrgency: 6, baseBenefit: 6, baseRisk: 4, personality: { ambition: 3, aggression: 1 }, motives: { control: 2 } },
  { id: 'protect_principal', baseUrgency: 7, baseBenefit: 8, baseRisk: 3, personality: { honor: 2, caution: 1 }, motives: { stability: 2 } },
  { id: 'escort_witness', baseUrgency: 5, baseBenefit: 6, baseRisk: 2, personality: { honor: 2 }, motives: { legitimacy: 2 } },
  { id: 'audit_resources', baseUrgency: 2, baseBenefit: 4, baseRisk: 1, personality: { caution: 2 }, motives: { stability: 1 } },
  { id: 'reserve_supplies', baseUrgency: 3, baseBenefit: 5, baseRisk: 1, personality: { caution: 2 }, motives: { stability: 2 } },
  { id: 'sabotage_agenda', baseUrgency: 4, baseBenefit: 7, baseRisk: 6, personality: { aggression: 2, ambition: 2 }, motives: { control: 2 } },
  { id: 'expose_plot', baseUrgency: 5, baseBenefit: 7, baseRisk: 4, personality: { honor: 2, aggression: 1 }, motives: { legitimacy: 2 } },
  { id: 'conceal_evidence', baseUrgency: 4, baseBenefit: 6, baseRisk: 5, personality: { caution: 3 }, motives: { control: 2 } },
  { id: 'switch_faction', baseUrgency: 3, baseBenefit: 8, baseRisk: 8, personality: { ambition: 3 }, motives: { control: 2 } },
  { id: 'force_succession', baseUrgency: 10, baseBenefit: 12, baseRisk: 4, personality: { aggression: 4, ambition: 4 }, motives: { control: 4 } },
  { id: 'withdraw_force', baseUrgency: 3, baseBenefit: 4, baseRisk: 2, personality: { caution: 2, honor: 1 }, motives: { stability: 2 } },
  { id: 'grant_local_autonomy', baseUrgency: 2, baseBenefit: 5, baseRisk: 4, personality: { honor: 1 }, motives: { stability: 2 } },
] as const;

const ACTIONS = new Map(NPC_ACTION_LIBRARY.map(action => [action.id, action]));
const RESOURCES: ScenarioNpcDecisionResource[] = ['influence', 'wealth', 'troops', 'intelligence'];

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${key}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  let result = 2166136261;
  for (const char of stable(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function npcDecisionConfigHash(core: ScenarioNpcDecisionCore): string {
  return hash({ libraryVersion: NPC_ACTION_LIBRARY_VERSION, core });
}

function dot(values: Record<string, number>, weights: Record<string, number> | undefined): number {
  return Object.entries(weights || {}).reduce((sum, [key, weight]) => sum + (values[key] || 0) * weight, 0);
}

function relationshipFit(actor: ScenarioNpcDecisionActor, weights: Record<string, number> | undefined): number {
  if (!weights) return 0;
  return Object.values(actor.relationships)
    .reduce((total, relation) => total + dot(relation, weights) / 100, 0);
}

function bindingRelationshipFit(
  actor: ScenarioNpcDecisionActor,
  binding: ScenarioNpcDecisionActionBinding,
): number {
  return (binding.utility?.relationships || []).reduce((sum, item) => {
    const value = actor.relationships[item.targetCharacterId]?.[item.dimension] || 0;
    return sum + (value / 100) * item.weight;
  }, 0);
}

function resourceCost(binding: ScenarioNpcDecisionActionBinding): number {
  return RESOURCES.reduce((sum, key) => sum + Math.max(0, binding.costs?.[key] || 0), 0);
}

function requirementFailure(actor: ScenarioNpcDecisionActor, binding: ScenarioNpcDecisionActionBinding): string | undefined {
  if ((actor.actionCooldowns?.[binding.actionId] || 0) > 0) return `cooldown:${actor.actionCooldowns![binding.actionId]}`;
  const knowledge = new Set(actor.knowledge);
  const missingKnowledge = (binding.requiresKnowledge || []).find(factId => !knowledge.has(factId));
  if (missingKnowledge) return `knowledge:${missingKnowledge}`;
  for (const requirement of binding.relationshipRequirements || []) {
    const value = actor.relationships[requirement.targetCharacterId]?.[requirement.dimension] || 0;
    if (requirement.min !== undefined && value < requirement.min) {
      return `relationship:${requirement.targetCharacterId}.${requirement.dimension}>=${requirement.min}`;
    }
    if (requirement.max !== undefined && value > requirement.max) {
      return `relationship:${requirement.targetCharacterId}.${requirement.dimension}<=${requirement.max}`;
    }
  }
  for (const key of RESOURCES) {
    const minimum = binding.requirements?.[key];
    if (minimum !== undefined && actor.resources[key] < minimum) {
      return `requirement:${key}>=${minimum}`;
    }
    const cost = binding.costs?.[key] || 0;
    if (actor.resources[key] < cost) return `insufficient:${key}`;
  }
  return undefined;
}

function scoreCandidate(
  actor: ScenarioNpcDecisionActor,
  binding: ScenarioNpcDecisionActionBinding,
  forbiddenBefore: Set<string>,
  situationValues: Record<string, number>,
  core: ScenarioNpcDecisionCore,
): NpcCandidateScore {
  const template = ACTIONS.get(binding.actionId);
  const empty = {
    urgency: 0, personalityFit: 0, motiveFit: 0, factionGoal: 0,
    relationshipMotive: 0, expectedBenefit: 0, situationFit: 0,
    escalationPressure: 0, resourceCost: 0, failureRisk: 0,
  };
  if (!template) return { actionId: binding.actionId, label: binding.label, eligible: false, eliminatedReason: 'unknown_action', breakdown: empty };
  const canonConflict = (binding.canonTags || []).find(tag => forbiddenBefore.has(tag));
  if (canonConflict) {
    return { actionId: binding.actionId, label: binding.label, eligible: false, eliminatedReason: `forbiddenBefore:${canonConflict}`, breakdown: empty };
  }
  const failed = requirementFailure(actor, binding);
  if (failed) return { actionId: binding.actionId, label: binding.label, eligible: false, eliminatedReason: failed, breakdown: empty };
  const normalizedSituation = Object.fromEntries(Object.entries(situationValues).map(([key, value]) => {
    const limit = core.situation.limits?.[key];
    if (!limit || limit.max <= limit.min) return [key, value];
    const midpoint = (limit.min + limit.max) / 2;
    return [key, (value - midpoint) / ((limit.max - limit.min) / 2)];
  }));
  const agendaProgress = actor.agendas.reduce((max, agenda) =>
    Math.max(max, agenda.escalation.length ? agenda.clock / agenda.escalation.length : 0), 0);
  const breakdown = {
    urgency: template.baseUrgency + (binding.utility?.urgency || 0),
    personalityFit: dot(actor.personality, template.personality),
    motiveFit: dot(actor.motives, template.motives),
    factionGoal: binding.utility?.factionGoal || 0,
    relationshipMotive: relationshipFit(actor, template.relationship) + bindingRelationshipFit(actor, binding),
    expectedBenefit: template.baseBenefit + (binding.utility?.expectedBenefit || 0),
    situationFit: dot(normalizedSituation, binding.utility?.situation),
    escalationPressure: agendaProgress * (binding.utility?.escalation || 0),
    resourceCost: resourceCost(binding),
    failureRisk: template.baseRisk + (binding.utility?.failureRisk || 0),
  };
  const score = breakdown.urgency + breakdown.personalityFit + breakdown.motiveFit
    + breakdown.factionGoal + breakdown.relationshipMotive + breakdown.expectedBenefit
    + breakdown.situationFit + breakdown.escalationPressure
    - breakdown.resourceCost - breakdown.failureRisk;
  return { actionId: binding.actionId, label: binding.label, eligible: true, score, breakdown };
}

export function decideNpcActions(
  core: ScenarioNpcDecisionCore,
  situationValues: Record<string, number> = core.situation.initialValues,
  actors: ScenarioNpcDecisionActor[] = core.actors,
): NpcDecisionRound {
  const forbidden = new Set(core.canonPolicy.forbiddenBefore);
  const decisions: NpcDecisionReceipt[] = [];
  for (const actor of actors) {
    const bindings = core.actionBindings.filter(binding =>
      actor.allowedActionIds.includes(binding.actionId)
      && (!binding.actorIds?.length || binding.actorIds.includes(actor.characterId)));
    const candidatesWithBindings = bindings.map(binding => ({
      binding,
      candidate: scoreCandidate(actor, binding, forbidden, situationValues, core),
    }));
    const candidates = candidatesWithBindings.map(item => item.candidate);
    const ranked = candidatesWithBindings.filter(item => item.candidate.eligible)
      .sort((a, b) => (b.candidate.score! - a.candidate.score!)
        || (a.candidate.actionId < b.candidate.actionId ? -1 : a.candidate.actionId > b.candidate.actionId ? 1 : 0));
    const selected = ranked[0];
    if (!selected) continue;
    const { binding, candidate: winner } = selected;
    const attitudeKeys = [
      ...(binding.utility?.relationships || []),
      ...(binding.relationshipRequirements || []),
    ];
    const seenAttitudes = new Set<string>();
    decisions.push({
      id: `npc-decision.${actor.characterId}.${winner.actionId}`,
      actorId: actor.characterId,
      actionId: winner.actionId,
      label: binding.label,
      reason: binding.reason,
      knownFactIds: (binding.knownFactIds || []).filter(factId => actor.knowledge.includes(factId)),
      knownFacts: binding.knownFactIds?.length
        ? binding.knownFactIds
          .filter(factId => actor.knowledge.includes(factId))
          .map(factId => core.knowledgeFacts?.[factId]?.text)
          .filter((fact): fact is string => Boolean(fact))
        : [...binding.knownFacts],
      attitudes: attitudeKeys
        .filter(item => {
          const key = `${item.targetCharacterId}.${item.dimension}`;
          if (seenAttitudes.has(key)) return false;
          seenAttitudes.add(key);
          return true;
        })
        .map(item => ({
          targetCharacterId: item.targetCharacterId,
          dimension: item.dimension,
          value: actor.relationships[item.targetCharacterId]?.[item.dimension] || 0,
        })),
      mustNotInvent: [...binding.mustNotInvent],
      visibleSignal: binding.visibleSignal,
      offscreenAction: binding.offscreenAction,
      visibility: binding.visibility,
      durationTurns: binding.durationTurns,
      score: winner.score!,
      candidates,
      effects: { ...(binding.effects || {}) },
      stateEffects: binding.stateEffects ? structuredClone(binding.stateEffects) : undefined,
    });
  }
  return {
    inputHash: hash({
      libraryVersion: NPC_ACTION_LIBRARY_VERSION,
      actors,
      situationValues,
      actionBindings: core.actionBindings,
      canonPolicy: core.canonPolicy,
    }),
    decisions,
  };
}

/** 结算行动成本与议程时钟；输入和 stage 配置均不原地修改。 */
export function applyNpcDecisionActorState(
  core: ScenarioNpcDecisionCore,
  actors: ScenarioNpcDecisionActor[],
  decisions: NpcDecisionReceipt[],
): ScenarioNpcDecisionActor[] {
  const next = structuredClone(actors);
  for (const actor of next) {
    actor.actionCooldowns = Object.fromEntries(
      Object.entries(actor.actionCooldowns || {})
        .map(([actionId, turns]): [string, number] => [actionId, Math.max(0, turns - 1)])
        .filter(([, turns]) => turns > 0),
    );
  }
  for (const decision of decisions) {
    const actor = next.find(item => item.characterId === decision.actorId);
    const binding = core.actionBindings.find(item =>
      item.actionId === decision.actionId
      && (!item.actorIds?.length || item.actorIds.includes(decision.actorId)));
    if (!actor || !binding) continue;
    if (binding.durationTurns > 1) {
      actor.actionCooldowns ||= {};
      actor.actionCooldowns[binding.actionId] = binding.durationTurns - 1;
    }
    for (const key of RESOURCES) {
      actor.resources[key] = Math.max(0, actor.resources[key] - Math.max(0, binding.costs?.[key] || 0));
    }
    for (const agenda of actor.agendas) {
      agenda.clock = Math.min(agenda.escalation.length, Math.max(0, agenda.clock) + 1);
    }
    applyNpcStateEffects(next, decision.actorId, decision.stateEffects);
  }
  return next;
}

function applyNpcStateEffects(
  actors: ScenarioNpcDecisionActor[],
  sourceActorId: string,
  effects: ScenarioNpcDecisionStateEffects | undefined,
): void {
  if (!effects) return;
  const source = actors.find(item => item.characterId === sourceActorId);
  if (source) {
    for (const [resource, delta] of Object.entries(effects.resources || {})) {
      const key = resource as ScenarioNpcDecisionResource;
      source.resources[key] = Math.max(0, (source.resources[key] || 0) + (delta || 0));
    }
  }
  for (const relationship of effects.relationships || []) {
    const owner = actors.find(item => item.characterId === (relationship.actorId || sourceActorId));
    if (!owner) continue;
    const current = owner.relationships[relationship.targetCharacterId] ||= {};
    for (const [dimension, delta] of Object.entries(relationship.deltas)) {
      current[dimension] = Math.min(100, Math.max(-100, (current[dimension] || 0) + delta));
    }
  }
  for (const knowledgeEffect of effects.knowledge || []) {
    const targets = knowledgeEffect.actorIds?.length
      ? actors.filter(item => knowledgeEffect.actorIds!.includes(item.characterId))
      : actors.filter(item => item.characterId === sourceActorId);
    for (const target of targets) {
      const removed = new Set(knowledgeEffect.remove || []);
      target.knowledge = [...new Set([
        ...target.knowledge.filter(factId => !removed.has(factId)),
        ...(knowledgeEffect.add || []),
      ])].sort();
    }
  }
}

export function applyNpcDecisionEffectsWithAudit(
  core: ScenarioNpcDecisionCore,
  situationValues: Record<string, number>,
  decisions: NpcDecisionReceipt[],
): NpcDecisionEffectApplication {
  const whitelist = new Set(core.situation.whitelist);
  const next = { ...situationValues };
  const rejectedEffects: RejectedNpcDecisionEffect[] = [];
  for (const decision of decisions) {
    for (const [key, delta] of Object.entries(decision.effects)) {
      // Registry 装载时会严格拒绝越界；这里面对旧档快照选择降级跳过，避免整回合硬崩。
      if (!whitelist.has(key)) {
        rejectedEffects.push({
          decisionId: decision.id,
          key,
          delta,
          reason: 'effect_not_whitelisted',
        });
        continue;
      }
      const raw = (next[key] || 0) + delta;
      const limit = core.situation.limits?.[key];
      next[key] = limit ? Math.min(limit.max, Math.max(limit.min, raw)) : raw;
    }
  }
  return { situationValues: next, rejectedEffects };
}

export function applyNpcDecisionEffects(
  core: ScenarioNpcDecisionCore,
  situationValues: Record<string, number>,
  decisions: NpcDecisionReceipt[],
): Record<string, number> {
  const applied = applyNpcDecisionEffectsWithAudit(core, situationValues, decisions);
  if (applied.rejectedEffects.length && typeof console !== 'undefined' && console.warn) {
    console.warn('[NPC Decision Core] skipped invalid legacy effects', applied.rejectedEffects);
  }
  return applied.situationValues;
}

/** hidden 是引擎秘密，不得仅靠文案含蓄兜底。 */
export function selectVisibleNpcDecisionIds(
  decisions: NpcDecisionReceipt[],
  maxVisibleActions: number,
): string[] {
  return decisions
    .filter(decision => decision.visibility !== 'hidden')
    .slice(0, maxVisibleActions)
    .map(decision => decision.id);
}
