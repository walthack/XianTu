import type { CharacterProfile, SaveData, SaveSlot } from '@/types/game';

export const LEGACY_ONLINE_MIGRATION_VERSION = 1 as const;

export type LegacyOnlineSlotKey = '云端修行' | '存档';

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * 迁移副本只继承玩法数据，不继承旧联机会话。
 * 来源存档保持只读；仅把即将写入新单机角色的深拷贝归一为单机运行态。
 */
export function normalizeLegacyOnlineSaveForSingle(saveData: SaveData): SaveData {
  const normalized = cloneJson(saveData) as SaveData & {
    系统?: Record<string, unknown> & { 联机?: Record<string, unknown> };
  };
  if (!normalized.系统 || typeof normalized.系统 !== 'object') {
    throw new Error('迁移后的 V3 存档缺少系统数据');
  }
  normalized.系统.联机 = {
    模式: '单机',
    房间ID: null,
    玩家ID: null,
    只读路径: ['世界'],
    世界曝光: false,
    冲突策略: '服务器',
  };
  return normalized;
}

export function findLegacyOnlineMigrationTarget(
  profiles: Record<string, CharacterProfile>,
  sourceCharacterId: string,
): string | null {
  for (const [characterId, profile] of Object.entries(profiles)) {
    if (
      profile.模式 === '单机' &&
      profile.本地迁移信息?.版本 === LEGACY_ONLINE_MIGRATION_VERSION &&
      profile.本地迁移信息.来源模式 === '联机' &&
      profile.本地迁移信息.来源角色ID === sourceCharacterId
    ) {
      return characterId;
    }
  }
  return null;
}

export function chooseLegacyOnlineMigrationTargetId(
  profiles: Record<string, CharacterProfile>,
  sourceCharacterId: string,
): string {
  const base = `${sourceCharacterId}__single`;
  if (!profiles[base]) return base;

  let suffix = 2;
  while (profiles[`${base}_${suffix}`]) suffix += 1;
  return `${base}_${suffix}`;
}

export function buildLegacyOnlineMigrationProfile(input: {
  sourceCharacterId: string;
  sourceProfile: CharacterProfile;
  sourceSlotKey: LegacyOnlineSlotKey;
  sourceSlot?: SaveSlot | null;
  saveData: SaveData;
  migratedAt: string;
}): CharacterProfile {
  const { sourceCharacterId, sourceProfile, sourceSlotKey, sourceSlot, saveData, migratedAt } = input;
  const sourceSlotMetadata = { ...(sourceSlot ?? ({ 存档名: sourceSlotKey } as SaveSlot)) };
  delete sourceSlotMetadata.云端同步信息;
  const sourceProfileMetadata = { ...sourceProfile };
  delete sourceProfileMetadata.存档;
  delete sourceProfileMetadata.本地迁移信息;

  return {
    ...sourceProfileMetadata,
    模式: '单机',
    角色: cloneJson(sourceProfile.角色),
    本地迁移信息: {
      版本: LEGACY_ONLINE_MIGRATION_VERSION,
      来源模式: '联机',
      来源角色ID: sourceCharacterId,
      来源存档槽位: sourceSlotKey,
      迁移时间: migratedAt,
    },
    存档列表: {
      存档1: {
        ...sourceSlotMetadata,
        id: '存档1',
        存档名: '存档1',
        保存时间: sourceSlot?.保存时间 ?? migratedAt,
        存档数据: cloneJson(saveData),
      },
      上次对话: {
        id: '上次对话',
        存档名: '上次对话',
        保存时间: null,
        存档数据: null,
      },
      时间点存档: {
        id: '时间点存档',
        存档名: '时间点存档',
        保存时间: null,
        存档数据: null,
      },
    },
  };
}

export async function migrateLegacyOnlineCacheToSingle(input: {
  profiles: Record<string, CharacterProfile>;
  sourceCharacterId: string;
  loadLocalSave: (characterId: string, slotId: string) => Promise<SaveData | null>;
  normalizeSave: (saveData: SaveData) => SaveData;
  saveTarget: (characterId: string, slotId: '存档1', saveData: SaveData) => Promise<void>;
  commitProfiles: () => Promise<void>;
  now?: () => string;
}): Promise<{ targetCharacterId: string; created: boolean }> {
  const {
    profiles,
    sourceCharacterId,
    loadLocalSave,
    normalizeSave,
    saveTarget,
    commitProfiles,
    now = () => new Date().toISOString(),
  } = input;
  const sourceProfile = profiles[sourceCharacterId];
  if (!sourceProfile || sourceProfile.模式 !== '联机') {
    throw new Error('只支持迁移旧联机角色');
  }

  const existingTargetId = findLegacyOnlineMigrationTarget(profiles, sourceCharacterId);
  const existingTarget = existingTargetId ? profiles[existingTargetId] : null;
  if (existingTargetId && existingTarget) {
    const existingLocalSave = await loadLocalSave(existingTargetId, '存档1');
    if (existingLocalSave) return { targetCharacterId: existingTargetId, created: false };
  }

  const sourceSlotKey: LegacyOnlineSlotKey = sourceProfile.存档列表?.['云端修行']
    ? '云端修行'
    : '存档';
  const sourceSlot = sourceProfile.存档列表?.[sourceSlotKey] ?? sourceProfile.存档 ?? null;
  const cachedSave = await loadLocalSave(sourceCharacterId, sourceSlotKey);
  if (!cachedSave) {
    throw new Error('本机未找到该联机角色的缓存；为避免联网补拉，本次未创建单机副本');
  }

  const migratedSave = normalizeSave(cachedSave);
  const targetCharacterId = existingTargetId
    ?? chooseLegacyOnlineMigrationTargetId(profiles, sourceCharacterId);
  const migratedAt = existingTarget?.本地迁移信息?.迁移时间 ?? now();
  const builtProfile = buildLegacyOnlineMigrationProfile({
    sourceCharacterId,
    sourceProfile,
    sourceSlotKey,
    sourceSlot,
    saveData: migratedSave,
    migratedAt,
  });
  const targetProfile: CharacterProfile = existingTarget
    ? {
        ...existingTarget,
        本地迁移信息: builtProfile.本地迁移信息,
        存档列表: {
          ...builtProfile.存档列表,
          ...existingTarget.存档列表,
          存档1: builtProfile.存档列表.存档1,
        },
      }
    : builtProfile;

  await saveTarget(targetCharacterId, '存档1', migratedSave);
  const previousTarget = profiles[targetCharacterId];
  profiles[targetCharacterId] = targetProfile;
  try {
    await commitProfiles();
  } catch (error) {
    if (previousTarget) profiles[targetCharacterId] = previousTarget;
    else delete profiles[targetCharacterId];
    throw error;
  }

  return { targetCharacterId, created: !existingTarget };
}
