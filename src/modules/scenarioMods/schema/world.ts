export interface ScenarioModContinent {
  id: string;
  name: string;
  description?: string;
  bounds?: ScenarioModMapPoint[];
}

export interface ScenarioModMapPoint {
  x: number;
  y: number;
}

export interface ScenarioModMapConfig {
  width: number;
  height: number;
  minLng?: number;
  maxLng?: number;
  minLat?: number;
  maxLat?: number;
}

export interface ScenarioModWorldMap {
  atlasId?: string;
  mapConfig?: ScenarioModMapConfig;
  locked?: boolean;
  backgroundImage?: string;
}

export interface ScenarioModWorld {
  name: string;
  era: string;
  background: string;
  specialRules?: string[];
  continents?: ScenarioModContinent[];
  map?: ScenarioModWorldMap;
}
