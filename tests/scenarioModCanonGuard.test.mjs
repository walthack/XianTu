import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function buildScenarioSave(configureMod) {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const input = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  configureMod?.(input);
  const mod = parseScenarioMod(input);
  const initialization = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');
  const save = applyStrictScenarioInitializationToSave({
    角色: {
      位置: { 描述: '旧地点' },
      技能: { 掌握技能: [{ id: 'skill.thunderblade', name: '雷刀诀' }] },
      背包: { 物品: [{ id: 'item.thunderblade', name: '雷刀' }] },
    },
    社交: { 关系: { 程宗扬: { 名字: '程宗扬', 好感度: 0 } } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, initialization);
  return save;
}

test('canon guard rejects locked names, their parent paths, and runtime metadata writes', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildScenarioSave();
  const commands = [
    { action: 'set', key: '世界.信息.势力信息.0.名称', value: '改名宗门' },
    { action: 'set', key: '世界.信息.势力信息', value: [] },
    { action: 'set', key: '社交.关系.程宗扬.名字', value: '程某' },
    { action: 'delete', key: '世界.状态.剧本模组' },
    { action: 'set', key: '角色.技能.掌握技能.0.name', value: '新刀法' },
    { action: 'set', key: '角色.背包.物品.0', value: { id: 'item.thunderblade', name: '假雷刀' } },
    { action: 'set', key: '世界.信息.势力信息.0.描述', value: '允许变化的描述' },
    { action: 'add', key: '社交.关系.程宗扬.好感度', value: 1 },
  ];

  const result = guardScenarioModCommands(save, commands);

  assert.equal(result.rejected.length, 6);
  assert.deepEqual(result.accepted, commands.slice(6));
  assert.ok(result.rejected.every(item => item.reason.includes('剧本模组正典字段受保护')));
});

test('canon guard is inactive for saves without a Scenario Mod', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const commands = [{ action: 'set', key: '世界.信息.世界名称', value: '自由世界' }];

  const result = guardScenarioModCommands({ 世界: { 状态: {} } }, commands);

  assert.deepEqual(result.accepted, commands);
  assert.deepEqual(result.rejected, []);
});

test('content access guard rejects exclusive content for the player and unauthorized NPCs', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildScenarioSave();
  const commands = [
    { action: 'push', key: '角色.技能.掌握技能', value: { 技能名称: '雷刀诀' } },
    { action: 'set', key: '社交.关系.路人甲', value: { 名字: '路人甲', 技能: ['雷刀诀'] } },
    { action: 'set', key: '社交.关系.程宗扬.技能.掌握技能', value: [{ 技能名称: '雷刀诀' }] },
    { action: 'push', key: '社交.关系.路人甲.记忆', value: '曾见程宗扬施展雷刀诀' },
  ];

  const result = guardScenarioModCommands(save, commands);

  assert.deepEqual(result.rejected.map(item => item.command), commands.slice(0, 2));
  assert.ok(result.rejected.every(item => item.reason.includes('专属正典内容')));
  assert.deepEqual(result.accepted, commands.slice(2));
});

test('mapped player inherits the canonical character content permissions', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildScenarioSave(mod => {
    mod.scenario.opening.playerCharacterId = 'character.chengzongyang';
  });
  const command = { action: 'push', key: '角色.技能.掌握技能.1', value: { 技能名称: '雷刀诀' } };

  const result = guardScenarioModCommands(save, [command]);

  assert.deepEqual(result.accepted, [command]);
  assert.deepEqual(result.rejected, []);
});

test('playerAllowed does not bypass a different mapped canonical identity', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildScenarioSave(mod => {
    mod.canon.characters.push({ id: 'character.outsider', name: '异乡人' });
    mod.scenario.opening.playerCharacterId = 'character.outsider';
    mod.rules.contentAccess[0].policy = 'restricted';
    mod.rules.contentAccess[0].playerAllowed = true;
  });
  const command = { action: 'push', key: '角色.技能.掌握技能.1', value: { 技能名称: '雷刀诀' } };

  const result = guardScenarioModCommands(save, [command]);

  assert.deepEqual(result.accepted, []);
  assert.equal(result.rejected[0].command, command);
  assert.match(result.rejected[0].reason, /受限正典内容/);
});

test('canon prompt exposes the active Mod identity, names, and locks', async () => {
  const { buildScenarioCanonPrompt } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildScenarioSave();

  const prompt = buildScenarioCanonPrompt(save);

  assert.match(prompt, /liuchao\.jiankang（strict）/);
  assert.match(prompt, /太乙真宗/);
  assert.match(prompt, /程宗扬/);
  assert.match(prompt, /雷刀诀/);
  assert.match(prompt, /雷刀诀：exclusive；允许持有者：程宗扬/);
  assert.match(prompt, /玩家正典身份：独立玩家/);
  assert.match(prompt, /canon\.characters\.\*\.name/);
  assert.match(prompt, /不得生成同 ID 或同名替代品/);
  assert.match(prompt, /不得重命名、删除或覆盖锁定正典/);
});
