export interface ScenarioModContinent {
  id: string;
  name: string;
  description?: string;
}

export interface ScenarioModWorld {
  name: string;
  era: string;
  background: string;
  specialRules?: string[];
  continents?: ScenarioModContinent[];
}
