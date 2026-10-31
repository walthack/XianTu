// fix5939-1：读旧档 / 重开试玩后「回到上一轮」不得跨档回滚到上一局的「上次对话」备份。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

/** 取 `const name = async (` 起到下一个同级 `  const ` 声明之前的函数体 */
function fnBody(src, name) {
  const start = src.indexOf(`const ${name} = async (`);
  assert.ok(start > 0, `找不到 ${name}`);
  const next = src.indexOf('\n  const ', start + 10);
  return src.slice(start, next > 0 ? next : undefined);
}

test('shouldKeepLastConversationOnLoad：只有读入槽位即激活槽位、且来源章匹配才保留', async () => {
  const { shouldKeepLastConversationOnLoad: keep } = await loadTs('../src/utils/lastConversationGuard.ts');
  assert.equal(keep({ 保存时间: 'x', 回滚来源槽位: 'W' }, 'W', 'W'), true);
  assert.equal(keep({ 保存时间: 'x', 回滚来源槽位: 'W' }, 'X', 'W'), false); // 真机场景：读手动档被挂到工作槽
  assert.equal(keep({ 保存时间: 'x', 回滚来源槽位: 'A' }, 'B', 'B'), false);
  assert.equal(keep({ 保存时间: 'x' }, 'W', 'W'), false); // 旧备份没有来源章
  assert.equal(keep({ 保存时间: null, 回滚来源槽位: 'W' }, 'W', 'W'), false);
  assert.equal(keep(null, 'W', 'W'), false);
});

test('lastConversationMatchesActive：来源章与激活槽位一致才算属于本档', async () => {
  const { lastConversationMatchesActive: match } = await loadTs('../src/utils/lastConversationGuard.ts');
  assert.equal(match({ 保存时间: 'x', 回滚来源槽位: 'W' }, 'W'), true);
  assert.equal(match({ 保存时间: 'x', 回滚来源槽位: 'A' }, 'B'), false);
  assert.equal(match({ 保存时间: 'x' }, 'W'), false);
  assert.equal(match({ 保存时间: null, 回滚来源槽位: 'W' }, 'W'), false);
  assert.equal(match({ 保存时间: 'x', 回滚来源槽位: 'W' }, undefined), false);
});

test('clearedLastConversationSlot：保存时间/存档数据置 null，去掉来源章，保留存档名', async () => {
  const { clearedLastConversationSlot, LAST_CONVERSATION_SLOT } = await loadTs('../src/utils/lastConversationGuard.ts');
  const cleared = clearedLastConversationSlot({ 存档名: '上次对话', 保存时间: 'x', 存档数据: { a: 1 }, 回滚来源槽位: 'W', 角色名字: '林' });
  assert.equal(cleared.保存时间, null);
  assert.equal(cleared.存档数据, null);
  assert.ok(!('回滚来源槽位' in cleared));
  assert.equal(cleared.存档名, '上次对话');
  assert.equal(cleared.角色名字, '林');
  assert.equal(clearedLastConversationSlot(undefined).存档名, LAST_CONVERSATION_SLOT);
});

test('characterStore 接线：saveToSlot 盖来源章，loadGame/重开试玩清旧备份，回滚前校验来源', async () => {
  const src = await read('../src/stores/characterStore.ts');
  assert.match(fnBody(src, 'saveToSlot'), /回滚来源槽位: active\.存档槽位/);

  const reset = fnBody(src, 'resetLastConversationIfForeign');
  assert.match(reset, /shouldKeepLastConversationOnLoad\(/);
  assert.doesNotMatch(reset, /deleteSaveData|saveSaveData/);
  assert.match(reset, /clearSnapshots\(charId, activeSlotKey\)/);

  const load = fnBody(src, 'loadGame');
  const setActive = load.indexOf('rootState.value.当前激活存档 = { 角色ID: charId, 存档槽位: activeSlotKey }');
  const call = load.indexOf('await resetLastConversationIfForeign(profile, charId, slotKey, activeSlotKey)');
  const apply = load.indexOf('gameStateStore.loadFromSaveData(patched)');
  assert.ok(apply > 0 && setActive > apply && call > setActive, 'loadGame 须在成功载入后才设激活存档、清内存备份');
  assert.equal(src.match(/LAST_CONVERSATION_SLOT = '上次对话'/), null); // 常量只在 guard 模块定义

  const install = fnBody(src, 'installIsolatedPlaytestCharacter');
  assert.match(install, /\[LAST_CONVERSATION_SLOT\]: clearedLastConversationSlot\(/);
  assert.match(install, /deleteSaveData\(payload\.characterId, LAST_CONVERSATION_SLOT/);

  const rollback = fnBody(src, 'rollbackToLastConversation');
  assert.match(rollback, /lastConversationMatchesActive\(lastConversationSlot, active\.存档槽位\)/);
  assert.match(rollback, /'LCQ-SAV-031'/);
  assert.ok(rollback.indexOf('lastConversationMatchesActive') < rollback.indexOf('JSON.parse(JSON.stringify(outcome.data))'));
});

test('按钮可见性：MainGamePanel canRollback 与 SavePanel 回滚按钮都校验来源', async () => {
  const main = await read('../src/components/dashboard/MainGamePanel.vue');
  const start = main.indexOf('const canRollback = computed(');
  const block = main.slice(start, main.indexOf('});', start));
  assert.match(block, /lastConversationMatchesActive\(lastConversation,/);

  const panel = await read('../src/components/dashboard/SavePanel.vue');
  assert.match(panel, /v-if="save\.存档名 === '上次对话' && !isOnlineMode && lastConversationMatchesActive\(save, activeSlotKey\)"/);
});
