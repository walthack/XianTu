import type { SaveData } from '@/types/game';

type UnknownRecord = Record<string, any>;

/**
 * Build the state JSON sent to the narrator.
 *
 * Scenario canon, chapter bodies and event bodies are already rendered into the focused
 * scenario prompts. Repeating those large immutable structures in the state JSON can push a
 * long-running session beyond an OpenAI-compatible endpoint's context window.
 */
export function buildNarrativePromptState(state: SaveData): Record<string, unknown> {
  const source = state as UnknownRecord;
  const world = source.世界 || {};
  const worldState = world.状态 || {};
  const runtime = worldState.剧本模组;
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
      身份: source.角色?.身份,
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
      关系: source.社交?.关系,
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
