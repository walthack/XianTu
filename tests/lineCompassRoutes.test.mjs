// 右栏「当前线」卡·分路线与进度兜底（真机 1f9f24127b4e 报告卡-05；总策划定）。
// ① 线的下一步表里凡有分路线的步（03／03b、05／04b 同序号拍、06／05b、lin_an_black_sea／lin_an_bridge、luoyang_coup／han_palace_endgame、
//    shixiang_ambush／changgan_interlude；前者是默认路线隔离关），完成条件改成 { anyOf: [...] }：任一路线的对应事件完成即算；
// ② 兜底：后面某一步已过，前面的步一律算过，进度只往前走；
// ③ 旧档情境回归：走 03b 的存档在碧鲮族、鬼王峒外围、鬼王宫时，卡片不能再停在「随商队出五原，往南荒去」。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const { validateLineCompassTable } = await loadTs('../src/modules/scenarioMods/validator.ts');
const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const texts = packs.CONTENT_PACKS.texts;
const places = packs.CONTENT_PACKS.lineCompassPlaces;

const S02 = 'lcq.stage_02', S03 = 'lcq.stage_03', S03B = 'lcq.stage_03b_snake_flower_bridge', S04 = 'lcq.stage_04', S04B = 'lcq.stage_04b_lingfei_baiyi_crisis', S05B = 'lcq.stage_05b';
const STUCK = texts['lineCompass.nanhuang.step.nh_enter_caravan'];
const stageEvents = stageId => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${stageId}.json`, 'utf8')).scenario.events;
const eventStage = new Map(fs.readdirSync('src/modules/scenarioMods/builtins/data').filter(f => f.endsWith('.json'))
  .flatMap(f => { const d = JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${f}`, 'utf8')); return (d.scenario?.events || []).map(e => [e.id, d.manifest.id]); }));

/** 整关事件（文件顺序）；before＝只取原著序号小于它的拍（存档停在那一拍之前）。 */
const played = (stageId, before = Infinity) => stageEvents(stageId).filter(e => before === Infinity || (typeof e.axisSeq === 'number' && e.axisSeq < before)).map(e => [stageId, e.id]);
/** fake＝表夹具里的假事件 id，挂进本关 events 才算事件（编年史只认已知事件）。 */
const saveOf = ({ modId, done, fake = false }) => ({
  角色: { 属性: { 境界: { 名称: '生象', 阶段: '初期' } } },
  世界: { 状态: { 剧本模组: {
    modId, events: fake ? done.map(([, id]) => ({ id })) : [], completedEventIds: [], flags: {}, acquaintances: {},
    chronicle: done.map(([stageId, eventId], i) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence: i + 1 })),
  } } },
});
const view = (save, focusEventId, extra = {}) => compass.lineCompassView(save, { focusEventId, compassPointer: () => '去某处 · 见某人', ...extra });
const returnTo = eventId => texts[compass.LINE_COMPASS_RETURN_KEY].split(compass.LINE_COMPASS_PLACE_SLOT).join(places[eventId]);

// 默认路线：02 → 03b → 04 → 04b → 05b（03、05、06 隔离）；编年史里没有 s03_12
const DEFAULT_ROUTE_SOUTH = [...played(S02), ...played(S03B), ...played(S04)];

test('旧档情境（03b 路线、编年史无 s03_12）：碧鲮族／鬼王峒外围／鬼王宫三处不再停在「随商队出五原，往南荒去」', () => {
  const cases = [
    // 6ccb-08-F07前：南荒·碧鲮族（第80章·碧鲮前路），04b 走到焚村那拍（biling_bay_stance，seq 139）之前
    { slot: '6ccb-08-F07前', modId: S04B, done: [...DEFAULT_ROUTE_SOUTH, ...played(S04B, 139)], step: returnTo('lcq.event.s05_16') },
    // 1aae-02-F10前：鬼王峒外围哨位（第86章·随弥骨入峒），同行之约已结、尚未随弥骨入峒（enter_dong_with_migu，seq 154）
    { slot: '1aae-02-F10前', modId: S04B, done: [...DEFAULT_ROUTE_SOUTH, ...played(S04B, 154)], step: texts['lineCompass.nanhuang.step.nh_guiwang_approach'] },
    // 1aae-05-F13前：南荒·鬼王宫，05b 走到祭台吞王（ghost_king_swallowed，seq 205）之前
    { slot: '1aae-05-F13前', modId: S05B, done: [...DEFAULT_ROUTE_SOUTH, ...played(S04B), ...played(S05B, 205)], step: returnTo('lcq.event.slay_dragon') },
  ];
  for (const c of cases) {
    assert.ok(!c.done.some(([, id]) => id === 'lcq.event.s03_12'), `${c.slot}：情境里没有 s03_12`);
    const v = view(saveOf(c), undefined);
    assert.equal(v.current?.lineId, 'nanhuang', `${c.slot}：当前线仍是南荒`);
    assert.notEqual(v.current.step, STUCK, `${c.slot}：不再卡在第一步`);
    assert.equal(v.current.step, c.step, c.slot);
  }
});

test('第一步：铁索桥后、到蛇彝村前照常显示；到蛇彝村后两条路线都能过（03 的 s03_12 或 03b 首拍）', () => {
  const base = played(S02);
  assert.equal(view(saveOf({ modId: S02, done: base }), undefined).current.step, STUCK, '还没到蛇彝村');
  for (const [stageId, eventId] of [[S03, 'lcq.event.s03_12'], [S03B, 'lcq.event.s03b_snake_flower_bridge_01']]) {
    const step = view(saveOf({ modId: stageId, done: [...base, [stageId, eventId]] }), undefined).current.step;
    assert.notEqual(step, STUCK, `${eventId} 完成即过第一步`);
    assert.notEqual(step, texts['lineCompass.nanhuang.step.nh_sheyi_village'], '蛇彝村那一步同样按任一路线算过');
  }
});

test('anyOf：组内任一条满足即成立；when／until／knownWhen 都认', () => {
  const D = id => ({ path: `done.lcq.event.${id}`, operator: 'eq', value: true });
  const table = { version: 1, lines: [{ lineId: 'nanhuang', nameKey: 'n', knownWhen: [{ anyOf: [D('k1'), D('k2')] }], steps: [
    { id: 'a', hintKey: 'k.a', until: [{ anyOf: [D('x1'), D('x2')] }] },
    { id: 'b', hintKey: 'k.b', when: [{ anyOf: [D('w1'), D('w2')] }], until: [D('y')] },
    { id: 'c', hintKey: 'k.c' },
  ] }] };
  const tx = { n: '南荒', 'k.a': 'A', 'k.b': 'B', 'k.c': 'C' };
  const at = done => view(saveOf({ modId: S04B, fake: true, done: done.map(id => [S04B, `lcq.event.${id}`]) }), undefined, { table, texts: tx }).current?.step;
  assert.equal(at([]), undefined, 'knownWhen 组都不满足：线未知');
  assert.equal(at(['k2']), 'A');
  assert.equal(at(['k2', 'x2']), 'C', 'until 组任一满足即过；b 的 when 组不满足跳过');
  assert.equal(at(['k1', 'x1', 'w2']), 'B', 'when 组任一满足即轮到');
});

test('兜底：后面某一步已过，前面的步一律算过（进度只往前走）；draft／pending 步不作数', () => {
  const D = id => ({ path: `done.lcq.event.${id}`, operator: 'eq', value: true });
  const table = { version: 1, lines: [{ lineId: 'nanhuang', nameKey: 'n', knownWhen: [D('known')], steps: [
    { id: 'a', hintKey: 'k.a', until: [D('never')] },
    { id: 'b', hintKey: 'k.b', until: [D('mid')] },
    { id: 'p', pending: true, note: '待建', eventId: 'lcq.event.late', hintKey: 'k.p' },
    { id: 'c', hintKey: 'k.c', until: [D('end')] },
  ] }] };
  const tx = { n: '南荒', 'k.a': 'A', 'k.b': 'B', 'k.p': 'P', 'k.c': 'C' };
  const at = done => view(saveOf({ modId: S04B, fake: true, done: ['known', ...done].map(id => [S04B, `lcq.event.${id}`]) }), undefined, { table, texts: tx }).current?.step;
  assert.equal(at([]), 'A');
  assert.equal(at(['mid']), 'C', 'b 已过 → a 算过，不再等走不到的那一路');
  assert.equal(at(['late']), 'A', 'pending 步运行时跳过，它的事件不推进度');
  assert.equal(at(['end']), '', '最后一步已过：没有下一步（只显示线名）');
});

test('validator：anyOf 组至少两条、只许账本条件、不嵌套、不带其他字段，问题路径指到组内具体位置；仓库表无问题', () => {
  const D = id => ({ path: `done.lcq.event.${id}`, operator: 'eq', value: true });
  const line = steps => ({ version: 1, lines: [{ lineId: 'nanhuang', nameKey: 'n', steps }] });
  const issues = table => validateLineCompassTable(table, { n: '南荒', 'k.a': '去看看' }).map(i => `${i.code}@${i.path}`);
  assert.deepEqual(issues(line([{ id: 'a', hintKey: 'k.a', until: [{ anyOf: [D('s03_12'), D('s03b_snake_flower_bridge_01')] }] }])), []);
  assert.deepEqual(issues(line([{ id: 'a', hintKey: 'k.a', until: [{ anyOf: [D('s03_12')] }] }])), ['invalid_type@lineCompass.lines[0].steps[0].until[0].anyOf']);
  assert.deepEqual(issues(line([{ id: 'a', hintKey: 'k.a', until: [{ anyOf: [D('s03_12'), { anyOf: [D('s03_12'), D('s03_12')] }] }] }])), ['invalid_type@lineCompass.lines[0].steps[0].until[0].anyOf[1]']);
  assert.deepEqual(issues(line([{ id: 'a', hintKey: 'k.a', when: [D('s03_12'), { anyOf: [D('s03_12'), { path: 'flags.x', operator: 'eq', value: true }] }] }])), ['ledger_only@lineCompass.lines[0].steps[0].when[1].anyOf[1].path']);
  assert.deepEqual(issues(line([{ id: 'a', hintKey: 'k.a', until: [{ anyOf: [D('s03_12'), D('no_such_event')], note: 'x' }] }])).sort(),
    ['missing_reference@lineCompass.lines[0].steps[0].until[0].anyOf[1].path', 'unknown_field@lineCompass.lines[0].steps[0].until[0].note'].sort());
  assert.deepEqual(validateLineCompassTable(compass.lineCompassTable(), texts, places), []);
});

test('仓库表：引用默认路线隔离关事件的正式步，都带上默认路线的对应事件（anyOf）；完成事件在隔离关的步必须写 until', () => {
  const quarantined = id => DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(eventStage.get(id));
  const doneIds = conds => (conds || []).map(c => (c.anyOf ? c.anyOf : [c]).filter(x => x.path.startsWith('done.')).map(x => x.path.slice(5))).filter(g => g.length);
  const problems = [];
  for (const line of compass.lineCompassTable().lines) {
    for (const step of line.steps) {
      if (step.pending || step.draft) continue;
      for (const field of ['when', 'until']) {
        for (const group of doneIds(step[field])) if (group.every(quarantined)) problems.push(`${line.lineId}.${step.id}.${field}: ${group.join('|')}`);
      }
      if (step.eventId && quarantined(step.eventId) && !step.until?.length) problems.push(`${line.lineId}.${step.id}: eventId ${step.eventId} 在隔离关却没写 until`);
    }
    for (const group of doneIds(line.closedWhen)) if (group.every(quarantined)) problems.push(`${line.lineId}.closedWhen: ${group.join('|')}`);
  }
  assert.deepEqual(problems, []);
});

test('唐 R-11／R-12（总策划定）：tang_d7_publish 暂不挂锚（pending），tang_shifang_public_enemy 挪到它后面；鸿胪寺补救（默认路线）或 s11（隔离路线）后显示「去大明宫赴元正朝会」', () => {
  const tang = compass.lineCompassTable().lines.find(line => line.lineId === 'tang');
  const ids = tang.steps.map(step => step.id);
  const publish = tang.steps.find(step => step.id === 'tang_d7_publish');
  assert.equal(publish.pending, true);
  assert.equal(publish.eventId, undefined, '鸿胪寺公布和约事件待补（建议 lyg.event.honglusi_treaty_announced），补上前不挂锚');
  assert.ok(ids.indexOf('tang_d7_publish') < ids.indexOf('tang_shifang_public_enemy') && ids.indexOf('tang_shifang_public_enemy') < ids.indexOf('tang_ganlu_zhuhuan'));
  assert.ok(!tang.steps.some(step => step.eventId === 'lyg.event.honglusi_amends'), '第673章鸿胪寺补救不再当后面的锚');
  const ENVOYS = texts['lineCompass.tang.step.tang_envoys_reunion'];
  const at = ids => view(saveOf({ modId: 'lyg.changgan_interlude', done: ids.map(id => [eventStage.get(id), id]) }), undefined).current;
  const base = ['lcq.event.sudaji_south_pact', 'lyg.event.s03_01', 'lyg.event.changgan_fanseng_hunt'];
  for (const opener of ['lyg.event.honglusi_amends', 'lyg.event.shixiang_s11']) {
    const card = at([...base, opener]);
    assert.equal(card?.lineId, 'tang', opener);
    assert.equal(card.step, ENVOYS, `${opener} 之后：元正朝会不再被兜底跳过`);
  }
  assert.notEqual(at([...base, 'lyg.event.honglusi_amends', 'lyg.event.yuanzheng_globe']).step, ENVOYS, '朝会过了就不再显示');
});

test('宋 R-13 → 五线补全·宋 S1（2026-10-28）：song_linan_arrive 改挂默认路线新首拍「入钱塘门，风波亭」，与隔离关 debut_ruan_sisters 分路线 anyOf；尾随／武穆王府／皇城司已上 rail 排在抵达之后，第二次拜祭谢艺（#71）不算', () => {
  const step = compass.lineCompassTable().lines.find(line => line.lineId === 'song').steps.find(s => s.id === 'song_linan_arrive');
  const [S1, ALT] = ['lyl.event.linan_arrive_fengbo', 'lyl.event.debut_ruan_sisters'];
  assert.equal(step.eventId, S1);
  assert.deepEqual(step.until, [{ anyOf: [S1, ALT].map(id => ({ path: `done.${id}`, operator: 'eq', value: true })) }]);
  assert.equal(eventStage.get(S1), 'lyl.lin_an_bridge', 'S1 在默认路线关');
  assert.ok(DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(eventStage.get(ALT)), 'debut_ruan_sisters 在隔离关，只作分路线承接');
  const pointer = '去某处 · 见某人';
  const base = ['lcq.event.sudaji_south_pact', 'lyl.event.s01_01', 'lyl.event.s01_02'];
  const at = extra => view(saveOf({ modId: 'lyl.lin_an_bridge', done: [...base, ...extra].map(id => [eventStage.get(id), id]) }), step.eventId).current;
  assert.equal(at([]).step, pointer, '刚到临安：停在这一步');
  for (const id of [S1, ALT]) assert.notEqual(at([id]).step, pointer, `${id} 完成即过`);
  assert.equal(at(['lyl.event.lin_an_bridge_xieyi_tomb']).step, pointer, '第二次拜祭谢艺不再承接抵达临安');
});
