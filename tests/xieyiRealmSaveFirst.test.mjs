// 2026-10-19 23:52 用户批准动冻结文件：runtime.ts 谢艺境界改走 actorLevels.reconcileNpcRealm（存档为准、只补缺失），隐藏期仍显示「未知」。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { XIE_YI, load } from './freeActionFixture.mjs';

const actorLevels = await load('../src/modules/scenarioMods/actorLevels.ts');
const { realmAt } = await load('../src/modules/scenarioMods/levelProgression.ts');
const { levelFact } = await load('../src/modules/scenarioMods/characterLevels.ts');

test('谢艺境界（23:52 批准）：存档为准只补缺失；隐藏期显示「未知」并暂存真实境界，显露后原样恢复', () => {
  const table = levelFact(XIE_YI, 40).level;
  const npc = { 境界: { ...realmAt(table + 1), 当前进度: 7 } }; // 存档值与等级表不同（高于表级：reconcileNpcRealm 不降、不重写）
  const saved = structuredClone(npc.境界);
  actorLevels.reconcileNpcRealm(npc, XIE_YI, 40, { hidden: true });
  assert.equal(npc.境界.名称, '未知');
  actorLevels.reconcileNpcRealm(npc, XIE_YI, 40, { hidden: true });
  assert.equal(npc.境界.名称, '未知', '隐藏期反复调用不丢暂存');
  actorLevels.reconcileNpcRealm(npc, XIE_YI, 40, {});
  assert.deepEqual(npc.境界, saved, '显露后原样恢复存档值，不按等级表重写');
  const blank = {};
  actorLevels.reconcileNpcRealm(blank, XIE_YI, 40, {});
  assert.deepEqual(blank.境界, realmAt(table), '缺失才按等级表补');
  const src = readFileSync(new URL('../src/modules/scenarioMods/runtime.ts', import.meta.url), 'utf8');
  assert.match(src, /reconcileNpcRealm\(npc,character\.id,namingChapter\(runtime\),\{hidden:isXieyiSkillHidden\(runtime\)\}\)/);
});
