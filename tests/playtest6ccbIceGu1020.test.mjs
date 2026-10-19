// 6ccb 真机 P1：04b 叙事写「冰蛊仍未解除」，状态栏没有冰蛊，灵气仍 50/50。
// 根因：①04b（及 03b/07/08/09）opening 没有 playerCharacterId，syncStoryStatuses 取不到主角直接返回；
//       ②冰蛊 storyApply 只按 05/05b 段补挂，04b 的种蛊事件（axis 42）真机没走到，旗标为假。
// 本文件用真机存档 CP-6ccb-07（F06 前，04b）裁出的最小现场复现。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const bingGu = await loadTs('../src/modules/scenarioMods/freeAction/bingGu.ts');
const { scenarioPlayerId } = await loadTs('../src/modules/scenarioMods/playerIdentity.ts');
const { actorStatusRecords } = await loadTs('../src/modules/scenarioMods/actorStatusRead.ts');
const N = JSON.parse(readFileSync(new URL('../mod-kit/numbers-progress.json', import.meta.url), 'utf8'));
const fx = () => JSON.parse(readFileSync(new URL('./fixtures/playtest-6ccb/f06-before-stage04b.json', import.meta.url), 'utf8'));

test('真机现场：opening 没有 playerCharacterId，按存档主角名从正典找回', () => {
  const save = fx();
  assert.equal(save.世界.状态.剧本模组.opening.playerCharacterId, undefined);
  assert.equal(scenarioPlayerId(save), 'liuchao.character.cheng_zongyang');
});

test('04b 真机现场：补挂冰蛊，灵气当前压到上限 × qiCapRatio', () => {
  const save = fx();
  assert.equal(save.角色.属性.灵气.当前, 50);
  const added = bingGu.syncStoryStatuses(save);
  assert.deepEqual(added, ['poison.ice_gu']);
  assert.ok(actorStatusRecords(save, 'liuchao.character.cheng_zongyang').some(r => r.statusId === 'poison.ice_gu'));
  const ratio = N.status.bingGu.qiCapRatio;
  assert.equal(save.角色.属性.灵气.当前, Math.floor(50 * ratio));
  assert.equal(save.角色.属性.灵气.上限, 50);
  assert.deepEqual(bingGu.syncStoryStatuses(save), [], '不重复挂');
});

test('殇侯解蛊旗标为真时不挂', () => {
  const save = fx();
  save.世界.状态.剧本模组.flags['event.shanghou_cures_ice_gu.done'] = true;
  const statuses = JSON.parse(readFileSync(new URL('../src/modules/sceneModule/contracts/statuses.json', import.meta.url), 'utf8'));
  const def = statuses.find(d => d.id === 'poison.ice_gu');
  for (const r of def.remove.filter(r => r.kind === 'story')) save.世界.状态.剧本模组.flags[r.flag] = true;
  assert.deepEqual(bingGu.syncStoryStatuses(save), []);
});
