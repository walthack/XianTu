/**
 * 读档入口（带滚动备份回退）：主槽读出损坏/抛错就依次试 `__rot__<槽>_1..N`，用第一个可用的。
 * 回退成功记 LCQ-SAV-012 并提示玩家（同一会话同一槽只提示一次）；全部不可用记 LCQ-SAV-013（日志管线按码表弹提示）。
 * 备份只存本机，所以备份一律走本机读取，不回源远端。
 */
import type { SaveData } from '@/types/game';
import { logEvent } from '@/modules/diagnostics/log';
import { toast } from '@/utils/toast';
import * as storage from '@/utils/indexedDBManager';
import { checkSaveSchemaVersion, detectLegacySaveData, futureSaveMessage, migrateSaveDataToLatest } from '@/utils/saveMigration';
import { isUsableSave, readWithRotationFallback, rotationKeepFor, rotationSlotName } from '@/utils/saveRotation';
import { validateSaveDataV3 } from '@/utils/saveValidationV3';

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

/**
 * 读档前校验（迁移之后）。宽松：只有 validateSaveDataV3 的 criticalErrors（结构不是 V3）算致命；
 * errors / warnings 一律是非致命（旧档缺字段很常见），只用于记日志。
 * 不沿用 validateGameData：它把任何非致命错误都当拒绝，还忽略 criticalErrors，且会校验档案的姓名/性别。
 */
export function checkLoadedSave(saveData: SaveData): { fatal: string[]; minor: string[] } {
  try {
    const result = validateSaveDataV3(saveData);
    return { fatal: result.criticalErrors, minor: [...result.errors, ...result.warnings] };
  } catch (error) {
    // lcq-allow: 校验器自身抛错按致命处理，原因并入返回值，由 validateLoadedSave 连同 LCQ-SAV-016/017 一并记录
    return { fatal: [`校验器抛错：${error instanceof Error ? error.message : String(error)}`], minor: [] };
  }
}

/** 滚动备份作为回退候选：须先过读档同款可用性判断；旧结构的备份在内存里迁移到最新版（不写回）；迁移后仍须通过致命校验。 */
function prepareBackupCandidate(raw: unknown): SaveData | null {
  if (!isUsableSave(raw) || !checkSaveSchemaVersion(raw as SaveData).supported) return null;
  try {
    const candidate = detectLegacySaveData(raw as SaveData).needsMigration ? (migrateSaveDataToLatest(raw as SaveData).migrated as SaveData) : (raw as SaveData);
    return checkLoadedSave(candidate).fatal.length === 0 ? candidate : null;
  } catch {
    return null; // lcq-allow: 单份备份迁移或校验抛错就试下一份；全部不可用由 LCQ-SAV-017 统一报
  }
}

export type LoadValidationOutcome =
  | { status: 'ok'; data: SaveData }
  | { status: 'recovered'; data: SaveData; backupIndex: number }
  | { status: 'rejected' };

/**
 * 读档校验入口（调用方：loadGame，迁移之后）。
 * 无致命错误 → ok（有非致命问题记 LCQ-SAV-015，不拒绝、不弹窗）；
 * 致命 → 依次试滚动备份 _1.._N，取第一份可用的 → recovered（记 LCQ-SAV-016，同会话同槽提示一次）；
 * 没有可用备份 → rejected（记 LCQ-SAV-017，给玩家可读错误；原槽不动，调用方应中止加载）。
 */
export async function validateLoadedSave(
  characterId: string,
  slotId: string,
  saveData: SaveData,
  options: { keep?: number; readBackup?: (index: number) => Promise<unknown> } = {},
): Promise<LoadValidationOutcome> {
  const first = checkLoadedSave(saveData);
  let data = saveData, minor = first.minor, backupIndex = 0;
  if (first.fatal.length > 0) {
    const keep = options.keep ?? rotationKeepFor(slotId);
    const readBackup = options.readBackup ?? (index => storage.loadLocalSaveData(characterId, rotationSlotName(slotId, index)));
    let recovered: SaveData | null = null;
    for (let i = 1; i <= keep && !recovered; i++) {
      try {
        recovered = prepareBackupCandidate(await readBackup(i));
        if (recovered) backupIndex = i;
      } catch {
        // lcq-allow: 单份备份读不出就试下一份；全部不可用由 LCQ-SAV-017 统一报
      }
    }
    if (!recovered) {
      logEvent({ code: 'LCQ-SAV-017', detail: { characterId, slotId, problems: first.fatal } });
      toast.error(`存档【${slotId}】结构损坏，且没有可用的备份，已停止读取以免进一步损坏。请不要覆盖该存档，可尝试导入你手动导出的存档文件（LCQ-SAV-017）`, { duration: 10000 });
      return { status: 'rejected' };
    }
    logEvent({ code: 'LCQ-SAV-016', detail: { characterId, slotId, backupIndex, problems: first.fatal } });
    const noticeKey = `validate:${characterId}/${slotId}`;
    if (!notifiedSlots.has(noticeKey)) {
      notifiedSlots.add(noticeKey);
      toast.warning(`存档【${slotId}】结构不完整，已自动恢复到较早的备份（第 ${backupIndex} 份），最近的进度可能丢失（LCQ-SAV-016）`, { duration: 8000 });
    }
    data = recovered;
    minor = checkLoadedSave(recovered).minor;
  }
  if (minor.length > 0) logEvent({ code: 'LCQ-SAV-015', detail: { characterId, slotId, count: minor.length, problems: minor } });
  return backupIndex > 0 ? { status: 'recovered', data, backupIndex } : { status: 'ok', data };
}
