import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 主角自己还不知道的自身设定，不得出现在正文、玩家台词与行动选项里。
//
// 立项由来（2026-08-20）：制作人在 demo 第二拍就看到行动选项
//   「查看斥候伤势，尝试用**生死根**救治」
// 而生死根要到 seq 19「王哲发现其身上有生死根」才被点破。
//
// 路径与「未相识者直呼其名」不同：生死根**不在剧本提示词里**（实测 0 次），
// 它是建档时写进 `角色.身份.灵根` 的，随人物面板每轮发给模型。
// storyContext 拦不住它进上下文，**只能显式禁止使用**——所以规则是禁令而非删除。
//
// 同一族的第三个变种：① 事件名印上按钮 ② 未相识者被直呼其名 ③ 主角自身设定提前自知。
// 共同点都是**引擎知道 ≠ 玩家/角色知道**。

const DATA = 'src/modules/scenarioMods/builtins/data/lcq.stage_01.json';

function boot(rtm, mod) {
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  return rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
}

test('未点破前，提示词必须显式禁止使用「生死根」', async () => {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  assert.ok((mod.scenario.undisclosedSelfFacts || []).length, '本关必须声明未点破的自身设定');

  const save = boot(rtm, mod);
  const prompt = buildScenarioStoryPrompt(save) || '';
  assert.match(prompt, /主角尚不自知/, '未点破时必须给出禁令');
  assert.match(prompt, /生死根/);
  assert.match(prompt, /行动选项里一律不得出现/, '必须连行动选项一起管——泄漏正是从选项里冒出来的');
});

test('点破那一拍完成之后解禁', async () => {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const save = boot(rtm, mod);
  save.世界.状态.剧本模组.completedEventIds = ['lcq.event.s01_05'];
  const prompt = buildScenarioStoryPrompt(save) || '';
  assert.ok(!/主角尚不自知/.test(prompt), '王哲点破之后不该再禁——否则玩家学会了却不许提');
});

test('声明的解禁事件必须真实存在，否则永远解不了禁', () => {
  for (const file of fs.readdirSync('src/modules/scenarioMods/builtins/data/').filter(n => n.endsWith('.json'))) {
    const mod = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/' + file, 'utf8'));
    const facts = mod.scenario?.undisclosedSelfFacts || [];
    if (!facts.length) continue;
    const ids = new Set((mod.scenario.events || []).map(event => event.id));
    for (const item of facts) {
      assert.ok(ids.has(item.untilEventId), `${mod.manifest.id} 的「${item.fact}」挂在不存在的事件 ${item.untilEventId} 上`);
      assert.ok(item.fact.length >= 2, '禁词太短会误伤正常文字');
    }
  }
});
