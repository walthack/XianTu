export interface ScenarioModFaction {
  id: string;
  name: string;
  description?: string;
  type?: string;
  headquartersLocationId?: string;
  level?: string;
  territory?: ScenarioModCanonMapPoint[];
  features?: string[];
}

export interface ScenarioModLocation {
  id: string;
  name: string;
  description?: string;
  type?: string;
  continentId?: string;
  factionId?: string;
  coordinates?: ScenarioModCanonMapPoint;
  features?: string[];
  safety?: string;
  status?: string;
}

export type ScenarioModAffiliationCategory = 'sect' | 'military' | 'state' | 'clan' | 'organization';

export interface ScenarioModCharacterAffiliation {
  factionId: string;
  category: ScenarioModAffiliationCategory;
  role?: string;
  exclusive?: boolean;
}

export interface ScenarioModCanonMapPoint {
  x: number;
  y: number;
}

export interface ScenarioModCharacterAttributes {
  rootBone?: number;
  spirituality?: number;
  comprehension?: number;
  fortune?: number;
  charm?: number;
  temperament?: number;
}

export interface ScenarioModCharacterProfile {
  appearance?: string;
  personality?: string[];
  currentAppearance?: string;
  currentThought?: string;
  memories?: string[];
  race?: string;
  origin?: string;
  spiritRoot?: {
    name: string;
    tier?: string;
    description?: string;
  };
  talents?: {
    name: string;
    description?: string;
  }[];
  attributes?: ScenarioModCharacterAttributes;
  notes?: string[];
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
  profile?: ScenarioModCharacterProfile;
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

export interface ScenarioModFactionRelationship {
  fromFactionId: string;
  toFactionId: string;
  relation: string;
  score: number;
  direction?: 'directed' | 'bidirectional';
  tags?: string[];
}

export interface ScenarioModCanon {
  factions?: ScenarioModFaction[];
  locations?: ScenarioModLocation[];
  characters?: ScenarioModCharacter[];
  playerRelationships?: ScenarioModPlayerRelationship[];
  relationships?: ScenarioModCharacterRelationship[];
  factionRelationships?: ScenarioModFactionRelationship[];
}
