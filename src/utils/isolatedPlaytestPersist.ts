import type { CharacterProfile, LocalStorageRoot, SaveData, SaveSlot } from '@/types/game';
import {
  XINGYUEHU_LANDING_PLAYTEST_KIND,
  XINGYUEHU_LANDING_PLAYTEST_SLOT,
} from '@/modules/scenarioMods/xingyuehuLandingPlaytest';

export function isIsolatedLocalOnlyProfile(profile: CharacterProfile | null | undefined): boolean {
  return profile?.隔离试玩信息?.localOnly === true;
}

export function isLandingPlaytestIsolatedProfile(profile: CharacterProfile | null | undefined): boolean {
  return isIsolatedLocalOnlyProfile(profile)
    && profile?.隔离试玩信息?.kind === XINGYUEHU_LANDING_PLAYTEST_KIND;
}

export function landingPlaytestWorkingSlot(): string {
  return XINGYUEHU_LANDING_PLAYTEST_SLOT;
}

/** 落地试玩读到的若不是固定连续槽，工作副本必须接回连续槽，检查点本身不自动覆盖。 */
export function shouldReattachLandingPlaytestWorkingCopy(
  profile: CharacterProfile | null | undefined,
  slotKey: string,
): boolean {
  return isLandingPlaytestIsolatedProfile(profile)
    && Boolean(slotKey)
    && slotKey !== XINGYUEHU_LANDING_PLAYTEST_SLOT;
}

export function stampSlotSaveTimes(slot: SaveSlot, now: string): SaveSlot {
  slot.保存时间 = now;
  slot.最后保存时间 = now;
  return slot;
}

export function applyLoadedSaveToWorkingSlotMeta(slot: SaveSlot, saveData: SaveData, now: string): void {
  const playerAttributes = (saveData as { 角色?: { 属性?: { 境界?: { 名称?: string } }; 身份?: { 名字?: string }; 位置?: { 描述?: string } } }).角色;
  stampSlotSaveTimes(slot, now);
  if (!slot.存档名) slot.存档名 = XINGYUEHU_LANDING_PLAYTEST_SLOT;
  slot.角色名字 = playerAttributes?.身份?.名字 || slot.角色名字;
  slot.境界 = playerAttributes?.属性?.境界?.名称 || slot.境界 || '凡人';
  slot.位置 = playerAttributes?.位置?.描述 || slot.位置 || '未知';
  const time = (saveData as { 元数据?: { 时间?: { 年?: number; 月?: number; 日?: number } } }).元数据?.时间;
  if (time) slot.游戏内时间 = `${time.年}年${time.月}月${time.日}日`;
}

export function shouldSkipRemoteRootPersist(input: {
  root: LocalStorageRoot;
  localOnly?: boolean;
  mutatedProfileIds?: string[];
}): boolean {
  if (input.localOnly) return true;
  const profiles = input.root.角色列表 || {};
  const activeId = input.root.当前激活存档?.角色ID;
  if (activeId && isIsolatedLocalOnlyProfile(profiles[activeId])) return true;
  const mutated = (input.mutatedProfileIds || []).filter(Boolean);
  if (mutated.length > 0) {
    return mutated.every(id => isIsolatedLocalOnlyProfile(profiles[id]));
  }
  return false;
}
