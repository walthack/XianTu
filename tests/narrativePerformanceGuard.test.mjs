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
  // Q26 版一（用户 2026-11-24 批）：兵力数字只记不拦——不进 issues，命中的原句在 numberHits 里。
  assert.equal(result.valid, true);
  assert.deepEqual(result.numberHits, [{ rule: 'concreteQuantity', sentence: '霍子孟断言北军已有三千兵，且阮香凝就是黑魔海的凝玉姬' }]);
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
  assert.equal(
    validateNarrativePerformance('郭解莫非已经心生死志？', '继续', scenarioPrompt).valid,
    false,
    'future-death associations do not opt into hypothetical claims',
  );
});

// Q26 版一（用户 2026-11-24 批）：两条数字检查只记不拦。判定规则没变，下面各例的「命中／不命中」改看 numberHits；其余硬门禁仍看 valid。
const flagged = result => !result.valid || Boolean(result.numberHits?.length);

test('real combined prompt rejects authoritative military quantities without blocking civilian counts or hypotheses', async () => {
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'mustNotInvent=具体兵力数字、秘密盟约。renderGuard.forbiddenTerms=黑魔海|吕冀|暗道|伏兵；renderGuard.rejectConcreteQuantities=true。';
  // Q26 版一：数字三句只记不拦（valid 仍为 true，原句进 numberHits）；禁词那一句照旧是硬门禁。
  for (const text of [
    '霍子孟说北军在宫门外布置三百甲士。',
    '界碑距宫门只有三十步。',
    '新税拟增三成。',
  ]) {
    const result = validateNarrativePerformance(text, '继续', scenarioPrompt);
    assert.equal(result.valid, true, text);
    assert.equal(result.numberHits?.length, 1, text);
  }
  const forbidden = validateNarrativePerformance('吕冀从暗道带来伏兵。', '继续', scenarioPrompt);
  assert.equal(forbidden.valid, false);
  assert.match(forbidden.issues.join('；'), /硬门禁/);
  assert.equal('numberHits' in forbidden, false);
  assert.equal(
    flagged(validateNarrativePerformance('一名宫女送来已经公开的诏书。', '继续', scenarioPrompt)),
    false,
  );
  assert.equal(flagged(validateNarrativePerformance('殿内无一人出声。', '继续', scenarioPrompt)), false);
  assert.equal(flagged(validateNarrativePerformance('两人对视一眼。', '继续', scenarioPrompt)), false);
  for (const ordinaryPeoplePhrase of [
    '两人马不停蹄赶到宫门前。',
    '三人马不停蹄，连夜赶路。',
    '两人马上就到宫门。',
    '两人马车已在门外候着。',
    '他二人马前谢罪。',
  ]) {
    assert.equal(
      flagged(validateNarrativePerformance(ordinaryPeoplePhrase, '继续', scenarioPrompt)),
      false,
      `ordinary N人 + 马… phrasing must not be segmented as a troop unit: ${ordinaryPeoplePhrase}`,
    );
  }
  assert.equal(flagged(validateNarrativePerformance('一队宫女鱼贯而入。', '继续', scenarioPrompt)), false);
  assert.equal(flagged(validateNarrativePerformance('一名宫女走到宫门前送诏书。', '继续', scenarioPrompt)), false);
  assert.equal(flagged(validateNarrativePerformance('他心想莫非有伏兵。', '继续', scenarioPrompt)), false);
  assert.equal(
    flagged(validateNarrativePerformance('宫中是否另有暗道？确有一条通往北阙。', '继续', scenarioPrompt)),
    true,
    'a following confirmation sentence cannot launder a contextual forbidden term',
  );
  assert.equal(flagged(validateNarrativePerformance('北军已有三百人驻守要道。', '继续', scenarioPrompt)), true);
  for (const militaryStrength of [
    '车驾周围，三百凉州军精锐已整装列队。',
    '凉州军三百精锐铁甲铿锵，护卫在外围。',
    '凉州军三百精锐外围警戒。',
    '四十七人已在宫门列队。',
    '亲卫十人卸刃入殿。',
  ]) {
    assert.equal(
      flagged(validateNarrativePerformance(militaryStrength, '继续', scenarioPrompt)),
      true,
      `a concrete military headcount must remain guarded: ${militaryStrength}`,
    );
  }
  assert.equal(
    flagged(validateNarrativePerformance('请金车骑卸甲解兵，独身入殿——你我三人当面说清。', '继续', scenarioPrompt)),
    false,
    'military words elsewhere in the sentence must not turn 你我三人 into troop strength',
  );
  assert.equal(
    flagged(validateNarrativePerformance('你我各退一步，划定入宫路线。', '继续', scenarioPrompt)),
    false,
    'the idiom 各退一步 is not a military distance',
  );
  assert.equal(
    flagged(validateNarrativePerformance('甲士各退三步，在宫门外重新布防。', '继续', scenarioPrompt)),
    true,
    'a literal measured retreat in a military context remains guarded',
  );
  assert.equal(
    flagged(validateNarrativePerformance('太后如今每一步都需借力。', '继续', scenarioPrompt)),
    false,
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
    assert.equal(flagged(validateNarrativePerformance(narrative, '继续', scenarioPrompt)), false, narrative);
  }
  for (const narrative of [
    '增税三成。',
    '三百甲士列阵。',
    '宫门三十步外有人布防。',
    '八校尉已经入宫。',
    '两队人马驻守宫门。',
    '凉州军在宫门外三坊驻扎。',
  ]) {
    assert.equal(flagged(validateNarrativePerformance(narrative, '继续', scenarioPrompt)), true, narrative);
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
    assert.equal(flagged(validateNarrativePerformance(narrative, '继续', scenarioPrompt)), true, narrative);
  }
  // 同样的动词落在商贸主语上必须放行，否则回到误杀主角语域的老问题。
  for (const narrative of [
    '这批绢帛折了三成，掌柜的仍不肯松口。',
    '程宗扬还到抽两成利便成交。',
    '粮价较上月增了三成，米行门前排起长队。',
    '船行运费减了三成，商队仍嫌贵。',
  ]) {
    assert.equal(flagged(validateNarrativePerformance(narrative, '继续', scenarioPrompt)), false, narrative);
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
  assert.equal(flagged(validateNarrativePerformance(text, '继续', blocked)), true);
  assert.equal(flagged(validateNarrativePerformance(text, '继续', allowed)), false);
  assert.equal(
    flagged(validateNarrativePerformance('宫门外确有三百甲士。', '继续', allowed)),
    true,
    'authorization permits attributed uncertainty, not authoritative invention',
  );
  assert.equal(
    flagged(validateNarrativePerformance('宫门外确有三百甲士，另有消息说援军可能迟到。', '继续', allowed)),
    true,
    'a vague possibility elsewhere in the sentence cannot launder an authoritative number',
  );
});

test('handoff loss guard blocks invented exact losses without policing ordinary counts or sourced rumors', async () => {
  const {
    decideNarrativePerformanceAttempt,
    requiresNarrativeBuffering,
    validateNarrativePerformance,
  } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const scenarioPrompt = 'renderGuard.rejectUngroundedHandoffLosses=true。';
  assert.equal(requiresNarrativeBuffering(scenarioPrompt), true);

  for (const narrative of [
    '云苍峰道：“死了三个伙计，加上易虎，共四人。”',
    '伤了七个，其中两个伤在腿上。',
    '三辆车被水冲翻了。',
    '骡子惊了两匹，跑了一匹。',
  ]) {
    const result = validateNarrativePerformance(narrative, '继续', scenarioPrompt);
    assert.equal(result.valid, true, narrative);
    assert.deepEqual(result.numberHits?.map(hit => hit.rule), ['handoffLoss'], narrative);
  }

  for (const narrative of [
    '伤亡和货损仍待清点，几名伤者正由同伴照料。',
    '两人扶着凝羽走到乐明珠身旁。',
    '三辆车继续沿山道前行。',
    '探子据报伤了七人，但这份消息尚待核实。',
  ]) {
    assert.equal(
      flagged(validateNarrativePerformance(narrative, '继续', scenarioPrompt)),
      false,
      narrative,
    );
  }

  // Q26 版一：命中只记不拦——第一稿就放行，不重写、不换兜底句。
  const first = decideNarrativePerformanceAttempt('云苍峰说死了三个伙计。', '继续', scenarioPrompt, 1, 2);
  assert.equal(first.shouldRetry, false);
  assert.equal(first.narrative, '云苍峰说死了三个伙计。');
  assert.deepEqual(first.numberHits, [{ rule: 'handoffLoss', sentence: '云苍峰说死了三个伙计' }]);
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

test('Q7-D：写给模型的数字检查例句与检查同源——说会命中的确实命中，换的写法确实不命中；两条说明都进了剧本提示', async () => {
  const G = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const hard = (text, scenarioPrompt) => Boolean(G.validateNarrativePerformance(`${text}。`, '我去看看。', scenarioPrompt).numberHits?.length);
  const quantityPrompt = 'renderGuard.rejectConcreteQuantities=true；renderGuard.allowUnverifiedQuantities=false。';
  const lossPrompt = 'renderGuard.rejectUngroundedHandoffLosses=true。当前没有结构化损失回执：';
  for (const text of G.QUANTITY_GUARD_EXAMPLES.rejected) assert.equal(hard(text, quantityPrompt), true, `应拦：${text}`);
  for (const text of G.QUANTITY_GUARD_EXAMPLES.accepted) assert.equal(hard(text, quantityPrompt), false, `不应拦：${text}`);
  for (const text of G.LOSS_GUARD_EXAMPLES.rejected) assert.equal(hard(text, lossPrompt), true, `应拦：${text}`);
  for (const text of G.LOSS_GUARD_EXAMPLES.accepted) assert.equal(hard(text, lossPrompt), false, `不应拦：${text}`);
  for (const text of [...G.QUANTITY_GUARD_EXAMPLES.rejected, ...G.QUANTITY_GUARD_EXAMPLES.accepted]) assert.ok(G.QUANTITY_GUARD_HINT.includes(`「${text}」`));
  for (const text of [...G.LOSS_GUARD_EXAMPLES.rejected, ...G.LOSS_GUARD_EXAMPLES.accepted]) assert.ok(G.LOSS_GUARD_HINT.includes(`「${text}」`));
  // 说明本身放进剧本提示后不得被门禁的「正文检查」以外的逻辑误用：两处拼接点都引用了常量。
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  assert.match(source, /不得自行补人数、距离或比例。' \+ QUANTITY_GUARD_HINT : ''\}/);
  assert.match(source, /等定性表述。\$\{LOSS_GUARD_HINT\}/);
});

test('Q26 版一：两条数字检查只记不拦——命中的原句进 numberHits，不算硬门禁、不触发重写；没命中不带这个字段', async () => {
  const G = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const quantityPrompt = 'renderGuard.rejectConcreteQuantities=true；renderGuard.allowUnverifiedQuantities=false。';
  const lossPrompt = 'renderGuard.rejectUngroundedHandoffLosses=true。当前没有结构化损失回执：';
  const quantity = G.validateNarrativePerformance('镇口起了风。近处一名披甲校尉按刀喝问。你停下脚步。', '我去看看。', quantityPrompt);
  assert.deepEqual(quantity.numberHits, [{ rule: 'concreteQuantity', sentence: '近处一名披甲校尉按刀喝问' }]);
  const loss = G.validateNarrativePerformance('她俯身扶起一名腿伤伙计。你接手护送。', '我去看看。', lossPrompt);
  assert.deepEqual(loss.numberHits, [{ rule: 'handoffLoss', sentence: '她俯身扶起一名腿伤伙计' }]);
  for (const check of [quantity, loss]) {
    assert.equal(check.valid, true);
    assert.deepEqual(check.issues, []);
    assert.equal(G.hasHardNarrativeViolation(check), false);
  }
  const attempt = G.decideNarrativePerformanceAttempt('四营正在继续压合围圈。', '我去看看。', quantityPrompt, 1, 2);
  assert.equal(attempt.shouldRetry, false);
  assert.equal(attempt.narrative, '四营正在继续压合围圈。');
  const clean = G.validateNarrativePerformance('镇口起了风。你停下脚步。', '我去看看。', quantityPrompt);
  assert.equal(clean.valid, true);
  assert.equal('numberHits' in clean, false, '没命中时不带这个字段');
  // 命中数字的同时命中别的硬门禁：硬门禁照拦，数字句仍带出。
  const both = G.validateNarrativePerformance('吕冀带来三百甲士。', '我去看看。', `renderGuard.forbiddenTerms=吕冀；${quantityPrompt}`);
  assert.equal(G.hasHardNarrativeViolation(both), true);
  assert.equal(both.numberHits?.length, 1);
  assert.equal(G.performanceRetryInstruction(both.issues).includes('被判违规的原句'), false);
});

test('Q7-B：AIBS 非分步路由——硬门禁命中先自动重写一次，预算用尽或重写仍违规才落兜底句（源码顺序）', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('// 非分步路由同样执行一次表演门禁'), source.indexOf('// 🔥 文本优化'));
  const at = text => { const i = block.indexOf(text); assert.ok(i >= 0, `应有：${text}`); return i; };
  assert.ok(at('const longRequestLeft = (remainingQingyuTurnLongRequests() ?? 1) > 0;') < at('if (hardViolation ? !longRequestLeft : usesFixedScenarioInventory(saveData)) {'));
  assert.ok(at('长请求预算已用尽，已丢弃正文与伴随指令，不再重写') < at('performanceRetryInstruction(performance.issues)'));
  assert.ok(at('performanceRetryInstruction(performance.issues)') < at('非分步重试仍违规，已丢弃正文与伴随指令'));
  assert.equal(block.split('_performance_retry').length, 3, '重写请求仍只有原来那一处（两种宿主各一行）');
});

test('Q26 版一：AIBS 回合与开局的最终落稿——没被别的硬门禁换掉时，把数字命中交给 recordNumberGateHits（源码约束）', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("} else recordNumberGateHits(finalPerformance.numberHits, { site: 'turn', generationId, step: getCurrentContractStep(saveData) });"));
  assert.ok(source.includes("} else recordNumberGateHits(finalInitialPerformance.numberHits, { site: 'opening' });"));
  assert.equal(source.split('recordNumberGateHits(').length, 3, '只有这两处');
});
