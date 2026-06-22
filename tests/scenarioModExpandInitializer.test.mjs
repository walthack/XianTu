import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadExpandMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const mod = parseScenarioMod(JSON.parse(await readFile(fixtureUrl, 'utf8')));
  mod.rules.mode = 'expand';
  return mod;
}

function generatedWorld() {
  return {
    世界名称: 'AI生成世界',
    世界背景: 'AI背景',
    世界纪元: 'AI纪元',
    特殊设定: ['AI规则'],
    生成时间: '2026-06-22T00:00:00.000Z',
    版本: 'generated-v1',
    大陆信息: [{ 名称: '江南', 描述: 'AI生成的江南', 主要势力: [] }],
    势力信息: [
      { id: 'faction.generated', 名称: '云海宗', 描述: 'AI势力' },
      { 名称: '太乙真宗', 描述: 'AI错误描述', 类型: 'AI宗门类型', 等级: '一流' },
    ],
    地点信息: [{ 名称: '建康', 描述: 'AI生成的建康', 类型: '城池' }],
  };
}

test('expand mode keeps Mod fields authoritative and uses generated values only for gaps', async () => {
  const { buildExpandScenarioInitialization } = await loadTs('../src/modules/scenarioMods/expandInitializer.ts');
  const mod = await loadExpandMod();
  const generated = generatedWorld();

  const result = buildExpandScenarioInitialization(mod, generated);

  assert.equal(result.worldInfo.世界名称, '六朝世界');
  assert.equal(result.worldInfo.世界背景, '建康内外暗流涌动，各方势力围绕朝局与秘宝展开角力。');
  assert.equal(result.worldInfo.世界纪元, '太康年间');
  assert.equal(result.worldInfo.大陆信息.find(item => item.名称 === '江南').描述, '王朝腹地与故事主要舞台。');
  assert.equal(result.worldInfo.地点信息.filter(item => item.名称 === '建康').length, 1);
  assert.equal(result.worldInfo.地点信息.find(item => item.名称 === '建康').类型, '城池');
  assert.equal(result.worldInfo.地点信息.find(item => item.名称 === '建康').描述, 'AI生成的建康');
  assert.ok(result.worldInfo.地点信息.some(item => item.名称 === '太乙真宗山门'));
  assert.equal(result.worldInfo.势力信息.filter(item => item.名称 === '太乙真宗').length, 1);
  assert.equal(result.worldInfo.势力信息.find(item => item.名称 === '太乙真宗').描述, '传承久远的修行宗派。');
  assert.equal(result.worldInfo.势力信息.find(item => item.名称 === '太乙真宗').类型, 'AI宗门类型');
  assert.equal(result.worldInfo.势力信息.find(item => item.名称 === '太乙真宗').等级, '一流');
  assert.ok(result.worldInfo.势力信息.some(item => item.名称 === '云海宗'));
  assert.deepEqual(result.worldInfo.特殊设定, ['AI规则', '固定人物姓名与所属势力不得被改写']);
  assert.equal(result.runtimeState.mode, 'expand');
  assert.equal(generated.地点信息.length, 1, 'generated world must not be mutated');
});

test('expand resolution calls the AI generator exactly once before merging', async () => {
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const mod = await loadExpandMod();
  let generatorCalls = 0;

  const result = await resolveInitialWorldInfo(mod, async () => {
    generatorCalls += 1;
    return generatedWorld();
  });

  assert.equal(generatorCalls, 1);
  assert.equal(result.expandInitialization.runtimeState.modId, 'liuchao.jiankang');
  assert.equal(result.strictInitialization, undefined);
});

test('expand Mod identity and additions survive a save serialization round trip', async () => {
  const {
    applyExpandScenarioInitializationToSave,
    buildExpandScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/expandInitializer.ts');
  const mod = await loadExpandMod();
  const initialization = buildExpandScenarioInitialization(mod, generatedWorld());
  const baseSave = {
    角色: { 位置: { 描述: '旧地点', x: 0, y: 0 } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {}, 联机: { 模式: '单机', 只读路径: [] } },
  };

  const saved = applyExpandScenarioInitializationToSave(baseSave, initialization);
  const reloaded = JSON.parse(JSON.stringify(saved));

  assert.equal(reloaded.系统.扩展.剧本模组.mode, 'expand');
  assert.equal(reloaded.世界.状态.剧本模组.canon.characters[0].name, '程宗扬');
  assert.ok(reloaded.世界.信息.地点信息.some(item => item.名称 === '太乙真宗山门'));
  assert.equal(reloaded.角色.位置.描述, '江南·建康');
  assert.equal(baseSave.角色.位置.描述, '旧地点', 'base save must not be mutated');
});
