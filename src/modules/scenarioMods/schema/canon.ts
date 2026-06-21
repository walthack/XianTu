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

export interface ScenarioModCharacter {
  id: string;
  name: string;
  description?: string;
  role?: string;
  gender?: string;
  realm?: string;
  factionId?: string;
  locationId?: string;
  skillIds?: string[];
  techniqueIds?: string[];
  itemIds?: string[];
}

export interface ScenarioModCanon {
  factions?: ScenarioModFaction[];
  locations?: ScenarioModLocation[];
  characters?: ScenarioModCharacter[];
}
