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
  conditions?: ScenarioCondition[];
  completion?: ScenarioCondition[];
  relatedCharacterIds?: string[];
  relatedFactionIds?: string[];
  locationId?: string;
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
