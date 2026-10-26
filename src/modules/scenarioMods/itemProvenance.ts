/**
 * 道具来路去重（身份账补充设计稿 2026-10-26 §2）：唯一道具组里任一件得过，就不再发同组物品。
 * - 不加存档字段：「得过」以 runtime.inventoryTransferReceipts（已跨关继承）为准，口径读 story.itemProvenance.dedupeBy；
 *   分组只读规则表 itemGroups（mod-kit/player-ledger-rules.json），首版为空，空时恒为 grant，发放行为不变。
 * - 写入侧只有 inventoryTransactions.ts 的 settleScenarioInventoryTransfers 调用；被跳过的发放不产生 settlement，模型拿不到授权。
 * - 判断出错按原逻辑发放、不拦截，记 LCQ-SAV-025。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { playerLedgerRules, type ItemGroupRule } from './playerLedgerRules';
import { logError } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

export type ItemGrantVerdict =
  | { action: 'grant' }
  | { action: 'skip'; groupId: string; firstFrom: string }
  | { action: 'redirect'; groupId: string; itemId: string };

/** 只有背包现存、没有回执时 firstFrom 的取值（旧档回执缺口，T6 回填后即有回执）。 */
export const HELD_WITHOUT_RECEIPT = 'inventory';

/** 改发回执的 transferId；同一笔改发重试时据此幂等。 */
export const redirectTransferId = (transferId: string): string => `${transferId}:redirect`;

interface ProvenanceRuntime {
  canon?: { items?: Array<{ id: string }> };
  inventoryTransferReceipts?: Array<{ itemId: string; sourceEventId: string; settledAtTurn?: number }>;
}

export const itemDedupeBy = (): string => GAME_NUMBERS.story.itemProvenance.dedupeBy;

/** itemId 所属道具组；规则表缺键按 [] 处理。 */
export function itemGroupOf(itemId: string, groups: ItemGroupRule[] = playerLedgerRules().itemGroups ?? []): ItemGroupRule | undefined {
  return groups.find(group => group.itemIds.includes(itemId));
}

function heldQuantity(saveData: SaveData, itemId: string): number {
  const items = (saveData as unknown as { 角色?: { 背包?: { 物品?: Record<string, { 数量?: unknown } | undefined> } } })?.角色?.背包?.物品;
  const quantity = Number(items?.[itemId]?.数量);
  return Number.isFinite(quantity) ? quantity : 0;
}

/** 纯判断：本组是否已得过（everObtained＝回执或背包现存；currentlyHeld＝只看背包现存）。规则表为空时恒为 grant。transferId 只用于日志。 */
export function itemGrantVerdict(saveData: SaveData, runtime: ProvenanceRuntime, itemId: string, transferId?: string): ItemGrantVerdict {
  try {
    const group = itemGroupOf(itemId);
    if (!group) return { action: 'grant' };
    const members = new Set(group.itemIds);
    const receipt = itemDedupeBy() === 'everObtained'
      ? (runtime.inventoryTransferReceipts || []).find(r => members.has(r.itemId))
      : undefined;
    const held = !receipt && group.itemIds.some(id => heldQuantity(saveData, id) > 0);
    if (!receipt && !held) return { action: 'grant' };
    const firstFrom = receipt?.sourceEventId ?? HELD_WITHOUT_RECEIPT;
    if (group.whenHeld === 'redirect' && group.redirectItemId) {
      if ((runtime.canon?.items || []).some(item => item.id === group.redirectItemId)) {
        debugLog('identity', `[道具来路] 改发 group=${group.id} item=${itemId} → ${group.redirectItemId} firstFrom=${firstFrom} transfer=${transferId}`);
        return { action: 'redirect', groupId: group.id, itemId: group.redirectItemId };
      }
      logError('LCQ-SAV-025', `道具组 ${group.id} 改发物品 ${group.redirectItemId} 不在本关物品表，本次只跳过不改发（原物品 ${itemId}）`, {
        detail: { reason: 'redirect_missing', groupId: group.id, itemId, redirectItemId: group.redirectItemId, firstFrom, transferId },
      });
    }
    debugLog('identity', `[道具来路] 跳过重复发放 group=${group.id} item=${itemId} firstFrom=${firstFrom} transfer=${transferId}`);
    return { action: 'skip', groupId: group.id, firstFrom };
  } catch (error) {
    logError('LCQ-SAV-025', error, { detail: { reason: 'check_failed', itemId, transferId } });
    return { action: 'grant' };
  }
}
