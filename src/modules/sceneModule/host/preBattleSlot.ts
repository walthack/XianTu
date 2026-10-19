import { GAME_NUMBERS } from '../numbers';

/** 存档槽操作（由角色商店提供）；拆出来便于测试。 */
export interface PreBattleSlotOps {
  activeSlot(): string | null | undefined;
  saveToSlot(name: string): Promise<void>;
  setActiveSlot(name: string): void;
}

/**
 * 开战前写战外档。开战后每拍都写回「当前激活槽」，所以当前激活槽不能是战前存档槽，
 * 否则战前档会被覆盖成战斗中的进度（2026-10-20 6ccb 真机：读战前存档后再开战，战前档落在战斗第 1 拍）。
 */
export async function writePreBattleSave(ops: PreBattleSlotOps): Promise<{ slot: string; movedTo?: string }> {
  const cfg = (GAME_NUMBERS.combat as any).preBattleSave || {};
  const slot = String(cfg.slotName);
  const working = String(cfg.workingSlotName);
  let movedTo: string | undefined;
  if (ops.activeSlot() === slot) {
    await ops.saveToSlot(working);
    ops.setActiveSlot(working);
    movedTo = working;
  }
  await ops.saveToSlot(slot);
  return { slot, movedTo };
}
