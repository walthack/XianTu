// F02 卡点底座修复（2026-10-19）：通用挂伤（配置驱动）、外伤（重）目录条目、解除说明取自 remove 规则、休整解除、
// 幅度加价封顶、偏离信号的专名过滤、开局出生年、无交涉合同的提示。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';
import { loadTs } from './loadTs.mjs';
import { makeSave, mods, runJudged, ticket } from './freeActionFixture.mjs';

const numbers = JSON.parse(readFileSync(new URL('../mod-kit/numbers-combat.json', import.meta.url), 'utf8'));
const WR = numbers.combat.woundRules;
const ruled = (extra = {}) => ({ id: 'jab', party: 'foe_a', label: '突刺', target: 'player', attack: { dc: 14 }, onHit: { statuses: [] }, woundRule: 'default', ...extra });
const ids = (state, party = 'pc') => (state.statuses[party] || []).map(s => s.id);
const roll = (contract, faces, beats = faces.length) => {
  let { state } = begin(contract, { action: Array(beats).fill(10), defense: faces });
  const tiers = [];
  for (let i = 0; i < beats; i++) { const out = mod.confirmAction(contract, state, attack(['boss']), CTX); tiers.push(out.result.enemy[0]?.woundTier); state = out.state; }
  return { state, tiers };
};

test('挂伤规则全部在 numbers 配置：四档几率/挂哪级/扣血比例、连续重击升级、战后清轻伤', () => {
  const p = WR.profiles.default;
  assert.deepEqual(Object.keys(p.tiers).sort(), ['critical_failure', 'failure', 'great_success', 'success']);
  assert.equal(p.tiers.success.chance, 0, '普通打中不挂伤');
  assert.equal(p.tiers.great_success.status, 'wound.external');
  assert.equal(p.streak.status, 'wound.external.heavy');
  assert.equal(WR.afterWin.clearLight, true);
  assert.deepEqual(mod.validateWoundRules(makeContract()), []);
  const merged = JSON.parse(readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  assert.deepEqual(merged.combat.woundRules, WR, '合并生成物已同步');
});

test('通用挂伤：普通打中只扣气血不挂伤；重击挂外伤；连续两次重击升外伤（重）；中间断开就不升', () => {
  const contract = makeContract({ enemyActions: [ruled()] });
  const normal = roll(contract, [8]);
  assert.deepEqual(normal.tiers, ['success']);
  assert.deepEqual(ids(normal.state), []);
  assert.equal(normal.state.hpLoss.pc, WR.profiles.default.tiers.success.hpLossRatio);
  const crit = roll(contract, [1]);
  assert.deepEqual(crit.tiers, ['great_success']);
  assert.deepEqual(ids(crit.state), ['wound.external']);
  // 难度 14、防御加值 0：只有自然 1（失败再降一档＝大失败）才是重击；防御 2 差 12，未过大失败线（sceneDefaults.tiers.critFailMargin），只是打中。
  assert.deepEqual(roll(contract, [2]).tiers, ['success']);
  const streak = roll(contract, [1, 1]);
  assert.deepEqual(ids(streak.state), ['wound.external.heavy']);
  const broken = roll(contract, [1, 8, 1]);
  assert.deepEqual(broken.tiers, ['great_success', 'success', 'great_success']);
  assert.deepEqual(ids(broken.state), ['wound.external'], '不连续的重击不自动升级');
  const blocked = roll(contract, [15]);
  assert.deepEqual([blocked.tiers[0], ids(blocked.state).length], ['failure', 0]);
  assert.deepEqual(roll(contract, [20]).tiers, ['critical_failure'], '防御掷出自然 20＝防御大成功＝被大挡');
  const downed = roll(contract, [1, 1, 1]);
  assert.deepEqual(ids(downed.state), ['incapacitated'], '外伤（重）再被重击仍按升级链倒下');
});

test('合同只写配置项名或覆盖值；几率在 0–1 之间才多取一颗防御骰；配置项不存在报 LCQ-NUM-009', () => {
  const half = makeContract({ enemyActions: [ruled({ woundRule: { profile: 'default', tiers: { success: { chance: 0.5, status: 'wound.external' } } } })] });
  const lucky = roll(half, [8, 20], 1);
  assert.deepEqual(ids(lucky.state), [], '第二颗骰 20 > 0.5×面数，不挂');
  assert.equal(lucky.state.cursors.defense, 2);
  assert.deepEqual(ids(roll(half, [8, 3], 1).state), ['wound.external']);
  assert.equal(roll(makeContract({ enemyActions: [ruled()] }), [8], 1).state.cursors.defense, 1, '几率 0/1 不取骰');
  assert.throws(() => mod.resolveWoundProfile('missing'), /LCQ-NUM-009/);
  assert.deepEqual(mod.lintContract(makeContract({ enemyActions: [ruled()] })).errors, []);
  assert.ok(mod.lintContract(makeContract({ enemyActions: [ruled({ woundRule: 'missing' })] })).errors.some(e => /woundRule/.test(e)));
  const crush = makeContract({ enemyActions: [ruled({ onCrush: { margin: 5, statuses: [{ status: 'off_balance' }] } })] });
  assert.deepEqual(ids(roll(crush, [1], 1).state), ['off_balance'], '合同写了 onCrush 就按合同后果，通用挂伤不叠加');
});

test('原“打中即挂外伤”的合同改走 woundRule（只改机制字段）；剧情指定的伤保持原样', async () => {
  const { SCENE_CONTRACTS } = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const byId = id => SCENE_CONTRACTS.find(c => c.meta.id === id);
  for (const [id, action] of [['combat.f01.iron_bridge', 'assassins_attack'], ['combat.f01.iron_bridge', 'archers_attack'], ['combat.f02.snake_assault', 'snake_man_attack'], ['combat.f05.dungeon_trap', 'blood_tiger_attack'], ['combat.f06.merfolk', 'fork']]) {
    const a = byId(id).enemyActions.find(x => x.id === action);
    assert.equal(a.woundRule, 'default', `${id}.${action}`);
    assert.deepEqual(a.onHit.statuses, [], `${id}.${action}`);
  }
  // F03 护人戏改成威胁进度：火力全压主角（woundRule pressing），扑向后方的两条只推威胁轨、不挂伤（到顶由合同剧本 rear_breached 结算）。
  const f03 = byId('combat.f03.mountain_stream_fog');
  for (const id of ['press_pc', 'press_last']) assert.equal(f03.enemyActions.find(x => x.id === id).woundRule, 'pressing', id);
  for (const id of ['threat_bride', 'threat_a_xi']) {
    const a = f03.enemyActions.find(x => x.id === id);
    assert.deepEqual([a.target, a.onHit.statuses, a.woundRule, a.onHit.trackShifts.map(t => t.party)], ['player', [], undefined, ['ally_threat']], id);
  }
  for (const c of SCENE_CONTRACTS) assert.deepEqual(mod.lintContract(c).errors, [], c.meta.id);
});

test('赢了之后战后休整清掉我方轻伤（按配置）；重伤保留；输了不清；气血损失写回且不低于 keepHp', async () => {
  const wb = await loadTs('../src/modules/sceneModule/host/writeback.ts');
  const contract = makeContract();
  const rows = () => [{ party: 'pc', ref: 'test.character.hero', status: 'wound.external', label: '外伤', minutes: 10080, cause: 'combat' },
    { party: 'ally', ref: 'test.character.ally', status: 'wound.external.heavy', label: '外伤（重）', minutes: 43200, cause: 'combat' },
    { party: 'boss', ref: 'test.foe.boss', status: 'wound.external', label: '外伤', minutes: 10080, cause: 'combat' }];
  const state = { statuses: { pc: [{ id: 'wound.external' }] } };
  const win = { outcome: { kind: 'win' }, persistent: rows() };
  assert.deepEqual(wb.clearLightWoundsAfterWin(contract, state, win).map(r => r.party), ['pc']);
  assert.deepEqual(win.persistent.map(r => `${r.party}:${r.status}`), ['ally:wound.external.heavy', 'boss:wound.external']);
  assert.deepEqual(state.statuses.pc, []);
  const lose = { outcome: { kind: 'lose' }, persistent: rows() };
  assert.deepEqual(wb.clearLightWoundsAfterWin(contract, { statuses: {} }, lose), []);
  const save = { 角色: { 属性: { 气血: { 当前: 100, 上限: 100 } } } };
  const s = { hpLoss: { pc: 0.3, foe_a: 0.5 } };
  assert.equal(wb.applySceneHpLoss(save, contract, s), 30);
  assert.equal(save.角色.属性.气血.当前, 70);
  assert.deepEqual(s.hpLoss, {}, '写回后清零，不重复扣');
  const low = { 角色: { 属性: { 气血: { 当前: 5, 上限: 100 } } } };
  wb.applySceneHpLoss(low, contract, { hpLoss: { pc: 0.5 } });
  assert.equal(low.角色.属性.气血.当前, WR.hp.keepHp);
});

test('外伤（重）进状态目录：来源→效果→解除写全；解除含休整与疗伤道具；-3/-3、30 天、升级到倒下；不自愈', async () => {
  const book = JSON.parse(readFileSync(new URL('../src/modules/sceneModule/contracts/statuses.json', import.meta.url), 'utf8'));
  const heavy = book.find(s => s.id === 'wound.external.heavy');
  assert.ok(heavy?.source);
  assert.deepEqual(heavy.effects, [{ kind: 'rollModifier', scope: 'action', value: -3 }, { kind: 'rollModifier', scope: 'defense', value: -3 }]);
  assert.deepEqual(heavy.remove, [{ kind: 'rest' }, { kind: 'item', ref: 'heal' }]);
  assert.equal(heavy.remove.some(r => r.kind === 'time'), false, '不自愈');
  assert.equal(heavy.afterScene.minutes, 43200);
  assert.equal(heavy.upgradesTo, 'incapacitated');
  const { SCENE_CONTRACTS } = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const resolved = mod.resolveStatusDef('wound.external.heavy', SCENE_CONTRACTS.find(c => c.meta.id === 'combat.f02.snake_assault'));
  assert.deepEqual(resolved.remove, heavy.remove, '合同里解析到的是目录条目，不是内置兜底');
  const index = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/index.json', import.meta.url), 'utf8'));
  assert.ok(index.entries.some(e => e.kind === 'status' && e.id === 'wound.external.heavy'));
});

test('伤病文字的解除说明按状态自己的 remove 规则生成，不再一律写“休整/疗伤可解除”', async () => {
  const { toInjuryNote } = await loadTs('../src/modules/sceneModule/statusAdapters.ts');
  const item = { party: '', ref: '', status: 'x', label: '外伤（重）', minutes: 60, cause: 'combat', source: '外伤再度加重' };
  const label = tag => ({ heal: '疗伤' })[tag];
  assert.equal(toInjuryNote(item, { effects: [], remove: [{ kind: 'rest' }] }, label), '外伤（重）：外伤再度加重（60分钟，休整可解除）');
  assert.equal(toInjuryNote(item, { effects: [], remove: [{ kind: 'rest' }, { kind: 'item', ref: 'heal' }] }, label), '外伤（重）：外伤再度加重（60分钟，休整/疗伤类道具可解除）');
  assert.equal(toInjuryNote(item, { effects: [], remove: [{ kind: 'time', minutes: 60 }] }, label), '外伤（重）：外伤再度加重（60分钟）');
});

test('调息疗伤/休整成功按每个状态的 rest 规则解除玩家伤病；“休息一整夜”写进变体提示', () => {
  const spec = mods.config.variantSpecOf('solo', 'recover');
  assert.match(spec.hint, /休息一整夜/);
  for (const re of [/不针对在场某人也出票/, /targetId填null/, /满血也算/, /为他人疗伤不是本项/]) assert.match(spec.hint, re);
  assert.ok(spec.restRemoval.outcomes.includes('success'));
  const seed = (save) => {
    const runtime = save.世界.状态.剧本模组, pid = runtime.opening.playerCharacterId;
    const row = (statusId, label, remove) => ({ player: true, statusId, label, sourceScene: 'combat.f01.iron_bridge', cause: 'combat', source: '外伤再度加重', appliedAt: 0, expiresAt: null, effects: [], remove });
    runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] };
    runtime.sceneLedger.statusRecords = { version: 1, actors: { [pid]: [row('wound.external.heavy', '外伤（重）', [{ kind: 'rest' }]), row('wound.poison', '中毒', [{ kind: 'item', ref: 'antidote' }])] }, groups: {}, groupLabels: {} };
    save.角色.效果 = [{ 状态名称: '外伤（重）', 来源: 'combat.f01.iron_bridge' }, { 状态名称: '中毒', 来源: 'combat.f01.iron_bridge' }];
    return pid;
  };
  const ok = makeSave(); const pid = seed(ok);
  const { result } = runJudged(ok, ticket('solo', 'recover', null), 'success');
  assert.equal(result.ok, true);
  assert.deepEqual(ok.世界.状态.剧本模组.sceneLedger.statusRecords.actors[pid].map(r => r.statusId), ['wound.poison'], '旧存档那条只写了 rest 的外伤（重）也能被休整解除');
  assert.deepEqual(ok.角色.效果.map(e => e.状态名称), ['中毒']);
  assert.ok(result.facts.some(f => /外伤（重）已经解除/.test(f)));
  const bad = makeSave(); seed(bad);
  runJudged(bad, ticket('solo', 'recover', null), 'failure');
  assert.equal(bad.角色.效果.length, 2, '没成功不解除');
});

test('幅度加价按实际能兑现的步数收，支援/防守目标不收', () => {
  assert.equal(mod.premiumMagnitude(3, [{ realizable: 1 }]), 1);
  assert.equal(mod.premiumMagnitude(2, [{ realizable: 3 }, { realizable: 0, blocked: 'x' }]), 2);
  assert.equal(mod.premiumMagnitude(3, [{ realizable: 3, blocked: 'x' }]), 0);
  const contract = makeContract();
  const { state } = begin(contract);
  state.tracks.foe_b = { vit: 1 };
  const capped = mod.evaluatePlan(contract, state, attack(['foe_b'], 3), CTX);
  assert.equal(capped.difficultyParts.premium, numbers.sceneDefaults.pricing.premium['1'], 'foe_b 只剩 1 步');
  const support = mod.evaluatePlan(contract, state, { goal: 'guard', magnitude: 3, scope: 'single', targets: [], levers: [], text: '掩护' }, CTX);
  assert.equal(support.difficultyParts.premium, 0);
});

test('偏离信号：常用说法和登记过的实体不算陌生专名；编造的阵名、宫名仍算', async () => {
  const { computeDivergenceSignal, properNounCore } = await loadTs('../src/modules/scenarioMods/divergenceControl.ts');
  assert.equal(properNounCore('你推开门'), '');
  assert.equal(properNounCore('闯荡江湖'), '');
  assert.equal(properNounCore('与巫神祭典'), '巫神祭典');
  const save = text => ({ 世界: { 状态: { 剧本模组: { chapters: [], events: [], activeEventIds: [], completedEventIds: [], stallTurns: 0, canon: {} } } }, 系统: { 历史: { 叙事: [{ content: text }] } } });
  assert.equal(computeDivergenceSignal(save('你推开门走上山，进了城，大殿里一会儿就安静了。')).unfamiliarProperNounDensity, 0);
  assert.ok(computeDivergenceSignal(save('九幽噬魂阵在圣王宫下开启。')).unfamiliarProperNounDensity > 0);
});

test('开局出生年 = 当前年 − 寿命.当前（没有就用开局预设 age）；寿元上限不动；缺数据记 LCQ-SAV-019', async () => {
  const { alignBirthWithStartYear } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const s = { 元数据: { 时间: { 年: 200, 月: 1, 日: 4 } }, 角色: { 身份: { 出生日期: { 年: 200, 月: 3, 日: 9 } }, 属性: { 寿命: { 当前: 18, 上限: 80 } } } };
  assert.equal(alignBirthWithStartYear(s, 20), true);
  assert.deepEqual(s.角色.身份.出生日期, { 年: 182, 月: 1, 日: 4 });
  assert.equal(s.角色.属性.寿命.上限, 80);
  const p = { 元数据: { 时间: { 年: 200, 月: 6, 日: 1 } }, 角色: { 身份: { 出生日期: { 年: 200, 月: 1, 日: 1 } }, 属性: {} } };
  alignBirthWithStartYear(p, 20);
  assert.equal(p.角色.身份.出生日期.年, 180);
  assert.equal(alignBirthWithStartYear({ 元数据: {}, 角色: { 身份: {} } }), false);
  const opened = makeSave();
  const now = opened.元数据.时间.年, birth = opened.角色.身份.出生日期.年;
  assert.equal(now - birth, opened.角色.属性.寿命.当前, '真实开局路径已对齐');
});

test('本场没有交涉目标时，交涉说法给明确提示，不改判成防守；有交涉目标的合同照常', async () => {
  const { negotiationUnsupported } = await loadTs('../src/modules/sceneModule/host/recognize.ts');
  const { SCENE_CONTRACTS } = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const f02 = SCENE_CONTRACTS.find(c => c.meta.id === 'combat.f02.snake_assault'), f06 = SCENE_CONTRACTS.find(c => c.meta.id === 'combat.f06.merfolk');
  assert.equal(negotiationUnsupported(f02, '我收起兵刃，劝他住手说清缘由'), true);
  assert.equal(negotiationUnsupported(f02, '我举起空手，与他交涉'), true);
  assert.equal(negotiationUnsupported(f02, '我挥刀砍向蛇人'), false);
  assert.equal(negotiationUnsupported(f06, '我与鲛人交涉'), false);
  const src = readFileSync(new URL('../src/modules/sceneModule/host/controller.ts', import.meta.url), 'utf8');
  assert.match(src, /NO_NEGOTIATION_NOTICE=negotiationConfig\(\)\.notice/);
});
