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
  assert.match(result.issues.join('；'), /阮香凝机密身份/);
});

test('NPC rendering contract rejects future death beats leaked by pretrained canon knowledge', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'mustNotInvent=具体兵力数字、郭解或董卓后续生死。';
  const result = validateNarrativePerformance(
    '秦桧低声说郭解伤及心脉，怕是撑不了太久，昏迷前已经托孤。',
    '继续',
    scenarioPrompt,
  );
  assert.equal(result.valid, false);
  assert.match(result.issues.join('；'), /后续生死节点/);
});

test('data-driven render guard rejects stage secrets and concrete quantities without blocking civilian counts', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=黑魔海|吕冀|暗道|伏兵；renderGuard.rejectConcreteQuantities=true。';
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
  assert.equal(
    validateNarrativePerformance('太后如今每一步都需借力。', '继续', scenarioPrompt).valid,
    true,
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

test('hard render violations degrade locally on the first draft instead of spending another model call', async () => {
  const { decideNarrativePerformanceAttempt, safeNarrativeFallback } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.forbiddenTerms=黑魔海；renderGuard.rejectConcreteQuantities=true。';
  const first = decideNarrativePerformanceAttempt('黑魔海已有三百甲士。', '继续', scenarioPrompt, 1, 2);
  assert.equal(first.valid, false);
  assert.equal(first.shouldRetry, false);
  assert.equal(first.narrative, safeNarrativeFallback());
});
