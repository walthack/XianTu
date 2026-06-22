import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(fixtureUrl, 'utf8')));
}

test('converts strict canon into native WorldInfo without renaming entities', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  const result = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');

  assert.equal(result.worldInfo.世界名称, '六朝世界');
  assert.deepEqual(result.worldInfo.大陆信息.map(item => item.名称), ['江南']);
  assert.deepEqual(result.worldInfo.势力信息.map(item => item.名称), ['太乙真宗']);
  assert.deepEqual(result.worldInfo.地点信息.map(item => item.名称), ['建康', '太乙真宗山门']);
  assert.equal(result.runtimeState.canon.characters[0].name, '程宗扬');
  assert.equal(result.runtimeState.canon.factions[0].name, '太乙真宗');
  assert.equal(result.runtimeState.canon.skills[0].name, '雷刀诀');
  assert.equal(result.runtimeState.canon.items[0].name, '雷刀');
  assert.ok(result.runtimeState.lockedFields.includes('canon.characters.*.name'));
  assert.equal(result.runtimeState.contentAccess[0].contentId, 'skill.thunderblade');
  assert.equal(result.initialLocation.描述, '江南·建康');
  assert.equal(result.worldInfo.版本, 'scenario-mod:liuchao.jiankang@1.0.0');
});

test('strict resolution never calls the AI world generator', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  let generatorCalls = 0;

  const result = await resolveInitialWorldInfo(mod, async () => {
    generatorCalls += 1;
    throw new Error('AI world generator must not run');
  });

  assert.equal(generatorCalls, 0);
  assert.equal(result.strictInitialization.runtimeState.modId, 'liuchao.jiankang');
});

test('strict Mod identity and canon survive a save serialization round trip', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  const initialization = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');
  const baseSave = {
    角色: { 位置: { 描述: '旧地点', x: 0, y: 0 } },
    社交: { 关系: {} },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {}, 联机: { 模式: '单机', 只读路径: [] } },
  };

  const saved = applyStrictScenarioInitializationToSave(baseSave, initialization);
  const reloaded = JSON.parse(JSON.stringify(saved));

  assert.equal(reloaded.系统.扩展.剧本模组.modId, 'liuchao.jiankang');
  assert.equal(reloaded.世界.状态.剧本模组.modVersion, '1.0.0');
  assert.equal(reloaded.世界.状态.剧本模组.canon.characters[0].name, '程宗扬');
  assert.equal(reloaded.世界.状态.剧本模组.contentAccess[0].policy, 'exclusive');
  assert.equal(reloaded.角色.位置.描述, '江南·建康');
  assert.equal(reloaded.社交.关系.程宗扬.与玩家关系, '盟友');
  assert.equal(reloaded.社交.关系.程宗扬.好感度, 25);
  assert.deepEqual(reloaded.社交.关系.程宗扬.记忆, ['在建康城外初次相遇']);
  assert.equal(reloaded.社交.关系.程宗扬.宗门, '太乙真宗');
  assert.equal(reloaded.社交.关系.程宗扬.技能.掌握技能[0].技能名称, '雷刀诀');
  assert.equal(reloaded.社交.关系.程宗扬.功法.修炼功法.名称, '九阳神功');
  assert.equal(reloaded.社交.关系.程宗扬.背包.物品['item.thunderblade'].名称, '雷刀');
  assert.deepEqual(reloaded.社交.关系矩阵.edges[0], {
    from: '王哲',
    to: '程宗扬',
    relation: '师徒',
    score: 80,
    type: '单向',
    tags: ['太乙真宗'],
    events: ['传授功法'],
    updatedAt: '2026-06-22T00:00:00.000Z',
  });
  assert.equal(baseSave.角色.位置.描述, '旧地点', 'base save must not be mutated');
});

test('mapped player identity is not duplicated in native NPC relationships', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  mod.scenario.opening.playerCharacterId = 'character.chengzongyang';
  mod.canon.playerRelationships = [];
  const saved = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    社交: { 关系: {} },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'));

  assert.equal(saved.社交.关系.程宗扬, undefined);
  assert.equal(saved.社交.关系.王哲.名字, '王哲');
  assert.deepEqual(saved.社交.关系矩阵.edges, []);
  assert.equal(saved.角色.技能.掌握技能[0].技能名称, '雷刀诀');
  assert.equal(saved.角色.背包.物品['item.thunderblade'].名称, '雷刀');
  assert.equal(saved.角色.修炼.修炼功法.名称, '九阳神功');
  assert.equal(saved.社交.宗门.当前宗门, '太乙真宗');
  assert.equal(saved.社交.宗门.成员信息.职位, '弟子');
});

test('resolution without a Mod preserves the original world generation path', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  let generatorCalls = 0;
  const generated = { 世界名称: 'generated' };

  const result = await resolveInitialWorldInfo(null, async () => {
    generatorCalls += 1;
    return generated;
  });

  assert.equal(generatorCalls, 1);
  assert.equal(result.worldInfo, generated);
  assert.equal(result.strictInitialization, undefined);
  assert.equal(result.expandInitialization, undefined);
});
