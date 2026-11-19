// 新界面存档页的纯函数：行名、每个存档能做的事（同老存档面板卡片按钮的显示／禁用条件）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { saveRowName, saveActions } = await loadTs('../src/components/uiNew/savesView.ts');

const base = { isCurrent: false, loading: false, hasCurrent: true, isOnlineMode: false, rollbackMatches: false, undeletable: false, deleteTooltip: '删除存档', empty: false };
const keys = acts => acts.map(a => a.key);

test('行名：存档名 → id → 存档N', () => {
  assert.equal(saveRowName({ 存档名: '存档一', id: 'x' }, 0), '存档一');
  assert.equal(saveRowName({ id: 'slot7' }, 0), 'slot7');
  assert.equal(saveRowName({}, 2), '存档3');
});

test('普通存档：读取 导出 覆盖 删除；空位覆盖写「存到这里」', () => {
  assert.deepEqual(keys(saveActions('存档一', base)), ['load', 'export', 'overwrite', 'delete']);
  assert.equal(saveActions('存档一', base).find(a => a.key === 'overwrite').label, '覆盖');
  assert.equal(saveActions('存档三', { ...base, empty: true }).find(a => a.key === 'overwrite').label, '存到这里');
});

test('当前存档：没有读取；删除禁用并带老面板的提示', () => {
  const acts = saveActions('存档一', { ...base, isCurrent: true, undeletable: true, deleteTooltip: '当前激活存档不可删除' });
  assert.deepEqual(keys(acts), ['export', 'overwrite', 'delete']);
  const del = acts.find(a => a.key === 'delete');
  assert.equal(del.disabled, true);
  assert.equal(del.title, '当前激活存档不可删除');
});

test('自动槽：时间点存档只有 导出 删除；上次对话属于当前槽时多一个回滚', () => {
  assert.deepEqual(keys(saveActions('时间点存档', base)), ['export', 'delete']);
  assert.deepEqual(keys(saveActions('上次对话', base)), ['export', 'delete']);
  assert.deepEqual(keys(saveActions('上次对话', { ...base, rollbackMatches: true })), ['rollback', 'export', 'delete']);
  assert.deepEqual(keys(saveActions('上次对话', { ...base, rollbackMatches: true, isOnlineMode: true })), ['export', 'delete']);
});

test('禁用条件：loading 全禁；没有当前存档时覆盖、回滚禁用', () => {
  assert.ok(saveActions('存档一', { ...base, loading: true }).every(a => a.disabled));
  const noCur = saveActions('上次对话', { ...base, rollbackMatches: true, hasCurrent: false });
  assert.equal(noCur.find(a => a.key === 'rollback').disabled, true);
  assert.equal(saveActions('存档一', { ...base, hasCurrent: false }).find(a => a.key === 'overwrite').disabled, true);
  assert.equal(saveActions('存档一', { ...base, hasCurrent: false }).find(a => a.key === 'load').disabled, false);
});
