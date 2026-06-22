export type ScenarioModMode = 'strict' | 'expand';
export type ScenarioContentAccessPolicy = 'restricted' | 'exclusive';

export interface ScenarioContentAccessRule {
  contentId: string;
  policy: ScenarioContentAccessPolicy;
  allowedCharacterIds?: string[];
  playerAllowed?: boolean;
}

export interface ScenarioModRules {
  mode: ScenarioModMode;
  lockedFields?: string[];
  contentAccess?: ScenarioContentAccessRule[];
}
