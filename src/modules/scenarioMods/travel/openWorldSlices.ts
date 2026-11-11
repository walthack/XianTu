/**
 * 内容包行旅切片（manifest.openWorldSlices，F0b 2026-11-11）：catalog 里的形状与「包与 TS 二选一」的取用。
 * 纯模块：不 import catalog（编译器 buildCatalog 要在 catalog.json 不存在时也能加载它取逐拍演出关前缀，M2）。
 * 读取方传入 CONTENT_PACKS.openWorldSlices；编译期校验见 scripts/content-pack-presentation-formats.mjs。
 */
import type { JudgementKind } from '@/utils/judgementEngine';
import type { OpenWorldSliceDefinition } from '../openWorldSlice';
import { TS_NANHUANG_STEP_SCENE_STAGE_IDS } from './defs/qingyuNanhuangStepScenes';

/**
 * 一个切片：definition 即原 OpenWorldSliceDefinition；key 是 TS 导出取用它的绑定名（不是剧情 id）。
 * 其余是原来散在定义文件里、和定义一起搬的数据：行旅账管理的关、逐拍演出关前缀、位置串区内节点表、
 * 逻辑代码按名取的 id（constants）、节点深浅（zoneRanks）、问题动作的判定类别与动作描述。
 */
export interface PackOpenWorldSlice {
  key: string;
  definition: OpenWorldSliceDefinition;
  stageIds?: string[];
  stepSceneStagePrefixes?: string[];
  positionNodes?: { segment: string; placeLocationId: string; nodes?: Array<{ zoneId: string; names: string[] }> };
  constants?: Record<string, string>;
  zoneRanks?: Record<string, number>;
  actionJudgement?: Record<string, { kind: JudgementKind }>;
  actionDescribe?: Record<string, string>;
}

/** TS 侧的一份（可以只是切片的一部分：五原的节点表与其余定义分在两个文件）。只剩 key 即视为已搬空。 */
export type TsOpenWorldSlicePart = { key: string } & Partial<Omit<PackOpenWorldSlice, 'key' | 'definition'>> & { definition?: Partial<OpenWorldSliceDefinition> };

export function tsOpenWorldSliceHasData(part: TsOpenWorldSlicePart | undefined): boolean {
  return Boolean(part && Object.keys(part).some(k => k !== 'key'));
}

/**
 * 二选一：包里有同 key 的切片就用包的（此时 TS 那份必须已搬空，否则抛错；编译期已拦）；没有就用 TS 那份。
 * 两边都没有数据时抛错（不静默给空定义）。
 */
export function resolveOpenWorldSlice(packs: readonly PackOpenWorldSlice[], ts: TsOpenWorldSlicePart): PackOpenWorldSlice {
  const pack = packs.find(s => s.key === ts.key);
  const tsHasData = tsOpenWorldSliceHasData(ts);
  if (pack && tsHasData) throw Error(`行旅切片 ${ts.key} 同时在内容包与 TS 里定义；整份搬进包后 TS 只留 key`);
  if (pack) return pack;
  if (!tsHasData) throw Error(`缺少行旅切片 ${ts.key}`);
  return ts as PackOpenWorldSlice;
}

/** 逐拍演出关前缀的 TS 侧数据（纯数据）。 */
export const TS_STEP_SCENE_STAGE_PREFIXES: readonly string[] = [...TS_NANHUANG_STEP_SCENE_STAGE_IDS];

/** 全部逐拍演出关前缀：TS 在前，包按 catalog 顺序在后（编译期禁止同一前缀两边都有）。 */
export function stepSceneStagePrefixesIn(packs: readonly PackOpenWorldSlice[], tsPrefixes: readonly string[]): string[] {
  return [...tsPrefixes, ...packs.flatMap(s => s.stepSceneStagePrefixes || [])];
}

/** 关卡 id 以登记的逐拍演出关卡前缀开头即算。 */
export function isStepSceneStageIn(prefixes: readonly string[], id?: string): boolean {
  const s = id || '';
  return prefixes.some(prefix => s.startsWith(prefix));
}
