// 说话人记号（Q29 修订版做法甲）：落账链路与模块演出链路上每一道检查/清洗。
// 只判断的：同一段正文带记号与不带记号判定相同。会删句的：删掉的句子记号一起没，留下的句子记号在原位，
// 且去掉记号后的结果与「不带记号的正文过同一道清洗」逐字相同。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { stripSpeakerMarks } = await loadTs('../src/utils/speakerMarks.ts');
const performance = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
const agency = await loadTs('../src/modules/scenarioMods/playerAgencyGuard.ts');
const narrated = await loadTs('../src/utils/narratedInventory.ts');
const fixedInventory = await loadTs('../src/modules/scenarioMods/fixedInventoryContracts.ts');
const resolver = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const boundaries = await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
const modular = await loadTs('../src/modules/scenarioMods/modularTurn.ts');
const guardFramework = await loadTs('../src/modules/scenarioMods/ledger/guardFramework.ts');
const loot = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const vital = await loadTs('../src/utils/playerVitalGuard.ts');
const audit = await loadTs('../src/services/progressAuditService.ts');
const summary = await loadTs('../src/services/narrativeSummary.ts');

/** 同一结果：判定函数带不带记号要一致（含抛错文本）。 */
function sameVerdict(fn, marked) {
  const run = text => { try { return { ok: fn(text) }; } catch (error) { return { threw: String(error?.message || error) }; } };
  assert.deepEqual(run(marked), run(stripSpeakerMarks(marked)), marked);
  return run(marked);
}

/** 删句清洗：删掉的段连记号一起没，留下的段记号原位；去记号后与无记号正文的清洗结果逐字相同。 */
function deletesWithMarks(fn, marked, { removedMarks, keptMarks }) {
  const withMarks = fn(marked);
  const plain = fn(stripSpeakerMarks(marked));
  assert.equal(stripSpeakerMarks(withMarks.text), plain.text, marked);
  for (const mark of removedMarks) assert.equal(withMarks.text.includes(mark), false, `应随句删掉：${mark}`);
  for (const mark of keptMarks) assert.ok(withMarks.text.includes(mark), `应留在原位：${mark}`);
  return withMarks;
}

test('只判断：表演门禁 validateNarrativePerformance 带记号与不带记号判定相同，退回原句不带记号', () => {
  const prompt = '【小紫·角色表演卡（逐轮硬合同）】';
  const reportOnly = '小紫道：〈小紫〉“敌军还在城外。程头儿要不要去看看？”她等着回话。';
  const verdict = sameVerdict(text => performance.validateNarrativePerformance(text, '让小紫说明敌情和下一步计划', prompt), reportOnly);
  assert.equal(verdict.ok.valid, false);
  sameVerdict(text => performance.validateNarrativePerformance(text, '询问小紫对局势的安排', prompt), '小紫笑了笑。〈小紫〉“我已让人盯住东门。程头儿现在可走水路，也可等我的后手。”');
  const decision = performance.decideNarrativePerformanceAttempt('小紫抱着茶盏。〈小紫〉“喝茶。”', '陪小紫喝茶闲聊', prompt, 2, 2);
  assert.equal(decision.narrative, '小紫抱着茶盏。〈小紫〉“喝茶。”', '通过的正文原样带着记号往下走');
});

test('只判断：玩家能动性 unauthorizedPlayerActions 带记号与不带记号相同；〈你〉不被当成主角施事', () => {
  for (const text of [
    '掌柜抬眼。〈你〉“在下程宗扬。”〈掌柜〉“原来是程公子。”他报上姓名。',
    '〈你〉“走。”你拔剑冲了上去。',
    '〈凝羽〉“毒清了。”凝羽收起银针。',
  ]) {
    sameVerdict(t => agency.unauthorizedPlayerActions(t, '看看四周'), text);
  }
});

test('只判断：背包相关 detectNarratedInventoryGainEntries/Possessions、getMissingNarratedInventoryGains、unsupportedInventoryGainNames', () => {
  const text = '凝羽看着你。〈凝羽〉“收好。”你收下了一枚青玉令牌，放入怀中。〈你〉“多谢。”';
  sameVerdict(t => narrated.detectNarratedInventoryGainEntries(t), text);
  sameVerdict(t => narrated.detectNarratedInventoryPossessions(t), text);
  sameVerdict(t => narrated.getMissingNarratedInventoryGains(t, []), text);
  sameVerdict(t => fixedInventory.unsupportedInventoryGainNames(t, []), text);
  assert.ok(narrated.getMissingNarratedInventoryGains(text, []).length > 0, '夹具应真的命中获得句');
});

test('会删句：stripUnsupportedGainClauses 删获得句时记号随句，其余记号原位', () => {
  const text = '凝羽看了你一眼。〈凝羽〉“这把青锋剑你拿着。”你接过了青锋剑。〈你〉“多谢。”她转身离开，山风吹动她的衣角，院中只剩下落叶的声音。';
  const result = deletesWithMarks(t => fixedInventory.stripUnsupportedGainClauses(t, []), text,
    { removedMarks: [], keptMarks: ['〈你〉“多谢。”'] });
  assert.ok(result.removed.length > 0, '应删掉获得句');
});

test('会删句：stripNarrativeEntityTypeConflicts 按段删，删段记号一起没，留段记号原位', () => {
  const text = '凝羽便是一柄宝剑。〈凝羽〉“我在这里。”\n〈你〉“走吧。”你推开门。';
  const result = deletesWithMarks(t => resolver.stripNarrativeEntityTypeConflicts(t), text,
    { removedMarks: ['〈凝羽〉'], keptMarks: ['〈你〉“走吧。”'] });
  assert.ok(result.conflicts.length > 0);
  // 记号里的名字不参与判断：名字只出现在记号里时不会因此误判
  sameVerdict(t => resolver.stripNarrativeEntityTypeConflicts(t).conflicts, '〈凝羽〉“是宝剑吗？”');
});

test('会删句：stripNarrativeUnintroducedCharacters 删未登场人物段，记号随段；判断不看记号', () => {
  const at = chapter => ({ modId: 'lcq.stage_04b_lingfei_baiyi_crisis', events: [{ id: 'current', axisAnchor: `第${chapter}章` }], activeEventIds: ['current'], completedEventIds: [] });
  const text = '殇振羽走进营地。〈殇振羽〉“都退下。”\n云苍峰点头。〈云苍峰〉“来了。”';
  const result = deletesWithMarks(t => resolver.stripNarrativeUnintroducedCharacters(t, ['云苍峰'], '', at(43)), text,
    { removedMarks: ['〈殇振羽〉'], keptMarks: ['〈云苍峰〉“来了。”'] });
  assert.ok(result.conflicts.length > 0);
  // 名字只出现在记号里：与无记号正文同判（不删）
  const markOnly = '〈殇振羽〉“都退下。”';
  assert.equal(resolver.stripNarrativeUnintroducedCharacters(markOnly, ['云苍峰'], '', at(43)).text, markOnly);
});

test('会删句：stripNarrativeBoundaryClauses 删越界句，记号随句；validateNarrativeBoundary 同判', () => {
  const eventId = 'lcq.event.sudaji_south_pact';
  const text = '苏妲己倚在榻上。〈苏妲己〉“给你三个月。”你没有作声。〈你〉“容我想想。”';
  const result = deletesWithMarks(t => boundaries.stripNarrativeBoundaryClauses(t, eventId), text,
    { removedMarks: ['〈苏妲己〉'], keptMarks: ['〈你〉“容我想想。”'] });
  assert.ok(result.removed.length > 0);
  sameVerdict(t => boundaries.validateNarrativeBoundary(t, eventId, false), text);
  sameVerdict(t => modular.validateModuleSettlementNarrative(t, eventId, false), text);
});

test('只判断：validateNanhuangCanonNarrative / validateQingyuNarrativeFacts 带记号与不带记号同判', () => {
  for (const text of ['〈你〉“鬼巫王已死。”众人欢呼。', '〈凝羽〉“毒清了。”']) {
    sameVerdict(t => boundaries.validateNanhuangCanonNarrative(t, 'lcq.stage_04b_lingfei_baiyi_crisis', '营地', [], undefined), text);
    sameVerdict(t => boundaries.validateQingyuNarrativeFacts(t, 'lcq.event.ningyu_regicide_offer'), text);
  }
});

test('模块演出：记忆摘录句、摘录证据、存档回执、性别影子、搜刮正文、逐拍场景检查都不带记号', () => {
  const text = '凝羽收起银针。〈凝羽〉“毒清了。”\n你点点头。〈你〉“多谢。”';
  const sentences = modular.moduleMemorySentences(text);
  assert.equal(sentences.some(item => /[〈〉]/.test(item.text)), false, '发给记忆模块的编号句不得带记号');
  assert.equal(modular.validateModuleSide('{"sentenceIds":[0]}', text, 'memory'), '凝羽收起银针。“毒清了。”');
  const evidence = '{"evidence":["凝羽收起银针。“毒清了。”"]}';
  assert.equal(modular.validateModuleSide(evidence, text, 'memory'), modular.validateModuleSide(evidence, stripSpeakerMarks(text), 'memory'));
  assert.doesNotMatch(modular.validateModuleSide(evidence, text, 'memory'), /[〈〉]/);
  const save = { 系统: { 扩展: {} } };
  modular.appendModuleReceipt(save, { id: 'r1', path: 'modular', text, promptChars: 0, foregroundMs: 0 });
  assert.equal(modular.getModuleReceipts(save)[0].text, stripSpeakerMarks(text), '存档里的回执正文不带记号');
  sameVerdict(t => guardFramework.genderShadowFindings(t, [{ name: '凝羽', gender: '女' }], 'e', 1), '凝羽，他说道。〈凝羽〉“走。”');
  sameVerdict(t => loot.validateLootNarrative(t, { drops: [{ name: '铜铢', quantity: 3 }] }, []), '你在柜底摸到三枚铜铢。〈掌柜〉“那是我的！”');
  sameVerdict(t => modular.validateStepSceneNarrative(t, { factChecks: [['银针']] }, {}, []), text);
});

test('只判断：非致死气血保底 recoverUnmarkedPlayerZeroHealth 带记号与不带记号同判', () => {
  const save = () => ({ 角色: { 属性: { 气血: { 当前: 0, 上限: 100 } } } });
  for (const text of ['你眼前一黑，昏了过去。〈凝羽〉“快救人！”', '〈凝羽〉“他死了。”你气绝身亡。']) {
    assert.deepEqual(vital.recoverUnmarkedPlayerZeroHealth(save(), text), vital.recoverUnmarkedPlayerZeroHealth(save(), stripSpeakerMarks(text)), text);
  }
});

test('发回模型：进度审计的正文不带记号；最近事件的正文尾巴不带记号', async () => {
  let sent = '';
  await audit.runProgressAudit({
    saveData: { 系统: { 扩展: { 任务追踪: { 即兴目标: [{ 目标: '找到凝羽', 状态: '进行中' }] } } } },
    recentText: '凝羽收起银针。〈凝羽〉“毒清了。”',
    userAction: '问凝羽',
    generate: async (_system, user) => { sent = user; return '{"updates":[]}'; },
  }).catch(() => {});
  assert.ok(sent.includes('凝羽收起银针。“毒清了。”'), '审计输入应含去记号的正文');
  assert.doesNotMatch(sent, /〈凝羽〉/);
  assert.deepEqual(summary.entriesForPrompt([], '〈凝羽〉“毒清了。”'), summary.entriesForPrompt([], '“毒清了。”'));
});
