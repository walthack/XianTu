import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const wuyuan = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const time = await loadTs('../src/modules/scenarioMods/actionTime.ts');
export async function freshPrologueCheckpoint() {
  const mods = await Promise.all(['lcq.stage_01', 'lcq.stage_02'].map(async id => packs.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8')))));
  let save = opening.createQingyuOpeningPlaytestSave(mods[0], '2026-11-01T00:00:00.000Z');
  // 与正式创角相同：开局年由既有年龄公式计算，试玩 helper 的最小档默认年仅供测试。
  const { 计算起始年 } = await loadTs('../src/utils/lifespanCalculator.ts');
  const age = mods[0].scenario.opening.creationPreset.age;
  save.元数据.时间.年 = 计算起始年(age);
  init.alignBirthWithStartYear(save, age);
  const trace = [];
  for (let n = 0; n < 100; n++) {
    const rt = save.世界.状态.剧本模组;
    const event = runtime.getScenarioFocusEvent(rt);
    if (event?.id === 'lcq.event.s02_04') {
      // 点心铺前置同样走正式选择器；检查点停在成功执行 s02_04 之前。
      for (let step = 0; step < 4 && !wuyuan.getWuyuanOpenWorldSelections(save).some(a => a.kind === 'problem_action'); step++) {
        const local = wuyuan.resolveWuyuanOpenWorldSelectionFromText(save, '我去点心铺') || wuyuan.getWuyuanOpenWorldSelections(save).find(a => a.identityId === 'lcq.route.wuyuan.arrive_market');
        if (!local) throw Error('missing pastry route: '+JSON.stringify(wuyuan.getWuyuanOpenWorldSelections(save))); 
        const result = wuyuan.settleWuyuanOpenWorldSelection(save, local);
        if (!result.settled) throw Error('pastry travel failed');
        trace.push({ local: local.identityId, settled: true });
        const narrative = wuyuan.composeWuyuanOpenWorldNarrative(save, local);
        save.系统.历史.叙事.push({ type: 'gm', content: narrative, actionOptions: [] });
        save.社交.记忆.短期记忆.push(narrative);
      }
      if (!wuyuan.getWuyuanOpenWorldSelections(save).some(a => a.kind === 'problem_action')) throw Error('pastry actions missing');
      save.元数据.存档名 = '当前构建新档-五原为奴s02_04前-220年';
      return { save, trace };
    }
    if (rt.gameOver) throw Error('unexpected ending');
    if (rt.nextStageReadyId) {
      const result = init.transitionToNextScenarioStage(save, mods);
      if (!result.ok) throw Error(result.reason);
      save = result.saveData; trace.push({ stage: save.世界.状态.剧本模组.modId }); continue;
    }
    if (event?.id === 'lcq.event.s02_01') {
      runtime.trackStoryOpportunity(save, 'opportunity.lcq.s02_01.take_full_mandate');
      const action = runtime.getTrackedStoryOpportunityActions(save)[0];
      if (action) {
        const result = runtime.recordStoryOpportunityStructuredAction(save, action);
        trace.push({ opportunity: action, progressed: result.progressed });
        save = runtime.advanceScenarioRuntime(save).saveData; continue;
      }
    }
    const actions = runtime.getCurrentStoryEventActions(save);
    const action = actions.find(a => event?.playerCompletionContract?.actions.some(c => c.id === a.actionId)) || actions.find(a => a.actionId.startsWith('travel:'));
    if (!action) throw Error(`no action: ${event?.id}`);
    const receipt = runtime.recordStoryEventStructuredAction(save, action);
    if (!receipt.attempted) throw Error(JSON.stringify(receipt));
    time.settleActionTime(save, {}, { timeActionId: `checkpoint:${n}` }, null, false, false);
    trace.push({ event: action.eventId, action: action.actionId, outcome: receipt.outcome });
    save = runtime.advanceScenarioRuntime(save).saveData;
  }
  throw Error('checkpoint replay did not reach s02_04');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { save, trace } = await freshPrologueCheckpoint();
  const dir = 'tests/fixtures/checkpoints'; await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/current-prologue-before-s02_04.json`, JSON.stringify({ type: 'saves', saves: [{ 存档名: save.元数据.存档名, 存档数据: save }] }, null, 2) + '\n');
  await writeFile(`${dir}/current-prologue-before-s02_04.trace.json`, JSON.stringify(trace, null, 2) + '\n');
  console.log('generated checkpoint', save.元数据.时间, trace.length);
}
