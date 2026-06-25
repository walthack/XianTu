import type { PlayerLocation, SaveData, WorldInfo } from '@/types/game';

import type { ScenarioMod } from './schema';
import { buildExpandScenarioInitialization, type ExpandScenarioInitialization } from './expandInitializer';
import { withNativeScenarioLocationType } from './locationTypes';
import { createScenarioProgress, getInitialScenarioChapterId, type ScenarioProgressState } from './runtime';
import { applyScenarioRelationshipsToSave } from './relationships';

export interface ScenarioModRuntimeState extends ScenarioProgressState {
  schema: ScenarioMod['schema'];
  version: ScenarioMod['version'];
  modId: string;
  modVersion: string;
  mode: 'strict';
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

export interface StrictScenarioInitialization {
  worldInfo: WorldInfo;
  runtimeState: ScenarioModRuntimeState;
  initialLocation: PlayerLocation;
}

export function buildStrictScenarioInitialization(
  mod: ScenarioMod,
  generatedAt = new Date().toISOString(),
): StrictScenarioInitialization {
  // Pinia exposes the selected Mod as a reactive Proxy. Normalize the JSON
  // contract before cloning nested values into the save runtime.
  mod = JSON.parse(JSON.stringify(mod)) as ScenarioMod;

  if (mod.rules.mode !== 'strict') {
    throw new Error(`Scenario Mod "${mod.manifest.id}" is not configured for strict initialization.`);
  }

  const continents = mod.world.continents || [];
  const factions = mod.canon?.factions || [];
  const factionRelationships = mod.canon?.factionRelationships || [];
  const locations = mod.canon?.locations || [];
  const openingLocation = locations.find(location => location.id === mod.scenario.opening.locationId) || locations[0];
  const firstContinentName = continents[0]?.name || '未定大陆';
  const mapConfig = mod.world.map?.mapConfig || {
    width: 10000,
    height: 10000,
    minLng: 0,
    maxLng: 10000,
    minLat: 0,
    maxLat: 10000,
  };

  const worldInfo: WorldInfo = {
    世界名称: mod.world.name,
    世界背景: mod.world.background,
    世界纪元: mod.world.era,
    特殊设定: [...(mod.world.specialRules || [])],
    生成时间: generatedAt,
    版本: `scenario-mod:${mod.manifest.id}@${mod.manifest.version}`,
    大陆信息: continents.map(continent => ({
      名称: continent.name,
      name: continent.name,
      描述: continent.description || '',
      大洲边界: continent.bounds ? structuredClone(continent.bounds) : undefined,
      主要势力: factions
        .filter(faction => {
          const headquarters = locations.find(location => location.id === faction.headquartersLocationId);
          return !headquarters?.continentId || headquarters.continentId === continent.id;
        })
        .map(faction => faction.name),
    })),
    势力信息: factions.map(faction => {
      const headquarters = locations.find(location => location.id === faction.headquartersLocationId);
      const continent = continents.find(item => item.id === headquarters?.continentId);
      return {
        id: faction.id,
        名称: faction.name,
        类型: faction.type || '中立宗门',
        等级: faction.level || '三流',
        所在大洲: continent?.name || firstContinentName,
        位置: headquarters?.coordinates ? structuredClone(headquarters.coordinates) : headquarters?.name || '位置未定',
        势力范围: faction.territory ? structuredClone(faction.territory) : undefined,
        描述: faction.description || '',
        特色: faction.features || [],
        对外关系: factionRelationships
          .filter(rel => rel.fromFactionId === faction.id || rel.toFactionId === faction.id)
          .map(rel => {
            const otherId = rel.fromFactionId === faction.id ? rel.toFactionId : rel.fromFactionId;
            return { 目标势力: factions.find(item => item.id === otherId)?.name || otherId, 关系: rel.relation, 分数: rel.score };
          }),
      };
    }),
    地点信息: locations.map(location => {
      const continent = continents.find(item => item.id === location.continentId);
      const faction = factions.find(item => item.id === location.factionId);
      return withNativeScenarioLocationType({
        名称: location.name,
        位置: continent?.name || firstContinentName,
        coordinates: location.coordinates ? structuredClone(location.coordinates) : undefined,
        坐标: location.coordinates ? structuredClone(location.coordinates) : undefined,
        描述: location.description || '',
        特色: location.features?.join('、') || '',
        安全等级: location.safety || '较安全',
        开放状态: location.status || '开放',
        相关势力: faction ? [faction.name] : [],
      }, location.type);
    }),
    地图配置: mapConfig,
  };
  (worldInfo as unknown as Record<string, unknown>).剧本地图 = {
    atlasId: mod.world.map?.atlasId,
    locked: mod.world.map?.locked ?? mod.rules.mode === 'strict',
    backgroundImage: mod.world.map?.backgroundImage,
  };

  const runtimeState: ScenarioModRuntimeState = {
    schema: mod.schema,
    version: mod.version,
    modId: mod.manifest.id,
    modVersion: mod.manifest.version,
    mode: 'strict',
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
  };

  const locationName = openingLocation?.name || '开场地点';
  const continentName = continents.find(item => item.id === openingLocation?.continentId)?.name || firstContinentName;
  const openingCoordinates = openingLocation?.coordinates || { x: 5000, y: 5000 };

  return {
    worldInfo,
    runtimeState,
    initialLocation: {
      描述: `${continentName}·${locationName}`,
      x: openingCoordinates.x,
      y: openingCoordinates.y,
    },
  };
}

export function applyStrictScenarioInitializationToSave(
  saveData: SaveData,
  initialization: StrictScenarioInitialization,
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

export async function resolveInitialWorldInfo(
  scenarioMod: ScenarioMod | null,
  generateWorld: () => Promise<WorldInfo>,
): Promise<{
  worldInfo: WorldInfo;
  strictInitialization?: StrictScenarioInitialization;
  expandInitialization?: ExpandScenarioInitialization;
}> {
  if (scenarioMod?.rules.mode === 'strict') {
    const strictInitialization = buildStrictScenarioInitialization(scenarioMod);
    return { worldInfo: strictInitialization.worldInfo, strictInitialization };
  }
  const generatedWorld = await generateWorld();
  if (scenarioMod?.rules.mode === 'expand') {
    const expandInitialization = buildExpandScenarioInitialization(scenarioMod, generatedWorld);
    return { worldInfo: expandInitialization.worldInfo, expandInitialization };
  }
  return { worldInfo: generatedWorld };
}
