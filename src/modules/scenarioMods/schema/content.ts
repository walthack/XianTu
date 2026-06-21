export interface ScenarioModSkill {
  id: string;
  name: string;
  description?: string;
  type?: string;
  effects?: string[];
}

export interface ScenarioModTechnique {
  id: string;
  name: string;
  description?: string;
  grade?: string;
  skillIds?: string[];
}

export type ScenarioModItemType = 'weapon' | 'armor' | 'consumable' | 'material' | 'other';

export interface ScenarioModItem {
  id: string;
  name: string;
  description?: string;
  type: ScenarioModItemType;
  grade?: string;
  skillIds?: string[];
  techniqueId?: string;
}

export interface ScenarioModContent {
  skills?: ScenarioModSkill[];
  techniques?: ScenarioModTechnique[];
  items?: ScenarioModItem[];
}
