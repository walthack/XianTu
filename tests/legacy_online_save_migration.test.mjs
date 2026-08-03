import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migrationModule = loadTs('../src/utils/legacyOnlineSaveMigration.ts');

const sourceProfile = () => ({
  模式: '联机',
  角色: { 名字: '旧角色', 世界: { name: '六朝' } },
  存档列表: {
    云端修行: {
      id: '云端修行',
      存档名: '云端修行',
      保存时间: '2026-08-01T00:00:00.000Z',
      云端同步信息: { 最后同步: '旧值', 版本: 9, 需要同步: true },
    },
  },
});

test('migration target lookup and allocation are idempotent and collision-safe', async () => {
  const {
    chooseLegacyOnlineMigrationTargetId,
    findLegacyOnlineMigrationTarget,
  } = await migrationModule;
  const source = sourceProfile();
  const profiles = {
    legacy: source,
    legacy__single: { ...source, 模式: '单机' },
    migrated: {
      ...source,
      模式: '单机',
      本地迁移信息: {
        版本: 1,
        来源模式: '联机',
        来源角色ID: 'legacy',
        来源存档槽位: '云端修行',
        迁移时间: '2026-08-03T00:00:00.000Z',
      },
    },
  };

  assert.equal(findLegacyOnlineMigrationTarget(profiles, 'legacy'), 'migrated');
  assert.equal(chooseLegacyOnlineMigrationTargetId(profiles, 'legacy'), 'legacy__single_2');
});

test('migration profile creates a playable single slot without mutating or copying cloud metadata', async () => {
  const { buildLegacyOnlineMigrationProfile } = await migrationModule;
  const source = sourceProfile();
  const sourceBefore = structuredClone(source);
  const saveData = { 元数据: { 版本: '3.0.0' }, 角色: { 身份: { 名字: '旧角色' } } };
  const migrated = buildLegacyOnlineMigrationProfile({
    sourceCharacterId: 'legacy',
    sourceProfile: source,
    sourceSlotKey: '云端修行',
    sourceSlot: source.存档列表.云端修行,
    saveData,
    migratedAt: '2026-08-03T00:00:00.000Z',
  });

  assert.deepEqual(source, sourceBefore);
  assert.equal(migrated.模式, '单机');
  assert.equal(migrated.本地迁移信息.来源角色ID, 'legacy');
  assert.equal(migrated.存档列表.存档1.存档名, '存档1');
  assert.equal(migrated.存档列表.存档1.id, '存档1');
  assert.equal('云端同步信息' in migrated.存档列表.存档1, false);
  assert.equal(migrated.存档列表.上次对话.存档数据, null);
  assert.equal(migrated.存档列表.时间点存档.存档数据, null);
  assert.notEqual(migrated.存档列表.存档1.存档数据, saveData);
});

test('migration strips legacy online runtime state only from the destination copy', async () => {
  const { normalizeLegacyOnlineSaveForSingle } = await migrationModule;
  const sourceSave = {
    元数据: { 版本号: 3 },
    系统: {
      联机: {
        模式: '联机',
        房间ID: 'room-legacy',
        玩家ID: 'player-legacy',
        穿越目标: { 世界ID: 99, 主人用户名: '旧世界主人' },
        服务器日志: [{ note: '旧日志' }],
        只读路径: ['世界', '角色'],
      },
    },
  };
  const sourceBefore = structuredClone(sourceSave);

  const normalized = normalizeLegacyOnlineSaveForSingle(sourceSave);

  assert.deepEqual(sourceSave, sourceBefore);
  assert.notEqual(normalized, sourceSave);
  assert.deepEqual(normalized.系统.联机, {
    模式: '单机',
    房间ID: null,
    玩家ID: null,
    只读路径: ['世界'],
    世界曝光: false,
    冲突策略: '服务器',
  });
  assert.equal('穿越目标' in normalized.系统.联机, false);
  assert.equal('服务器日志' in normalized.系统.联机, false);
});

test('migration orchestration writes save before metadata and preserves the source', async () => {
  const { migrateLegacyOnlineCacheToSingle } = await migrationModule;
  const source = sourceProfile();
  const sourceBefore = structuredClone(source);
  const profiles = { legacy: source };
  const order = [];
  const cached = { 元数据: { 版本: '3.0.0' }, 角色: { 身份: { 名字: '旧角色' } } };

  const result = await migrateLegacyOnlineCacheToSingle({
    profiles,
    sourceCharacterId: 'legacy',
    loadLocalSave: async (characterId, slotId) => {
      order.push(`load:${characterId}:${slotId}`);
      return structuredClone(cached);
    },
    normalizeSave: save => ({ ...save, normalized: true }),
    saveTarget: async (characterId, slotId, save) => {
      order.push(`save:${characterId}:${slotId}`);
      assert.equal(save.normalized, true);
    },
    commitProfiles: async () => {
      order.push('commit');
      assert.equal(profiles.legacy__single.模式, '单机');
    },
    now: () => '2026-08-03T00:00:00.000Z',
  });

  assert.deepEqual(result, { targetCharacterId: 'legacy__single', created: true });
  assert.deepEqual(order, [
    'load:legacy:云端修行',
    'save:legacy__single:存档1',
    'commit',
  ]);
  assert.deepEqual(source, sourceBefore);
});

test('repeat migration reuses a complete target without another write', async () => {
  const {
    buildLegacyOnlineMigrationProfile,
    migrateLegacyOnlineCacheToSingle,
  } = await migrationModule;
  const source = sourceProfile();
  const cached = { 元数据: { 版本: '3.0.0' }, 角色: { 身份: { 名字: '旧角色' } } };
  const profiles = {
    legacy: source,
    migrated: buildLegacyOnlineMigrationProfile({
      sourceCharacterId: 'legacy',
      sourceProfile: source,
      sourceSlotKey: '云端修行',
      sourceSlot: source.存档列表.云端修行,
      saveData: cached,
      migratedAt: '2026-08-03T00:00:00.000Z',
    }),
  };
  let writes = 0;

  const result = await migrateLegacyOnlineCacheToSingle({
    profiles,
    sourceCharacterId: 'legacy',
    loadLocalSave: async (characterId, slotId) => {
      assert.equal(`${characterId}:${slotId}`, 'migrated:存档1');
      return cached;
    },
    normalizeSave: save => save,
    saveTarget: async () => { writes += 1; },
    commitProfiles: async () => { writes += 1; },
  });

  assert.deepEqual(result, { targetCharacterId: 'migrated', created: false });
  assert.equal(writes, 0);
});

test('metadata failure rolls back the target profile and remains retryable', async () => {
  const { migrateLegacyOnlineCacheToSingle } = await migrationModule;
  const source = sourceProfile();
  const sourceBefore = structuredClone(source);
  const profiles = { legacy: source };
  let savedTarget = null;

  await assert.rejects(
    migrateLegacyOnlineCacheToSingle({
      profiles,
      sourceCharacterId: 'legacy',
      loadLocalSave: async () => ({ 元数据: { 版本: '3.0.0' }, 角色: {} }),
      normalizeSave: save => save,
      saveTarget: async characterId => { savedTarget = characterId; },
      commitProfiles: async () => { throw new Error('metadata failed'); },
    }),
    /metadata failed/,
  );

  assert.equal(savedTarget, 'legacy__single');
  assert.deepEqual(Object.keys(profiles), ['legacy']);
  assert.deepEqual(source, sourceBefore);
});

test('missing local cache never creates metadata or invokes destination persistence', async () => {
  const { migrateLegacyOnlineCacheToSingle } = await migrationModule;
  const profiles = { legacy: sourceProfile() };
  let writes = 0;

  await assert.rejects(
    migrateLegacyOnlineCacheToSingle({
      profiles,
      sourceCharacterId: 'legacy',
      loadLocalSave: async () => null,
      normalizeSave: save => save,
      saveTarget: async () => { writes += 1; },
      commitProfiles: async () => { writes += 1; },
    }),
    /为避免联网补拉/,
  );

  assert.equal(writes, 0);
  assert.deepEqual(Object.keys(profiles), ['legacy']);
});

test('migration source reads only local IndexedDB and UI requires explicit confirmation', () => {
  const storage = read('src/utils/indexedDBManager.ts');
  const localLoader = storage.slice(
    storage.indexOf('export async function loadLocalSaveData('),
    storage.indexOf('export async function loadSaveData('),
  );
  const store = read('src/stores/characterStore.ts');
  const migration = read('src/utils/legacyOnlineSaveMigration.ts');
  const management = read('src/components/character-creation/CharacterManagement.vue');
  const initializeStore = store.slice(
    store.indexOf('const initializeStore = async () =>'),
    store.indexOf('// --- 计算属性 (Getters) ---'),
  );

  assert.doesNotMatch(localLoader, /loadRemoteRecord|fetch\(/);
  assert.match(initializeStore, /if \(anyProfile\.模式 === '联机'\) \{[\s\S]*?return;/);
  assert.doesNotMatch(initializeStore, /asyncMigrations|savedata_\$\{charId\}_云端修行/);
  assert.match(store, /loadLocalSave:\s*storage\.loadLocalSaveData/);
  assert.match(store, /migrateLegacyOnlineCacheToSingle/);
  assert.match(migration, /const cachedSave = await loadLocalSave\(sourceCharacterId, sourceSlotKey\)/);
  assert.match(migration, /await saveTarget\(targetCharacterId, '存档1', migratedSave\)/);
  assert.match(management, /showConfirm\(\s*'复制为单机角色'/);
  assert.match(management, /原联机角色和旧存档键不会删除/);
});
