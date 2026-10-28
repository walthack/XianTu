// 南荒线「当前线」卡时机（fix86-1，真机 8097：打完诗薇莫后误显「回到花苗寨看看」）。
// 前一拍未完成时这一步不入选；没有别的步可选就只显示线名。兜底句分支未改（P3-1 待定）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const texts = packs.CONTENT_PACKS.texts;
const places = packs.CONTENT_PACKS.lineCompassPlaces;

const S02 = 'lcq.stage_02';
const S03B = 'lcq.stage_03b_snake_flower_bridge';
const POINTER = '去某处 · 见某人';
const SHEYI = texts['lineCompass.nanhuang.step.nh_sheyi_village'];
const ROAD = texts['lineCompass.nanhuang.step.nh_yun_guide_road'];

const stageEvents = stageId => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${stageId}.json`, 'utf8')).scenario.events;
const eventStage = new Map(fs.readdirSync('src/modules/scenarioMods/builtins/data').filter(f => f.endsWith('.json'))
  .flatMap(f => { const d = JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${f}`, 'utf8')); return (d.scenario?.events || []).map(e => [e.id, d.manifest.id]); }));

/** 整关事件（文件顺序）；before＝只取原著序号小于它的拍（存档停在那一拍之前）。 */
const played = (stageId, before = Infinity) => stageEvents(stageId).filter(e => before === Infinity || (typeof e.axisSeq === 'number' && e.axisSeq < before)).map(e => [stageId, e.id]);
const saveOf = ({ modId, done }) => ({
  角色: { 属性: { 境界: { 名称: '生象', 阶段: '初期' } } },
  世界: { 状态: { 剧本模组: {
    modId, events: [], completedEventIds: [], flags: {}, acquaintances: {},
    chronicle: done.map(([stageId, eventId], i) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence: i + 1 })),
  } } },
});
const view = (save, focusEventId) => compass.lineCompassView(save, { focusEventId, compassPointer: () => POINTER });
const returnTo = eventId => texts[compass.LINE_COMPASS_RETURN_KEY].split(compass.LINE_COMPASS_PLACE_SLOT).join(places[eventId]);
const at = (id) => {
  assert.ok(eventStage.has(id), id);
  return [eventStage.get(id), id];
};

/** 03b 路线：02 全关，再加上 03b 里 axisSeq ≤ maxSeq 的拍。 */
const through03b = maxSeq => [...played(S02), ...played(S03B, maxSeq + 1)];

test('打完诗薇莫（s03b_01..03，焦点 s03b_02）：仍停在蛇彝村，不出「回到花苗寨看看」', () => {
  const card = view(saveOf({ modId: S03B, done: through03b(63) }), 'lcq.event.s03b_snake_flower_bridge_02').current;
  assert.equal(card?.lineId, 'nanhuang');
  assert.equal(card.step, SHEYI);
  assert.ok(!card.step.includes('花苗'), card.step);
  assert.ok(!card.step.startsWith('回到'), card.step);
});

test('完成到 s03b_04：显示「跟着商队往前走」', () => {
  const card = view(saveOf({ modId: S03B, done: through03b(64) }), undefined).current;
  assert.equal(card?.lineId, 'nanhuang');
  assert.equal(card.step, ROAD);
  assert.equal(card.step, '跟着商队往前走');
});

test('完成到 s03b_05、焦点 s03b_06：走主线指南针，不走兜底句', () => {
  const card = view(saveOf({ modId: S03B, done: through03b(65) }), 'lcq.event.s03b_snake_flower_bridge_06').current;
  assert.equal(card?.lineId, 'nanhuang');
  assert.equal(card.step, POINTER);
  assert.notEqual(card.step, returnTo('lcq.event.s03b_snake_flower_bridge_06'));
});

test('12 步：前一拍未完成时，不显示该步的「回到{地点}看看」', () => {
  // 前一步的事件已完成（那一步算过），本步 when 的前一拍都没完成。缺 when 时会选出本步并走兜底句。
  const cases = [
    ['nh_le_mingzhu_join', 'lcq.event.s04_03', 'lcq.event.s04_01'],
    ['nh_f04_yaren', 'lcq.event.s04b_lingfei_baiyi_crisis_02', 'lcq.event.s04_07'],
    ['nh_lingfei_mirror', 'lcq.event.s04b_lingfei_baiyi_crisis_05', 'lcq.event.s04b_lingfei_baiyi_crisis_02'],
    ['nh_f05_trap', 'lcq.event.s04b_lingfei_baiyi_crisis_10', 'lcq.event.s04b_lingfei_baiyi_crisis_05'],
    ['nh_xiaozi_debut', 'lcq.event.xiaozi_first_appears', 'lcq.event.s04b_lingfei_baiyi_crisis_15'],
    ['nh_tide_disaster', 'lcq.event.s04b_lingfei_baiyi_crisis_19', 'lcq.event.xiaozi_first_appears'],
    ['nh_f07_burn_village', 'lcq.event.s05_16', 'lcq.event.s04b_lingfei_baiyi_crisis_19'],
    ['nh_f09_yinsha', 'lcq.event.s05_09', 'lcq.event.s05_08'],
    ['nh_binu_arc', 'lcq.event.s05b_02_xiaozi_exposed', 'lcq.event.s05_11'],
    ['nh_f11_f12', 'lcq.event.s05b_08a_rescue_suli', 'lcq.event.s05b_04_enter_ghost_palace'],
    ['nh_f13_f14', 'lcq.event.slay_dragon', 'lcq.event.s05b_08a_rescue_suli'],
    ['nh_tribes_ending', 'lcq.event.tribes_pledge', 'lcq.event.slay_dragon'],
  ];
  const pact = 'lcq.event.sudaji_south_pact';
  for (const [stepId, eventId, prevId] of cases) {
    const step = compass.lineCompassTable().lines.find(l => l.lineId === 'nanhuang').steps.find(s => s.id === stepId);
    assert.ok(step?.when?.length, `${stepId} 要有 when`);
    assert.ok(places[eventId], `${stepId} 有地点，缺 when 时会走兜底句`);
    const card = view(saveOf({ modId: eventStage.get(prevId), done: [at(pact), at(prevId)] }), undefined).current;
    assert.equal(card?.lineId, 'nanhuang', stepId);
    assert.notEqual(card.step, returnTo(eventId), `${stepId}：前一拍未完成，不应是 ${returnTo(eventId)}`);
  }
});
