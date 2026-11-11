/**
 * 逐拍演出关卡（行旅数据 NANHUANG_STEP_SCENE_STAGE_IDS）与每拍推进分钟数（数值配置 story.stepScene.minutesPerBeat）。
 * 取代 AIBidirectionalSystem 里的南荒正则硬判与写死的 120 分钟（2026-10-19 小批解冻）。
 */
import { GAME_NUMBERS } from '../../sceneModule/numbers';
import { CONTENT_PACKS } from '../../contentPacks';
import { TS_STEP_SCENE_STAGE_PREFIXES, isStepSceneStageIn, stepSceneStagePrefixesIn } from './openWorldSlices';

/** TS 侧前缀在前、内容包 openWorldSlices 的 stepSceneStagePrefixes 按 catalog 顺序在后（F0b）；编译器用同一份纯数据与本次编译的包算（不经本模块，M2）。 */
const STEP_SCENE_STAGE_IDS: readonly string[] = stepSceneStagePrefixesIn(CONTENT_PACKS.openWorldSlices || [], TS_STEP_SCENE_STAGE_PREFIXES);

/** 关卡 id 以登记的逐拍演出关卡 id 开头即算（与原正则 ^lcq\.stage_0(?:3b|4|4b) 同义）。 */
export function isStepSceneStage(id?: string): boolean {
  return isStepSceneStageIn(STEP_SCENE_STAGE_IDS, id);
}

/** 逐拍演出时一拍推进的分钟数；卡片自带 dayPart 时由调用方按 0 处理。 */
export function stepSceneMinutesPerBeat(): number {
  return Number((GAME_NUMBERS as any).story.stepScene.minutesPerBeat);
}
