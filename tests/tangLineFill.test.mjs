// 唐线补全（剧情策划 2026-10-28 五线补全·唐 T1–T24；用户 2026-10-28 01:26 授权）：用真实关卡数据跑引擎，
// 证明默认路线上唐线三关（长安初定、长安插曲、尸陀林）每拍都会被激活、按 rail 原著序完成并收到 stage_ready；
// 长安初定新首章「留仙坪」、长安插曲新首章「佛门暗潮与元正朝会」是 rail 章，原 rail 章的非 rail 拍随迁（不随迁就永远不激活）；侧栏章名按拍分。
// 线卡逐步推进见 lineCompassAxisOrder.test.mjs。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const stageOf = id => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${id}.json`, 'utf8'));
const railOf = id => CANON_RAIL_PROFILES.find(p => p.modId === id);
const lyg = id => `lyg.event.${id}`;
const [CB, CI, ST] = ['lyg.changgan_begins', 'lyg.changgan_interlude', 'lyg.shituolin_endgame'];

/** 跟着主线（rail 拍优先）逐拍完成；记下完成顺序、每拍完成前的活跃事件，以及是否 stage_ready。 */
function playthrough(stageId) {
  const mod = stageOf(stageId);
  const rail = railOf(stageId).orderedEventIds;
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = stageId;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  progress.nextStageId = 'NEXT';
  const order = [];
  const activeBefore = new Map();
  let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  for (let turn = 1; turn <= 160; turn++) {
    const runtime = save.世界.状态.剧本模组;
    if (runtime.nextStageReadyId) return { ready: true, order, activeBefore };
    const active = [...(runtime.activeEventIds || [])];
    if (!active.length) break;
    const pick = active.find(id => rail.includes(id)) || active[0];
    activeBefore.set(pick, active);
    const event = mod.scenario.events.find(e => e.id === pick);
    for (const c of event.completion) runtime.flags[c.path.slice('flags.'.length)] = c.value;
    order.push(pick);
    runtime.worldTurn += 1;
    save = rtm.advanceScenarioRuntime(save).saveData;
  }
  return { ready: false, order, activeBefore };
}

const LIUXIANPING = ['tang_liuxianping_arrive', 'tang_liuxianping_xiangshi', 'changgan_fanseng_hunt'].map(lyg);
const BUDDHIST = ['north_bureau_buddhist_moves', 'honglusi_amends', 'cien_red_lotus', 'yuanzheng_globe', 'xuanping_eunuch_murder',
  'survey_xingqing_palace', 'prince_injury_control', 'shuixiang_lure_setup', 'spot_poison_assassin', 'poolside_capture',
  'blast_moni_temple', 'xinyong_reveals_fanmi', 'interrogate_feiniao_yingzi'].map(lyg);
const TAIL = ['liang_secret_order', 'zhoufei_conspiracy', 'feiniao_hilt_clue'].map(lyg);
const FILLED = {
  [CB]: [...LIUXIANPING, lyg('qinglongsi_te_master')],
  [CI]: [...BUDDHIST, lyg('song_tongwen'), lyg('tang_secret_treaty_signed'), lyg('honglusi_treaty_announced'), ...TAIL],
  [ST]: [lyg('shituolin_endgame_title_daduhu')],
};

for (const [stageId, ids] of Object.entries(FILLED)) {
  test(`唐线补全：${stageId} 跟着主线走，补上的拍逐一激活、按 rail 序完成，最后 stage_ready`, () => {
    const out = playthrough(stageId);
    assert.equal(out.ready, true, `${stageId} 走不到 stage_ready（完成 ${out.order.length} 拍）`);
    const rail = railOf(stageId).orderedEventIds;
    assert.deepEqual(out.order.filter(id => rail.includes(id)), rail, 'rail 拍按 rail 序逐一完成');
    const bound = new Set(stageOf(stageId).scenario.chapters.flatMap(c => c.eventIds || []));
    for (const id of ids) {
      assert.ok(out.order.includes(id), `${id} 被激活并完成`);
      assert.ok(bound.has(id) && rail.includes(id), `${id} 挂章且在 rail 上`);
    }
  });
}

test('唐线补全：rail 插入位置按原著序——留仙坪三拍（1059–1061）在 s03_01 之前、青龙寺接 s03_09；佛门暗潮 13 拍在 01 之前；通问计议使、密约谈定、和约公布、甘露前夜三拍、受封大都护各就其位', () => {
  const short = stageId => railOf(stageId).orderedEventIds.map(id => id.split('.').pop());
  assert.deepEqual(short(CB), ['tang_liuxianping_arrive', 'tang_liuxianping_xiangshi', 'changgan_fanseng_hunt',
    ...['01', '02', '03', '04', '05', '06', '07', '08', '09'].map(n => `s03_${n}`), 'qinglongsi_te_master']);
  assert.deepEqual(short(CI), [...BUDDHIST.map(id => id.split('.').pop()),
    'changgan_interlude_01_beat', 'changgan_interlude_02_beat', 'changgan_interlude_03_beat', 'song_tongwen', 'changgan_interlude_04_beat',
    'tang_secret_treaty_signed', 'changgan_interlude_05_beat', 'changgan_interlude_06_beat', 'changgan_interlude_07_beat', 'changgan_interlude_08_beat',
    'honglusi_treaty_announced', 'changgan_interlude_09_beat', 'changgan_interlude_10_beat', ...TAIL.map(id => id.split('.').pop())]);
  assert.deepEqual(short(ST).slice(12, 15), ['shituolin_endgame_13_beat', 'shituolin_endgame_title_daduhu', 'shituolin_endgame_14_beat']);
  // 长安插曲、尸陀林两关 rail 的 axisSeq 全程不倒序；长安初定只有青龙寺（1096）一处，比下一关首拍北司佛门（1093）晚，属跨关小倒序（待核）
  const seqs = stageId => railOf(stageId).orderedEventIds.map(id => stageOf(stageId).scenario.events.find(e => e.id === id).axisSeq);
  for (const stageId of [CB, CI, ST]) {
    const s = seqs(stageId);
    assert.ok(s.every((x, i) => i === 0 || s[i - 1] <= x), `${stageId} rail 的 axisSeq 不倒序：${s.join(',')}`);
  }
  assert.ok(seqs(CB).at(-1) > seqs(CI)[0], '青龙寺（1096）> 北司佛门（1093）：跨关小倒序如实钉住，待正典确认');
});

test('唐线补全：长安初定首章「留仙坪」是 rail 章，开关第一拍是抵留仙坪；灞桥章接在它之后；原灞桥章两条非 rail 拍随迁——小紫的说法番僧猎杀完成后才开放，蛇夫人登场卡照旧不加门；侧栏章名按拍分', () => {
  const mod = stageOf(CB);
  const [lxp, bq] = mod.scenario.chapters;
  assert.equal(lxp.id, 'lyg.chapter.changgan_begins_liuxianping');
  assert.equal(lxp.title, '留仙坪');
  assert.equal(rtm.getInitialScenarioChapterId(mod), lxp.id);
  assert.equal(railOf(CB).chapterId, lxp.id, 'runtime 只在 rail 章里激活 rail 拍');
  assert.deepEqual(bq.activation, [{ path: 'flags.chapter.lyg.changgan_begins.liuxianping.done', operator: 'eq', value: true }]);
  const out = playthrough(CB);
  assert.equal(out.order[0], lyg('tang_liuxianping_arrive'));
  const [SHEFUREN, XIAOZI] = [lyg('debut_shefuren'), lyg('xiaozi_teleported_into_dayanta')];
  for (const id of [SHEFUREN, XIAOZI]) assert.ok(lxp.eventIds.includes(id) && !bq.eventIds.includes(id), `${id} 随 rail 章迁到留仙坪章`);
  assert.deepEqual(mod.scenario.events.find(e => e.id === XIAOZI).conditions, [{ path: 'flags.event.changgan_fanseng_hunt.done', operator: 'eq', value: true }]);
  for (const id of LIUXIANPING) assert.ok(!out.activeBefore.get(id).includes(XIAOZI), `${id} 时小紫的说法还没开放`);
  assert.ok(out.activeBefore.get(lyg('s03_01')).includes(XIAOZI), '番僧猎杀完成（原灞桥章开章）后小紫的说法开放');
  // 蛇夫人登场卡：debutCardGating 欠账，门要按卡面依托的那一拍定，本次不加；与改前一样关一开即开放
  assert.deepEqual(mod.scenario.events.find(e => e.id === SHEFUREN).conditions, []);
  assert.ok(out.activeBefore.get(LIUXIANPING[0]).includes(SHEFUREN));
  assert.deepEqual([...view.LIUXIANPING_EVENT_IDS].sort(), [...LIUXIANPING].sort(), '章名表与关卡数据同步');
  for (const id of lxp.eventIds) assert.equal(view.storyChapterTitle(CB, id, lxp.title), LIUXIANPING.includes(id) ? '留仙坪' : '抵达长安灞桥');
  for (const id of bq.eventIds) assert.equal(view.storyChapterTitle(CB, id, lxp.title), '抵达长安灞桥');
  // 开场改到留仙坪：不再写抵灞桥、不再开场即解禁杨玉环／潘金莲／袁天罡
  assert.match(mod.scenario.opening.text, /留仙坪/);
  assert.doesNotMatch(mod.scenario.opening.text, /灞桥|杨玉环|潘金莲|袁天罡/);
  assert.deepEqual(mod.scenario.opening.featuredCharacterIds, ['liuchao.character.cheng_zongyang', 'liuchao.character.gao_zhishang']);
  assert.equal(mod.scenario.opening.locationId, 'lyg.location.liuxianping');
  const town = mod.canon.locations.find(l => l.id === 'lyg.location.liuxianping');
  assert.equal(town?.name, '留仙坪');
  assert.deepEqual(town?.coordinates, { x: 3600, y: 3400 });
  for (const id of LIUXIANPING) assert.equal(mod.scenario.events.find(e => e.id === id).locationId, 'lyg.location.liuxianping', id);
});

test('唐线补全：长安插曲首章「佛门暗潮与元正朝会」是 rail 章；年节与朝局接在它之后、甘露前夜接失踪与伏击；佛堂善母登场卡随迁、照旧关一开即开放；侧栏章名按拍分', () => {
  const mod = stageOf(CI);
  const [buddhist, court, ambush, tail] = mod.scenario.chapters;
  assert.deepEqual([buddhist.id, court.id, ambush.id, tail.id], ['buddhist', 'court', 'ambush', 'tail'].map(s => `lyg.chapter.changgan_interlude_${s}`));
  assert.equal(rtm.getInitialScenarioChapterId(mod), buddhist.id);
  assert.equal(railOf(CI).chapterId, buddhist.id);
  assert.deepEqual(court.activation, buddhist.completion);
  assert.deepEqual(tail.activation, ambush.completion);
  assert.deepEqual(buddhist.eventIds, [...BUDDHIST, lyg('debut_daiqisi')]);
  assert.deepEqual(tail.eventIds, TAIL);
  const out = playthrough(CI);
  assert.equal(out.order[0], lyg('north_bureau_buddhist_moves'));
  assert.deepEqual(mod.scenario.events.find(e => e.id === lyg('debut_daiqisi')).conditions, [], 'debutCardGating 欠账，本次不加门');
  assert.ok(out.activeBefore.get(lyg('north_bureau_buddhist_moves')).includes(lyg('debut_daiqisi')), '与改前一样关一开即开放（不随迁就永远不激活）');
  for (const [title, ids] of view.CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS) {
    const chapter = mod.scenario.chapters.find(c => c.title === title);
    assert.deepEqual([...ids].sort(), [...chapter.eventIds].sort(), `${title} 章名表与关卡数据同步`);
    for (const id of ids) assert.equal(view.storyChapterTitle(CI, id, buddhist.title), title);
  }
  for (const id of BUDDHIST) assert.equal(view.storyChapterTitle(CI, id, buddhist.title), '佛门暗潮与元正朝会');
});

test('唐线补全：新建四拍 axisId 待补轴、critical、人物地点在本关 canon、有本地完成合同；抵留仙坪没走过汉线时出行商版', () => {
  const NEW = {
    [CB]: [['tang_liuxianping_arrive', 1059, '#49·白娃'], ['tang_liuxianping_xiangshi', 1060, '#50·相士']],
    [CI]: [['tang_secret_treaty_signed', 1139, '#98·押注'], ['honglusi_treaty_announced', 1160, '#109·濯足']],
  };
  for (const [stageId, list] of Object.entries(NEW)) {
    const mod = stageOf(stageId);
    for (const [id, seq, anchor] of list) {
      const event = mod.scenario.events.find(e => e.id === lyg(id));
      assert.ok(event, id);
      assert.equal(event.axisId, null, `${id}：canon 轴待补，不猜造`);
      assert.equal(event.axisMethod, 'tang-line-fill-axis-pending');
      assert.equal(event.axisSeq, seq, id);
      assert.equal(event.axisAnchor, `六朝燕歌行·${anchor}`);
      assert.equal(event.critical, true);
      if (event.locationId) assert.ok(mod.canon.locations.some(l => l.id === event.locationId), `${id} 地点在本关 canon`);
      for (const c of event.relatedCharacterIds) assert.ok(mod.canon.characters.some(x => x.id === c), `${id} 人物 ${c} 在本关 canon`);
      assert.equal(event.playerCompletionContract.kind, 'objective_action');
      assert.equal(mod.scenario.initialFlags[event.completion[0].path.slice('flags.'.length)], false, `${id} 完成旗有初值`);
    }
  }
  // 镇上相士带上袁天罡：完成后相识账记 encountered，「进长安，先找个宅子住下」那步的 when 才成立
  assert.ok(stageOf(CB).scenario.events.find(e => e.id === lyg('tang_liuxianping_xiangshi')).relatedCharacterIds.includes('liuchao.character.yuan_tiangang'));
  const t1 = stageOf(CB).scenario.events.find(e => e.id === lyg('tang_liuxianping_arrive'));
  const rt = done => ({ chronicle: done.map((id, i) => ({ id: `chronicle.lyg.han_succession.${id}`, type: 'event', stageId: 'lyg.han_succession', sequence: i + 1 })) });
  const han = view.resolveScenarioEventNarrative(t1, {}, undefined, rt([lyg('han_succession_10_beat')]));
  assert.match(han.description, /多留一日/);
  assert.match(han.description, /周飞/);
  const merchant = view.resolveScenarioEventNarrative(t1, {}, undefined, rt([]));
  assert.match(merchant.description, /行商身份/);
  assert.match(merchant.objective, /江湖人/);
  assert.doesNotMatch(`${merchant.description}\n${merchant.objective}\n${merchant.axisBeat}`, /不得写出|周飞|廖群玉|汪臻|贾师宪/);
  const t2 = stageOf(CB).scenario.events.find(e => e.id === lyg('tang_liuxianping_xiangshi'));
  assert.match(t2.description, /试探着问此间是否有危险/);
  assert.match(t2.description, /神色有异/);
  assert.doesNotMatch(t2.description, /此间有危险，也可能有回去的办法/);
  const fanseng = stageOf(CB).scenario.events.find(e => e.id === lyg('changgan_fanseng_hunt'));
  assert.equal(fanseng.name, '主家小姐的旧事');
  assert.match(fanseng.description, /不知道番僧是否专冲穿越者/);
  assert.doesNotMatch(`${fanseng.description}\n${fanseng.axisBeat}\n${fanseng.objective}`, /猎杀穿越者/);
  const rail = railOf(CB);
  const contract = id => rail.contracts.find(c => c.eventId === lyg(id));
  assert.match(contract('tang_liuxianping_arrive').mustReach, /多留一日/);
  assert.ok(contract('tang_liuxianping_arrive').forbiddenInCanon.includes('行商入唐写成舞阳侯、汉使身份、舞都或汉国随行'));
  assert.match(contract('changgan_fanseng_hunt').mustReach, /不知道番僧是否专冲穿越者/);
  assert.ok(contract('changgan_fanseng_hunt').forbiddenInCanon.includes('坐实番僧专门猎杀穿越者'));
  assert.doesNotMatch(contract('changgan_fanseng_hunt').allowedElaboration, /不得改写番僧猎杀/);
});
