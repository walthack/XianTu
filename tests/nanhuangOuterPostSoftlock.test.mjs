// 回归：山涧一战（f03）输了并逃脱后，「随弥骨进入鬼王峒」这一拍要先去外围哨位打拦路守卫（combat.f03.escape_followup）。
// 2026-11-12 整链浏览器长跑发现这里是死路（迁移前基线同样复现）：
//   1. 外围哨位不在南荒行旅账的 zone 表里，回合收尾的位置兜底把人拉回强制路途终点（鬼王峒），永远到不了；
//   2. 任务模式下日志与地图标记仍指「鬼王峒」（人已在），界面上没有任何地方告诉玩家要去哨位，照日志打字也不认。
// 状态用 tests/mainlineWalker.mjs 从正式新档走到这一拍，再置 scene.f03.escaped（walker 不打场面，默认路线没有这个旗）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
import { withFixedHost, loadMainlineMods, formalNewSave, step, rt } from './mainlineWalker.mjs';

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const Q = await loadTs('../src/modules/scenarioMods/questLog.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const quiet = fn => { const k = ['log', 'info', 'warn'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const BEAT = 'lcq.event.enter_dong_with_migu';
const POST = 'lcq.location.guiwang_outer_post';
const TRAVEL = `travel:${POST}`;

test('f03 逃脱后进鬼王峒：外围哨位走得到、日志与标记指到哨位、照日志打「去X」即走，这一拍能做完', { timeout: 120000 }, async () => {
  await withFixedHost(async () => {
    const mods = await loadMainlineMods();
    let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    let n = 0;
    for (; n < 400 && R.getScenarioFocusEvent(rt(save))?.id !== BEAT; n++) save = quiet(() => step(save, mods, n)).save;
    assert.equal(R.getScenarioFocusEvent(rt(save))?.id, BEAT, 'walker 应走到进鬼王峒这一拍');
    rt(save).flags['scene.f03.escaped'] = true;
    const actions = () => quiet(() => R.getCurrentStoryEventActions(save)).filter(a => a.eventId === BEAT).map(a => a.actionId);
    assert.deepEqual(actions(), [TRAVEL], '逃脱后这一拍先要去外围哨位');

    // 任务模式：日志地点与地图标记跟着引擎要去的地方；照日志地点打「去X」本地认作这条出行。
    const quest = GAME_NUMBERS.story.quest, prev = quest.enabled;
    quest.enabled = true;
    try {
      const place = Q.locationName(POST);
      assert.ok(place);
      assert.equal(quiet(() => Q.questLogView(save, mods)).current.find(e => e.key === BEAT)?.place, place);
      assert.deepEqual(quiet(() => Q.questMarkers(save, mods)).filter(m => m.key === BEAT).map(m => m.locationId), [POST]);
      const hit = quiet(() => BP.resolveBeatText(save, `去${place}`, mods));
      assert.equal(hit?.action.kind === 'event' && hit.action.selection.actionId, TRAVEL);
      quest.enabled = false;
      assert.equal(quiet(() => BP.resolveBeatText(save, `去${place}`, mods)), undefined, '开关关不加这条比对行');
    } finally { quest.enabled = prev; }

    // 走过去以后不被拉回：下一步能看到哨位的动作，随后整拍做完。
    save = quiet(() => step(save, mods, n++)).save;
    assert.ok(actions().includes('fight_outer_sentry_intercept'), `到哨位后应能迎击拦路守卫，实际 ${JSON.stringify(actions())}`);
    for (let i = 0; i < 12 && !rt(save).completedEventIds.includes(BEAT) && rt(save).modId === 'lcq.stage_04b_lingfei_baiyi_crisis'; i++) save = quiet(() => step(save, mods, n++)).save;
    assert.ok(rt(save).completedEventIds.includes(BEAT) || rt(save).modId !== 'lcq.stage_04b_lingfei_baiyi_crisis', '这一拍应能完成');
  });
});
