import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// 剧情罗盘移动（travel:）由本地事件引擎落位，跨国也不走地图选择；模型位置指令跨国仍由 canonGuard 拒。
const readStage = async id => JSON.parse(await readFile(
  new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url),
  'utf8',
));

async function api() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const guard = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const travel = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const first = parseScenarioMod(await readStage('lcq.stage_01'));
  const stageSave = async id => init.applyStrictScenarioInitializationToSave(
    opening.createQingyuOpeningPlaytestSave(first, '2026-10-31T00:00:00.000Z'),
    init.buildStrictScenarioInitialization(parseScenarioMod(await readStage(id))),
  );
  return { ...runtime, ...guard, ...travel, stageSave };
}

/** 收集控制台输出里的 LCQ-SAV-038；诊断日志按码打印到控制台。 */
async function capture038(fn) {
  const seen = [], originals = {};
  for (const level of ['warn', 'error', 'info', 'debug', 'log']) {
    originals[level] = console[level];
    console[level] = (...args) => { const line = args.map(String).join(' '); if (line.includes('LCQ-SAV-038')) seen.push(line); };
  }
  try { await fn(); } finally { Object.assign(console, originals); }
  return seen;
}

const advance = (tools, save) => tools.advanceScenarioRuntime(save).saveData;

/** 罗盘移动：自由输入「去X」解析出 travel:，结算后到场但不完成本拍。 */
function compassTravel(tools, save, eventId, toId) {
  const action = tools.getCurrentStoryEventActions(save).find(item => item.eventId === eventId);
  assert.equal(action?.actionId, `travel:${toId}`, `${eventId} 应先给罗盘移动`);
  const byText = tools.resolveStoryEventActionFromPlayerText(save, action.actionText.replace(/^前往/, '去'));
  assert.equal(byText?.actionId, action.actionId, '自由输入同样只换成这条移动');
  const fromCountry = tools.countryOf(save.角色.位置.locationId);
  const result = tools.recordStoryEventStructuredAction(save, byText);
  assert.equal(result.attempted, true, result.reason);
  assert.equal(result.completed, false, '到达≠完成');
  assert.equal(save.角色.位置.locationId, toId);
  return { fromCountry, toCountry: tools.countryOf(toId) };
}

function doContract(tools, save, eventId) {
  const action = tools.getCurrentStoryEventActions(save).find(item => item.eventId === eventId);
  assert.ok(action && !action.actionId.startsWith('travel:'), `${eventId} 到场后应给合同动作`);
  assert.equal(tools.recordStoryEventStructuredAction(save, action).completed, true);
}

test('江州退军：江州(晋)→荆溪村寨(宋)→筠州(宋) 剧情罗盘跨国移动到场，无 LCQ-SAV-038', async () => {
  const tools = await api();
  let save = await tools.stageSave('lyl.jiangzhou_retreat');
  assert.equal(save.角色.位置.locationId, 'liuchao.location.jiangzhou');
  const legs = [
    ['lyl.event.s01_01', 'liuchao.location.jinming_zhai'],
    ['lyl.event.s01_02', 'liuchao.location.jiangzhou'],
    ['lyl.event.s01_03', 'liuchao.location.jingxi_village'],
    ['lyl.event.s01_04', 'liuchao.location.junzhou'],
  ];
  const crossings = [];
  const logs = await capture038(() => {
    for (const [eventId, toId] of legs) {
      save = advance(tools, save);
      const leg = compassTravel(tools, save, eventId, toId);
      if (leg.fromCountry !== leg.toCountry) crossings.push(`${leg.fromCountry}→${leg.toCountry}`);
      save = advance(tools, save);
      doContract(tools, save, eventId);
    }
    // 到场后模型回写同一位置（同国）照常接受。
    const echo = tools.guardScenarioModCommands(save, [{ action: 'set', key: '角色.位置.locationId', value: 'liuchao.location.junzhou' }]);
    assert.equal(echo.accepted.length, 1);
    assert.deepEqual(echo.rejected, []);
  });
  assert.deepEqual(crossings, ['晋→宋']);
  assert.deepEqual(logs, []);
  save = advance(tools, save);
  assert.ok(save.世界.状态.剧本模组.completedEventIds.includes('lyl.event.s01_04'));
  assert.deepEqual(
    save.世界.状态.剧本模组.questArrivalReceipts.map(item => item.locationId),
    legs.map(([, toId]) => toId),
  );
});

test('临安黑海：临安(宋)→江州(晋) 场外插叙罗盘移动可达，再回临安', async () => {
  const tools = await api();
  let save = await tools.stageSave('lyl.lin_an_black_sea');
  const runtime = save.世界.状态.剧本模组;
  const order = runtime.events.map(event => event.id);
  const prior = order.slice(0, order.indexOf('liuchao.event.black_sea_approach'));
  runtime.completedEventIds = prior;
  for (const id of prior) runtime.flags[`event.${id.split('.').pop()}.done`] = true;
  runtime.flags['chapter.arrival.done'] = true;
  runtime.flags['chapter.lin_chong.done'] = true;
  runtime.flags['chapter.wei_yuan.done'] = true;
  runtime.flags['chapter.xue_sun.done'] = true;
  runtime.activeEventIds = [];
  assert.equal(save.角色.位置.locationId, 'liuchao.location.lin_an');
  const legs = [];
  const logs = await capture038(() => {
    // 每次推进只翻一章，补齐前四章后多推几次。
    for (let i = 0; i < 6 && !save.世界.状态.剧本模组.activeEventIds.includes('liuchao.event.black_sea_approach'); i++) save = advance(tools, save);
    assert.ok(save.世界.状态.剧本模组.activeEventIds.includes('liuchao.event.black_sea_approach'));
    legs.push(compassTravel(tools, save, 'liuchao.event.black_sea_approach', 'liuchao.location.jiangzhou'));
    save = advance(tools, save);
    doContract(tools, save, 'liuchao.event.black_sea_approach');
    save = advance(tools, save);
    legs.push(compassTravel(tools, save, 'liuchao.event.final_preparations', 'liuchao.location.lin_an'));
  });
  assert.deepEqual(legs, [{ fromCountry: '宋', toCountry: '晋' }, { fromCountry: '晋', toCountry: '宋' }]);
  assert.deepEqual(logs, []);
});

test('对照：模型位置指令跨国仍被 canonGuard 以 LCQ-SAV-038 拒绝，存档不动', async () => {
  const tools = await api();
  const save = await tools.stageSave('lyl.lin_an_black_sea');
  const before = structuredClone(save.角色.位置);
  let result;
  const logs = await capture038(() => {
    result = tools.guardScenarioModCommands(save, [
      { action: 'set', key: '角色.位置.locationId', value: 'liuchao.location.jiangzhou' },
      { action: 'set', key: '角色.位置', value: { locationId: 'liuchao.location.jiangzhou', 描述: '晋·江州' } },
    ]);
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
  for (const item of result.rejected) assert.match(item.reason, /LCQ-SAV-038/);
  assert.ok(logs.length >= 1, '拒绝须留诊断日志（也证明本文件的日志捕获有效）');
  assert.deepEqual(save.角色.位置, before);
});
