import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadTs } from '../tests/loadTs.mjs';
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const wuyuan = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const time = await loadTs('../src/modules/scenarioMods/actionTime.ts');
/**
 * 生成失败条件：档按落盘形状（JSON 往返）走真实读档入口——validateLoadedSave → applyLoadRepairs → migrateCalendar
 * （characterStore.loadGame 与 gameStateStore.loadFromSaveData 的同一批函数），读后主角出生须仍为 开局年−开局年龄（200）、
 * 未被修复改动、寿命缓存已开且 寿命.当前 等于现算年龄。不成立即抛错，CLI 以非 0 退出、不写文件。
 */
export async function assertRealOpeningAfterLoad(bundleOrSave, label) {
  const [fallback, repairs, calendar, life] = await Promise.all([
    loadTs('../src/utils/saveLoadFallback.ts'), loadTs('../src/modules/scenarioMods/loadRepairs.ts'),
    loadTs('../src/utils/calendarMigration.ts'), loadTs('../src/utils/lifespanCalculator.ts')]);
  const stage01 = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'));
  const age = packs.applyContentPackOverlays(stage01).scenario.opening.creationPreset.age;
  const expectedBirthYear = life.计算起始年(age) - age;
  const disk = JSON.parse(JSON.stringify(bundleOrSave?.saves ? bundleOrSave.saves[0].存档数据 : bundleOrSave));
  const fail = msg => { throw Error(`[checkpoint ${label}] ${msg}`); };
  const before = { year: disk.元数据.时间.年, birth: structuredClone(disk.角色.身份.出生日期), age: disk.角色.属性.寿命.当前 };
  if (before.birth?.年 !== expectedBirthYear) fail(`生成档出生年 ${before.birth?.年} ≠ 开局年−开局年龄 ${expectedBirthYear}`);
  if (!life.lifespanCacheEnabled(disk)) fail('生成档未像正式新建那样开寿命缓存');
  const outcome = await fallback.validateLoadedSave('checkpoint-generator', label, disk, { keep: 0, readBackup: async () => null });
  if (outcome.status !== 'ok') fail(`读档校验未通过：${outcome.status}`);
  const loaded = outcome.data;
  repairs.applyLoadRepairs(loaded);
  calendar.migrateCalendar(loaded);
  const after = { year: loaded.元数据.时间.年, birth: structuredClone(loaded.角色.身份.出生日期), age: loaded.角色.属性.寿命.当前 };
  if (JSON.stringify(after.birth) !== JSON.stringify(before.birth)) fail(`读档修复改动了出生：${JSON.stringify(before.birth)} → ${JSON.stringify(after.birth)}`);
  if (!life.lifespanCacheEnabled(loaded)) fail('读后寿命缓存未开启');
  const nowAge = life.calculateAgeFromBirthdate(after.birth, loaded.元数据.时间);
  if (after.age !== nowAge) fail(`读后寿命.当前 ${after.age} ≠ 现算年龄 ${nowAge}`);
  return { label, before, after, expectedBirthYear, openingAge: age };
}
export async function freshPrologueCheckpoint({ beforeWuyuan = false } = {}) {
  const mods = await Promise.all(['lcq.stage_01', 'lcq.stage_02'].map(async id => packs.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8')))));
  let save = opening.createQingyuOpeningPlaytestSave(mods[0], '2026-11-01T00:00:00.000Z');
  // 与正式创角相同：开局年由既有年龄公式计算，试玩 helper 的最小档默认年仅供测试。
  const { 计算起始年, enableLifespanCache } = await loadTs('../src/utils/lifespanCalculator.ts');
  const age = mods[0].scenario.opening.creationPreset.age;
  const oldYear = save.元数据.时间.年;
  save.元数据.时间.年 = 计算起始年(age);
  // helper 先建最小试玩历法再切正式 220 历，已经登记的首见年须随同平移。
  for (const npc of Object.values(save.社交.关系)) {
    if (Number.isInteger(npc.首见年)) npc.首见年 += save.元数据.时间.年 - oldYear;
  }
  const { reconcileRegistryBirthdates } = await loadTs('../src/modules/scenarioMods/relationships.ts');
  reconcileRegistryBirthdates(save);
  // 真实开局（总策划 11-11 03:21 / 05:12；C01 v5）：正式创角写 寿命.当前=开局年龄（characterInitialization），
  // 再按开局年对齐出生（出生=开局年−开局年龄=200），最后与正式新建一样开寿命缓存。
  // 最小档自带的默认寿命 18 不能留着，否则 alignBirthWithStartYear 优先取它，出生被写成 202。
  save.角色.属性.寿命.当前 = age;
  if (!init.alignBirthWithStartYear(save, age)) throw Error('alignBirthWithStartYear failed');
  enableLifespanCache(save);
  const trace = [];
  for (let n = 0; n < 100; n++) {
    const rt = save.世界.状态.剧本模组;
    const event = runtime.getScenarioFocusEvent(rt);
    if (event?.id === 'lcq.event.s02_04') {
      if (beforeWuyuan) {
        save.元数据.存档名 = 'C01验收-焦土后进五原前-220年';
        return { save, trace };
      }
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
      save.元数据.存档名 = '当前构建新档-五原为奴s02_04前-224年';
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
  console.log('load check', JSON.stringify(await assertRealOpeningAfterLoad(save, 'current-prologue-before-s02_04')));
  const dir = 'tests/fixtures/checkpoints'; await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/current-prologue-before-s02_04.json`, JSON.stringify({ type: 'saves', saves: [{ 存档名: save.元数据.存档名, 存档数据: save }] }, null, 2) + '\n');
  await writeFile(`${dir}/current-prologue-before-s02_04.trace.json`, JSON.stringify(trace, null, 2) + '\n');
  console.log('generated checkpoint', save.元数据.时间, trace.length);
}
