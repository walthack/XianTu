import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/playtest-1aae/${n}`, import.meta.url), 'utf8'));
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
process.env.COMBAT_SIM_N ||= '400';
const sim = await import('../scripts/combat-simulation.mjs');
const F13 = 'combat.f13.ghost_king_final';

// P0：真机 F13 0/5。模拟器与真机同一 core；差在参考玩家每拍都抹「真阳之血」，真机玩家只写「守住井口」。
test('F13：真机画像（只用地形抓手）下旧难度 14 只有约 25%，复现真机连输', () => {
  const c = structuredClone(registry.sceneContractById(F13));
  c.goals.find(g => g.id === 'hold_well').baseDifficulty = 14;
  const plain = sim.simulateContract(c, 400, sim.plainPlayerOpts(c)).winRate;
  const full = sim.simulateContract(c, 400).winRate;
  assert.ok(plain < 0.3, `plain ${plain}`);
  assert.ok(full > 0.6, `全抓手 ${full}（旧模拟 65% 的来源）`);
});

test('F13：门槛按真机画像算，调到难度 10 后落在 40%–75%', () => {
  const c = registry.sceneContractById(F13);
  assert.ok(sim.plainPlayerOpts(c), 'F13 在 plainPlayer.contracts 里');
  const plain = sim.simulateContract(c, 400, sim.plainPlayerOpts(c)).winRate;
  assert.ok(plain >= 0.4 && plain <= 0.75, `plain ${plain}`);
});

// P1-1：F10 骨爪原来 onHit 直挂外伤，普通命中（没标重击）也挂上「外伤（重）（加重）」。
test('F10 骨爪改走通用挂伤规则；全部合同都不再普通命中直挂外伤', () => {
  const c = registry.sceneContractById('combat.f10.ghost_king_clash');
  const claw = c.enemyActions.find(a => a.id === 'bone_claw');
  assert.equal(claw.woundRule, 'default');
  assert.deepEqual(claw.onHit.statuses, []);
  for (const k of registry.SCENE_CONTRACTS) for (const a of k.enemyActions || []) assert.ok(!(a.onHit?.statuses || []).some(s => String(s.status).startsWith('wound.external')), `${k.meta.id}.${a.id}`);
});

// P1-2：「过吊桥击退守卫」战后记录漏出 liuchao.character.yi_biao外伤。
test('F03 吊桥战：前锋按存档角色名显示，不漏原始 id', async () => {
  const refs = await loadTs('../src/modules/sceneModule/host/refs.ts');
  const q = await loadTs('../src/modules/sceneModule/queries.ts');
  const f = fx('f03entry-runtime.json');
  assert.match(f.memoryNote, /liuchao\.character\.yi_biao外伤/, '真机原文');
  const c = registry.sceneContractById('combat.f03.escape_followup');
  for (const p of c.parties.filter(p => p.side === 'player_side')) {
    const shown = refs.renderRefs(q.partyDisplay(c, p.id), f);
    assert.doesNotMatch(shown, /[a-z_]+\.[a-z_]+\./, `${p.id} → ${shown}`);
  }
});

// P1-3：CP-1aae-07 读回后谢艺三选项没了。存档里这一事件已完成、选择旗标没写：事件完成/选项逻辑在冻结文件 runtime.ts，本轮只复现不改。
test('CP-07：谢艺选择前的事件在存档里已完成且没有选择回执（冻结文件，待处理）', () => {
  const f = fx('cp07-xieyi-choice-lost.json');
  assert.ok(f.completedEventIds.includes('lcq.event.s05b_09_temporary_pact_with_xiaozi'));
  assert.equal(f.flags['event.xieyi_entrustment.done'], false);
  assert.ok(f.activeEventIds.includes('lcq.event.s05b_10_slave_revolt_and_phoenix_change'));
});

// P1-4：一期末尾「继续到下一期」在自动推进时点了没反应（按钮被残留的生成中标记禁用）。
test('继续到下一期：本期已结束时，残留的生成中标记不挡按钮；只有自己的请求在途才挡', async () => {
  const { phaseContinueBlocked } = await loadTs('../src/modules/scenarioMods/phaseContinue.ts');
  assert.equal(phaseContinueBlocked({ pending: false, processing: true, finished: true }), false);
  assert.equal(phaseContinueBlocked({ pending: true, processing: false, finished: true }), true);
  assert.equal(phaseContinueBlocked({ pending: false, processing: true, finished: false }), true);
  const vue = readFileSync('src/components/dashboard/MainGamePanel.vue', 'utf8');
  assert.match(vue, /:disabled="phaseContinueBlocked\(/);
});

// P1-5（只查不改）：判负「回到上一轮」是整档读回「上次对话」槽，不是疗伤；赢了只清轻伤状态、不回气血。
test('回滚与战后休整：回滚只读回上次对话槽；赢后休整只清配置里的轻伤，不回气血', async () => {
  const store = readFileSync('src/stores/characterStore.ts', 'utf8');
  const body = store.slice(store.indexOf('const rollbackToLastConversation'), store.indexOf('const rollbackToLastConversation') + 4000);
  assert.match(body, /'上次对话'/);
  assert.doesNotMatch(body, /气血|疗伤|heal/);
  const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.deepEqual(GAME_NUMBERS.combat.woundRules.afterWin.statuses, ['wound.external', 'wound.burn']);
});
