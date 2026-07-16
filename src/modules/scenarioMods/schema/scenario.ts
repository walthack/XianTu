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
  relatedCharacterIds?: string[];
  relatedFactionIds?: string[];
  locationId?: string;
  objective?: string;
  narrativeVariants?: ScenarioModEventNarrativeVariant[];
  /** 玩家长期缺席时由世界自行结算的事件组；不计作玩家完成。 */
  offscreenResolution?: ScenarioModEventOffscreenResolution;
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
