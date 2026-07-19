export type ScenarioConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes' | 'exists';
export type ScenarioFlagValue = string | number | boolean | null;

export interface ScenarioCondition {
  path: string;
  operator: ScenarioConditionOperator;
  value?: ScenarioFlagValue;
}

export interface ScenarioModOpening {
  text: string;
  playerRole?: string;
  playerCharacterId?: string;
  creationPreset?: ScenarioModCreationPreset;
  locationId?: string;
  featuredCharacterIds?: string[];
}

export interface ScenarioModCreationPresetNamedEntry {
  name: string;
  description: string;
}

export interface ScenarioModCreationPresetSpiritRoot extends ScenarioModCreationPresetNamedEntry {
  tier: string;
  specialEffects?: string[];
}

export interface ScenarioModCreationPresetAttributes {
  rootBone: number;
  spirituality: number;
  comprehension: number;
  fortune: number;
  charm: number;
  temperament: number;
}

export interface ScenarioModCreationPreset {
  characterName: string;
  gender: string;
  race: string;
  age: number;
  talentTier: ScenarioModCreationPresetNamedEntry;
  origin: ScenarioModCreationPresetNamedEntry;
  spiritRoot: ScenarioModCreationPresetSpiritRoot;
  talents: ScenarioModCreationPresetNamedEntry[];
  attributes: ScenarioModCreationPresetAttributes;
  locked?: boolean;
}

export interface ScenarioModEvent {
  id: string;
  name: string;
  description: string;
  axisId?: string | null;
  axisMethod?: string;
  axisBeat?: string;
  axisAnchor?: string;
  axisSeq?: number;
  critical?: boolean;
  conditions?: ScenarioCondition[];
  completion?: ScenarioCondition[];
  /** 全部命中本轮正文时可确定性落账；仅用于逐拍高光合同。 */
  completionEvidence?: string[];
  relatedCharacterIds?: string[];
  relatedFactionIds?: string[];
  locationId?: string;
  objective?: string;
  narrativeVariants?: ScenarioModEventNarrativeVariant[];
  /** 玩家长期缺席时由世界自行结算的事件组；不计作玩家完成。 */
  offscreenResolution?: ScenarioModEventOffscreenResolution;
  /** 当前承重拍的世界演员纵切；数据通用、按事件显式启用。 */
  worldActor?: ScenarioWorldActorContract;
}

export type ScenarioWorldActorCanonPolicy = 'process_only' | 'local_state' | 'divergence_allowed' | 'if_only';
export type ScenarioWorldActorScope = 'world' | 'state' | 'region' | 'faction' | 'local' | 'character';

export interface ScenarioWorldActorPressure {
  id: string;
  scope: ScenarioWorldActorScope;
  summary: string;
  domains?: string[];
  geography?: string[];
  factionIds?: string[];
  intensity: 1 | 2 | 3;
  canonPolicy: ScenarioWorldActorCanonPolicy;
}

export interface ScenarioWorldActorAgenda {
  id: string;
  characterId: string;
  goal: string;
  nextAction: string;
  visibleSignal: string;
  offscreenAction: string;
  forbiddenOutcomes?: string[];
}

export interface ScenarioStoryOpportunity {
  id: string;
  title: string;
  characterIds: string[];
  whyNow: string;
  nextStep: string;
  stakes: string;
  rewardPreview: string;
  futureHint: string;
  actionText: string;
  rewardKey: string;
  rewardLabel: string;
}

export interface ScenarioWorldActorContract {
  pressure: ScenarioWorldActorPressure;
  agendas: ScenarioWorldActorAgenda[];
  opportunities: ScenarioStoryOpportunity[];
}

export interface ScenarioModEventOffscreenResolution {
  id: string;
  afterStallTurns: number;
  flagKey: string;
  resolvedEventIds: string[];
  worldDelta: string;
  evidence: string;
}

/** 已发生分歧下的叙事投影；不改完成链，只替换玩家看到/LLM 续写的当前事件表述。 */
export interface ScenarioModEventNarrativeVariant {
  when: ScenarioCondition[];
  /** 明确替代默认正典合同的分歧投影；普通条件化文案不得关闭 Canon Rail。 */
  replacesCanonRail?: boolean;
  name?: string;
  description?: string;
  axisBeat?: string;
  objective?: string;
}

export interface ScenarioModChapter {
  id: string;
  title: string;
  summary: string;
  activation?: ScenarioCondition[];
  completion?: ScenarioCondition[];
  eventIds?: string[];
}

export interface ScenarioModScenario {
  opening: ScenarioModOpening;
  initialFlags?: Record<string, ScenarioFlagValue>;
  chapters?: ScenarioModChapter[];
  events?: ScenarioModEvent[];
}
