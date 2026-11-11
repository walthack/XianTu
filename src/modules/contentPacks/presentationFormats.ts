/**
 * 内容包展示类的新段（F0b，2026-11-11）：catalog 里的形状（作者 note 编译时已剥掉）。只放类型；
 * 合并函数在各读取模块里（endingPresentation／fixedEndingNarratives／travel/openWorldSlices／persistentLineEntries）。
 * stageMeta 事件新字段的类型在 ./stageMeta。编译期校验见 scripts/content-pack-presentation-formats.mjs。
 */
export type { PackOpenWorldSlice } from '../scenarioMods/travel/openWorldSlices';
export type { PersistentEntry as PackPersistentEntry } from '../scenarioMods/persistentLineEntries';

/** 战败结局：同 fixedEndingNarratives.ts 的 BATTLE_LOSS_ENDINGS 条目，endingId 取外层。 */
export interface PackBattleLossEnding {
  title: string; kind: 'death' | 'failure'; sourceEventId: string; tierFlag: string; tier: string; facts: string[];
}
/** 一个结局：key 是结局编号（E01…，endingPresentation.ts 的 endingKey），pathText 是按来路追加的分支句（ENDING_PATH_TEXTS）。 */
export interface PackEnding {
  endingId: string;
  key?: string;
  battleLoss?: PackBattleLossEnding;
  pathText?: { sourceEventId: string; textKey: string };
}
