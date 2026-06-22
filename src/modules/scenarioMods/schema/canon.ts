export interface ScenarioModFaction {
  id: string;
  name: string;
  description?: string;
  type?: string;
  headquartersLocationId?: string;
}

export interface ScenarioModLocation {
  id: string;
  name: string;
  description?: string;
  type?: string;
  continentId?: string;
  factionId?: string;
}

export type ScenarioModAffiliationCategory = 'sect' | 'military' | 'state' | 'clan' | 'organization';

export interface ScenarioModCharacterAffiliation {
  factionId: string;
  category: ScenarioModAffiliationCategory;
  role?: string;
  exclusive?: boolean;
}

export interface ScenarioModCharacter {
  id: string;
  name: string;
  description?: string;
  role?: string;
  gender?: string;
  realm?: string;
  factionId?: string;
  affiliations?: ScenarioModCharacterAffiliation[];
  locationId?: string;
  skillIds?: string[];
  techniqueIds?: string[];
  itemIds?: string[];
}

export interface ScenarioModPlayerRelationship {
  characterId: string;
  relation: string;
  favorability: number;
  memories?: string[];
}

export interface ScenarioModCharacterRelationship {
  fromCharacterId: string;
  toCharacterId: string;
  relation: string;
  score: number;
  direction?: 'directed' | 'bidirectional';
  tags?: string[];
  events?: string[];
}

export interface ScenarioModCanon {
  factions?: ScenarioModFaction[];
  locations?: ScenarioModLocation[];
  characters?: ScenarioModCharacter[];
  playerRelationships?: ScenarioModPlayerRelationship[];
  relationships?: ScenarioModCharacterRelationship[];
}
