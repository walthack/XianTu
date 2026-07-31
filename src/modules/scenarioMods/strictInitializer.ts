import type { PlayerLocation, SaveData, WorldInfo } from '@/types/game';

import type { ScenarioMod } from './schema';
import { buildExpandScenarioInitialization, type ExpandScenarioInitialization } from './expandInitializer';
import { withNativeScenarioLocationType } from './locationTypes';
import { advanceScenarioRuntime, createScenarioProgress, getInitialScenarioChapterId, type ScenarioProgressState } from './runtime';
import { applyScenarioRelationshipsToSave } from './relationships';
import { isDefaultLineQuarantinedStageId } from './canonRail';

export interface ScenarioModRuntimeState extends ScenarioProgressState {
  schema: ScenarioMod['schema'];
  version: ScenarioMod['version'];
  modId: string;
  modName: string;
  modVersion: string;
  axisVersion?: string;
  axisOrder?: number;
  axisSeqLo?: number | null;
  axisSeqHi?: number | null;
  prevStageId?: string | null;
  prevStageName?: string | null;
  nextStageId?: string | null;
  nextStageName?: string | null;
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
        ...(location.region ? { 地域: location.region } : {}),
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
    modName: mod.manifest.name,
    modVersion: mod.manifest.version,
    axisVersion: mod.manifest.axisVersion,
    axisOrder: mod.manifest.axisOrder,
    axisSeqLo: mod.manifest.axisSeqLo,
    axisSeqHi: mod.manifest.axisSeqHi,
    prevStageId: mod.manifest.prevStageId,
    prevStageName: mod.manifest.prevStageName,
    nextStageId: mod.manifest.nextStageId,
    nextStageName: mod.manifest.nextStageName,
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
      modName: initialization.runtimeState.modName,
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

// ===== 关卡切换（消费 stage_ready 信号；此前信号存在但无任何代码执行切关） =====
export interface StageTransitionResult {
  saveData: SaveData;
  ok: boolean;
  reason?: string;
  from?: string;
  to?: string;
  toName?: string;
}

/**
 * 把存档推进到下一关：换 世界.信息/剧本模组运行时/开场位置，
 * 但**保留**玩家全部状态与 NPC 累积关系（好感度/与玩家关系/记忆），并携带不在新关花名册的旧 NPC。
 * 仅当 nextStageReadyId 就绪（本关关键剧情已完成）才允许。
 */
export function transitionToNextScenarioStage(saveData: SaveData, modsOverride?: ScenarioMod[]): StageTransitionResult {
  const rt = (saveData as any)?.世界?.状态?.剧本模组;
  if (!rt?.modId) return { saveData, ok: false, reason: '当前存档无剧本运行时' };
  const configuredTargetId = rt.nextStageId;
  if (!configuredTargetId) return { saveData, ok: false, reason: '已是最终关，无下一关' };
  if (rt.nextStageReadyId !== configuredTargetId) return { saveData, ok: false, reason: '本关关键剧情尚未完成' };
  let mods = modsOverride;
  if (!mods) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- builtins use require.context and are unavailable to the Node harness.
      mods = (require('./builtins') as { BUILTIN_SCENARIO_MODS: ScenarioMod[] }).BUILTIN_SCENARIO_MODS;
    } catch { return { saveData, ok: false, reason: '内置剧情模组不可用' }; }
  }
  let targetId = configuredTargetId;
  let mod = (mods || []).find(item => item.manifest.id === targetId);
  const skipped = new Set<string>();
  // Do not silently enter a legacy freeform/mismatched stage from the default
  // route. Follow its declared continuation; entering it itself requires IF.
  while (mod && isDefaultLineQuarantinedStageId(targetId)) {
    if (skipped.has(targetId)) return { saveData, ok: false, reason: `隔离关卡转场循环：${targetId}` };
    skipped.add(targetId);
    targetId = mod.manifest.nextStageId || '';
    mod = targetId ? (mods || []).find(item => item.manifest.id === targetId) : undefined;
  }
  if (!mod) return { saveData, ok: false, reason: `未找到下一关模组 ${targetId}` };

  const relationSnapshot = structuredClone((saveData as any)?.社交?.关系 || {});
  // 世界线分歧是玩家历史，不是当前关卡模板数据。切关时必须跨关携带；
  // done/章节进度仍按新关初始化，只继承分支、人物状态与 void 审计标记。
  const divergenceSnapshot = structuredClone(Array.isArray(rt.divergences) ? rt.divergences : []);
  const chronicleSnapshot = structuredClone(Array.isArray(rt.chronicle) ? rt.chronicle : []);
  const playerKnowledgeSnapshot = structuredClone(
    rt.playerKnowledge && typeof rt.playerKnowledge === 'object' ? rt.playerKnowledge : {},
  );
  const npcPrivateKnowledgeSnapshot = structuredClone(
    rt.npcPrivateKnowledge && typeof rt.npcPrivateKnowledge === 'object' ? rt.npcPrivateKnowledge : {},
  );
  if (!chronicleSnapshot.some((item: any) => item?.id === `chronicle.stage.${rt.modId}.${targetId}`)) {
    chronicleSnapshot.push({
      id: `chronicle.stage.${rt.modId}.${targetId}`,
      type: 'stage', stageId: String(rt.modId || ''),
      title: `完成「${rt.modName || rt.modId}」`,
      detail: `进入「${mod.manifest.name}」`,
      sequence: chronicleSnapshot.length + 1,
    });
  }
  const inheritedWorldlineFlags = Object.fromEntries(Object.entries(rt.flags || {}).filter(([key]) =>
    key.startsWith('branch.') || key.startsWith('character.') || key.endsWith('.void'),
  ));
  const initialization = buildStrictScenarioInitialization(mod);
  const next = applyStrictScenarioInitializationToSave(saveData, initialization);
  // 回填累积关系：旧值(好感/关系/记忆等)优先，新关正典只补新增字段与新记忆
  const relations = (next as any).社交.关系 as Record<string, any>;
  for (const [name, old] of Object.entries<any>(relationSnapshot)) {
    if (relations[name]) {
      const fresh = relations[name];
      const mergedMemories = [...new Set([...(old?.记忆 || []), ...(fresh?.记忆 || [])])];
      relations[name] = { ...fresh, ...old, 记忆: mergedMemories };
    } else {
      relations[name] = old; // 跨关携带旧 NPC（后宫/同行者不因换关消失）
    }
  }
  const newRuntime = (next as any).世界.状态.剧本模组;
  newRuntime.reconciledRegistryVersion = rt.reconciledRegistryVersion;
  if (divergenceSnapshot.length) newRuntime.divergences = divergenceSnapshot;
  if (chronicleSnapshot.length) newRuntime.chronicle = chronicleSnapshot;
  newRuntime.playerKnowledge = {
    ...(newRuntime.playerKnowledge || {}),
    ...playerKnowledgeSnapshot,
  };
  newRuntime.npcPrivateKnowledge = {
    ...(newRuntime.npcPrivateKnowledge || {}),
    ...npcPrivateKnowledgeSnapshot,
  };
  Object.assign(newRuntime.flags, inheritedWorldlineFlags);
  // 立即推进一轮：激活新关首章/首批事件
  const advanced = advanceScenarioRuntime(next);
  const advancedRuntime = (advanced.saveData as any)?.世界?.状态?.剧本模组;
  if (advancedRuntime) {
    advancedRuntime.stageEntryPresentation = {
      fromStageId: String(rt.modId),
      ...(rt.modName ? { fromStageName: String(rt.modName) } : {}),
      toStageId: targetId,
      ...(mod.manifest.name ? { toStageName: mod.manifest.name } : {}),
      enteredAtTurn: Math.max(0, Number(advancedRuntime.worldTurn) || 0),
      text: String(mod.scenario.opening.text || '').trim(),
    };
  }
  return { saveData: advanced.saveData, ok: true, from: rt.modId, to: targetId, toName: mod.manifest.name };
}
