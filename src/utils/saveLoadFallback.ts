/**
 * 读档入口（带滚动备份回退）：主槽读出损坏/抛错就依次试 `__rot__<槽>_1..N`，用第一个可用的。
 * 回退成功记 LCQ-SAV-012 并提示玩家（同一会话同一槽只提示一次）；全部不可用记 LCQ-SAV-013（日志管线按码表弹提示）。
 * 备份只存本机，所以备份一律走本机读取，不回源远端。
 */
import type { SaveData } from '@/types/game';
import { logEvent } from '@/modules/diagnostics/log';
import { toast } from '@/utils/toast';
import * as storage from '@/utils/indexedDBManager';
import { checkSaveSchemaVersion, futureSaveMessage } from '@/utils/saveMigration';
import { readWithRotationFallback, rotationKeepFor, rotationSlotName } from '@/utils/saveRotation';

const notifiedSlots = new Set<string>();

/** 测试用：清掉“已提示过”的会话记录。 */
export const resetSaveFallbackNotices = (): void => notifiedSlots.clear();

export async function loadSaveWithFallback(
  characterId: string,
  slotId: string,
  options: { localOnly?: boolean } = {},
): Promise<SaveData | null> {
  const result = await readWithRotationFallback<SaveData>({
    keep: rotationKeepFor(slotId),
    readPrimary: () => storage.loadSaveDataStrict(characterId, slotId, options),
    readBackup: index => storage.loadLocalSaveData(characterId, rotationSlotName(slotId, index)),
  });
  switch (result.status) {
    case 'ok':
    case 'absent':
      return result.data;
    case 'fallback': {
      logEvent({ code: 'LCQ-SAV-012', detail: { characterId, slotId, backupIndex: result.backupIndex, problem: result.primaryProblem } });
      const noticeKey = `${characterId}/${slotId}`;
      if (!notifiedSlots.has(noticeKey)) {
        notifiedSlots.add(noticeKey);
        toast.warning(`存档【${slotId}】已损坏，已自动恢复到较早的备份（第 ${result.backupIndex} 份），最近的进度可能丢失（LCQ-SAV-012）`, { duration: 8000 });
      }
      return result.data;
    }
    case 'exhausted':
      logEvent({ code: 'LCQ-SAV-013', detail: { characterId, slotId, problem: result.primaryProblem } });
      return result.primary; // 沿用旧行为：读得出的原值照旧交给下游（如存档修复），读不出则为 null
  }
}

/**
 * 读档版本守卫：存档版本高于当前游戏时记 LCQ-SAV-014、给玩家可读提示，返回 true（调用方应中止加载，且不得迁移或写回该槽）。
 * 版本不高于当前、或存档为空，返回 false。
 */
export function rejectFutureSaveVersion(characterId: string, slotId: string, saveData: SaveData | null | undefined): boolean {
  if (!saveData) return false;
  const check = checkSaveSchemaVersion(saveData);
  if (check.supported) return false;
  logEvent({ code: 'LCQ-SAV-014', detail: { characterId, slotId, saveVersion: check.saveVersion, currentVersion: check.currentVersion } });
  toast.error(futureSaveMessage(slotId, check), { duration: 10000 });
  return true;
}
