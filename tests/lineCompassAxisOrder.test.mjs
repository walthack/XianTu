// 右栏「当前线」卡·下一步表的原著顺序守门（剧情策划稿 §14.3-4；总策划定）。
// 同一条线里带 eventId 的正式步（非 pending／draft），按表顺序 axisSeq 不得倒序：每一步的 axisSeq 不小于它前面各步的最大值。
// 倒序的后果（lineCompass.ts 的「进度只往前走」兜底与「取第一条未过的步」）：
//   ① 后面那步的事件先完成 → 前面还没走到的步一律算过，带文案的提示被吞；
//   ② 前面那步的事件后完成 → 它一直被选中，挡住后面那步的提示。
// 例外逐条写明，查证时按默认路线的实际推进顺序（关链 nextStageId、关内 rail 顺序、条件链、eventReachability 欠账）：
//   ALLOWED＝核实过不吞带文案步的；KNOWN＝核实过确有影响、已汇报、待总策划定（不擅自改顺序）。
// 两张表都钉住「本步 seq < 前面最大 seq（那一步）」，数据一变就要重新核实；修好一处删一条。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const { CANON_RAIL_PROFILES, DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const { questCompassPhrases } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const texts = packs.CONTENT_PACKS.texts;
const places = packs.CONTENT_PACKS.lineCompassPlaces;

const DATA = 'src/modules/scenarioMods/builtins/data';
const stages = new Map(fs.readdirSync(DATA).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(`${DATA}/${f}`, 'utf8'))).map(d => [d.manifest.id, d]));
const allEvents = [...stages.values()].flatMap(d => (d.scenario?.events || []).map(e => ({ ...e, stageId: d.manifest.id })));
const axisSeq = new Map(allEvents.map(e => [e.id, e.axisSeq]));
const eventOf = new Map(allEvents.map(e => [e.id, e]));

const ALLOWED = {
  'nanhuang.nh_le_mingzhu_join': {
    at: '73 < 75（nh_f03_huamiao_mist）',
    why: 's04_03 乐明珠（73）在 s04_01 送亲疑点（75）之后才能触发：stage_04 条件链 s04_01 → s04_02 → s04_03，所以 s04_01 一定先完成，nh_f03_huamiao_mist 的提示照常显示到 s04_01 完成。',
  },
  'tang.tang_fanseng': {
    at: '1061 < 1066（tang_changan_yangyuhuan）',
    why: '番僧猎杀（changgan_fanseng_hunt）不在 changgan_begins rail、也没挂章（eventReachability 欠账），默认路线完成不了；前一步 tang_changan_yangyuhuan 的 s03_01 是本关 rail 第一拍，按焦点排序（rail 拍优先）挂章后也是它先完成，提示不会被吞。',
  },
};

// 原有三处（晋 jin_shanghou_cure_and_trade、汉 han_camera_palace_alt、太泉 tq_yinyang_fish）已按总策划定改顺序，回归测试见文末。
const KNOWN = {};
// 南荒 nh_leave_for_jin（219<222）已按 R-15（剧情策划稿 §15.2，总策划定）整步删掉，放行条目随之去掉；回归测试见文末。
// 晋 jin_palm_oath（300<308）已按五线补全·晋 J3（2026-10-28）挪到 jin_back_after_eagle 之后、掌誓挂章上 rail，放行条目随之去掉；回归测试见文末。

/** 每条线里倒序的步：本步 axisSeq 小于它前面各正式 eventId 步的最大值。 */
function inversions(table) {
  const found = {};
  for (const line of table.lines) {
    let max = null;
    for (const step of line.steps) {
      if (!step.eventId || step.pending || step.draft) continue;
      const seq = axisSeq.get(step.eventId);
      assert.equal(typeof seq, 'number', `${line.lineId}.${step.id}：${step.eventId} 没有 axisSeq`);
      if (max && seq < max.seq) found[`${line.lineId}.${step.id}`] = `${seq} < ${max.seq}（${max.id}）`;
      else max = { seq, id: step.id };
    }
  }
  return found;
}

test('下一步表：同一线带 eventId 的正式步按表顺序 axisSeq 不倒序；例外逐条写明原因，且钉住当前序号', () => {
  const pinned = Object.fromEntries([...Object.entries(ALLOWED), ...Object.entries(KNOWN)].map(([key, entry]) => [key, entry.at]));
  assert.deepEqual(inversions(compass.lineCompassTable()), pinned);
  for (const [key, entry] of [...Object.entries(ALLOWED), ...Object.entries(KNOWN)]) assert.ok(entry.why.length > 20, `${key} 要写明原因`);
  assert.ok(!Object.keys(ALLOWED).some(key => key in KNOWN), '同一处不能既放行又待定');
});

test('守门本身：倒序能查出来，pending／draft 步不参与', () => {
  const ev = id => `lcq.event.${id}`;
  const table = { version: 1, lines: [{ lineId: 'nanhuang', steps: [
    { id: 'a', eventId: ev('s04_01') },
    { id: 'p', eventId: ev('s05b_wuer_suli_depart'), pending: true },
    { id: 'b', eventId: ev('s04_03') },
    { id: 'c', eventId: ev('s04_06') },
  ] }] };
  assert.deepEqual(inversions(table), { 'nanhuang.b': '73 < 75（a）' });
});

// ── 回归：真实的 lineCompassView，按默认路线推进 ──
// 推进顺序：关链 nextStageId（跳过默认路线隔离关）；关内按章，章内 rail 拍优先、其余按 axisSeq（同 runtime getNarrativeAnchorEvent 的焦点排序）。
// 指南针句取右栏同一口径（RightSidebar.vue：questCompassPhrases 连成一句，canon 取当前关）。
const order = (x, y) => (x === y ? 0 : x - y);
function stageOrder(stageId) {
  const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId)?.orderedEventIds || [];
  const railAt = id => (rail.includes(id) ? rail.indexOf(id) : Infinity);
  return (stages.get(stageId).scenario.chapters || []).flatMap(c => [...(c.eventIds || [])]
    .sort((a, b) => order(railAt(a), railAt(b)) || order(axisSeq.get(a) ?? Infinity, axisSeq.get(b) ?? Infinity)));
}
/** 默认路线上 stageId 之前（不含）各关事件，按推进顺序。 */
function routeTo(stageId) {
  const done = [];
  for (let id = 'lcq.stage_01'; id !== stageId; id = stages.get(id).manifest.nextStageId) {
    assert.ok(id, `默认路线走不到 ${stageId}`);
    if (!DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(id)) done.push(...stageOrder(id));
  }
  return done;
}
const saveOf = (modId, done, acq = {}) => ({
  角色: { 属性: { 境界: { 名称: '生象', 阶段: '初期' } } },
  世界: { 状态: { 剧本模组: {
    modId, events: [], completedEventIds: [], flags: {}, acquaintances: acq,
    chronicle: done.map((id, i) => ({ id: `chronicle.${eventOf.get(id).stageId}.${id}`, type: 'event', stageId: eventOf.get(id).stageId, title: '', sequence: i + 1 })),
  } } },
});
const pointer = (modId, eventId) => (eventId
  ? questCompassPhrases(eventOf.get(eventId), { canon: stages.get(modId).canon, opening: stages.get(modId).scenario.opening }).join(' · ')
  : '');
const card = (modId, done, focusEventId, acq) =>
  compass.lineCompassView(saveOf(modId, done, acq), { focusEventId, compassPointer: () => pointer(modId, focusEventId) }).current;
const returnTo = eventId => texts[compass.LINE_COMPASS_RETURN_KEY].split(compass.LINE_COMPASS_PLACE_SLOT).join(places[eventId]);

test('晋（总策划定）：jin_shanghou_cure_and_trade 排在三版入口之前；00a 完成后返程期间显示对应那版「去建康…」，抵建康后不再显示', () => {
  const S07 = 'lcq.stage_07_qingyuan_jiankang';
  const [A, B, C] = ['lcq.event.s07_00a_shanghou_trading_house', 'lcq.event.s07_00b_return_north', 'lcq.event.s07_00c_arrive_jiankang'];
  const acq = { 'liuchao.character.shang_zhen_yu': { kind: 'encountered' }, 'liuchao.character.yun_cang_feng': { kind: 'encountered' } };
  const ARRIVE = ['jin_arrive_from_nanhuang', 'jin_arrive_icegu', 'jin_arrive_skip_nh'].map(id => texts[`lineCompass.jin.step.${id}`]);
  const cases = [
    { name: '走南荒、解了冰蛊（默认路线）', before: routeTo(S07), hint: ARRIVE[0] },
    { name: '走南荒、冰蛊没解（没走 05b）', before: routeTo('lcq.stage_05b'), hint: ARRIVE[1] },
    { name: '没走南荒（只到铁索桥）', before: routeTo('lcq.stage_03b_snake_flower_bridge'), hint: ARRIVE[2] },
  ];
  for (const { name, before, hint } of cases) {
    const at = (done, focus) => card(S07, [...before, ...done], focus, acq);
    assert.equal(at([], A)?.lineId, 'jin', name);
    assert.equal(at([], A).step, pointer(S07, A), `${name}：00a 当焦点，本步就是焦点 → 主线指南针`);
    for (const [done, focus] of [[[A], B], [[A], undefined], [[A, B], undefined]]) {
      assert.equal(at(done, focus).step, hint, `${name}：返程期间（完成 ${done.length} 拍、焦点 ${focus ?? '无'}）显示入口提示`);
    }
    assert.equal(at([A, B], C).step, pointer(S07, C), `${name}：00c 当焦点 → 主线指南针`);
    assert.ok(!ARRIVE.includes(at([A, B, C], undefined).step), `${name}：抵建康后入口提示不再显示`);
  }
});

test('汉（总策划定）：han_camera_palace_alt 排在 han_yuncangfeng_luodu 之前；afterfall_09 之后显示「进宫看看」，进洛都那一拍不再被兜底跳过', () => {
  const AF = 'lyl.taiquan_afterfall', LUO = 'lyl.luoyang_cloud_secret';
  const [A09, A10, S0501] = ['lyl.event.taiquan_afterfall_09_beat', 'lyl.event.taiquan_afterfall_10_beat', 'lyl.event.s05_01'];
  const PALACE = texts['lineCompass.han.step.han_camera_palace_alt'];
  const before = routeTo(AF), af = stageOrder(AF);
  const upTo = id => [...before, ...af.slice(0, af.indexOf(id))];
  assert.equal(pointer(AF, A10), '', 'afterfall_10 没有地点、只有主角：右栏指南针为空，用本步文案');
  const palace = card(AF, upTo(A10), A10);
  assert.equal(palace?.lineId, 'han');
  assert.equal(palace.step, PALACE, 'afterfall_09 之后、afterfall_10 当焦点：显示「进宫看看」');
  assert.notEqual(card(AF, upTo(A09), A09)?.step, PALACE, 'afterfall_09 之前不显示（when）');
  const luodu = card(LUO, [...before, ...af], S0501);
  assert.equal(luodu?.lineId, 'han');
  assert.equal(luodu.step, pointer(LUO, S0501), '进洛都：s05_01 当焦点 → 主线指南针，不再被兜底跳到下一拍的「回到洛都看看」');
  assert.notEqual(card(LUO, [...before, ...af, S0501], undefined)?.step, PALACE, 'afterfall_10 完成后不再显示');
});

test('太泉（总策划定）：tq_yinyang_fish 按关链排在 afterfall 各步之前；阴阳鱼反击后 afterfall 三步不被兜底跳过，tq_city_in_film 过了才出「找条路出古阵」', () => {
  const CC = 'lyl.taiquan_core_conflict', AF = 'lyl.taiquan_afterfall';
  const [YY, BEAST, A05, A06] = ['lyl.event.yin_yang_counter', 'lyl.event.xingyin_beast_traps', 'lyl.event.taiquan_afterfall_05_beat', 'lyl.event.taiquan_afterfall_06_beat'];
  const EXIT = texts['lineCompass.taiquan.step.tq_exit_to_han'];
  const cc = stageOrder(CC), af = stageOrder(AF), before = routeTo(CC);
  const yy = card(CC, [...before, ...cc.slice(0, cc.indexOf(YY))], YY);
  assert.equal(yy?.lineId, 'taiquan');
  assert.equal(yy.step, pointer(CC, YY), '阴阳鱼反击当焦点：本步就是焦点 → 主线指南针');
  const afterYY = [...before, ...cc.slice(0, cc.indexOf(YY) + 1)];
  assert.equal(card(CC, afterYY, cc[cc.indexOf(YY) + 1]).step, returnTo(BEAST), '阴阳鱼反击完成：下一步是 tq_beast_traps，不再跳到出古阵');
  // afterfall 关：tq_city_in_film（afterfall_05）完成之前，任何一拍都不提前显示「找条路出古阵」
  const until05 = af.slice(0, af.indexOf(A05) + 1);
  assert.ok(until05.includes(BEAST) && until05.includes('lyl.event.taiquan_afterfall_03_beat'));
  until05.forEach((id, i) => {
    for (const focus of [id, undefined]) {
      const c = card(AF, [...before, ...cc, ...af.slice(0, i)], focus);
      assert.equal(c?.lineId, 'taiquan', `${id} 之前（焦点 ${focus ?? '无'}）`);
      assert.notEqual(c.step, EXIT, `${id} 之前（焦点 ${focus ?? '无'}）：不提前显示「找条路出古阵」`);
    }
  });
  assert.equal(card(AF, [...before, ...cc, ...af.slice(0, 1)], af[1]).step, returnTo(BEAST), 'afterfall 开头：仍是 tq_beast_traps「回到太泉古阵看看」');
  assert.equal(card(AF, [...before, ...cc, ...until05], A06).step, EXIT, 'tq_city_in_film 过了：显示「找条路出古阵」');
});

test('南荒 R-15（总策划定）：删掉 nh_leave_for_jin；山村那句显示到离队，离队即收束撤卡；晋入口 jin_arrive_from_nanhuang 照常接上', () => {
  const S05B = 'lcq.stage_05b', S07 = 'lcq.stage_07_qingyuan_jiankang';
  const [PLEDGE, DEPART, CURE] = ['lcq.event.tribes_pledge', 'lcq.event.s05b_wuer_suli_depart', 'lcq.event.shanghou_cures_ice_gu'];
  const [A, B] = ['lcq.event.s07_00a_shanghou_trading_house', 'lcq.event.s07_00b_return_north'];
  const nanhuang = compass.lineCompassTable().lines.find(l => l.lineId === 'nanhuang');
  assert.ok(!nanhuang.steps.some(s => s.id === 'nh_leave_for_jin'), '表里已删');
  assert.equal(texts['lineCompass.nanhuang.step.nh_leave_for_jin'], undefined, '文案键已删');
  assert.equal(nanhuang.steps.at(-1).id, 'nh_shanghou_ice_gu', '山村那句成了南荒最后一步');
  assert.deepEqual(nanhuang.closedWhen, [{ path: `done.${DEPART}`, operator: 'eq', value: true }], 'closedWhen 不动');
  const LEAVE = '收拾行装，往北出南荒', VILLAGE = texts['lineCompass.nanhuang.step.nh_shanghou_ice_gu'];
  const before = routeTo(S05B), s05b = stageOrder(S05B);
  assert.ok(s05b.indexOf(PLEDGE) < s05b.indexOf(DEPART) && s05b.indexOf(DEPART) < s05b.indexOf(CURE));
  s05b.forEach((id, i) => {
    const done = [...before, ...s05b.slice(0, i)];
    for (const focus of [id, undefined]) {
      const v = compass.lineCompassView(saveOf(S05B, done), { focusEventId: focus, compassPointer: () => pointer(S05B, focus) });
      assert.ok(![v.current?.step, ...v.others.map(o => o.step)].includes(LEAVE), `${id}：不再出现「${LEAVE}」`);
      if (i > s05b.indexOf(PLEDGE) && i <= s05b.indexOf(DEPART) && !focus) assert.equal(v.current?.step, VILLAGE, `${id} 之前：显示山村那句`);
      if (i > s05b.indexOf(DEPART)) {
        assert.notEqual(v.current?.lineId, 'nanhuang', `${id} 之前：离队后南荒已收束`);
        assert.ok(!v.others.some(o => o.lineId === 'nanhuang'), `${id} 之前：折叠行也撤掉南荒`);
      }
    }
  });
  const ARRIVE = texts['lineCompass.jin.step.jin_arrive_from_nanhuang'];
  const route = routeTo(S07);
  assert.ok(route.includes(DEPART) && route.includes(CURE), '默认路线到建康前走过 05b：离队、解蛊都完成');
  const acq = { 'liuchao.character.shang_zhen_yu': { kind: 'encountered' }, 'liuchao.character.yun_cang_feng': { kind: 'encountered' } };
  for (const [done, focus] of [[[A], B], [[A], undefined], [[A, B], undefined]]) {
    const c = card(S07, [...route, ...done], focus, acq);
    assert.equal(c?.lineId, 'jin', `完成 ${done.length} 拍、焦点 ${focus ?? '无'}`);
    assert.equal(c.step, ARRIVE, `完成 ${done.length} 拍、焦点 ${focus ?? '无'}：南荒收束后晋入口「${ARRIVE}」照常显示`);
  }
});

test('晋 五线补全 J1–J6（2026-10-28）：默认路线从南荒收束起，07→08→09 每拍挂章上 rail；线卡随步推进，掌誓不再倒序，s09_10 完成即收束撤卡', () => {
  const S05B = 'lcq.stage_05b', S07 = 'lcq.stage_07_qingyuan_jiankang', S08 = 'lcq.stage_08_jiankang_coup', S09 = 'lcq.stage_09_trade_and_escape';
  const ev = id => `lcq.event.${id}`;
  const FILLED = { [S07]: ['wangzhe_letter', 'palace_haunting_rumor', 'jin_panjiang_shaozhu'], [S08]: ['palm_oath_shanghou'], [S09]: ['spoils_split', 'xiangfu_stance'] };
  // ① 可达：原欠账 5 拍与新拍都挂在本关章里、且在本关 rail 上；插入处与 rail 前后两拍按原著 axisSeq 不倒序
  for (const [stageId, ids] of Object.entries(FILLED)) {
    const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
    const bound = new Set(stages.get(stageId).scenario.chapters.flatMap(c => c.eventIds || []));
    for (const id of ids.map(ev)) {
      assert.ok(bound.has(id), `${id} 挂在 ${stageId} 的章里`);
      const i = rail.indexOf(id);
      assert.ok(i >= 0, `${id} 在 ${stageId} rail 上`);
      const [prev, next] = [axisSeq.get(rail[i - 1]), axisSeq.get(rail[i + 1])];
      assert.ok((prev ?? -Infinity) <= axisSeq.get(id) && axisSeq.get(id) <= (next ?? Infinity), `${id} 与 rail 前后拍 axisSeq 不倒序`);
    }
  }
  assert.equal(axisSeq.get(ev('jin_panjiang_shaozhu')), 243);
  // ② 默认路线：关链从 stage_01 走到晋三关，途经 05b（南荒已收束）
  const before = routeTo(S07);
  assert.ok(before.includes(ev('s05b_wuer_suli_depart')), '默认路线到建康前南荒已收束');
  assert.equal(stages.get(S07).manifest.nextStageId, S08);
  assert.equal(stages.get(S08).manifest.nextStageId, S09);
  const jin = [S07, S08, S09].flatMap(stageId => stageOrder(stageId).map(id => ({ stageId, id })));
  for (const id of Object.values(FILLED).flat().map(ev)) assert.ok(jin.some(x => x.id === id), `${id} 在默认路线上`);
  const at = id => jin.findIndex(x => x.id === ev(id));
  assert.ok(at('s07_02_kill_wu') < at('wangzhe_letter') && at('wangzhe_letter') < at('s07_03_xiaozi_appears'), '原著序：斩吴 → 拆锦囊 → 小紫现身');
  assert.ok(at('palace_haunting_rumor') < at('jin_panjiang_shaozhu') && at('jin_panjiang_shaozhu') < at('s07_04_zhuo_subdued'));
  assert.ok(at('s08_06_pursuit_repelled') < at('palm_oath_shanghou') && at('palm_oath_shanghou') < at('s08_07_palace_ninja'));
  assert.ok(at('spoils_split') < at('s09_01_eight_steeds_leave') && at('s09_01_eight_steeds_leave') < at('xiangfu_stance'));
  // ③ 逐拍走：每拍之前（焦点＝这一拍／无焦点）当前线都是晋；焦点正是本步的拍时出主线指南针；提示只往前走
  const acq = Object.fromEntries(['shang_zhen_yu', 'yun_cang_feng', 'xiao_yao_yi'].map(n => [`liuchao.character.${n}`, { kind: 'encountered' }]));
  const table = compass.lineCompassTable().lines.find(l => l.lineId === 'jin');
  const stepOf = new Map(table.steps.filter(s => s.eventId).map(s => [s.eventId, s.id]));
  const HINTS = Object.fromEntries(table.steps.filter(s => s.hintKey).map(s => [s.id, texts[s.hintKey]]));
  const seen = [];
  // 广阳两拍（s09_07／s09_08）写在宋线下一步表里（song_guangyang_from_jin），焦点在那里时当前线归宋，不算晋的步
  const ownLine = x => compass.lineOfEvent(x.id, x.stageId) === 'jin';
  jin.forEach(({ stageId, id }, i) => {
    if (i > at('s09_10_separation')) return; // 收束拍之后（章尾的非承重拍）见 ④
    const done = [...before, ...jin.slice(0, i).map(x => x.id)];
    if (ownLine(jin[i])) assert.equal(card(stageId, done, id, acq)?.lineId, 'jin', `${id} 当焦点：当前线是晋`);
    // 晋第一拍之前没有焦点时编年史里还没有晋的拍；上一拍归宋时最近推进的线是宋
    if (i === 0 || !ownLine(jin[i - 1])) return;
    const idle = card(stageId, done, undefined, acq);
    assert.equal(idle?.lineId, 'jin', `${id} 之前（无焦点）：当前线是晋`);
    const hint = Object.entries(HINTS).find(([, text]) => text === idle.step)?.[0];
    if (hint && seen.at(-1) !== hint) seen.push(hint);
  });
  assert.deepEqual(seen, ['jin_arrive_from_nanhuang', 'jin_qingyuan_case', 'jin_back_jiankang', 'palace_ask', 'jin_eagle_beifu', 'jin_back_after_eagle'],
    '带文案的步按表顺序依次出现，不回跳；palace_ask（宫禁闹鬼可达后）不再永不显示');
  // 拆锦囊：s07_01 后显示到锦囊拆开；锦囊当焦点出主线指南针；拆开后不再显示
  const upTo = id => [...before, ...jin.slice(0, at(id)).map(x => x.id)];
  assert.equal(card(S07, upTo('s07_02_kill_wu'), undefined, acq).step, HINTS.jin_qingyuan_case);
  assert.equal(card(S07, upTo('wangzhe_letter'), ev('wangzhe_letter'), acq).step, pointer(S07, ev('wangzhe_letter')));
  assert.notEqual(card(S07, upTo('s07_03_xiaozi_appears'), undefined, acq).step, HINTS.jin_qingyuan_case);
  // 宫禁闹鬼已完成、回建康之后：「在建康打听宫里最近有什么事」显示到神龙殿夜探
  assert.equal(card(S07, upTo('s07_06_water_assassins'), undefined, acq).step, HINTS.palace_ask);
  assert.notEqual(card(S07, upTo('s07_08_palace_escape'), undefined, acq).step, HINTS.palace_ask, '神龙殿夜探之后不再显示');
  // 掌誓：苏妲己退走后轮到 jin_palm_oath；当焦点出主线指南针；完成后轮到 jin_feiniao_ninjia，不再被兜底吞掉
  assert.equal(card(S08, upTo('palm_oath_shanghou'), undefined, acq).step, returnTo(ev('palm_oath_shanghou')));
  assert.equal(card(S08, upTo('palm_oath_shanghou'), ev('palm_oath_shanghou'), acq).step, pointer(S08, ev('palm_oath_shanghou')));
  assert.equal(card(S08, upTo('s08_07_palace_ninja'), ev('s08_07_palace_ninja'), acq).step, pointer(S08, ev('s08_07_palace_ninja')), '掌誓之后 jin_feiniao_ninjia 照常是本步');
  assert.equal(stepOf.get(ev('palm_oath_shanghou')), 'jin_palm_oath');
  // ④ 收束：s09_10_separation 完成即撤卡，折叠行也不再有晋
  const all = [...before, ...jin.map(x => x.id)];
  assert.ok(all.includes(ev('s09_10_separation')));
  const closed = compass.lineCompassView(saveOf(S09, all, acq), { focusEventId: undefined, compassPointer: () => '' });
  assert.notEqual(closed.current?.lineId, 'jin', 's09_10 完成：晋已收束');
  assert.ok(!closed.others.some(o => o.lineId === 'jin'), 's09_10 完成：折叠行撤掉晋');
});

test('宋 五线补全 S1–S30（2026-10-28）：默认路线从晋收束起，10→12→江州退军→临安→小瀛洲→临安收束每拍挂章上 rail；抵达步改挂默认路线、死步复活，线卡随步推进，_06 完成即收束撤卡', () => {
  const S10 = 'lcq.stage_10_jiangzhou_shadow_war', S12 = 'lcq.stage_12_jiangzhou_counterwar', RET = 'lyl.jiangzhou_retreat';
  const LIN = 'lyl.lin_an_bridge', XYZ = 'lyl.xiaoyingzhou_blacksea_trap', SF = 'lyl.taiquan_sacred_fruit';
  const lcq = id => `lcq.event.${id}`, lyl = id => `lyl.event.${id}`;
  const FILLED = {
    [S10]: ['yeying_seat_struggle'].map(lcq),
    [S12]: ['jin_vacate_jiangzhou', 'tuntian_post', 'pengyi_takeover'].map(lcq),
    [LIN]: ['linan_arrive_fengbo', 'tail_li_shishi', 'survey_wumu_mansion', 'evade_huangchengsi', 'mingqingsi_lin_lu_meeting', 'decode_bianmenwa_note',
      'weiyuan_extortion', 'libu_registration', 'meet_xue_yanshan', 'blacksea_iron_puppet', 'identify_xue_cold_poison', 'leifeng_pagoda_invite',
      'leifeng_repel_gao', 'decide_chase_weiyuan', 'pass_kotian_stone', 'ivory_visit_weiyuan', 'siying_lane_saber_ambush'].map(lyl),
    [XYZ]: ['linjia_sees_ningyi', 'xihu_villa_eavesdrop', 'xiaoyingzhou_paper_plan', 'xiaoyingzhou_paper_mint', 'xiaoyingzhou_lin_takes_seat',
      'song_baochao_appointed', 'xiaoyingzhou_cement_truce'].map(lyl),
    [SF]: ['sacred_against_lin', 'sacred_jin_drought'].map(lyl),
  };
  // ① 可达：28 条原欠账与 2 个新拍都挂在本关章里、且在本关 rail 上；插入处与 rail 前后两拍按 axisSeq 不倒序，
  //    唯一例外是 S1 风波亭（556）→ 尾随李师师（555）：原著 yly 766→795，尾随的主轴改绑 yunlong.6.1 按 R-14 暂缓
  const R14 = [lyl('linan_arrive_fengbo'), lyl('tail_li_shishi')].join('→');
  for (const [stageId, ids] of Object.entries(FILLED)) {
    const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
    const bound = new Set(stages.get(stageId).scenario.chapters.flatMap(c => c.eventIds || []));
    for (const id of ids) {
      assert.ok(bound.has(id), `${id} 挂在 ${stageId} 的章里`);
      const i = rail.indexOf(id);
      assert.ok(i >= 0, `${id} 在 ${stageId} rail 上`);
      for (const [a, b] of [[rail[i - 1], id], [id, rail[i + 1]]]) {
        if (a && b && `${a}→${b}` !== R14) assert.ok(axisSeq.get(a) <= axisSeq.get(b), `${a}（${axisSeq.get(a)}）→ ${b}（${axisSeq.get(b)}）不倒序`);
      }
    }
  }
  assert.equal(eventOf.get(lyl('tail_li_shishi')).axisSeq, 555, 'R-14 暂缓：尾随李师师仍是 yunlong.3.2／555，只加过渡前置');
  assert.deepEqual(eventOf.get(lyl('tail_li_shishi')).conditions, [{ path: 'flags.event.linan_arrive_fengbo.done', operator: 'eq', value: true }]);
  // 新首章：rail 章＝首章（runtime 只在 rail 章里激活 rail 拍）；原 intel 章接在它之后
  const linChapters = stages.get(LIN).scenario.chapters;
  assert.deepEqual(linChapters.map(c => c.id), ['lyl.chapter.lin_an_bridge_arrival', 'lyl.chapter.lin_an_bridge_intel']);
  assert.equal(CANON_RAIL_PROFILES.find(p => p.modId === LIN).chapterId, linChapters[0].id);
  // 同 seq 次序键按原著行序：556 风波亭 766 → 武穆王府 825 → 皇城司 831；557 鲁林初会 903 → 祈福暗号 961 → 威远勒索 1078；
  // 558 吏部 989 → 薛延山 1007 → 铁傀儡 1178；559 寒毒 1010 → 雷峰之邀 1045 → 便门瓦棚 1266；560 雷峰退高 1099 → 小瀛洲 1334；
  // 561 复盘失镖 1161 → 林娘子 1496；562 叩天石 1214 → 明庆寺饮酒 1510
  const linRail = CANON_RAIL_PROFILES.find(p => p.modId === LIN).orderedEventIds;
  assert.deepEqual(linRail.map(id => id.replace('lyl.event.', '')), [
    'linan_arrive_fengbo', 'tail_li_shishi', 'survey_wumu_mansion', 'evade_huangchengsi',
    'mingqingsi_lin_lu_meeting', 'decode_bianmenwa_note', 'weiyuan_extortion',
    'libu_registration', 'meet_xue_yanshan', 'blacksea_iron_puppet',
    'identify_xue_cold_poison', 'leifeng_pagoda_invite', 'lin_an_bridge_01_beat',
    'leifeng_repel_gao', 'lin_an_bridge_02_beat', 'decide_chase_weiyuan', 'lin_an_bridge_03_beat',
    'pass_kotian_stone', 'lin_an_bridge_04_beat', 'ivory_visit_weiyuan', 'siying_lane_saber_ambush', 'lin_an_bridge_xieyi_tomb',
  ]);
  // ② 默认路线：关链 09→10→11→12→江州退军→（隔离 lin_an_black_sea）→临安→（隔离 taiquan_expedition）→小瀛洲→临安收束
  const SONG = [S10, 'lcq.stage_11_lieshan_battle', S12, RET, LIN, XYZ, SF];
  const before = routeTo(S10);
  assert.ok(before.includes(lcq('s09_10_separation')), '默认路线到江州前晋已收束');
  for (const id of ['lyl.lin_an_black_sea', 'lyl.taiquan_expedition']) assert.ok(DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(id));
  const song = SONG.flatMap(stageId => stageOrder(stageId).map(id => ({ stageId, id })));
  assert.deepEqual([...new Set(routeTo('lyl.taiquan_core_conflict').map(id => eventOf.get(id).stageId))].filter(s => SONG.includes(s)), SONG);
  for (const id of Object.values(FILLED).flat()) assert.ok(song.some(x => x.id === id), `${id} 在默认路线上`);
  // ③ 逐拍走：焦点＝本线的拍时当前线是宋；上一拍归宋时（无焦点）当前线仍是宋；带文案的步按表序出现、不回跳
  const acq = Object.fromEntries(['meng_fei_qing', 'xie_yi'].map(n => [`liuchao.character.${n}`, { kind: 'encountered' }]));
  const table = compass.lineCompassTable().lines.find(l => l.lineId === 'song');
  const HINTS = Object.fromEntries(table.steps.filter(s => s.hintKey).map(s => [s.id, texts[s.hintKey]]));
  const at = id => song.findIndex(x => x.id === id);
  const CLOSE = at(lyl('taiquan_sacred_fruit_06'));
  const ownLine = x => compass.lineOfEvent(x.id, x.stageId) === 'song';
  const upTo = id => [...before, ...song.slice(0, at(id)).map(x => x.id)];
  const seen = [];
  song.forEach(({ stageId, id }, i) => {
    if (i >= CLOSE) return;
    const done = [...before, ...song.slice(0, i).map(x => x.id)];
    if (table.steps.some(s => s.eventId === id)) assert.equal(card(stageId, done, id, acq)?.lineId, 'song', `${id} 当焦点：当前线是宋`);
    if (i === 0 || !ownLine(song[i - 1])) return;
    const idle = card(stageId, done, undefined, acq);
    assert.equal(idle?.lineId, 'song', `${id} 之前（无焦点）：当前线是宋`);
    const hint = Object.entries(HINTS).find(([, text]) => text === idle.step)?.[0];
    if (hint && seen.at(-1) !== hint) seen.push(hint);
  });
  assert.deepEqual(seen, ['song_escort_yue_girls', 'song_jiangzhou_war_open_alt', 'song_lieshan_snow', 'song_sanchuankou', 'song_yuanwailang',
    'song_xuezhun_takeover', 'song_ximen_xiaoyingzhou'],
  '带文案的步按表顺序依次出现，不回跳；song_xuezhun_takeover「去约好的地方看看」不再是死步');
  // 临安收束关按地区归太泉线（lineOfStage），无焦点时不归宋；云涛观迷楼当焦点照常是宋的本步（挂章前后同）
  assert.equal(compass.lineOfStage(SF), 'taiquan');
  const yt = card(SF, upTo(lyl('taiquan_sacred_fruit_04')), lyl('taiquan_sacred_fruit_04'), acq);
  assert.equal(yt?.lineId, 'song');
  assert.equal(pointer(SF, lyl('taiquan_sacred_fruit_04')), '', '迷楼没有地点：指南针为空，用本步文案');
  assert.equal(yt.step, HINTS.song_yuntao_niaoren, '对付蔺采泉、晋旱收粮两拍插在 _03 与 _04 之间，不吞云涛观这一步');
  // 抵达步：江州上船（s01_02）后显示「回到临安看看」直到风波亭；风波亭当焦点出主线指南针；之后不再显示
  const ARRIVE = returnTo(lyl('linan_arrive_fengbo'));
  assert.equal(places[lyl('linan_arrive_fengbo')], '临安');
  assert.equal(card(RET, upTo(lyl('s01_03')), undefined, acq).step, ARRIVE, '江州上船之后：抵达步提示');
  assert.equal(card(LIN, upTo(lyl('linan_arrive_fengbo')), undefined, acq).step, ARRIVE);
  assert.equal(card(LIN, upTo(lyl('linan_arrive_fengbo')), lyl('linan_arrive_fengbo'), acq).step, pointer(LIN, lyl('linan_arrive_fengbo')));
  for (const id of ['tail_li_shishi', 'decode_bianmenwa_note', 'lin_an_bridge_01_beat'].map(lyl)) {
    assert.notEqual(card(LIN, upTo(id), undefined, acq).step, ARRIVE, `${id} 之前：抵达步已过`);
  }
  // 薛延山：祈福暗号解开后显示「去约好的地方看看」，见到薛延山后不再显示；之前也不提前显示
  const XUE = HINTS.song_xuezhun_takeover;
  assert.notEqual(card(LIN, upTo(lyl('decode_bianmenwa_note')), undefined, acq).step, XUE, '暗号没解开前不显示');
  assert.equal(card(LIN, upTo(lyl('libu_registration')), undefined, acq).step, XUE, '暗号解开后：显示到见薛延山');
  assert.equal(pointer(LIN, lyl('meet_xue_yanshan')), '', '西湖农居没有地点：指南针为空');
  assert.equal(card(LIN, upTo(lyl('meet_xue_yanshan')), lyl('meet_xue_yanshan'), acq).step, XUE, '薛延山当焦点：用本步文案');
  assert.notEqual(card(LIN, upTo(lyl('blacksea_iron_puppet')), undefined, acq).step, XUE, '见过薛延山后不再显示');
  // ④ 收束：taiquan_sacred_fruit_06 完成即撤卡，折叠行也不再有宋
  const all = [...before, ...song.slice(0, CLOSE + 1).map(x => x.id)];
  const closed = compass.lineCompassView(saveOf(SF, all, acq), { focusEventId: undefined, compassPointer: () => '' });
  assert.notEqual(closed.current?.lineId, 'song', '_06 完成：宋已收束');
  assert.ok(!closed.others.some(o => o.lineId === 'song'), '_06 完成：折叠行撤掉宋');
});

test('汉 五线补全 H1–H20（2026-10-28）：默认路线从临安收束起，太泉余波→洛都→汉宫→定陶→秘境每拍挂章上 rail；入汉／饼肆／霍府三处死步复活，宫变两步改挂默认路线，线卡随步推进，s02_09 完成即收束撤卡', () => {
  const AF = 'lyl.taiquan_afterfall', LUO = 'lyl.luoyang_cloud_secret', HPE = 'lyl.han_palace_endgame', DT = 'lyg.dingtao_beijing', MJ = 'lyg.mijing_rumen';
  const lyl = id => `lyl.event.${id}`;
  const [H1, H2, H5, H6, H20] = [lyl('han_shouyang_gaoyanei'), lyl('han_wudu_bingsi'), lyl('han_yuedan_ping'), lyl('han_huo_villa'), 'lyg.event.han_marquis_wuyang_enfeoff'];
  const FILLED = {
    [AF]: [H1, H2, lyl('jin_guangyuan_ledger'), lyl('han_court_grain_blame')],
    [LUO]: [H5, H6, lyl('han_xingyue_framed'), lyl('han_limit_field')],
    [HPE]: ['lvji_defiles_consort', 'emperor_death_spreads', 'arrange_escape_route', 'liujian_takes_nangong', 'changqiu_palace_defense',
      'bounty_and_hu_cavalry', 'han_jianyu_refused', 'lvfengxian_breaks_line'].map(lyl),
    [DT]: [H20],
    [MJ]: ['lyg.event.mijing_superuser_roster'],
  };
  // ① 可达：13 条原欠账与 5 个新拍都挂在本关章里、且在本关 rail 上；插入处与 rail 前后两拍按 axisSeq 不倒序
  for (const [stageId, ids] of Object.entries(FILLED)) {
    const rail = CANON_RAIL_PROFILES.find(p => p.modId === stageId).orderedEventIds;
    const bound = new Set(stages.get(stageId).scenario.chapters.flatMap(c => c.eventIds || []));
    for (const id of ids) {
      assert.ok(bound.has(id), `${id} 挂在 ${stageId} 的章里`);
      const i = rail.indexOf(id);
      assert.ok(i >= 0, `${id} 在 ${stageId} rail 上`);
      for (const [a, b] of [[rail[i - 1], id], [id, rail[i + 1]]]) {
        if (a && b) assert.ok(axisSeq.get(a) <= axisSeq.get(b), `${a}（${axisSeq.get(a)}）→ ${b}（${axisSeq.get(b)}）不倒序`);
      }
    }
  }
  // 同 seq 次序键按原著行序：718 抵舞都（yly 22618）→ 云如瑶私奔（22934）；898 赏格争胡骑（47300）→ 回绝剑玉姬（47483）
  const afRail = CANON_RAIL_PROFILES.find(p => p.modId === AF).orderedEventIds;
  assert.equal(afRail.indexOf(H1) + 1, afRail.indexOf(lyl('taiquan_afterfall_06_beat')));
  const hpeRail = CANON_RAIL_PROFILES.find(p => p.modId === HPE).orderedEventIds;
  assert.equal(hpeRail.indexOf(lyl('bounty_and_hu_cavalry')) + 1, hpeRail.indexOf(lyl('han_jianyu_refused')));
  // ② 默认路线：关链 …临安收束→（太泉核心）→太泉余波→洛都→（隔离 luoyang_coup）→汉宫→定陶→秘境
  const HAN = [AF, LUO, HPE, DT, MJ];
  assert.ok(DEFAULT_LINE_QUARANTINED_STAGE_IDS.has('lyl.luoyang_coup'));
  assert.deepEqual([...new Set(routeTo('lyg.han_succession').map(id => eventOf.get(id).stageId))].filter(s => HAN.includes(s)), HAN);
  const before = routeTo(AF);
  const han = HAN.flatMap(stageId => stageOrder(stageId).map(id => ({ stageId, id })));
  for (const id of Object.values(FILLED).flat()) assert.ok(han.some(x => x.id === id), `${id} 在默认路线上`);
  // ③ 表：6 个 pending 全去掉，抵达两步不再挂隔离关 s06_01／s06_02
  const table = compass.lineCompassTable().lines.find(l => l.lineId === 'han');
  assert.ok(!table.steps.some(s => s.pending), '汉线不再有待建步');
  assert.ok(!JSON.stringify(table.steps).includes('lyl.event.s06_0'), '不再引用隔离关 luoyang_coup 的拍');
  for (const id of ['han_enter_from_taiquan_wudu', 'han_enter_from_taiquan', 'han_enter_border_wudu', 'han_enter_border_alt']) {
    assert.equal(table.steps.find(s => s.id === id).eventId, H1, `${id} 改挂 H1`);
  }
  assert.deepEqual(table.steps.map(s => s.id).slice(4, 7), ['han_zhu_urge_luo_alt', 'han_yunruyao_bing', 'han_camera_palace_alt'], '饼肆挪到 han_zhu_urge_luo_alt 之后');
  assert.equal(texts['lineCompass.han.step.han_yunruyao_bing'], '在舞都城里走走看看');
  // H1 带上高智商：完成后相识账记 encountered，饼肆那步的 when 才成立
  assert.ok(eventOf.get(H1).relatedCharacterIds.includes('liuchao.character.gao_zhishang'));
  // ④ 逐拍走：焦点＝本线表里的拍时当前线是汉；带文案的步按表序出现、不回跳
  const acq = { 'liuchao.character.gao_zhishang': { kind: 'encountered' } };
  const HINTS = Object.fromEntries(table.steps.filter(s => s.hintKey).map(s => [s.id, texts[s.hintKey]]));
  const at = id => han.findIndex(x => x.id === id);
  const CLOSE = at('lyg.event.s02_09');
  const upTo = id => [...before, ...han.slice(0, at(id)).map(x => x.id)];
  const seen = [];
  han.forEach(({ stageId, id }, i) => {
    if (i > CLOSE) return;
    const done = [...before, ...han.slice(0, i).map(x => x.id)];
    if (table.steps.some(s => s.eventId === id)) assert.equal(card(stageId, done, id, acq)?.lineId, 'han', `${id} 当焦点：当前线是汉`);
    const idle = card(stageId, done, undefined, acq);
    if (idle?.lineId !== 'han') return;
    const hint = Object.entries(HINTS).find(([, text]) => text === idle.step)?.[0];
    if (hint && seen.at(-1) !== hint) seen.push(hint);
  });
  assert.deepEqual(seen, ['han_zhu_urge_luo_alt', 'han_yunruyao_bing', 'han_huo_bieyuan', 'han_liujian_yuxi_alt'],
    '带文案的步按表顺序依次出现、不回跳；饼肆、霍府两步不再是死步');
  // 入汉：H1 当焦点出主线指南针（去舞都）；过了 H1 显示「去洛都看看」，入口提示不再出
  assert.equal(card(AF, upTo(H1), H1, acq).step, pointer(AF, H1));
  assert.match(pointer(AF, H1), /^去舞都/);
  const ENTRY = ['han_enter_from_taiquan_wudu', 'han_enter_from_taiquan', 'han_enter_border_wudu', 'han_enter_border_alt'].map(id => HINTS[id]);
  const afterH1 = card(AF, upTo(lyl('taiquan_afterfall_06_beat')), undefined, acq);
  assert.equal(afterH1.step, HINTS.han_zhu_urge_luo_alt);
  for (const id of [H2, lyl('taiquan_afterfall_10_beat'), lyl('s05_01'), H6]) assert.ok(!ENTRY.includes(card(eventOf.get(id).stageId, upTo(id), undefined, acq)?.step), `${id} 之前不再出入口提示`);
  // 饼肆：afterfall_07 之后显示到饼肆完成；饼肆当焦点出指南针
  assert.equal(card(AF, upTo(H2), undefined, acq).step, HINTS.han_yunruyao_bing);
  assert.equal(card(AF, upTo(H2), H2, acq).step, pointer(AF, H2));
  assert.notEqual(card(AF, upTo(lyl('jin_guangyuan_ledger')), undefined, acq).step, HINTS.han_yunruyao_bing, '饼肆之后不再显示');
  // 霍府：进洛都之后显示到霍府别院完成，之后不再显示
  assert.equal(card(LUO, upTo(H6), undefined, acq).step, HINTS.han_huo_bieyuan);
  assert.notEqual(card(LUO, upTo(lyl('han_xingyue_framed')), undefined, acq).step, HINTS.han_huo_bieyuan);
  // 宫变：天子暴毙（默认路线）完成后显示「去长秋宫看看」，出宫定拥立后不再显示
  const PALACE_NIGHT = lyl('arrange_escape_route');
  assert.notEqual(card(HPE, upTo(lyl('emperor_death_spreads')), undefined, acq).step, HINTS.han_liujian_yuxi_alt, '天子暴毙之前不显示');
  assert.equal(card(HPE, upTo(PALACE_NIGHT), undefined, acq).step, HINTS.han_liujian_yuxi_alt);
  assert.notEqual(card(HPE, upTo(lyl('liujian_takes_nangong')), undefined, acq).step, HINTS.han_liujian_yuxi_alt);
  // ⑤ 收束：s02_09 完成即撤卡，折叠行也不再有汉
  const all = [...before, ...han.slice(0, CLOSE + 1).map(x => x.id)];
  const closed = compass.lineCompassView(saveOf(MJ, all, acq), { focusEventId: undefined, compassPointer: () => '' });
  assert.notEqual(closed.current?.lineId, 'han', 's02_09 完成：汉已收束');
  assert.ok(!closed.others.some(o => o.lineId === 'han'), 's02_09 完成：折叠行撤掉汉');
  assert.ok(han.findIndex(x => x.id === H20) < CLOSE, '受封舞阳侯在收束前');
});
