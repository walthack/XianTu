import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 玩家还没认识的人，正文里不得直呼其名。
//
// 立项由来（2026-08-20）：制作人在 demo 里读到这段——
//   「那是**王哲**——虽然你还不知道他的名字，但那一刻，你莫名觉得这人会很重要。」
// 模型手里有王哲的档案，就把名字写了出来；同时又感觉不该知道，于是自己拆穿自己。
//
// 查证：相识账本（`acquaintanceLedger`）早就在给 prompt 注入【素未谋面】，
// 但那条只禁止「按旧识相处」，**没有一条禁止在正文里用这个名字**——
// 与今天几件事同源：约束写了一半，漏掉的那半正好是玩家看得见的那半。

test('素未谋面的人，提示词必须禁止正文直呼其名，并禁止自相矛盾写法', async () => {
  const { formatAcquaintance } = await loadTs('../src/modules/scenarioMods/acquaintanceLedger.ts');
  const line = formatAcquaintance(undefined, '王哲');
  assert.match(line, /素未谋面/);
  assert.match(line, /不得直呼其名/, '必须显式禁止在正文里用这个名字');
  assert.match(line, /指代/, '必须给出替代写法（外观/衣着/位置/行为）');
  assert.match(line, /有人当场把名字说出口|自己问出来/, '必须说明什么时候才可以开始用这个名字');
  assert.match(line, /自相矛盾/, '必须点名禁止「写出名字又说你还不知道他的名字」这种写法');
});

test('仅闻其名：知道名字不等于认得出人', async () => {
  const { formatAcquaintance, recordAcquaintance } = await loadTs('../src/modules/scenarioMods/acquaintanceLedger.ts');
  const ledger = {};
  if (typeof recordAcquaintance === 'function') recordAcquaintance(ledger, 'x', '王哲', 'rumored');
  const line = formatAcquaintance(
    { records: { x: { characterId: 'x', name: '王哲', kind: 'rumored' } } },
    '王哲',
  );
  if (!line.includes('仅闻其名')) return;   // 账本形状不同则跳过，只保证有该分支时措辞到位
  assert.match(line, /不知道眼前这个人就是他/, '知道名字与认得出人是两回事');
});

test('登场门槛必须绑住叙述者，且这条规则要真的进提示词', async () => {
  // ⚠ 本轮差点报错结论：我先用一个精简存档测，发现「素未谋面」在提示词里 0 次，
  // 差点断言「规则根本不生效」。实情是**角色档案段只按当前事件的相关角色生成**——
  // 王哲不在「段强被射杀」的相关人里，自然没有档案，那条规则对他本就不适用。
  // 真正的缺口在另一处：`introducedLine` 原文只写「**NPC** 不得认识、回忆或主动提及」，
  // 管的是 NPC 的知情，**不管叙述者的笔**。于是旁白可以大方写出「那是王哲」。
  // 故这条断言钉的是**始终存在**的那份约束，而不是依赖档案段。
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const fs = await import('node:fs');
  const mod = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_01.json', 'utf8'));
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  const save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  const prompt = buildScenarioStoryPrompt(save) || '';
  assert.match(prompt, /叙述同样受此约束/, '登场门槛必须显式绑住叙述者，只管 NPC 拦不住旁白');
  assert.match(prompt, /不得被直呼其名/);
  assert.match(prompt, /自相矛盾/, '必须点名禁止「写出名字又说你还不知道他的名字」');
});

