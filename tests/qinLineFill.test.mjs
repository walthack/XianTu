import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';
const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { CANON_RAIL_PROFILES } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const ledger = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const { resolveLedgerPath } = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const mod = CONTENT_PACKS.stages.find(s => s.manifest.id === 'lyg.qin_xianyang');
const rail = CANON_RAIL_PROFILES.find(p => p.modId === mod.manifest.id);
const id = name => `liuchao.event.qin_${name}`;
function start(extra = {}) {
  const progress = rtm.createScenarioProgress(mod);
  Object.assign(progress, { flags: { ...mod.scenario.initialFlags, 'line.nanhuang.outcome': 'resolved' }, worldTurn: 0, modId: mod.manifest.id,
    currentChapterId: rtm.getInitialScenarioChapterId(mod), nextStageId: 'NEXT', ...extra });
  return rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
}
function complete(save, eventId) {
  const rt = save.世界.状态.剧本模组;
  assert.ok(rt.activeEventIds.includes(eventId), `${eventId} 必须先激活`);
  const event = rt.events.find(e => e.id === eventId);
  for (const c of event.completion) rt.flags[c.path.slice(6)] = c.value;
  rt.worldTurn++;
  return rtm.advanceScenarioRuntime(save).saveData;
}
test('秦：直接开局逐拍推进默认 rail，线卡提示向前，最终写 unresolved 且可收束', () => {
  let save = start();
  const hints = [];
  for (const eventId of rail.orderedEventIds) {
    const view = compass.lineCompassView(save, { focusEventId: eventId, compassPointer: () => '' });
    if (view.current?.step) hints.push(view.current.step);
    save = complete(save, eventId);
  }
  const rt = save.世界.状态.剧本模组;
  assert.equal(rt.nextStageReadyId, 'NEXT');
  assert.equal(rt.flags['line.qin.outcome'], 'unresolved');
  for (const key of ['qin_entry_xu_unmet', 'qin_camp_route', 'qin_banquet', 'qin_villa']) {
    assert.ok(hints.includes(CONTENT_PACKS.texts[`lineCompass.qin.step.${key}`]), key);
  }
  assert.equal(resolveLedgerPath('line.qin.outcome', rt).value, 'unresolved');
  assert.deepEqual(rt.playerIdentities || {}, {}, '秦线不授予主角客卿或其他身份');
});
test('秦：Q8/Q13 只在救过虞氏姐妹后出现，前章完成前不抢跑', () => {
  const rescue = 'lyl.event.rescue_yu_sisters';
  for (const rescued of [false, true]) {
    let save = start({ chronicle: rescued ? [{ id: `chronicle.lyl.lin_an_palace.${rescue}`, type: 'event', stageId: 'lyl.lin_an_palace', sequence: 1 }] : [] });
    for (const eventId of rail.orderedEventIds) {
      const rt = save.世界.状态.剧本模组;
      if (eventId === id('new_year_banquet')) {
        assert.equal(rt.activeEventIds.includes(id('yu_sisters_refuge')), rescued);
        if (rescued) save = complete(save, id('yu_sisters_refuge'));
      }
      if (eventId === id('heimohai_message')) {
        assert.equal(save.世界.状态.剧本模组.activeEventIds.includes(id('yu_sisters_act2')), rescued);
        if (rescued) save = complete(save, id('yu_sisters_act2'));
      }
      save = complete(save, eventId);
    }
    assert.equal(save.世界.状态.剧本模组.nextStageReadyId, 'NEXT');
  }
});
test('秦：Q15 使用真实 party 读取；有入队规则时出现、离队后不出现；生产空表不冒认同行', () => {
  const rules = JSON.parse(fs.readFileSync('mod-kit/player-ledger-rules.json', 'utf8'));
  for (const present of [false, true]) {
    ledger.setPlayerLedgerRulesForTest({ ...rules, partyOpenings: present ? [{ stageId: mod.manifest.id, characterIds: ['liuchao.character.ning_yu'] }] : [] });
    try {
      let save = start();
      for (const eventId of rail.orderedEventIds) {
        if (eventId === id('xiaoling_villa')) {
          const rt = save.世界.状态.剧本模组;
          assert.equal(rt.activeEventIds.includes(id('ningyu_coldtrace')), present);
          assert.equal(resolveLedgerPath('party.liuchao.character.ning_yu', { ...rt, departedCast: ['liuchao.character.ning_yu'] }).value, false);
          if (present) save = complete(save, id('ningyu_coldtrace'));
        }
        save = complete(save, eventId);
      }
    } finally { ledger.setPlayerLedgerRulesForTest(undefined); }
  }
});
test('秦：18 个事件独立轴段，critical 全上 rail，Q2 五拍未实现、两步保留 pending', () => {
  assert.equal(mod.scenario.events.length, 18);
  assert.deepEqual(mod.scenario.events.map(e => e.axisSeq), [...Array.from({ length: 17 }, (_, i) => 2001 + i), 2022]);
  for (const e of mod.scenario.events) {
    assert.equal(e.axisId, null);
    if (e.critical) assert.ok(rail.orderedEventIds.includes(e.id), e.id);
    assert.ok(mod.scenario.chapters.some(c => c.eventIds.includes(e.id)), e.id);
  }
  const line = CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === 'qin');
  assert.deepEqual(line.steps.filter(s => s.pending).map(s => s.id), ['qin_baiqi', 'qin_branch_raid']);
  for (const suffix of ['act3_choose','act3_trade_route','act3_baiqi','raid_branch','close_overthrow']) assert.ok(!mod.scenario.events.some(e => e.id === id(suffix)));
});

test('秦：汉使入口只读身份，不以受封事件冒认持有；知情拍统一口信、不从晋身份推断商号', async () => {
  const view = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  for (const held of [false, true]) {
    let save = start({ playerIdentities: held ? { 'liuchao.identity.han.marquis_wuyang': { status: 'active' } } : {},
      chronicle: [{ id: 'chronicle.lyg.dingtao_beijing.lyg.event.han_marquis_wuyang_enfeoff', stageId: 'lyg.dingtao_beijing', type: 'event', sequence: 1 }] });
    save = complete(save, id('hook_fangshi_rumor'));
    save = complete(save, id('enter_xianyang'));
    assert.equal(save.世界.状态.剧本模组.activeEventIds.includes(id('entry_envoy')), held);
    if (held) save = complete(save, id('entry_envoy'));
  }
  const hook = mod.scenario.events.find(e => e.id === id('hook_fangshi_rumor'));
  for (const runtime of [{}, { playerIdentities: { 'liuchao.identity.jin.panjiang_shaozhu': { status: 'active' } } }]) {
    const description = view.resolveScenarioEventNarrative(hook, {}, undefined, runtime).description;
    assert.match(description, /商会伙计.*程少主/);
    assert.doesNotMatch(description, /盘江|云氏|徐君房|水晶球|芈太后|公子稷/);
  }
});
test('秦：正文与单步成本由内容包编译器解析', async () => {
  const raw = JSON.parse(fs.readFileSync('src/modules/contentPacks/packs/qingyu/stage-qin-xianyang.json', 'utf8'));
  for (const e of raw.scenario.events) {
    const compiled = mod.scenario.events.find(c => c.id === e.id);
    assert.equal(compiled.description, CONTENT_PACKS.texts[e.description.$text]);
    assert.equal(compiled.playerCompletionContract.actions[0].timeCost, 1);
  }
});
