/**
 * 存档滚动备份：覆盖写前把槽位旧值挪进 `__rot__<槽>_1`，原 _1→_2、_2→_3…，只留 saves.rotationKeep 份。
 * 本文件是纯逻辑（命名、挪动计划、可用性判断、读档回退选择），IndexedDB 读写在 indexedDBManager.ts / characterStore.ts。
 * 份数在 game-numbers.qingyu.json 的 saves 段，调用时再读（热改 tuning.json 才生效）。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS, registerNumbersValidator } from '@/modules/sceneModule/numbers';
import { detectLegacySaveData } from '@/utils/saveMigration';
import { isSaveDataV3Shape, validateSaveDataV3 } from '@/utils/saveValidationV3';

export const ROTATION_SLOT_PREFIX = '__rot__';
/** 迁移前备份槽（characterStore 的 SaveMigration 写入），同样不参与滚动、不进普通列表。 */
export const MIGRATION_BACKUP_SLOT_PREFIX = '__backup__';
const SAVEDATA_KEY_PREFIX = 'savedata_';
/** 体检上限：防止热改把份数改到撑爆站点存储。 */
const ROTATION_KEEP_MAX = 20;

type SavesConfig = { rotationKeep?: unknown; rotationExcludeSlots?: unknown };

export const rotationKeep = (): number => (GAME_NUMBERS as { saves: { rotationKeep: number } }).saves.rotationKeep;
/** 不做滚动备份的槽名（自动存档槽，如每回合覆盖的“上次对话”）。 */
export const rotationExcludeSlots = (): readonly string[] => (GAME_NUMBERS as { saves: { rotationExcludeSlots: string[] } }).saves.rotationExcludeSlots;
export const isRotationExcludedSlot = (slotId: string): boolean => rotationExcludeSlots().includes(slotId);
/** 该槽实际保留的滚动备份份数：排除槽为 0（读档回退也不会去翻它早年遗留的旧备份）。 */
export const rotationKeepFor = (slotId: string): number => (isRotationExcludedSlot(slotId) ? 0 : rotationKeep());

export function validateSavesConfig(cfg: SavesConfig | undefined = (GAME_NUMBERS as { saves?: SavesConfig }).saves): string[] {
  if (!cfg || typeof cfg !== 'object') return ['saves 段缺失'];
  const problems: string[] = [];
  const n = cfg.rotationKeep;
  if (!(Number.isInteger(n) && (n as number) >= 0 && (n as number) <= ROTATION_KEEP_MAX)) problems.push(`saves.rotationKeep 须为 0–${ROTATION_KEEP_MAX} 的整数（0 = 关闭滚动备份与读档回退）`);
  const excluded = cfg.rotationExcludeSlots;
  if (!Array.isArray(excluded) || excluded.some(slot => typeof slot !== 'string' || slot.length === 0)) problems.push('saves.rotationExcludeSlots 须为非空字符串组成的数组（槽名）');
  return problems;
}
registerNumbersValidator(() => validateSavesConfig());

/** 滚动备份槽与迁移备份槽：不再被滚动，也不属于玩家看得到的存档。 */
export const isInternalBackupSlot = (slotId: string): boolean =>
  slotId.startsWith(ROTATION_SLOT_PREFIX) || slotId.startsWith(MIGRATION_BACKUP_SLOT_PREFIX);

/** IndexedDB 键 `savedata_<角色>_<槽>` 是否属于内部备份槽（槽名以 `__` 开头，故键里必含 `___rot__` / `___backup__`）。 */
export const isInternalBackupKey = (key: string): boolean =>
  key.startsWith(SAVEDATA_KEY_PREFIX) && (key.includes(`_${ROTATION_SLOT_PREFIX}`) || key.includes(`_${MIGRATION_BACKUP_SLOT_PREFIX}`));

export const rotationSlotName = (slotId: string, n: number): string => `${ROTATION_SLOT_PREFIX}${slotId}_${n}`;

/** 判断 `slotId` 是否为 `ownerSlot` 的滚动备份槽（`__rot__<ownerSlot>_<数字>`；不会误认 x_1 的备份为 x 的）。 */
export const isRotationSlotOf = (slotId: string, ownerSlot: string): boolean =>
  slotId.startsWith(`${ROTATION_SLOT_PREFIX}${ownerSlot}_`) && /^\d+$/.test(slotId.slice(ROTATION_SLOT_PREFIX.length + ownerSlot.length + 1));

/** 一次滚动要做的挪动，按执行顺序（最老的先挪，避免覆盖），最后一步是当前槽旧值 → _1。keep=0、内部槽或排除槽返回空。 */
export function planRotation(slotId: string, keep: number = rotationKeep()): Array<{ from: string; to: string }> {
  if (isInternalBackupSlot(slotId) || isRotationExcludedSlot(slotId) || !(keep > 0)) return [];
  const moves: Array<{ from: string; to: string }> = [];
  for (let i = keep - 1; i >= 1; i--) moves.push({ from: rotationSlotName(slotId, i), to: rotationSlotName(slotId, i + 1) });
  moves.push({ from: slotId, to: rotationSlotName(slotId, 1) });
  return moves;
}

/**
 * 读出的存档是否可用：是对象；V3 形状须过 validateSaveDataV3 的致命校验；
 * 旧结构（还没迁移）只要认得出旧字段就算可用——迁移流程自会处理，不能在这里把它当损坏。
 */
export function isUsableSave(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  try {
    if (isSaveDataV3Shape(data as SaveData)) return validateSaveDataV3(data as SaveData).criticalErrors.length === 0;
    return detectLegacySaveData(data as SaveData).legacyKeysFound.length > 0;
  } catch {
    return false; // lcq-allow: 校验器自身抛错即视为不可用，交给回退链处理
  }
}

export type RotationReadResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'absent'; data: null }
  | { status: 'fallback'; data: T; backupIndex: number; primaryProblem: string }
  /** primary：主槽读出的原值（读不出为 null），全部备份不可用时调用方可原样沿用旧行为。 */
  | { status: 'exhausted'; data: null; primaryProblem: string; primary: T | null };

/**
 * 读档回退选择：主槽不存在(null) → absent，不当损坏；读出但不可用或读取抛错 → 依次试 _1.._keep，取第一个可用。
 * 备份读取抛错同样跳过。全部不可用 → exhausted。
 */
export async function readWithRotationFallback<T>(opts: {
  readPrimary: () => Promise<T | null | undefined>;
  readBackup: (index: number) => Promise<T | null | undefined>;
  keep?: number;
  isUsable?: (data: unknown) => boolean;
}): Promise<RotationReadResult<T>> {
  const isUsable = opts.isUsable ?? isUsableSave;
  let primaryProblem: string;
  let primaryRaw: T | null = null;
  try {
    const primary = await opts.readPrimary();
    if (primary === null || primary === undefined) return { status: 'absent', data: null };
    if (isUsable(primary)) return { status: 'ok', data: primary };
    primaryRaw = primary;
    primaryProblem = '存档内容损坏或结构不完整';
  } catch (error) {
    // lcq-allow: 异常原因并入 primaryProblem，由调用方连同 LCQ-SAV-012/013 一并记录
    primaryProblem = `读取抛错：${error instanceof Error ? error.message : String(error)}`;
  }
  const keep = opts.keep ?? rotationKeep();
  for (let i = 1; i <= keep; i++) {
    try {
      const backup = await opts.readBackup(i);
      if (backup !== null && backup !== undefined && isUsable(backup)) return { status: 'fallback', data: backup, backupIndex: i, primaryProblem };
    } catch {
      // lcq-allow: 单份备份读不出就试下一份；全部不可用由 exhausted 统一报 LCQ-SAV-013
    }
  }
  return { status: 'exhausted', data: null, primaryProblem, primary: primaryRaw };
}
