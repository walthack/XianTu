import type { SaveData } from '@/types/game';
import { computeScenarioPresence } from '@/modules/scenarioMods/storyContext';
import {
  beatIntimateFor,
  intimateInputHit,
  pickAbsentRelationFields,
  pickPrivacyFields,
  privateGateOpen,
  projectNpcMemory,
} from '@/modules/scenarioMods/promptLayers';
import { gateAgeNow } from '@/modules/scenarioMods/characterResolver';

type UnknownRecord = Record<string, any>;

/**
 * 社交.关系 按在场投影（与 storyContext 同口径：computeScenarioPresence），存档本身不删。
 * 不在场 NPC 只留 absentRelationFields（名字、关系、好感、位置等），省记忆与私密信息。
 * 在场 NPC 记忆只带最近 memory.npcPromptLimit 条；私密信息 走 privateGateOpen
 * （本轮输入命中或激活拍 scene.intimate＋在场＋好感＋现算年龄满 18），门不过整块剔除，门过只留 privacyAllowedFields。
 * 非剧本存档无在场口径：关系照常全发，只有 私密信息 同样过门（无在场口径按在场计、无激活拍）。
 */
function projectPromptRelations(
  relations: unknown,
  presenceSource: SaveData,
  playerInput: string,
): unknown {
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) return relations;
  const presence = computeScenarioPresence(presenceSource, playerInput);
  const characters = presence?.runtime.canon?.characters || [];
  const inputHit = intimateInputHit(playerInput);
  const currentYear = Number((presenceSource as any)?.元数据?.时间?.年);
  const projected: UnknownRecord = {};
  for (const [key, npc] of Object.entries(relations as UnknownRecord)) {
    if (!presence) {
      projected[key] = npc && typeof npc === 'object' && '私密信息' in npc ? gatePrivacy({ ...npc }, inputHit, false, String(npc.角色ID || key), currentYear) : npc;
      continue;
    }
    if (!npc || typeof npc !== 'object') continue;
    const name = String(npc.名字 || key);
    if (!presence.presentNames.has(key) && !presence.presentNames.has(name)) {
      projected[key] = pickAbsentRelationFields(npc);
      continue;
    }
    const entry: UnknownRecord = { ...npc };
    if (Array.isArray(entry.记忆)) entry.记忆 = projectNpcMemory(entry.记忆);
    if ('私密信息' in entry) {
      const characterId = characters.find(character => character.id === key || character.name === name)?.id;
      gatePrivacy(entry, inputHit, presence.activeEvents.some(event => beatIntimateFor(event, characterId)), characterId || String(entry.角色ID || key), currentYear);
    }
    projected[key] = entry;
  }
  return projected;
}

/** 私密信息 过门（与 storyContext 共用 privateGateOpen）：门不过整块剔除，门过只留 privacyAllowedFields。 */
function gatePrivacy(entry: UnknownRecord, inputHit: boolean, beatIntimate: boolean, characterId: string, currentYear: number): UnknownRecord {
  const open = privateGateOpen({
    inputHit,
    beatIntimate,
    present: true,
    favor: Number(entry.好感度) || 0,
    ageNow: gateAgeNow(characterId, currentYear, undefined, entry.首见年),
  });
  const privacy = open ? pickPrivacyFields(entry.私密信息) : null;
  if (privacy) entry.私密信息 = privacy;
  else delete entry.私密信息;
  return entry;
}

/**
 * Build the state JSON sent to the narrator.
 *
 * Scenario canon, chapter bodies and event bodies are already rendered into the focused
 * scenario prompts. Repeating those large immutable structures in the state JSON can push a
 * long-running session beyond an OpenAI-compatible endpoint's context window.
 */
export function buildNarrativePromptState(
  state: SaveData,
  playerInput = '',
  presenceSource: SaveData = state,
): Record<string, unknown> {
  const source = state as UnknownRecord;
  const world = source.世界 || {};
  const worldState = world.状态 || {};
  const runtime = worldState.剧本模组;
  // 创角身份中保留的完整世界副本已在世界.信息中提供，不重复传输。
  const identity = source.角色?.身份;
  const compactIdentity = identity && typeof identity === 'object' ? { ...identity } : identity;
  if (String(runtime?.modId || '').startsWith('lcq.')
    && compactIdentity?.世界 && typeof compactIdentity.世界 === 'object') {
    compactIdentity.世界 = compactIdentity.世界.名称 || compactIdentity.世界.name
      || world.信息?.世界名称 || '当前世界';
  }
  const compactRuntime = runtime && typeof runtime === 'object'
    ? {
        modId: runtime.modId,
        modName: runtime.modName,
        mode: runtime.mode,
        currentChapterId: runtime.currentChapterId,
        activeEventIds: runtime.activeEventIds,
        completedChapterIds: runtime.completedChapterIds,
        completedEventIds: runtime.completedEventIds,
        flags: runtime.flags,
        divergences: runtime.divergences,
        introducedCharacterIds: runtime.introducedCharacterIds,
        steeringCooldown: runtime.steeringCooldown,
        stallTurns: runtime.stallTurns,
        nextStageId: runtime.nextStageId,
        nextStageReadyId: runtime.nextStageReadyId,
      }
    : runtime;

  return {
    元数据: { 时间: source.元数据?.时间 },
    角色: {
      身份: compactIdentity,
      属性: source.角色?.属性,
      位置: source.角色?.位置,
      效果: source.角色?.效果,
      身体: source.角色?.身体,
      背包: source.角色?.背包,
      装备: source.角色?.装备,
      功法: source.角色?.功法,
      修炼: source.角色?.修炼,
      大道: source.角色?.大道,
      技能: source.角色?.技能,
    },
    社交: {
      关系: projectPromptRelations(source.社交?.关系, presenceSource, String(playerInput || '')),
      宗门: source.社交?.宗门,
      任务: source.社交?.任务,
      事件: source.社交?.事件,
      记忆: {
        中期记忆: source.社交?.记忆?.中期记忆,
        长期记忆: source.社交?.记忆?.长期记忆,
      },
    },
    世界: {
      信息: world.信息,
      状态: {
        ...worldState,
        剧本模组: compactRuntime,
      },
    },
  };
}
