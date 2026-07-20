import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const prompt = '【小紫·角色表演卡（逐轮硬合同）】';

test('voice-card decision scene rejects report-only performance and explains the retry', async () => {
  const { validateNarrativePerformance, performanceRetryInstruction } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const result = validateNarrativePerformance(
    '小紫道：“敌军还在城外。程头儿要不要去看看？”她等着回话。',
    '让小紫说明敌情和下一步计划',
    prompt,
  );
  assert.equal(result.valid, false);
  assert.match(result.issues[0], /只汇报\/等待/);
  assert.match(performanceRetryInstruction(result.issues), /不得让主角代为分析\/下令/);
});

test('voice-card decision scene accepts a named active plan and ignores ordinary chat', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  assert.equal(validateNarrativePerformance(
    '小紫笑道：“我已让人盯住东门。程头儿现在可走水路，也可等我的后手。”',
    '询问小紫对局势的安排',
    prompt,
  ).valid, true);
  assert.equal(validateNarrativePerformance(
    '小紫抱着茶盏打了个呵欠。',
    '陪小紫喝茶闲聊',
    prompt,
  ).valid, true);
});

test('split performance retry discards only the retryable draft and preserves the final draft', async () => {
  const { decideNarrativePerformanceAttempt } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const reportOnly = '小紫道：“敌军还在城外。程头儿要不要去看看？”她等着回话。';

  const first = decideNarrativePerformanceAttempt(reportOnly, '让小紫说明敌情和下一步计划', prompt, 1, 2);
  assert.equal(first.valid, false);
  assert.equal(first.shouldRetry, true);
  assert.equal(first.narrative, '');
  assert.match(first.retryInstruction, /上稿未通过内部检查/);

  const final = decideNarrativePerformanceAttempt(reportOnly, '让小紫说明敌情和下一步计划', prompt, 2, 2);
  assert.equal(final.valid, false);
  assert.equal(final.shouldRetry, false);
  assert.equal(final.narrative, reportOnly);
});

test('internal control protocol leakage triggers a retry even outside decision scenes', async () => {
  const { validateNarrativePerformance, performanceRetryInstruction } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const result = validateNarrativePerformance(
    '【世界留钩】正文结尾必须留下1-2个来自世界自身的新动静。',
    '我观察殿外动静',
    '',
  );
  assert.equal(result.valid, false);
  assert.match(result.issues.join('；'), /世界留钩/);
  assert.match(performanceRetryInstruction(result.issues), /严禁复述到正文/);
  assert.doesNotMatch(performanceRetryInstruction(result.issues), /【表演门禁退回重写】/);
});

test('NPC rendering contract rejects mustNotInvent violations even outside voice-card scenes', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'mustNotInvent=具体兵力数字、秘密盟约、阮香凝的黑魔海身份。';
  const result = validateNarrativePerformance(
    '霍子孟断言北军已有三千兵，且阮香凝就是黑魔海的凝玉姬。',
    '继续',
    scenarioPrompt,
  );
  assert.equal(result.valid, false);
  assert.match(result.issues.join('；'), /具体兵力数字/);
  assert.equal(result.issues.some(issue => /阮香凝/.test(issue)), false, 'stage secrets must come from the data-driven render guard');
});

test('future death variants are rejected through the data-driven stage guard', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const associations = [{
    subjects: ['郭解', '董卓'],
    predicates: ['伤及心脉', '撑不了', '死志', '托孤', '临终', '身亡', '死亡', '被杀', '永久失能'],
    maxDistance: 48,
  }];
  const scenarioPrompt = `mustNotInvent=具体兵力数字、郭解或董卓后续生死。renderGuard.forbiddenTerms=郭解托孤|郭解身亡|董卓身亡；renderGuard.forbiddenAssociations=${JSON.stringify(associations)}；renderGuard.rejectConcreteQuantities=true。`;
  for (const narrative of [
    '秦桧低声说郭解托孤已成定局。',
    '郭解伤及心脉，撑不了几日了。',
    '董卓已经显出死志。',
    '郭解恐怕即将永久失能。',
  ]) {
    const result = validateNarrativePerformance(narrative, '继续', scenarioPrompt);
    assert.equal(result.valid, false, narrative);
    assert.match(result.issues.join('；'), /硬门禁/);
  }
  assert.equal(
    validateNarrativePerformance(`宫女伤及心脉。${'宫灯依次亮起，'.repeat(12)}郭解在远处整顿衣冠。`, '继续', scenarioPrompt).valid,
    true,
    'association guard must require subject/predicate proximity',
  );
});

test('real combined prompt rejects authoritative military quantities without blocking civilian counts or hypotheses', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'mustNotInvent=具体兵力数字、秘密盟约。renderGuard.forbiddenTerms=黑魔海|吕冀|暗道|伏兵；renderGuard.rejectConcreteQuantities=true。';
  for (const text of [
    '霍子孟说北军在宫门外布置三百甲士。',
    '界碑距宫门只有三十步。',
    '新税拟增三成。',
    '吕冀从暗道带来伏兵。',
  ]) {
    const result = validateNarrativePerformance(text, '继续', scenarioPrompt);
    assert.equal(result.valid, false, text);
    assert.match(result.issues.join('；'), /硬门禁/);
  }
  assert.equal(
    validateNarrativePerformance('一名宫女送来已经公开的诏书。', '继续', scenarioPrompt).valid,
    true,
  );
  assert.equal(validateNarrativePerformance('殿内无一人出声。', '继续', scenarioPrompt).valid, true);
  assert.equal(validateNarrativePerformance('两人对视一眼。', '继续', scenarioPrompt).valid, true);
  assert.equal(validateNarrativePerformance('一队宫女鱼贯而入。', '继续', scenarioPrompt).valid, true);
  assert.equal(validateNarrativePerformance('一名宫女走到宫门前送诏书。', '继续', scenarioPrompt).valid, true);
  assert.equal(validateNarrativePerformance('他心想莫非有伏兵。', '继续', scenarioPrompt).valid, true);
  assert.equal(
    validateNarrativePerformance('宫中是否另有暗道？确有一条通往北阙。', '继续', scenarioPrompt).valid,
    false,
    'a following confirmation sentence cannot launder a contextual forbidden term',
  );
  assert.equal(validateNarrativePerformance('北军已有三百人驻守要道。', '继续', scenarioPrompt).valid, false);
  assert.equal(
    validateNarrativePerformance('太后如今每一步都需借力。', '继续', scenarioPrompt).valid,
    true,
  );
});

test('quantity guard allows ordinary commerce and ward navigation without weakening military checks', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=；renderGuard.forbiddenAssociations=[]；renderGuard.rejectConcreteQuantities=true；renderGuard.allowUnverifiedQuantities=true。';
  for (const narrative of [
    '市集上摊贩喊价，程宗扬还到抽两成利便成交。',
    '这批绢帛按市价折了三成，掌柜的仍不肯松口。',
    '东市往西三坊便是米行，路线程宗扬还算熟。',
    '粮价较上月增了三成，米行门前排起长队。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, true, narrative);
  }
  for (const narrative of [
    '增税三成。',
    '三百甲士列阵。',
    '宫门三十步外有人布防。',
    '八校尉已经入宫。',
    '两队人马驻守宫门。',
    '凉州军在宫门外三坊驻扎。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, false, narrative);
  }
});

// 反例按「主语 × 表述」铺开，不枚举个别句子：收窄比例语境时若只对着少数样本
// 调词表，同义表述（折损／抽丁／守军减）会整片逃逸而测试仍全绿。
test('ratio guard keys on military or fiscal subjects, not on a fixed verb list', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=；renderGuard.forbiddenAssociations=[]；renderGuard.rejectConcreteQuantities=true；renderGuard.allowUnverifiedQuantities=true。';
  for (const narrative of [
    '凉州军折损三成。',
    '城中抽丁三成充作辅兵。',
    '守军较上月减了三成。',
    '北军甲士折了三成。',
    '徭役加派三成。',
    '军粮只剩三成。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, false, narrative);
  }
  // 同样的动词落在商贸主语上必须放行，否则回到误杀主角语域的老问题。
  for (const narrative of [
    '这批绢帛折了三成，掌柜的仍不肯松口。',
    '程宗扬还到抽两成利便成交。',
    '粮价较上月增了三成，米行门前排起长队。',
    '船行运费减了三成，商队仍嫌贵。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, true, narrative);
  }
});

test('contextual secret guard accepts 有无 questions but not 有无数 as a false question marker', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=暗道|伏兵；renderGuard.forbiddenAssociations=[]；renderGuard.rejectConcreteQuantities=false；renderGuard.allowUnverifiedQuantities=false。';
  for (const narrative of [
    '探查宫道两侧有无伏兵。',
    '探查宫中有没有暗道。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, true, narrative);
  }
  for (const narrative of [
    '查明宫道两侧确有伏兵。',
    '宫道有无数伏兵涌出。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', scenarioPrompt).valid, false, narrative);
  }
});

test('unverified military numbers require explicit stage authorization and attribution', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const text = '探子声称宫门外有三百甲士，但这份军报未经核实。';
  const blocked = 'mustNotInvent=具体兵力数字。renderGuard.rejectConcreteQuantities=true。';
  const allowed = `${blocked}renderGuard.allowUnverifiedQuantities=true。`;
  assert.equal(validateNarrativePerformance(text, '继续', blocked).valid, false);
  assert.equal(validateNarrativePerformance(text, '继续', allowed).valid, true);
  assert.equal(
    validateNarrativePerformance('宫门外确有三百甲士。', '继续', allowed).valid,
    false,
    'authorization permits attributed uncertainty, not authoritative invention',
  );
  assert.equal(
    validateNarrativePerformance('宫门外确有三百甲士，另有消息说援军可能迟到。', '继续', allowed).valid,
    false,
    'a vague possibility elsewhere in the sentence cannot launder an authoritative number',
  );
});

test('hard render violations are buffered and replaced locally if the final retry still fails', async () => {
  const {
    decideNarrativePerformanceAttempt,
    requiresNarrativeBuffering,
    safeNarrativeFallback,
  } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=黑魔海；renderGuard.rejectConcreteQuantities=true。';
  assert.equal(requiresNarrativeBuffering(scenarioPrompt), true);
  const final = decideNarrativePerformanceAttempt('黑魔海已有三百甲士。', '继续', scenarioPrompt, 2, 2);
  assert.equal(final.valid, false);
  assert.equal(final.shouldRetry, false);
  assert.equal(final.narrative, safeNarrativeFallback());
  assert.doesNotMatch(final.narrative, /黑魔海|三百/);
});

test('hard render violations receive one buffered rewrite before local fallback', async () => {
  const { decideNarrativePerformanceAttempt, performanceRetryInstruction } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=黑魔海；renderGuard.rejectConcreteQuantities=true。';
  const first = decideNarrativePerformanceAttempt('黑魔海已有三百甲士。', '继续', scenarioPrompt, 1, 2);
  assert.equal(first.valid, false);
  assert.equal(first.shouldRetry, true);
  assert.equal(first.narrative, '');
  assert.match(first.retryInstruction, /职责、通行、次序、联络和可见动作/);
  assert.match(first.retryInstruction, /不得补人数、距离或比例/);
  assert.match(performanceRetryInstruction(first.issues), /不得换一种肯定说法再次坐实/);
});
