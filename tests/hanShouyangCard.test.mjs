// 汉线「下首阳山」两张入口卡只在出阵后还没去别处时出（用户 2026-11-27 03:51 定条件；总策划 04:58 代定替代口径：
// 不新建首阳山地点，条件＝已出阵，且之后还没完成过任何别的线的事件）。派生读取点 compass.hanStillAtShouyang（汉包声明，kind noOtherLineEventsSince）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');

const EXIT = 'lyl.event.taiquan_portal_exit';
const AF = 'lyl.taiquan_afterfall';
const rt = entries => ({ chronicle: entries.map(([stageId, id], i) => ({ id: `chronicle.${stageId}.${id}`, type: 'event', stageId, sequence: i + 1 })) });
const holds = runtime => ledger.evaluateLedgerCondition({ path: 'compass.hanStillAtShouyang', operator: 'eq', value: true }, runtime);

test('compass.hanStillAtShouyang：已出阵，且之后的事件都在出阵那一关或汉线里', () => {
  assert.deepEqual(packs.COMPASS_CONDITIONS.find(c => c.id === 'hanStillAtShouyang'),
    { id: 'hanStillAtShouyang', kind: 'noOtherLineEventsSince', sinceEventId: EXIT, lineIds: ['han'] });
  assert.ok(ledger.COMPASS_DERIVED_IDS.includes('hanStillAtShouyang'));
  assert.equal(holds(rt([])), false, '没出阵');
  assert.equal(holds(rt([['lyl.lin_an_bridge', 'lyl.event.xiaoyingzhou_cement_truce']])), false, '没出阵（只走过宋）');
  assert.equal(holds(rt([['lyl.lin_an_bridge', 'lyl.event.xiaoyingzhou_cement_truce'], [AF, EXIT]])), true, '刚出阵：出阵之前走过别的线不算');
  assert.equal(holds({ chronicle: [], completedEventIds: [EXIT], events: [{ id: EXIT }] }), true, '出阵已完成、编年史还没落账的同回合空档');
  assert.equal(holds(rt([[AF, EXIT], [AF, 'lyl.event.taiquan_afterfall_01_beat']])), true, '出阵后仍在出阵那一关');
  assert.equal(holds(rt([[AF, EXIT], ['lyl.luoyang_cloud_secret', 'lyl.event.s05_01']])), true, '出阵后只做了汉线的事');
  assert.equal(holds(rt([[AF, EXIT], ['lyg.changgan_begins', 'lyg.event.tang_liuxianping_arrive']])), false, '出阵后去过唐');
  assert.equal(holds(rt([[AF, EXIT], ['lcq.stage_07_qingyuan_jiankang', 'lcq.event.s07_00c_arrive_jiankang'], [AF, 'lyl.event.taiquan_afterfall_01_beat']])), false, '去过晋再回来也不算还在首阳山');
  assert.equal(holds(rt([[AF, EXIT], ['no.such.stage', 'lyl.event.taiquan_afterfall_01_beat']])), false, '不属任何国家线的关也算去了别处');
});

test('汉线入口四张卡：「下首阳山」两版多读 compass.hanStillAtShouyang，不成立时落到不点首阳山的两版', () => {
  const steps = compass.lineCompassTable().lines.find(l => l.lineId === 'han').steps;
  const texts = packs.CONTENT_PACKS.texts;
  const ENTRY = ['han_enter_from_taiquan_wudu', 'han_enter_from_taiquan', 'han_enter_border_wudu', 'han_enter_border_alt'];
  assert.deepEqual(steps.slice(0, 4).map(s => s.id), ENTRY);
  const still = { path: 'compass.hanStillAtShouyang', operator: 'eq', value: true };
  for (const id of ENTRY.slice(0, 2)) {
    assert.deepEqual(steps.find(s => s.id === id).when.at(-1), still, id);
    assert.match(texts[`lineCompass.han.step.${id}`], /^下首阳山/);
  }
  for (const id of ENTRY.slice(2)) {
    assert.ok(!JSON.stringify(steps.find(s => s.id === id).when || []).includes('compass.'), id);
    assert.doesNotMatch(texts[`lineCompass.han.step.${id}`], /首阳/);
  }
  // 按表序取第一条 when 全满足的入口步（同 lineCompass 的取法）
  const pick = runtime => steps.slice(0, 4).find(s => compass.lineCompassConditionsHold(s.when, c => ledger.evaluateLedgerCondition(c, runtime) === true)).id;
  const TRUCE = ['lyl.lin_an_bridge', 'lyl.event.xiaoyingzhou_cement_truce'];
  const TANG = ['lyg.changgan_begins', 'lyg.event.tang_liuxianping_arrive'];
  assert.equal(pick(rt([TRUCE, [AF, EXIT]])), 'han_enter_from_taiquan_wudu');
  assert.equal(pick(rt([[AF, EXIT]])), 'han_enter_from_taiquan');
  assert.equal(pick(rt([TRUCE, [AF, EXIT], TANG])), 'han_enter_border_wudu', '出阵后去过别处、知道舞都：去汉国舞都看看');
  assert.equal(pick(rt([[AF, EXIT], TANG])), 'han_enter_border_alt', '出阵后去过别处、不知道舞都：去汉国看看');
  assert.equal(pick(rt([])), 'han_enter_border_alt');
});
