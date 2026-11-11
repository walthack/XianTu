/**
 * 南荒逐拍演出的关卡（每拍有固定演出卡，非卡片 dayPart 时按 story.stepScene.minutesPerBeat 推进时间）。
 * 按前缀匹配，与原 isNanhuangSceneStage 正则 ^lcq\.stage_0(?:3b|4|4b) 同义；不含 stage_02 / stage_05b。
 *
 * F0b（2026-11-11）从 qingyuNanhuang.ts 原样拆出：编译器在 catalog.json 不存在时也要读这份 TS 侧数据（M2），
 * 而 qingyuNanhuang.ts 现在要读 catalog 合并内容包切片。本文件只放纯数据，不 import 任何会读 catalog 的模块。
 */
export const TS_NANHUANG_STEP_SCENE_STAGE_IDS = [
  'lcq.stage_03b',
  'lcq.stage_04',
] as const;
