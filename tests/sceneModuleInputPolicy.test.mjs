import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const contract = makeContract();
const rule = text => mod.classifyByRules(contract, text);

test('规则判定：行动不需要证据，闲聊要有正面证据', () => {
  assert.equal(rule('哈哈，我随手一刀劈了他').class, 'action');
  assert.equal(rule('我不砍他，只是躲在后面').class, 'action', '含否定也先按行动，识别层再过滤');
  assert.deepEqual([rule('这是什么剧情？').class, rule('这是什么剧情？').strength], ['chat', 'strong']);
  assert.deepEqual([rule('谢谢').class, rule('谢谢').strength], ['chat', 'medium']);
  assert.equal(rule('嗯，好吧我想想怎么办').class, 'action', '没有闲聊证据的一律按行动');
  assert.equal(rule('我借浓雾绕到他背后').class, 'action');
  assert.equal(rule('').class, 'unclear');
});

test('规则判定的两个例外：问句＋观察词＝观察行动；问句＋其它行动词＝无法识别，要澄清', () => {
  const look = rule('周围有什么可以用？');
  assert.deepEqual([look.class, look.observe], ['action', true]);
  assert.equal(rule('我砍他行吗？').class, 'unclear');
  assert.equal(rule('我能不能冲上去？').class, 'unclear');
});

test('合并：规则 × 模型 的处置表（宁错杀）', () => {
  const { policy } = mod.resolveInputPolicy([]);
  const chatStrong = { class: 'chat', strength: 'strong', evidence: ['问句'] };
  const chatMedium = { class: 'chat', strength: 'medium', evidence: ['寒暄词表'] };
  const action = { class: 'action', evidence: ['行动词“砍”'] };
  const m = klass => ({ used: true, class: klass });
  const none = { used: false };
  const d = (r, model, phase = 'engaged') => mod.route(policy, phase, r, model);
  assert.equal(d(chatStrong, m('chat')).decision, 'passThrough');
  assert.equal(d(chatStrong, none).decision, 'passThrough');
  assert.match(d(chatStrong, none).reason, /无模型确认/);
  assert.equal(d(chatMedium, m('chat')).decision, 'passThrough');
  assert.equal(d(chatMedium, none).decision, 'clarify');
  assert.deepEqual([d(chatStrong, m('action')).decision, d(chatStrong, m('action')).disagreement], ['redirectAction', true]);
  assert.deepEqual([d(chatStrong, m('unclear')).decision, d(chatStrong, m('unclear')).disagreement], ['clarify', true]);
  assert.equal(d(action, m('chat')).decision, 'redirectAction');
  assert.equal(d(action, m('chat')).disagreement, true);
  assert.equal(d({ class: 'unclear', evidence: ['问句里带行动词'] }, m('chat')).decision, 'clarify');
  assert.equal(d({ class: 'unclear', evidence: ['空输入'] }, none).decision, 'ignored');
  assert.equal(d(action, none, 'closed').decision, 'passThrough', '场面已收束：回主流程');
});

test('策略取各层最严格者；试玩的 interceptAll 把一切都交给场面；自动回退生效后也是', () => {
  assert.equal(mod.resolveInputPolicy([{ mode: 'passThroughChat' }]).policy.mode, 'passThroughChat');
  const strict = mod.resolveInputPolicy([{ mode: 'passThroughChat' }, { mode: 'interceptAll' }, { mode: 'passThroughChat' }]);
  assert.deepEqual([strict.policy.mode, strict.winningLayer], ['interceptAll', 1]);
  const fb = mod.resolveInputPolicy([{ mode: 'passThroughChat' }], true);
  assert.deepEqual([fb.policy.mode, fb.winningLayer], ['interceptAll', 'fallback']);
  const routed = mod.route(strict.policy, 'engaged', rule('这是什么剧情？'), { used: false });
  assert.equal(routed.decision, 'intercept');
});

test('宿主动作：遇敌前的行动＝强制遇敌（这句话本身不判定）；战斗中改道进行动流程；已决出未收尾要先完成收束', () => {
  assert.equal(mod.hostAction('preEncounter', 'redirectAction'), 'forceEncounter');
  assert.equal(mod.hostAction('preEncounter', 'passThrough'), 'passToMainFlow');
  assert.equal(mod.hostAction('engaged', 'redirectAction'), 'runActionPipeline');
  assert.equal(mod.hostAction('engaged', 'intercept'), 'runActionPipeline');
  assert.equal(mod.hostAction('decided', 'redirectAction'), 'askToFinishClosing');
  assert.equal(mod.hostAction('closed', 'redirectAction'), 'passToMainFlow');
  assert.equal(mod.hostAction('engaged', 'clarify'), 'clarify');
});

test('可观测：每条输入一条日志；计数不变量成立；自动回退在嫌疑 ≥ 2 或守卫丢弃 ≥ 3 时触发，下一场恢复', () => {
  const { policy } = mod.resolveInputPolicy([]);
  const base = { contractId: 'c', beat: 1, phase: 'engaged', text: '周围有什么', rule: rule('周围有什么？'), model: { used: false }, reason: 'r', policy: { mode: 'passThroughChat', fallbackActive: false, layer: 'default' }, disagreement: false, suspect: false };
  let log = mod.newInputLog();
  const add = patch => { log = mod.appendInput(log, { ...base, decision: 'passThrough', ...patch }, policy); };
  add({});
  add({ decision: 'redirectAction' });
  add({ decision: 'clarify', disagreement: true });
  add({ decision: 'ignored' });
  assert.equal(log.counters.total, 4);
  assert.deepEqual(mod.inputInvariants(log), []);
  assert.equal(log.fallbackActive, false);
  add({ suspect: ['回复里出现行动描写'] });
  assert.equal(log.fallbackActive, false);
  add({ suspect: ['原话命中行动词表'] });
  assert.equal(log.fallbackActive, true, '嫌疑累计 2 次后本场降级');
  assert.equal(log.counters.fallbacks, 1);
  assert.equal(mod.resolveInputPolicy([], log.fallbackActive).policy.mode, 'interceptAll');
  assert.equal(mod.resetFallbackForNewScene(log).fallbackActive, false);
  let guarded = mod.newInputLog();
  for (let i = 0; i < 3; i++) guarded = mod.appendInput(guarded, { ...base, decision: 'passThrough', guard: { passed: false, rejected: ['写出了未判定的结果'] } }, policy);
  assert.equal(guarded.fallbackActive, true, '守卫丢弃 3 次后降级');
  const report = mod.inputReport(guarded);
  assert.equal(report.counters.guardRejects, 3);
  assert.equal(report.review.length, 3);
  assert.match(report.text, /输入 3 条/);
});

test('日志有上限，超出的压成计数；放行回合的防火墙触发会被不变量检查抓出来', () => {
  const policy = { ...mod.resolveInputPolicy([]).policy, log: { enabled: true, cap: 3 } };
  const base = { contractId: 'c', beat: 1, phase: 'engaged', text: 'x', rule: { class: 'chat', evidence: [] }, model: { used: false }, decision: 'passThrough', reason: 'r', policy: { mode: 'passThroughChat', fallbackActive: false, layer: 'default' }, disagreement: false, suspect: false };
  let log = mod.newInputLog();
  for (let i = 0; i < 5; i++) log = mod.appendInput(log, base, policy);
  assert.equal(log.entries.length, 3);
  assert.equal(log.overflow, 2);
  assert.equal(log.counters.total, 5);
  log = mod.appendInput(log, { ...base, firewall: { before: 'a', after: 'b', changed: true } }, policy);
  assert.ok(mod.inputInvariants(log).some(p => p.includes('防火墙')));
});

test('状态防火墙指纹：场面状态变了指纹就变，克隆不变；digest 不算（它只是摘要）', () => {
  const { state } = begin(contract, { action: [10], defense: Array.from({ length: 4 }, () => 20) });
  const before = mod.sceneFingerprint(state);
  assert.equal(mod.sceneFingerprint(structuredClone(state)), before);
  const copy = structuredClone(state);
  copy.digest.push('随便一行');
  assert.equal(mod.sceneFingerprint(copy), before);
  const moved = mod.confirmAction(contract, state, attack(['foe_a']), CTX).state;
  assert.notEqual(mod.sceneFingerprint(moved), before);
  const tweaked = structuredClone(state);
  tweaked.tracks.foe_a.vit = 2;
  assert.notEqual(mod.sceneFingerprint(tweaked), before);
  assert.equal(mod.phaseOf(null), 'preEncounter');
  assert.equal(mod.phaseOf(state), 'engaged');
});
