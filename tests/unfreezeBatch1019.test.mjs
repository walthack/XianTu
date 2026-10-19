// 2026-10-19 22:31 用户批准的冻结文件小批解冻：任务线效果结算迁出、角色结局只记归宿、NPC 境界以存档为准、
// 剧情交易与逐拍演出分钟数进数值配置。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const root = new URL('..', import.meta.url).pathname;
const effects = await loadTs('../src/modules/scenarioMods/questLineEffects.ts');
const lines = await loadTs('../src/modules/scenarioMods/questLines.ts');
const step = await loadTs('../src/modules/scenarioMods/travel/stepScene.ts');
const trades = await loadTs('../src/modules/scenarioMods/storyTrades.ts');
const actorLevels = await loadTs('../src/modules/scenarioMods/actorLevels.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const realm = await loadTs('../src/utils/realmUtils.ts');
const characterLevels = await loadTs('../src/modules/scenarioMods/characterLevels.ts');
const progress = JSON.parse(readFileSync(`${root}mod-kit/numbers-progress.json`, 'utf8'));

test('runtime 只保留一次调用：效果循环、gameOver 写入与写死数值都不在 runtime 里', () => {
  const rt = readFileSync(`${root}src/modules/scenarioMods/runtime.ts`, 'utf8');
  const body = rt.slice(rt.indexOf('function settleOptionalLine('), rt.indexOf('\n}\n', rt.indexOf('function settleOptionalLine(')));
  assert.equal((body.match(/settleQuestLineEffects\(/g) || []).length, 1);
  assert.doesNotMatch(body, /for\s*\(const e of plan\.effects\)|gameOver/);
  assert.doesNotMatch(rt, /fee \? 60 : -50|Math\.max\(-15,Math\.min\(15/);
  const ai = readFileSync(`${root}src/utils/AIBidirectionalSystem.ts`, 'utf8');
  assert.doesNotMatch(ai, /minutes: 120|\? 0 : 120\)/);
});

test('任务线好感截断读 freeAction.affinity.perBeatCap；重大回应门槛 / 显著度下限 / 记忆条数读 lineBonds.majorResponse', () => {
  const cap = GAME_NUMBERS.freeAction.affinity.perBeatCap;
  assert.equal(effects.clampLineAffinityDelta(999), cap);
  assert.equal(effects.clampLineAffinityDelta(-999), -cap);
  assert.equal(effects.clampLineAffinityDelta(NaN), 0);
  assert.deepEqual({ ...progress.lineBonds.majorResponse, note: undefined }, { note: undefined, delta: 10, salienceFloor: 80, memoryKeep: 12 }, '数值与迁出前一致');
});

test('kind=ending：只记角色归宿 {actorIds,resolutionId,textId,atTurn} 并关线，不写 gameOver；关线后不再提供这条线的拍', () => {
  const line = { id: 'line.test', kind: 'character', name: '测试线', entryHint: '', ownerCharacterIds: ['liuchao.character.ning_yu'], entry: { canonChapterAtLeast: 1 }, beats: [{ id: 'b1', mode: 'standalone', hostEventId: null, eventId: 'ev.b1', objective: '目标', onComplete: [], completedBy: { eventActionReceipt: { eventId: 'ev.b1', actionId: 'go' } } }] };
  const r = { worldTurn: 7, flags: {} }, state = { version: 1, receipts: {} };
  effects.LINE_EFFECT_HANDLERS.ending.apply({ kind: 'ending', endingId: 'lcq.ending.e01' }, { r, line, event: { id: 'ev.b1' }, state });
  assert.equal(r.gameOver, undefined, '角色结局与整局结局无关');
  const res = state.actorResolutions['line.test'];
  assert.deepEqual(res.actorIds, ['liuchao.character.ning_yu']);
  assert.equal(res.resolutionId, 'lcq.ending.e01');
  assert.equal(res.atTurn, 7);
  assert.equal(typeof res.label, 'string');
  assert.equal(state.closedLines['line.test'], 7);
  const ctx = { completedEventIds: [], presentActorIds: [], knownFactIds: [], chapterOrder: {}, currentChapterOrder: 5, affinity: {}, flags: {} };
  assert.equal(lines.lineInsertionsAt([line], 'ev.b1', ctx, { version: 1, receipts: {} }).length, 1);
  assert.equal(lines.lineInsertionsAt([line], 'ev.b1', ctx, state).length, 0, '关线后不再出现');
  assert.equal(lines.settleLineInsertion(line, 'b1', { id: 'line.ev.b1.go', eventId: 'ev.b1', actionId: 'go', outcome: 'success', turn: 8 }, ctx, state), null);
});

test('扩展点：势力声望 / 货币 / 路线解锁只预留名字，没有处理器；内容里写了在解析时就被拒', () => {
  assert.deepEqual([...effects.RESERVED_LINE_EFFECT_KINDS], ['factionReputation', 'currency', 'routeUnlock']);
  for (const kind of effects.RESERVED_LINE_EFFECT_KINDS) assert.equal(effects.LINE_EFFECT_HANDLERS[kind], undefined);
  const table = { version: 1, lines: [{ id: 'l', kind: 'side', name: 'n', entryHint: '', ownerCharacterIds: [], entry: { canonChapterAtLeast: 1 }, beats: [{ id: 'b', mode: 'standalone', hostEventId: null, eventId: 'e', objective: 'o', onComplete: [{ kind: 'currency', amount: 1 }], completedBy: { eventActionReceipt: { eventId: 'e', actionId: 'a' } } }] }] };
  assert.throws(() => lines.parseQuestLines(table, x => x, {}), /not whitelisted/);
});

test('剧情固定交易读 story.trades：+60 / −50 金铢与借据，回执只结算一次', () => {
  const t = GAME_NUMBERS.story.trades;
  assert.equal(t.find(x => x.actionId === 'lock_fee_then_remove_device').goldDelta, 60);
  assert.equal(t.find(x => x.actionId === 'take_ajiman_bond_in_hand').goldDelta, -50);
  const save = { 角色: { 背包: { 货币: { 金铢: { 数量: 100 } }, 物品: {} } } }, rt = { flags: {} };
  trades.settleStoryTrade(save, rt, 'lcq.event.charge_sudaji_fee', 'lock_fee_then_remove_device');
  trades.settleStoryTrade(save, rt, 'lcq.event.charge_sudaji_fee', 'lock_fee_then_remove_device');
  assert.equal(save.角色.背包.货币.金铢.数量, 160, '回执防重复');
  trades.settleStoryTrade(save, rt, 'lcq.event.free_ajiman', 'take_ajiman_bond_in_hand');
  assert.equal(save.角色.背包.货币.金铢.数量, 110);
  assert.ok(save.角色.背包.物品['lcq.item.ajiman_bond']);
  trades.settleStoryTrade(save, { flags: {} }, 'lcq.event.free_ajiman', 'tear_bond_and_face_blockade');
  assert.equal(save.角色.背包.物品['lcq.item.ajiman_bond'], undefined);
  trades.settleStoryTrade(save, rt, 'lcq.event.other', 'x');
  assert.equal(save.角色.背包.货币.金铢.数量, 110);
});

test('逐拍演出关卡读行旅数据，与原正则同义；每拍分钟数读 story.stepScene.minutesPerBeat', () => {
  const re = /^lcq\.stage_0(?:3b|4|4b)/;
  for (const id of ['lcq.stage_02', 'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04', 'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b', 'lcq.stage_03', '', undefined])
    assert.equal(step.isStepSceneStage(id), re.test(id || ''), String(id));
  assert.equal(step.stepSceneMinutesPerBeat(), 120);
});

test('NPC 境界以存档为准：缺失才按等级表补；表更高才抬；从不往下改', () => {
  const id = 'liuchao.character.ning_yu';
  const blank = {};
  actorLevels.reconcileNpcRealm(blank, id, 52);
  assert.ok(blank.境界?.名称);
  const table = characterLevels.levelFact(id, 52)?.level;
  assert.equal(realm.levelOf(blank.境界), typeof table === 'number' ? table : null, '缺失时按等级表当章行补');
  const top = GAME_NUMBERS.levels.max;
  const high = { 境界: { 名称: realm.levelName(top), 阶段: '后期' } };
  actorLevels.reconcileNpcRealm(high, id, 52);
  assert.deepEqual(high.境界, { 名称: realm.levelName(top), 阶段: '后期' }, '存档里更高的境界（如传功后）不被等级表压回去');
  if (typeof table === 'number' && table > 0) {
    const low = { 境界: { 名称: realm.levelName(table - 1), 阶段: '中期' } };
    actorLevels.reconcileNpcRealm(low, id, 52);
    assert.equal(realm.levelOf(low.境界), table, '表上当章更高时抬到表级（剧情节点定向提升）');
  }
  const unknown = { 境界: { 名称: '不详', 阶段: '', 当前进度: 0, 下一级所需: 0, 突破描述: '' } };
  actorLevels.reconcileNpcRealm(unknown, 'test.character.nobody', 52);
  assert.equal(unknown.境界.名称, '不详', '表上没有也不乱填');
});
