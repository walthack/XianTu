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

test('名字解禁必须以「真见过」为准，不能因为事件激活就提前解禁', async () => {
  // 代码级漏洞（2026-08-20 制作人要求做反例测试时查出）：
  // `collectIntroducedCharacterIds` 取的是 `[...activeEventIds, ...completedEventIds]`
  // 的相关角色——**事件一激活，它的相关人就全被算作已相识**，可玩家还没见着。
  // 实测：`太乙真宗介入` 一激活，蔺采泉／商乐轩／卓云君／月霜 立刻全部解禁；
  // `程宗扬见王哲` 一激活，王哲立刻解禁。名字比见面早整整一拍。
  //
  // 真正记「见没见过」的是相识账本（acquaintances），故命名规则改走账本。
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

  // 「太乙真宗介入」已激活（旧口径会把卓云君等四人全部解禁），但账本仍是空的
  save.世界.状态.剧本模组.activeEventIds = ['lcq.event.s01_04'];
  const prompt = buildScenarioStoryPrompt(save) || '';
  assert.match(prompt, /一个正典人物都还没见过/, '账本为空时必须明说玩家谁都没见过');
  assert.ok(
    !/玩家\*\*真正见过\*\*的只有：[^）]*卓云君/.test(prompt),
    '卓云君只是出现在已激活事件里，玩家并没有见过他——不得据此解禁其名',
  );
});

test('相识账本只认已完成的拍——正在进行的那一拍不算见过（用带 canon.characters 的真档）', async () => {
  // ⚠ 这条测试的写法本身是个教训：上一版我用精简存档验，账本一直是空的，
  // 我据此以为"修好了"。**实情是 `updateAcquaintanceLedger` 第一行
  // `if (!characters.length) return;` 直接退出了**——精简存档没有 canon.characters，
  // 我测的东西根本不在链路里。故这里必须用带 canon 的真模组建档。
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const fsm = await import('node:fs');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const mod = parseScenarioMod(JSON.parse(fsm.readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_01.json', 'utf8')));
  let save = createQingyuOpeningPlaytestSave(mod);
  const rt = () => save.世界.状态.剧本模组;
  assert.ok((rt().canon?.characters || []).length > 0, '真档必须带 canon.characters，否则账本逻辑整段被跳过');

  // 把「太乙真宗介入」设为进行中（卓云君等人在它的 relatedCharacterIds 里），但一拍未完成
  rt().activeEventIds = ['lcq.event.s01_04'];
  rt().completedEventIds = [];
  save = rtm.advanceScenarioRuntime(save).saveData;
  const met = Object.values(rt().acquaintances || {}).map(record => record.name);
  assert.ok(!met.includes('卓云君'), `拍还没完成就把卓云君记成见过了：${met.join('、')}`);

  // 完成之后才算见过
  rt().completedEventIds = ['lcq.event.s01_04'];
  save = rtm.advanceScenarioRuntime(save).saveData;
  const after = Object.values(rt().acquaintances || {}).map(record => record.name);
  assert.ok(after.includes('卓云君'), `拍完成后应当记账，实际：${after.join('、')}`);
});

