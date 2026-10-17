// 自由行动：配置体检（T18）、事实/记忆/闸门文本齐全、事实行用词不得触发关键词守卫（previewWangZheStayEnding）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { load, mods } from './freeActionFixture.mjs';

const rt = await load('../src/modules/scenarioMods/runtime.ts');
const { CONTENT_PACKS } = await load('../src/modules/contentPacks/index.ts');
const cfg = () => mods.config.freeActionConfig();
const clone = () => structuredClone(cfg());

test('配置体检通过；文本体检通过（每个启用变体的每个可能结果都有事实文本与记忆文本）', () => {
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.deepEqual(mods.facts.validateFreeActionTexts(), []);
});

test('配置里的引用与跨键约束：gain 引用 training.*，perBeatCap = affinity.limits.perTurn = 单拍钳制，攻击难度 = combat.baselineDc', () => {
  const N = mods.numbers.GAME_NUMBERS;
  const qi = mods.config.variantSpecOf('cast', 'transfer_qi');
  assert.equal(qi.gain.base, N.training.successProgress);
  assert.equal(qi.gain.perTransferCap, N.training.greatProgress);
  assert.equal(cfg().affinity.perBeatCap, N.affinity.limits.perTurn);
  assert.equal(rt.clampLineAffinityDelta(1000), cfg().affinity.perBeatCap);
  assert.equal(rt.clampLineAffinityDelta(-1000), -cfg().affinity.perBeatCap);
  assert.equal(mods.config.variantSpecOf('physical', 'attack').difficulty, N.combat.baselineDc);
  assert.equal(cfg().affinity.majorAbs, 10);
  assert.equal(N.status.lifeFloor.ratio, 0.1, 'lifeFloor 用 status.lifeFloor.ratio');
  assert.equal(cfg().lifeFloor, undefined, 'freeAction 下不再另设 lifeFloor');
});

test('T18 配置负向：未知类、变体缺必填参数、不认识的 effect、矩阵缺格、难度/上限漂移 → 体检报错', () => {
  const expectErrors = (mutate, pattern) => {
    const c = clone();
    mutate(c);
    const errors = mods.config.validateFreeActionConfig(c);
    assert.ok(errors.some(e => pattern.test(e)), `${pattern} ⊄ ${JSON.stringify(errors)}`);
  };
  expectErrors(c => { c.classes.sorcery = { label: 'x', variants: {} }; }, /sorcery/);
  expectErrors(c => { delete c.classes.cast.variants.heal.base; }, /heal.*base/);
  expectErrors(c => { delete c.classes.physical.defaults.kind; }, /judge 缺 kind/);
  expectErrors(c => { c.classes.cast.variants.heal.effect = 'teleport'; }, /effect teleport/);
  expectErrors(c => { delete c.classes.intimate.variants.kiss.matrix.mid.closed; }, /matrix\.mid\.closed/);
  expectErrors(c => { c.classes.intimate.variants.kiss.matrix.low.open = 'explode'; }, /matrix\.low\.open/);
  expectErrors(c => { c.classes.physical.variants.attack.npcOutcomes.perfect = ''; }, /npcOutcomes 缺 perfect/);
  expectErrors(c => { c.classes.physical.defaults.difficulty = 99; }, /baselineDc/);
  expectErrors(c => { c.affinity.perBeatCap = 5; }, /perTurn/);
  expectErrors(c => { c.classes.cast.variants.transfer_qi.gain.base = 'training.noSuchKey'; }, /gain\.base/);
  expectErrors(c => { delete c.classes.give; }, /give/);
  expectErrors(c => { delete c.classes.intimate.intimacy.reactionEffect.refuse; }, /reactionEffect 缺 refuse/);
  expectErrors(c => { c.classes.intimate.intimacy.temperamentRemap.reserved.accept = 'melt'; }, /temperamentRemap.*accept→melt/);
});

test('T18b 文本负向：缺任何一条事实/记忆/闸门/判定卡文案，体检点名', () => {
  const texts = { ...CONTENT_PACKS.texts };
  for (const id of ['free.fact.attack.wound', 'free.memory.kiss.deflect', 'free.fact.gate.cooldown', 'free.fact.protected', 'free.why', 'free.stakes.physical.failure']) {
    const broken = { ...texts };
    delete broken[id];
    assert.ok(mods.facts.validateFreeActionTexts(broken).some(e => e.includes(id)), id);
  }
});

test('事实行用词：任何事实/闸门/记忆模板渲染结果（含整块事实行）都不会让 previewWangZheStayEnding 返回非空', () => {
  const save = {
    世界: { 状态: { 剧本模组: {
      flags: {},
      activeEventIds: ['lcq.event.s02_02'],
      eventActionStates: { 'lcq.event.s02_02': { attempts: [{ actionId: 'witness_wang_zhe_nine_suns', outcome: 'success' }] } },
      events: [{ id: 'lcq.event.s02_02', fatalOutcomes: { deadline: { ending: 'wangzhe_stay_ending' } } }],
    } } },
  };
  for (const control of ['我不走，留下来看王哲', '我留在原地', '我不逃也不撤']) {
    assert.ok(rt.previewWangZheStayEnding(save, control), `对照：${control} 应触发守卫，夹具才有意义`);
  }
  const slots = { player: '程宗扬', target: '王哲', item: '解毒丸', status: '重伤', label: '攻击' };
  const ids = Object.keys(CONTENT_PACKS.texts).filter(id => id.startsWith('free.'));
  assert.ok(ids.length > 100);
  for (const id of ids) {
    const text = mods.facts.fillSlots(CONTENT_PACKS.texts[id], slots);
    for (const line of [text, mods.facts.renderSettledBlock([text, text]), mods.facts.renderRefusedBlock([text])]) {
      assert.equal(rt.previewWangZheStayEnding(save, line), undefined, `${id}：${line}`);
    }
  }
});

test('事实行与记忆模板只有代码填的显示名槽位，不含玩家原话槽位', () => {
  // facts/changes/items/name/count/amount：回合事实块、背包事实、回执里由代码填的槽位（事实行、物品名、数量），同样不收玩家原话。
  const allowed = new Set(['player', 'target', 'item', 'status', 'label', 'facts', 'changes', 'items', 'name', 'count', 'amount']);
  for (const [id, text] of Object.entries(CONTENT_PACKS.texts).filter(([id]) => id.startsWith('free.'))) {
    for (const part of text.split('{').slice(1)) assert.ok(allowed.has(part.split('}')[0]), `${id} 含未知槽位`);
  }
});
