import type { PlayerLocation, SaveData, WorldInfo } from '@/types/game';

import type { ScenarioMod } from './schema';
import { withNativeScenarioLocationType } from './locationTypes';
import { createScenarioProgress, getInitialScenarioChapterId, type ScenarioProgressState } from './runtime';
import { applyScenarioRelationshipsToSave } from './relationships';

export interface ExpandScenarioRuntimeState extends ScenarioProgressState {
  schema: ScenarioMod['schema'];
  version: ScenarioMod['version'];
  modId: string;
  modVersion: string;
  mode: 'expand';
  lockedFields: string[];
  contentAccess: NonNullable<ScenarioMod['rules']['contentAccess']>;
  currentChapterId: string | null;
  flags: Record<string, string | number | boolean | null>;
  canon: {
    factions: NonNullable<ScenarioMod['canon']>['factions'];
    locations: NonNullable<ScenarioMod['canon']>['locations'];
    characters: NonNullable<ScenarioMod['canon']>['characters'];
    playerRelationships: NonNullable<ScenarioMod['canon']>['playerRelationships'];
    relationships: NonNullable<ScenarioMod['canon']>['relationships'];
    skills: NonNullable<ScenarioMod['content']>['skills'];
    techniques: NonNullable<ScenarioMod['content']>['techniques'];
    items: NonNullable<ScenarioMod['content']>['items'];
  };
  opening: ScenarioMod['scenario']['opening'];
}

export interface ExpandScenarioInitialization {
  worldInfo: WorldInfo;
  runtimeState: ExpandScenarioRuntimeState;
  initialLocation: PlayerLocation;
}

type NamedRecord = Record<string, unknown> & { id?: string; name?: string; 名称?: string };

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function mergeAuthoritative(authoritative: NamedRecord, fallback: NamedRecord): NamedRecord {
  const result: NamedRecord = structuredClone(fallback);
  for (const [key, value] of Object.entries(authoritative)) {
    if (hasValue(value)) result[key] = structuredClone(value);
  }
  return result;
}

function mergeNamedRecords(generated: unknown[] | undefined, additions: NamedRecord[]): NamedRecord[] {
  const result = structuredClone(generated || []) as NamedRecord[];
  for (const addition of additions) {
    const additionName = addition.名称 || addition.name;
    const index = result.findIndex(item =>
      (addition.id && item.id === addition.id) ||
      (additionName && (item.名称 === additionName || item.name === additionName)),
    );
    if (index >= 0) result[index] = mergeAuthoritative(addition, result[index]);
    else result.push(structuredClone(addition));
  }
  return result;
}

export function buildExpandScenarioInitialization(
  mod: ScenarioMod,
  generatedWorld: WorldInfo,
): ExpandScenarioInitialization {
  // Character creation stores the selected Mod in reactive state.
  mod = JSON.parse(JSON.stringify(mod)) as ScenarioMod;

  if (mod.rules.mode !== 'expand') {
    throw new Error(`Scenario Mod "${mod.manifest.id}" is not configured for expand initialization.`);
  }

  const continents = mod.world.continents || [];
  const factions = mod.canon?.factions || [];
  const locations = mod.canon?.locations || [];
  const firstContinentName = continents[0]?.name || generatedWorld.大陆信息?.[0]?.名称 || '未定大陆';

  const continentAdditions: NamedRecord[] = continents.map(continent => {
    const relatedFactions = factions
      .filter(faction => {
        const headquarters = locations.find(location => location.id === faction.headquartersLocationId);
        return !headquarters?.continentId || headquarters.continentId === continent.id;
      })
      .map(faction => faction.name);
    return {
      id: continent.id,
      名称: continent.name,
      name: continent.name,
      ...(continent.description ? { 描述: continent.description } : {}),
      ...(relatedFactions.length > 0 ? { 主要势力: relatedFactions } : {}),
    };
  });

  const factionAdditions: NamedRecord[] = factions.map(faction => {
    const headquarters = locations.find(location => location.id === faction.headquartersLocationId);
    const continent = continents.find(item => item.id === headquarters?.continentId);
    return {
      id: faction.id,
      名称: faction.name,
      ...(faction.type ? { 类型: faction.type } : {}),
      ...(continent ? { 所在大洲: continent.name } : {}),
      ...(headquarters ? { 位置: headquarters.name } : {}),
      ...(faction.description ? { 描述: faction.description } : {}),
    };
  });

  const locationAdditions: NamedRecord[] = locations.map(location => {
    const continent = continents.find(item => item.id === location.continentId);
    const faction = factions.find(item => item.id === location.factionId);
    return withNativeScenarioLocationType({
      id: location.id,
      名称: location.name,
      ...(continent ? { 位置: continent.name } : {}),
      ...(location.description ? { 描述: location.description } : {}),
      ...(faction ? { 相关势力: [faction.name] } : {}),
    }, location.type);
  });

  const worldInfo = structuredClone(generatedWorld);
  worldInfo.世界名称 = mod.world.name;
  worldInfo.世界背景 = mod.world.background;
  worldInfo.世界纪元 = mod.world.era;
  worldInfo.特殊设定 = Array.from(new Set([...(worldInfo.特殊设定 || []), ...(mod.world.specialRules || [])]));
  worldInfo.大陆信息 = mergeNamedRecords(worldInfo.大陆信息, continentAdditions) as unknown as WorldInfo['大陆信息'];
  worldInfo.势力信息 = mergeNamedRecords(worldInfo.势力信息, factionAdditions) as unknown as WorldInfo['势力信息'];
  worldInfo.地点信息 = mergeNamedRecords(worldInfo.地点信息, locationAdditions) as unknown as WorldInfo['地点信息'];

  const openingLocation = locations.find(location => location.id === mod.scenario.opening.locationId) || locations[0];
  const locationName = openingLocation?.name || '开场地点';
  const continentName = continents.find(item => item.id === openingLocation?.continentId)?.name || firstContinentName;

  return {
    worldInfo,
    runtimeState: {
      schema: mod.schema,
      version: mod.version,
      modId: mod.manifest.id,
      modVersion: mod.manifest.version,
      mode: 'expand',
      lockedFields: [...(mod.rules.lockedFields || [])],
      contentAccess: structuredClone(mod.rules.contentAccess || []),
      currentChapterId: getInitialScenarioChapterId(mod),
      flags: { ...(mod.scenario.initialFlags || {}) },
      canon: {
        factions: structuredClone(mod.canon?.factions || []),
        locations: structuredClone(mod.canon?.locations || []),
        characters: structuredClone(mod.canon?.characters || []),
        playerRelationships: structuredClone(mod.canon?.playerRelationships || []),
        relationships: structuredClone(mod.canon?.relationships || []),
        skills: structuredClone(mod.content?.skills || []),
        techniques: structuredClone(mod.content?.techniques || []),
        items: structuredClone(mod.content?.items || []),
      },
      opening: structuredClone(mod.scenario.opening),
      ...createScenarioProgress(mod),
    },
    initialLocation: {
      描述: `${continentName}·${locationName}`,
      x: 5000,
      y: 5000,
    },
  };
}

export function applyExpandScenarioInitializationToSave(
  saveData: SaveData,
  initialization: ExpandScenarioInitialization,
): SaveData {
  const next = structuredClone(saveData);
  next.世界 = {
    ...(next.世界 || {}),
    信息: initialization.worldInfo,
    状态: {
      ...((next.世界?.状态 as Record<string, unknown>) || {}),
      剧本模组: initialization.runtimeState,
    },
  };
  next.角色.位置 = initialization.initialLocation;
  next.系统.扩展 = {
    ...(next.系统.扩展 || {}),
    剧本模组: {
      modId: initialization.runtimeState.modId,
      modVersion: initialization.runtimeState.modVersion,
      mode: initialization.runtimeState.mode,
    },
  };
  return applyScenarioRelationshipsToSave(next, {
    ...initialization.runtimeState.canon,
    opening: initialization.runtimeState.opening,
  }, initialization.worldInfo.生成时间);
}
