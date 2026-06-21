import type { ScenarioModCanon } from './canon';
import type { ScenarioModContent } from './content';
import type { ScenarioModManifest } from './manifest';
import type { ScenarioModRules } from './rules';
import type { ScenarioModScenario } from './scenario';
import type { ScenarioModWorld } from './world';

export const SCENARIO_MOD_SCHEMA = 'xiantu.scenario-mod' as const;
export const SCENARIO_MOD_VERSION = 1 as const;

export interface ScenarioMod {
  schema: typeof SCENARIO_MOD_SCHEMA;
  version: typeof SCENARIO_MOD_VERSION;
  manifest: ScenarioModManifest;
  world: ScenarioModWorld;
  canon?: ScenarioModCanon;
  content?: ScenarioModContent;
  scenario: ScenarioModScenario;
  rules: ScenarioModRules;
}

export * from './canon';
export * from './content';
export * from './manifest';
export * from './rules';
export * from './scenario';
export * from './world';
