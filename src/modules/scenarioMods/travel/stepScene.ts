/**
 * 逐拍演出关卡（行旅数据 NANHUANG_STEP_SCENE_STAGE_IDS）与每拍推进分钟数（数值配置 story.stepScene.minutesPerBeat）。
 * 取代 AIBidirectionalSystem 里的南荒正则硬判与写死的 120 分钟（2026-10-19 小批解冻）。
 */
import { NANHUANG_STEP_SCENE_STAGE_IDS } from './defs/qingyuNanhuang';
import { GAME_NUMBERS } from '../../sceneModule/numbers';

const STEP_SCENE_STAGE_IDS: readonly string[] = [...NANHUANG_STEP_SCENE_STAGE_IDS];

/** 关卡 id 以登记的逐拍演出关卡 id 开头即算（与原正则 ^lcq\.stage_0(?:3b|4|4b) 同义）。 */
export function isStepSceneStage(id?: string): boolean {
  const s = id || '';
  return STEP_SCENE_STAGE_IDS.some(stageId => s.startsWith(stageId));
}

/** 逐拍演出时一拍推进的分钟数；卡片自带 dayPart 时由调用方按 0 处理。 */
export function stepSceneMinutesPerBeat(): number {
  return Number((GAME_NUMBERS as any).story.stepScene.minutesPerBeat);
}
