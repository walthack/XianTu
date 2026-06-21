export type ScenarioModMode = 'strict' | 'expand';

export interface ScenarioModRules {
  mode: ScenarioModMode;
  lockedFields?: string[];
}
