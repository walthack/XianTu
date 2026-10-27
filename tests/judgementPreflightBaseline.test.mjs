// 旧关键词预检（judgementPreflight 八类）与旧判定引擎确定性结算的迁移前基线。
// 这里锁的是“当前实际输出”，不是“应有输出”：包括明显粗糙的命中（如“我不想修炼”也算修炼）。
// 迁移 freeAction 无对象大类（solo / field）时，旧流程这些输出必须一字不变；要改，先改这里并说明理由。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
const engine = await loadTs('../src/utils/judgementEngine.ts');
const { levelName } = await loadTs('../src/utils/realmUtils.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');

// 六司取值拉开差距，让各类权重的差别能在“六司”因子上看出来。
const baseSave = () => ({
  角色: {
    身份: {
      先天六司: { 悟性: 18, 灵性: 2, 心性: 10, 根骨: 14, 气运: 6, 魅力: 20 }, 后天六司: { 悟性: 1 },
      天赋: [{ 名称: '过目不忘', 描述: '探查辨识线索更快' }],
    },
    位置: { 灵气浓度: 60 },
    属性: { 气血: { 当前: 100, 上限: 100 } },
    技能: { 掌握技能: [{ 技能名称: '追风步', 熟练度: 30 }] },
  },
  世界: { 状态: { 剧本模组: { canon: { skills: [{ name: '追风步', description: '轻功身法，疾行如风', type: '身法' }] } } } },
});

const project = proposal => proposal && [
  proposal.kind, proposal.difficulty.band, proposal.difficulty.value, proposal.canonPolicy,
  proposal.factors.map(f => `${f.label}:${f.value}:${f.source}`).join('|'),
];
const F = (stat, ...extra) => [`六司:${stat}:attribute`, ...extra, '幸运:0:condition', '环境:1:environment'].join('|');

// [玩家句子, 期望投影]；null = 不发判定卡。
const PREFLIGHT_CASES = [
  // 不该出卡的
  ['我先和店家闲聊几句', null],
  ['我吃了碗面，在街边坐下', null],
  ['他说你要攻击我', null], // 转述不算本轮动作
  // combat（难度 20 / hard）
  ['我出手攻击他', ['combat', 'hard', 20, 'free', F(2)]],
  ['我拔剑斩向守卫', ['combat', 'hard', 20, 'free', F(2)]],
  ['打晕守卫', ['combat', 'hard', 20, 'free', F(2)]],
  ['我抢夺腰牌', ['combat', 'hard', 20, 'free', F(2)]],
  ['朝他射出一箭', ['combat', 'hard', 20, 'free', F(2)]],
  // escape（20 / hard，六司权重与 combat 不同）；点名已掌握正典技能 +2
  ['我趁乱逃跑', ['escape', 'hard', 20, 'free', F(0)]],
  ['甩开身后的追踪者', ['escape', 'hard', 20, 'free', F(0)]],
  ['我施展追风步逃跑', ['escape', 'hard', 20, 'free', F(0, '正典技能·追风步:2:skill')]],
  // stealth（20 / hard）
  ['我潜入府邸', ['stealth', 'hard', 20, 'free', F(0)]],
  ['趁乱偷走腰牌', ['stealth', 'hard', 20, 'free', F(0)]],
  ['撬锁进入密室', ['stealth', 'hard', 20, 'free', F(0)]],
  // craft（25 / severe）
  ['我炼丹', ['craft', 'severe', 25, 'free', F(2)]],
  ['锻造一柄法器', ['craft', 'severe', 25, 'free', F(2)]],
  ['制作丹药', ['craft', 'severe', 25, 'free', F(2)]],
  // cultivate（难度取 combat.baselineDc / normal）：练功、闭关、冲关、调息疗伤、双修、运功都归这一类
  ['我闭关修炼', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['我开始练功', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['我冲关突破', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['我盘膝调息疗伤', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['我和她双修', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['运功一周天', ['cultivate', 'normal', 11, 'free', F(2)]],
  ['我不想修炼', ['cultivate', 'normal', 11, 'free', F(2)]], // 粗糙命中，不看否定
  // social / scheme（15 / normal）
  ['我劝他放我们过去', ['social', 'normal', 15, 'free', F(2)]],
  ['我威胁他交出钥匙', ['social', 'normal', 15, 'free', F(2)]],
  ['我想谈判', ['social', 'normal', 15, 'free', F(2)]],
  ['我收服这个人为手下', ['social', 'normal', 15, 'free', F(2)]], // 无事件合同时不走 if_only
  ['我撒谎骗过门房', ['scheme', 'normal', 15, 'free', F(2)]],
  ['我伪装成送货人', ['scheme', 'normal', 15, 'free', F(2)]],
  ['我设局栽赃他', ['scheme', 'normal', 15, 'free', F(2)]],
  // explore（15 / normal）；点名天赋 +4
  ['我搜索暗室里的线索', ['explore', 'normal', 15, 'free', F(1)]],
  ['我探查四周', ['explore', 'normal', 15, 'free', F(1)]],
  ['我翻越围墙', ['explore', 'normal', 15, 'free', F(1)]],
  ['我借过目不忘搜查线索', ['explore', 'normal', 15, 'free', F(1, '天赋·过目不忘:4:talent')]],
  // 一句话命中多类：按 RISK_RULES 的先后取第一类
  ['我潜入后攻击守卫', ['combat', 'hard', 20, 'free', F(2)]],
  ['我逃跑并且炼丹', ['escape', 'hard', 20, 'free', F(0)]],
];

test('旧预检基线：代表性玩家句子 → 判定类别 / 难度 / 因子', () => {
  for (const [sentence, expected] of PREFLIGHT_CASES) {
    assert.deepEqual(project(buildLocalJudgementPreflight(sentence, baseSave(), 7)), expected, sentence);
  }
});

test('旧预检基线：判定卡的风险说明与理由是固定文本，不带目标', () => {
  const proposal = buildLocalJudgementPreflight('我出手攻击他', baseSave(), 7);
  assert.equal(proposal.whyNow, '该行动存在可见风险或资源代价，需在叙事前确认。');
  assert.equal(proposal.actionText, '我出手攻击他');
  assert.equal(proposal.target, undefined);
  assert.equal(proposal.authorityReceipt, undefined);
  assert.deepEqual(proposal.stakes, {
    perfect: '以压倒性优势达成目标，且不留下额外代价。',
    greatSuccess: '大幅推进当前目标，并取得额外收益。',
    success: '按当前做法取得直接进展。',
    partial: '达成部分目标，但会留下代价或余波。',
    failure: '行动受阻，局势可能恶化；可以换做法或先准备。',
    criticalFailure: '局势显著恶化，必须承接更重的余波。',
  });
});

test('旧预检基线：cultivate 难度取 combat.baselineDc，不是写死的常数', () => {
  assert.equal(buildLocalJudgementPreflight('我闭关修炼', baseSave(), 7).difficulty.value, GAME_NUMBERS.combat.baselineDc);
});

// ---- 旧引擎确认判定时的确定性结算（deterministicOutcomeEffects）----
const realm = (stage, progress) => ({ 名称: levelName(1), 阶段: stage, 当前进度: progress, 下一级所需: 100 });

function resolveOnce(sentence, outcome, { realmState = realm('中期', 30), trainingCap } = {}) {
  const save = baseSave();
  save.角色.属性.神识 = { 当前: 40, 上限: 100 };
  save.角色.属性.境界 = realmState;
  save.角色.效果 = [];
  if (trainingCap) save.系统 = { 难度设置: { autoRaiseLevel: true, trainingCap } };
  const proposal = buildLocalJudgementPreflight(sentence, save, 7);
  engine.persistPendingJudgement(save, proposal);
  const resolution = engine.resolvePendingJudgement(save, proposal.id, { roll: () => 10, testOutcome: outcome, currentTurn: 7 });
  const effects = resolution.appliedEffects.map(e => e.key === '角色.效果'
    ? [e.key, e.action, e.value.状态名称, e.value.持续时间分钟]
    : e.key === '系统.扩展.行动门控.recent' ? [e.key, e.value.scope, e.value.outcome, e.value.ttlTurns] : [e.key, e.action, e.value]);
  return { effects, hp: save.角色.属性.气血.当前, spirit: save.角色.属性.神识.当前, realm: save.角色.属性.境界 };
}
const GATE = (scope, outcome) => ['系统.扩展.行动门控.recent', scope, outcome, 3];

test('旧引擎基线：cultivate 修炼 / 练功只在成功档写境界进度（trainingRealm）', () => {
  const stage = realm('中期', 30);
  assert.deepEqual(resolveOnce('我闭关修炼', 'success').realm, { ...stage, 当前进度: 40 });
  assert.deepEqual(resolveOnce('我闭关修炼', 'great_success').realm, { ...stage, 当前进度: 50 });
  assert.deepEqual(resolveOnce('我闭关修炼', 'perfect').realm, { ...stage, 当前进度: 50 }); // 完美与大成功同量
  // 失败档不涨，只留行动余波
  const failed = resolveOnce('我闭关修炼', 'failure');
  assert.deepEqual(failed.realm, stage);
  assert.deepEqual(failed.effects, [GATE('scene', 'failure')]);
  // 进度满阶段：初期→中期、中期→后期，进度清零
  assert.deepEqual(resolveOnce('我开始练功', 'success', { realmState: realm('初期', 95) }).realm, realm('中期', 0));
  assert.deepEqual(resolveOnce('我闭关修炼', 'success', { realmState: realm('中期', 95) }).realm, realm('后期', 0));
  // 后期满进度：修炼不再前进，但仍会发一条“境界 set”（内容不变）
  const full = resolveOnce('我闭关修炼', 'success', { realmState: realm('后期', 100), trainingCap: 'none' });
  assert.deepEqual(full.realm, realm('后期', 100));
  assert.equal(full.effects.length, 1);
});

test('旧引擎基线：冲关只在后期满进度且未到上限时生效，失败按 failureRetention 折损', () => {
  const late = realm('后期', 100);
  // 用户 2026-10-27 13:40 定取消练功章节上限：默认难度（trainingCap=none）满进度即可冲关；
  // 旧档存的 canon 在查不到剧情级数时也不再把上限退成当前级
  assert.equal(resolveOnce('我冲关突破', 'success', { realmState: late }).realm.阶段, '初期');
  assert.equal(resolveOnce('我冲关突破', 'success', { realmState: late, trainingCap: 'canon' }).realm.阶段, '初期');
  // 到境界最高级就停
  assert.deepEqual(resolveOnce('我冲关突破', 'success', { realmState: { ...late, 名称: levelName(GAME_NUMBERS.levels.max) } }).effects, []);
  // 上限放开：成功升一级、阶段回初期
  const up = resolveOnce('我冲关突破', 'success', { realmState: late, trainingCap: 'none' });
  assert.equal(up.realm.阶段, '初期');
  assert.equal(up.realm.当前进度, 0);
  assert.notEqual(up.realm.名称, late.名称);
  // 失败与部分成功：进度折损到 failureRetention，并留余波
  for (const outcome of ['partial', 'failure']) {
    const lost = resolveOnce('我冲关突破', outcome, { realmState: late, trainingCap: 'none' });
    assert.deepEqual(lost.realm, { ...late, 当前进度: Math.floor(100 * GAME_NUMBERS.training.failureRetention) }, outcome);
    assert.deepEqual(lost.effects.at(-1), GATE('scene', outcome));
  }
  // 阶段不够：不动
  assert.deepEqual(resolveOnce('我冲关突破', 'success', { trainingCap: 'none' }).effects, []);
});

test('旧预检：修炼／冲关部分成功的说明与结算数值一致（同自由行动自修，真机 1f9f24127b4e）；其余 cultivate 与别的类仍用通用句', () => {
  const GENERIC = '达成部分目标，但会留下代价或余波。';
  const partialOf = (sentence, realmState = realm('中期', 30)) => {
    const save = baseSave();
    save.角色.属性.境界 = realmState;
    save.系统 = { 难度设置: { autoRaiseLevel: true, trainingCap: 'none' } };
    return buildLocalJudgementPreflight(sentence, save, 7).stakes.partial;
  };
  // 练功：部分成功进度不涨
  for (const sentence of ['我闭关修炼', '我开始练功']) {
    assert.equal(partialOf(sentence), '修炼了一阵，修为没有实在的进益。', sentence);
    assert.deepEqual(resolveOnce(sentence, 'partial').realm, realm('中期', 30), `${sentence}：部分成功进度不涨`);
  }
  // 冲关：后期满进度时部分成功按失败折损
  const late = realm('后期', 100);
  assert.equal(partialOf('我冲关突破', late), '冲关未成，已积累的修为折损一部分。');
  assert.equal(resolveOnce('我冲关突破', 'partial', { realmState: late, trainingCap: 'none' }).realm.当前进度, Math.floor(100 * GAME_NUMBERS.training.failureRetention));
  // 冲关时机未到：结算不动境界，不说折损，也不说成修炼
  assert.equal(partialOf('我冲关突破'), GENERIC);
  // 调息疗伤、双修：部分成功有回血等收益，仍用通用句；别的类不受影响
  for (const sentence of ['我盘膝调息疗伤', '我和她双修', '我出手攻击他']) assert.equal(partialOf(sentence), GENERIC, sentence);
});

test('旧引擎基线：调息疗伤按结果档回气血/神识，双修另得“阴阳调和”', () => {
  const heal = outcome => resolveOnce('我盘膝调息疗伤', outcome);
  assert.deepEqual(heal('partial').effects, [['角色.属性.气血.当前', 'set', 100], ['角色.属性.神识.当前', 'set', 45], GATE('scene', 'partial')]);
  assert.equal(heal('success').spirit, 55);
  assert.equal(heal('perfect').spirit, 80);
  assert.deepEqual(heal('failure').effects, [GATE('scene', 'failure')]);
  const dual = resolveOnce('我和她双修', 'success');
  assert.deepEqual(dual.effects.at(-1), ['角色.效果', 'upsert', '阴阳调和', 240]);
});

test('旧引擎基线：combat 失败按比例扣气血，所有非成功档写行动余波，余波范围按类', () => {
  const hit = outcome => resolveOnce('我出手攻击他', outcome);
  assert.deepEqual(hit('partial').effects, [['角色.属性.气血.当前', 'add', -5], GATE('combat', 'partial')]);
  assert.deepEqual(hit('failure').effects, [['角色.属性.气血.当前', 'add', -15], GATE('combat', 'failure')]);
  assert.deepEqual(hit('critical_failure').effects, [['角色.属性.气血.当前', 'add', -40], GATE('combat', 'failure')]);
  assert.deepEqual([hit('partial').hp, hit('failure').hp, hit('critical_failure').hp], [95, 85, 60]);
  assert.deepEqual(hit('success').effects, []);
  // 余波范围：escape→combat，stealth/craft/explore/cultivate→scene，social/scheme→social；只有 combat 扣血
  assert.deepEqual(resolveOnce('我趁乱逃跑', 'failure').effects, [GATE('combat', 'failure')]);
  assert.deepEqual(resolveOnce('我潜入府邸', 'failure').effects, [GATE('scene', 'failure')]);
  assert.deepEqual(resolveOnce('我炼丹', 'failure').effects, [GATE('scene', 'failure')]);
  assert.deepEqual(resolveOnce('我搜索暗室里的线索', 'failure').effects, [GATE('scene', 'failure')]);
  assert.deepEqual(resolveOnce('我劝他放我们过去', 'partial').effects, [GATE('social', 'partial')]);
  assert.deepEqual(resolveOnce('我撒谎骗过门房', 'critical_failure').effects, [GATE('social', 'failure')]);
  assert.deepEqual(resolveOnce('我炼丹', 'success').effects, []);
});
