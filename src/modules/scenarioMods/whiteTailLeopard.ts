/**
 * 白尾豹彩蛋（用户 2026-11-01 00:28 定，稿 narrative-drafts/2026-11-01-白尾豹彩蛋.md）。
 *
 * 南荒密林里小概率遇见白尾豹：它不攻击；玩家回复体力（＝角色.属性.气血），挂增益「山神庇佑」，持续若干回合后摘除。
 * 2026-11-02 起是通用稀有遇见（rareEncounters.ts，配置 encounter.rareEncounters）里的一条：nanhuang.white_tail_leopard。
 * 本文件只留旧接口：leopardConfig() 把那一条投影成旧形状；tickWhiteTailLeopard／expireWhiteTailLeopard 只跑这一条；
 * 旧参数 leopardChance（函数参数、URL、南荒测试开关）照旧映射到这一条。存档字段沿用 剧本模组.whiteTailLeopard。
 */
import type { SaveData } from '@/types/game';
import type { EncounterChanceOverride } from './randomEncounter';
import {
  expireRareEncounter, rareBuffSource, rareCompanionLine, rareEncountersConfig, tickRareEncounter,
  type RareEncounterEntry, type RareEncounterState,
} from './rareEncounters';

export interface LeopardConfig {
  note?: string; enabled: boolean; hostile: false;
  locations: Array<{ key: string; subPlace?: string }>;
  chance: number; staminaRestoreRatio: number;
  buff: { statusId: string; name: string; durationTurns: number };
  textKey: string;
  companionLines: Array<{ characterId: string; textKey: string }>;
}
export type LeopardState = RareEncounterState;

const leopardEntry = (): RareEncounterEntry => {
  const cfg = rareEncountersConfig();
  const entry = cfg.entries.find(e => e.id === cfg.legacyLeopardEntryId);
  if (!entry) throw new Error(`稀有遇见缺白尾豹条目：${cfg.legacyLeopardEntryId}`);
  return entry;
};
export const BUFF_SOURCE = rareBuffSource(leopardEntry());

/** 旧形状投影（测试与旧调用方用）。 */
export const leopardConfig = (): LeopardConfig => {
  const e = leopardEntry();
  return {
    note: rareEncountersConfig().note, enabled: e.enabled, hostile: e.hostile, locations: e.locations, chance: e.chance,
    staminaRestoreRatio: e.effect.staminaRestoreRatio,
    buff: { ...e.effect.buff, durationTurns: e.durationTurns },
    textKey: e.textKey, companionLines: e.companionLines,
  };
};
/** 旧形状 → 白尾豹条目（覆盖调用方给的字段，状态字段、来源标记沿用条目）。 */
const asEntry = (cfg: LeopardConfig): RareEncounterEntry => ({
  ...leopardEntry(), enabled: cfg.enabled, hostile: cfg.hostile, locations: cfg.locations, chance: cfg.chance,
  durationTurns: cfg.buff.durationTurns,
  effect: { staminaRestoreRatio: cfg.staminaRestoreRatio, buff: { statusId: cfg.buff.statusId, name: cfg.buff.name } },
  textKey: cfg.textKey, companionLines: cfg.companionLines,
});

export function leopardCompanionLine(save: SaveData, cfg: LeopardConfig = leopardConfig()): { characterId: string; text: string } | undefined {
  return rareCompanionLine(save, asEntry(cfg));
}
export function expireWhiteTailLeopard(save: SaveData, cfg: LeopardConfig = leopardConfig()): boolean {
  return expireRareEncounter(save, asEntry(cfg));
}
/** 只检定白尾豹这一条（故事回合收尾统一走 tickRareEncounters）。 */
export function tickWhiteTailLeopard(save: SaveData, cfg: LeopardConfig = leopardConfig(), override?: EncounterChanceOverride): { changed: boolean; text: string } {
  return tickRareEncounter(save, asEntry(cfg), override);
}
