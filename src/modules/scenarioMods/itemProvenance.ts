/**
 * 道具来路去重（身份账补充设计稿 2026-10-26 §2）：唯一道具组里任一件得过，就不再发同组物品。
 * - 不加存档字段：「得过」以 runtime.inventoryTransferReceipts（已跨关继承）为准，口径读 story.itemProvenance.dedupeBy；
 *   分组只读规则表 itemGroups（mod-kit/player-ledger-rules.json），首版为空，空时恒为 grant，发放行为不变。
 * - 写入侧只有 inventoryTransactions.ts 的 settleScenarioInventoryTransfers 调用；被跳过的发放不产生 settlement，模型拿不到授权。
 * - 判断出错按原逻辑发放、不拦截，记 LCQ-SAV-025。
 * - 读取侧（item.<groupId 或 itemId>[.from]，ledgerConditions.ts）只看回执不看背包；旧档靠读档窄回填补齐（§2.3 / Q5）：
 *   背包现存的唯一道具组成员没有回执的，补 transferId=backfill:<itemId> 的回填回执。done.* 不推断回填。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { playerLedgerRules, type ItemGroupRule } from './playerLedgerRules';
import type { ScenarioInventoryTransferReceipt } from './inventoryTransactions';
import { STAGE_ORDER } from './mainQuestAxis';
import { logError, logEventOnce } from '../diagnostics/log';
import { debugLog } from '../diagnostics/debugLog';

export type ItemGrantVerdict =
  | { action: 'grant' }
  | { action: 'skip'; groupId: string; firstFrom: string }
  | { action: 'redirect'; groupId: string; itemId: string };

/** 只有背包现存、没有回执时 firstFrom 的取值（旧档回执缺口，T6 回填后即有回执）。 */
export const HELD_WITHOUT_RECEIPT = 'inventory';

/** 改发回执的 transferId；同一笔改发重试时据此幂等。 */
export const redirectTransferId = (transferId: string): string => `${transferId}:redirect`;

/** 回填回执的 sourceEventId / actionId（§2.1）；item.<g>.from 读到它即「旧档背包里就有，来路不明」。 */
export const BACKFILL_SOURCE = 'backfill';
/** 回填回执的 transferId；不与任何事件发放的 transferId 相撞（锦囊等按 transferId 判断的逻辑不受影响）。 */
export const backfillTransferId = (itemId: string): string => `${BACKFILL_SOURCE}:${itemId}`;

interface ProvenanceRuntime {
  modId?: string;
  worldTurn?: number;
  canon?: { items?: Array<{ id: string; name?: string }> };
  chronicle?: Array<{ type?: string }>;
  inventoryTransferReceipts?: ScenarioInventoryTransferReceipt[];
}

export const itemDedupeBy = (): string => GAME_NUMBERS.story.itemProvenance.dedupeBy;

/** itemId 所属道具组；规则表缺键按 [] 处理。 */
export function itemGroupOf(itemId: string, groups: ItemGroupRule[] = playerLedgerRules().itemGroups ?? []): ItemGroupRule | undefined {
  return groups.find(group => group.itemIds.includes(itemId));
}

const heldEntry = (saveData: SaveData, itemId: string): { 数量?: unknown; 名称?: unknown } | undefined =>
  (saveData as unknown as { 角色?: { 背包?: { 物品?: Record<string, { 数量?: unknown; 名称?: unknown } | undefined> } } })?.角色?.背包?.物品?.[itemId];

function heldQuantity(saveData: SaveData, itemId: string): number {
  const quantity = Number(heldEntry(saveData, itemId)?.数量);
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

/** item.<id> 读取的展开：道具组 id 展开成组内全部 itemId，其余按 itemId 原样（不并入所属组）。 */
function itemReadIds(id: string): string[] {
  try {
    return (playerLedgerRules().itemGroups ?? []).find(group => group.id === id)?.itemIds ?? [id];
  } catch (error) {
    // 读取很频繁（每拍条件求值），只记一次；本次按 itemId 原样读
    logEventOnce('LCQ-SAV-025:read', { code: 'LCQ-SAV-025', cause: error, detail: { reason: 'check_failed', phase: 'read', id } });
    return [id];
  }
}

/** item.<id> / item.<id>.from 的数据源（§2.4）：最早一条回执（数组按结算先后追加）。只看回执不看背包，旧档靠读档回填补齐。 */
export function firstItemReceipt(runtime: unknown, id: string): ScenarioInventoryTransferReceipt | undefined {
  const receipts = (runtime as ProvenanceRuntime | undefined)?.inventoryTransferReceipts;
  if (!Array.isArray(receipts) || !receipts.length) return undefined;
  const members = new Set(itemReadIds(id));
  return receipts.find(receipt => members.has(receipt?.itemId));
}

/**
 * 读档窄回填（§2.3 / Q5，幂等）：唯一道具组成员当前在背包里（数量>0）却没有任何回执的，补一条回填回执
 * （transferId=backfill:<itemId>，sourceEventId=actionId=backfill）。规则表为空时不动存档。
 * 不改 ScenarioInventoryTransferReceipt 类型；失败记 LCQ-SAV-025 backfill_failed，不抛、不写半截。返回补的条数。
 */
export function backfillItemReceipts(saveData: SaveData, runtime: ProvenanceRuntime | undefined): number {
  try {
    if (!runtime) return 0;
    const groups = playerLedgerRules().itemGroups ?? [];
    if (!groups.length) return 0;
    const receipts = runtime.inventoryTransferReceipts ?? [];
    if (!Array.isArray(receipts)) throw new Error('inventoryTransferReceipts 不是数组');
    const received = new Set(receipts.map(receipt => receipt?.itemId));
    const names = new Map((runtime.canon?.items || []).map(item => [item.id, item.name]));
    const turn = Math.max(0, Number(runtime.worldTurn) || 0);
    const added: ScenarioInventoryTransferReceipt[] = [];
    for (const itemId of groups.flatMap(group => group.itemIds)) {
      const quantity = heldQuantity(saveData, itemId);
      if (quantity <= 0 || received.has(itemId)) continue;
      const heldName = heldEntry(saveData, itemId)?.名称;
      added.push({
        transferId: backfillTransferId(itemId),
        itemId,
        itemName: names.get(itemId) || (typeof heldName === 'string' && heldName) || itemId,
        quantity,
        sourceEventId: BACKFILL_SOURCE,
        actionId: BACKFILL_SOURCE,
        outcome: 'success',
        settledAtTurn: turn,
      });
    }
    if (!added.length) return 0;
    runtime.inventoryTransferReceipts = [...receipts, ...added];
    debugLog('identity', `[道具来路] 读档回填 ${added.length} 条：${added.map(receipt => receipt.itemId).join('、')}`);
    return added.length;
  } catch (error) {
    logError('LCQ-SAV-025', error, { detail: { reason: 'backfill_failed', modId: runtime?.modId } });
    return 0;
  }
}

/**
 * Q5：done.* 不推断回填。读档时当前关不是首关（STAGE_ORDER 链首）、编年史里却没有任何事件条目，
 * 多半是编年史上线（2026-07-16）前的旧档：只打 identity 调试日志便于排查，不改存档。返回是否命中。
 */
export function noteChronicleGap(runtime: ProvenanceRuntime | undefined): boolean {
  const modId = runtime?.modId;
  if (!modId || modId === STAGE_ORDER[0]) return false;
  if (Array.isArray(runtime.chronicle) && runtime.chronicle.some(entry => entry?.type === 'event')) return false;
  debugLog('identity', `[道具来路] 旧档缺口：当前关=${modId} 非首关 ${STAGE_ORDER[0]}，编年史无事件条目；done.* 不推断回填，只回填唯一道具回执`);
  return true;
}
