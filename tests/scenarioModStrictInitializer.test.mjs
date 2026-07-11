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
  assert.equal(result.initialLocation.x, 7100);
  assert.equal(result.initialLocation.y, 4960);
  assert.equal(result.worldInfo.版本, 'scenario-mod:liuchao.jiankang@1.0.0');
  assert.equal(result.worldInfo.地图配置.width, 10000);
  assert.equal(result.worldInfo.剧本地图.locked, true);
  assert.deepEqual(result.worldInfo.大陆信息[0].大洲边界[0], { x: 6000, y: 4200 });
  assert.deepEqual(result.worldInfo.势力信息[0].势力范围[0], { x: 6500, y: 4300 });
  assert.deepEqual(result.worldInfo.地点信息[0].coordinates, { x: 7100, y: 4960 });
  assert.equal(result.worldInfo.地点信息[0].类型, '城池');
  assert.equal(result.worldInfo.地点信息[0].原始类型, 'capital');
  assert.equal(result.worldInfo.地点信息[1].类型, '宗门');
  assert.equal(result.worldInfo.地点信息[1].原始类型, '宗门驻地');
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

test('Canon Rail is explicit fresh-save opt-in and otherwise absent', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  mod.manifest.id = 'lcq.stage_01';
  const disabled = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');
  const enabled = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z', { canonRailEnabled: true });
  assert.equal(disabled.runtimeState.canonRail, undefined);
  assert.deepEqual(enabled.runtimeState.canonRail, { enabled: true, profileId: 'qingyu.stage_01' });
});

test('strict initialization accepts a reactive-style Mod proxy from character creation', async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  const reactiveLikeMod = new Proxy(mod, {});
  reactiveLikeMod.canon.characters = new Proxy(reactiveLikeMod.canon.characters, {});

  assert.throws(() => structuredClone(reactiveLikeMod.canon.characters), /could not be cloned/);

  const result = buildStrictScenarioInitialization(reactiveLikeMod, '2026-06-22T00:00:00.000Z');

  assert.equal(result.runtimeState.modId, 'liuchao.jiankang');
  assert.equal(result.runtimeState.canon.characters[0].name, '程宗扬');
});

test('strict Mod identity and canon survive a save serialization round trip', async () => {
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadMod();
  mod.manifest.axisVersion = 'test-axis';
  mod.manifest.axisOrder = 3;
  mod.manifest.axisSeqLo = 10;
  mod.manifest.axisSeqHi = 20;
  mod.manifest.nextStageId = 'liuchao.next';
  mod.manifest.nextStageName = '六朝·下一关';
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
  assert.equal(reloaded.系统.扩展.剧本模组.modName, '六朝·建康风云');
  assert.equal(reloaded.世界.状态.剧本模组.modVersion, '1.0.0');
  assert.equal(reloaded.世界.状态.剧本模组.axisVersion, 'test-axis');
  assert.equal(reloaded.世界.状态.剧本模组.axisOrder, 3);
  assert.equal(reloaded.世界.状态.剧本模组.axisSeqLo, 10);
  assert.equal(reloaded.世界.状态.剧本模组.axisSeqHi, 20);
  assert.equal(reloaded.世界.状态.剧本模组.nextStageId, 'liuchao.next');
  assert.equal(reloaded.世界.状态.剧本模组.nextStageName, '六朝·下一关');
  assert.equal(reloaded.世界.状态.剧本模组.canon.characters[0].name, '程宗扬');
  assert.equal(reloaded.世界.状态.剧本模组.contentAccess[0].policy, 'exclusive');
  assert.equal(reloaded.角色.位置.描述, '江南·建康');
  assert.equal(reloaded.社交.关系.程宗扬.与玩家关系, '盟友');
  assert.equal(reloaded.社交.关系.程宗扬.好感度, 25);
  assert.deepEqual(reloaded.社交.关系.程宗扬.记忆, [
    '穿越后卷入六朝风云。',
    '生死根不得被其他 NPC 自动获得。',
    '在建康城外初次相遇',
  ]);
  assert.equal(reloaded.社交.关系.程宗扬.宗门, '太乙真宗');
  assert.equal(reloaded.社交.关系.程宗扬.外貌描述, '年轻男子，眉目清朗，带着异世来客的警觉与机变。');
  assert.deepEqual(reloaded.社交.关系.程宗扬.性格特征, ['机变', '谨慎', '重情义']);
  assert.equal(reloaded.社交.关系.程宗扬.灵根.name, '生死根');
  assert.equal(reloaded.社交.关系.程宗扬.先天六司.悟性, 7);
  assert.equal(reloaded.社交.关系.程宗扬.当前位置.x, 7100);
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
  assert.equal(reloaded.角色.技能, undefined, 'independent player must not inherit canonical NPC skills');
  assert.equal(reloaded.社交.宗门, undefined, 'independent player must not inherit a canonical NPC sect');
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

test('stage transition preserves accumulated NPC relations and switches runtime', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    transitionToNextScenarioStage,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { readFile } = await import('node:fs/promises');
  const raw = JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
  raw.manifest.nextStageId = 'liuchao.next_stage';
  raw.manifest.nextStageName = '六朝·下一关';
  const mod = parseScenarioMod(raw);
  // 下一关 mod：同 fixture 改 id
  const rawNext = JSON.parse(JSON.stringify(raw));
  rawNext.manifest.id = 'liuchao.next_stage';
  rawNext.manifest.name = '六朝·下一关·测试';
  rawNext.manifest.nextStageId = null;
  const nextMod = parseScenarioMod(rawNext);

  let save = applyStrictScenarioInitializationToSave(
    { 角色: { 位置: { 描述: '旧' } }, 世界: { 信息: {}, 状态: {} }, 系统: { 扩展: {} } },
    buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'),
  );
  // 玩家与程宗扬的累积状态
  save.社交.关系['程宗扬'] = { ...(save.社交.关系['程宗扬'] || {}), 名字: '程宗扬', 与玩家关系: '挚友', 好感度: 77, 记忆: ['同闯建康的旧事'] };
  const rt = save.世界.状态.剧本模组;
  rt.nextStageReadyId = rt.nextStageId; // 模拟本关关键剧情已完成

  // 未就绪时拒绝
  const notReady = transitionToNextScenarioStage({ ...structuredClone(save), 世界: { ...save.世界, 状态: { 剧本模组: { ...rt, nextStageReadyId: null } } } }, [nextMod]);
  assert.equal(notReady.ok, false);

  const result = transitionToNextScenarioStage(save, [nextMod]);
  assert.equal(result.ok, true, result.reason);
  const newRt = result.saveData.世界.状态.剧本模组;
  assert.equal(newRt.modId, 'liuchao.next_stage');
  const npc = result.saveData.社交.关系['程宗扬'];
  assert.equal(npc.好感度, 77, '好感度跨关保留');
  assert.equal(npc.与玩家关系, '挚友', '关系标签跨关保留');
  assert.ok((npc.记忆 || []).includes('同闯建康的旧事'), '记忆跨关保留');
});
