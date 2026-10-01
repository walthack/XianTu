import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('landing checkpoint load reattaches to the continuous slot and leaves the checkpoint untouched', async () => {
  const persist = await loadTs('../src/utils/isolatedPlaytestPersist.ts');
  const landing = await loadTs('../src/modules/scenarioMods/xingyuehuLandingPlaytest.ts');
  const profile = {
    模式: '单机',
    隔离试玩信息: { kind: landing.XINGYUEHU_LANDING_PLAYTEST_KIND, localOnly: true },
    存档列表: {},
  };
  assert.equal(persist.shouldReattachLandingPlaytestWorkingCopy(profile, 'R3-检查点A'), true);
  assert.equal(persist.shouldReattachLandingPlaytestWorkingCopy(profile, landing.XINGYUEHU_LANDING_PLAYTEST_SLOT), false);
  assert.equal(persist.shouldReattachLandingPlaytestWorkingCopy({
    隔离试玩信息: { kind: 'qingyu-demo-v1', localOnly: true },
  }, '手动档'), false);
  assert.equal(persist.shouldReattachLandingPlaytestWorkingCopy({
    模式: '单机',
  }, '手动档'), false);
});

test('isolated active persist skips remote root writes; official persist does not', async () => {
  const persist = await loadTs('../src/utils/isolatedPlaytestPersist.ts');
  const isolatedRoot = {
    当前激活存档: { 角色ID: 'char_playtest', 存档槽位: '连续档' },
    角色列表: {
      char_playtest: { 隔离试玩信息: { kind: 'xingyuehu-landing-through-v1', localOnly: true } },
      char_official: { 模式: '单机' },
    },
  };
  assert.equal(persist.shouldSkipRemoteRootPersist({ root: isolatedRoot }), true);
  assert.equal(persist.shouldSkipRemoteRootPersist({
    root: {
      当前激活存档: { 角色ID: 'char_official', 存档槽位: '存档1' },
      角色列表: isolatedRoot.角色列表,
    },
  }), false);
  assert.equal(persist.shouldSkipRemoteRootPersist({
    root: { 当前激活存档: null, 角色列表: isolatedRoot.角色列表 },
    localOnly: true,
  }), true);
  assert.equal(persist.shouldSkipRemoteRootPersist({
    root: { 当前激活存档: null, 角色列表: isolatedRoot.角色列表 },
    mutatedProfileIds: ['char_playtest'],
  }), true);
  assert.equal(persist.shouldSkipRemoteRootPersist({
    root: { 当前激活存档: null, 角色列表: isolatedRoot.角色列表 },
    mutatedProfileIds: ['char_official'],
  }), false);
});

test('save-chain timestamps stamp both display fields', async () => {
  const persist = await loadTs('../src/utils/isolatedPlaytestPersist.ts');
  const slot = persist.stampSlotSaveTimes({}, '2026-09-29T00:00:00.000Z');
  assert.equal(slot.保存时间, '2026-09-29T00:00:00.000Z');
  assert.equal(slot.最后保存时间, '2026-09-29T00:00:00.000Z');
});

test('localOnly metadata writes never call remote save-storage', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/utils/indexedDBManager.ts', import.meta.url), 'utf8'));
  assert.match(source, /if \(options\.localOnly\) \{/);
  assert.match(source, /saveCharacters\(root\.角色列表, \{ localOnly: true \}\)/);
  assert.match(source, /saveActiveSave\(root\.当前激活存档, \{ localOnly: true \}\)/);
  assert.match(source, /const remoteSaved = options\.localOnly\s*\? false/);
});

test('initializeStore persists isolated-only slot repairs through commitMetadataToStorage', async () => {
  const store = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8'));
  assert.match(store, /mutatedProfileIds/);
  assert.match(store, /commitMetadataToStorage\(\{ mutatedProfileIds \}\)/);
  assert.match(store, /if \(initializePromise\) return initializePromise/);
});
