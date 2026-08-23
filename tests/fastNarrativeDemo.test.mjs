import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import axios from 'axios';

import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);
const A_B_ACTION = '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';
const ON_STORAGE = { getItem: key => (key === 'xiantu.fastNarrativeDemo.v1' ? 'true' : null) };
const OFF_STORAGE = { getItem: () => null };

async function loadStage() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
}

async function loadDemo() {
  return loadTs('../src/modules/scenarioMods/fastNarrativeDemo.ts');
}

async function eligibleFixture(overrides = {}) {
  const [
    { createQingyuOpeningPlaytestSave },
    { createJudgementProposal, persistPendingJudgement, resolvePendingJudgement },
  ] = await Promise.all([
    loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts'),
    loadTs('../src/utils/judgementEngine.ts'),
  ]);
  const save = createQingyuOpeningPlaytestSave(await loadStage());
  const proposal = createJudgementProposal({
    actionText: A_B_ACTION,
    kind: 'combat',
    whyNow: '抢刀翻滚有被箭射中的风险',
    difficulty: { band: 'normal', value: 12 },
    factors: [{ label: '求生', value: 2, source: 'condition' }],
    stakes: { success: '抢到短刀并躲开箭', partial: '抢到短刀但擦伤', failure: '未能取刀' },
    canonPolicy: 'route_process_only',
    createdAtTurn: 1,
    ...overrides.proposal,
  });
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, {
    currentTurn: 1,
    roll: () => 15,
    ...overrides.resolve,
  });
  const { settleFastNarrativeDemoAdjudication } = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  settleFastNarrativeDemoAdjudication(save, resolution, { storage: ON_STORAGE });
  return { save, resolution };
}

function planInput(save, resolution, extra = {}) {
  return {
    saveData: save,
    playerAction: extra.playerAction ?? A_B_ACTION,
    judgementResolution: Object.hasOwn(extra, 'judgementResolution') ? extra.judgementResolution : resolution,
    aborted: extra.aborted === true,
    storage: extra.storage ?? ON_STORAGE,
  };
}

test('fast narrative demo is fail-closed by default and rejects ineligible turns', async () => {
  const demo = await loadDemo();
  const { save, resolution } = await eligibleFixture();

  assert.equal(demo.isFastNarrativeDemoEnabled(OFF_STORAGE), false);
  assert.equal(demo.isFastNarrativeDemoEnabled({ getItem: () => 'TRUE' }), false);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, resolution, { storage: OFF_STORAGE })), null);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, resolution, { aborted: true })), null);
  assert.equal(demo.planFastNarrativeDemo(planInput(save, resolution, { judgementResolution: undefined })), null);
  assert.equal(demo.planFastNarrativeDemo({ ...planInput(save, resolution), hasOtherActionContract: true }), null);

  const otherSave = JSON.parse(JSON.stringify(save));
  delete otherSave.系统.扩展.清羽记开局;
  assert.equal(demo.planFastNarrativeDemo(planInput(otherSave, resolution)), null);

  const laterStage = JSON.parse(JSON.stringify(save));
  laterStage.世界.状态.剧本模组.modId = 'lcq.stage_02';
  assert.equal(demo.planFastNarrativeDemo(planInput(laterStage, resolution)), null);

  const pendingSave = JSON.parse(JSON.stringify(save));
  const { createJudgementProposal, persistPendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  persistPendingJudgement(pendingSave, createJudgementProposal({
    actionText: '再冲一次',
    kind: 'escape',
    whyNow: '另一次风险',
    difficulty: { band: 'normal', value: 10 },
    factors: [],
    stakes: { success: '逃开', partial: '擦伤', failure: '被追上' },
    canonPolicy: 'route_process_only',
    createdAtTurn: 2,
  }));
  assert.equal(demo.planFastNarrativeDemo(planInput(pendingSave, resolution)), null);

  const mismatched = JSON.parse(JSON.stringify(resolution));
  mismatched.roll = 1;
  mismatched.outcome = 'critical_failure';
  assert.equal(demo.planFastNarrativeDemo(planInput(save, resolution, { judgementResolution: mismatched })), null);
});

test('eligible qingyu stage_01 turn builds an allowlist packet and a short prompt', async () => {
  const demo = await loadDemo();
  const { save, resolution } = await eligibleFixture();
  const beforeSave = JSON.stringify(save);
  const beforeResolution = JSON.stringify(resolution);
  const wrappedAction = `<行动趋向>${A_B_ACTION}</行动趋向>\n【本地判定已结算】判定ID=${resolution.id}；结果=${resolution.outcome}\n`;

  const plan = demo.planFastNarrativeDemo(planInput(save, resolution, { playerAction: wrappedAction }));
  assert.ok(plan);
  assert.equal(plan.packet.playerAction, A_B_ACTION);
  assert.deepEqual(Object.keys(plan.packet).sort(), ['adjudication', 'playerAction', 'playerName', 'presentNames', 'processBoundary', 'publicScene', 'resolution']);
  assert.equal(plan.packet.playerName, '程宗扬');
  assert.deepEqual(Object.keys(plan.packet.resolution).sort(), [
    'appliedEffects', 'canonPolicy', 'difficulty', 'id', 'kind', 'outcome', 'roll', 'settledOutcomeText', 'total',
  ]);
  assert.equal(plan.packet.resolution.settledOutcomeText, '抢到短刀并躲开箭');
  assert.equal(plan.packet.adjudication.location, 'scene_held');
  assert.equal(plan.packet.adjudication.sceneHeld, true);
  assert.equal(plan.packet.adjudication.judgementId, resolution.id);
  assert.equal(plan.packet.publicScene.location, '中州·草原');
  assert.match(plan.packet.publicScene.time, /200年1月1日/);
  assert.ok(Array.isArray(plan.packet.presentNames));
  assert.ok(plan.packet.presentNames.every(name => name === '段强'));
  assert.equal(plan.packet.presentNames.includes('程宗扬'), false);
  assert.ok(plan.forbiddenNames.includes('月霜'));
  assert.ok(plan.forbiddenNames.includes('王哲'));
  assert.equal(plan.forbiddenNames.includes('段强'), false);

  const packed = JSON.stringify(plan.packet);
  const prompt = `${plan.systemPrompt}\n${plan.userPrompt}`;
  for (const leak of [
    '社交', '长期记忆', 'playerKnowledge', 'npcPrivateKnowledge', 'tavern_commands',
    'lcq.event.s01_03', 'lcq.event.s01_04', '月霜', '王哲', '已故', 'event.s01_02.done',
  ]) {
    assert.equal(packed.includes(leak), false, `packet leaked ${leak}`);
    assert.equal(prompt.includes(leak), false, `prompt leaked ${leak}`);
  }
  assert.equal('世界' in plan.packet, false);
  assert.equal('角色' in plan.packet, false);
  assert.equal('系统' in plan.packet, false);
  assert.ok(demo.estimateFastNarrativePromptBytes(plan) < demo.FAST_NARRATIVE_PROMPT_BUDGET_BYTES);
  assert.ok(Buffer.byteLength(prompt, 'utf8') < 12 * 1024);
  assert.match(prompt, /玩家名：程宗扬/);
  assert.match(prompt, /“我\/玩家”只指该玩家/);
  assert.match(prompt, /必须用第二人称“你”叙述玩家动作/);
  assert.match(prompt, /不得把这些动作转移给任何其他人、生物或行动者/);
  assert.match(prompt, /已落账场景物品/);
  assert.match(prompt, /最近的战场尸体僵硬的手指间原本握着一把凡品短刀/);
  assert.match(prompt, /你在现场握持，尚未进入正式背包/);
  assert.match(prompt, /当前事件终局不可由本轮改写/);
  assert.match(prompt, /只写“你”和由该行动直接引起的可感知环境/);
  assert.match(prompt, /不要写任何其他人物、生物、同伴、敌人或人影/);
  assert.match(prompt, /不要写精确人数或精确距离/);
  assert.equal(prompt.includes('段强'), false);
  assert.equal(prompt.includes('# 在场且已揭示的人'), false);
  assert.match(prompt, /现在只写 180-280 字的现场正文，写完即停/);
  assert.equal(prompt.includes('250-500'), false);

  plan.packet.resolution.roll = 1;
  plan.packet.playerAction = 'mutated';
  plan.packet.presentNames.push('王哲');
  assert.equal(JSON.stringify(save), beforeSave);
  assert.equal(JSON.stringify(resolution), beforeResolution);
});

test('fallback is deterministic, local, and free of commands or internal IDs', async () => {
  const demo = await loadDemo();
  const { save, resolution } = await eligibleFixture();
  const plan = demo.planFastNarrativeDemo(planInput(save, resolution));
  const first = demo.buildFastNarrativeFallback(plan.packet);
  const second = demo.buildFastNarrativeFallback(plan.packet);
  assert.equal(first, second);
  assert.ok(demo.isValidFastNarrativeText(first, plan.packet));
  assert.ok(first.length >= 180 && first.length <= 300, `fallback length=${first.length}`);
  assert.equal(first.includes('本地判定'), false);
  assert.equal(first.includes('tavern_commands'), false);
  assert.equal(first.includes('lcq.event'), false);
  assert.equal(first.includes('judge-'), false);
  assert.equal(first.includes('已故'), false);
  assert.equal(demo.isValidFastNarrativeText('', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('{"tavern_commands":[]}', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('正文 tavern_commands=[]', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你完成了 lcq.event.s01_02', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你重新掷骰，骰点为 1', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('月霜突然从草丛后现身。', plan.packet, plan.forbiddenNames), false);
  assert.equal(demo.isValidFastNarrativeText('段强扑向尸体，抢下短刀，又翻滚躲开箭矢。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('程宗扬扑向尸体，他抢下短刀又翻滚躲开箭矢。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你伏在草间。段强手里攥着一把弯刀，正望向远处。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你滚进草丛。段强贴在你身后，换着肩膀，脸色发白。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你滚进草丛。段强传来一声闷哼，像是被流矢擦过。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你攥紧手里的短刀，伏在草间。', plan.packet), true);
  assert.equal(demo.isValidFastNarrativeText('你把刀贴着腕子藏好，继续向前。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你收起短刀，翻滚避开箭矢。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你带走短刀，钻入草丛。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你伏低身子，刀刃贴着手腕，继续听着草外的动静。', plan.packet), true);
  assert.equal(demo.isValidFastNarrativeText('你伸手去抢短刀，随即翻滚避开箭矢。', plan.packet), true);
  assert.equal(demo.isValidFastNarrativeText('你从尸体攥紧的指缝里抽出一把短刀，随后手心一空，短刀脱了手，留在草丛里。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你伸手去抢短刀，刀从尸体指间脱落；你随即翻滚避箭，最后并未将刀带走。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('那柄短刀握在手里，沉甸甸的。你松开手指，让刀落进草丛里。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你夺过短刀，反手将短刀掷了出去；刀插在远处土坡上，你没有回头。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你反手将短刀掷向最近的半兽人，刀柄擦过肩甲，随即没入草丛深处。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('短刀脱手落地。你迟疑片刻，又把短刀收起。', plan.packet), false);
  const finalized = demo.finalizeFastNarrativeText('你伸手去抢短刀，随即翻滚避开箭矢。', plan.packet);
  assert.match(finalized, /乱草的缝隙里，段强仍在你视线可及之处，却谁也没有替你做出下一步选择/);
  assert.match(finalized, /那柄从尸体手中夺来的凡品短刀仍被你握在手中/);
  assert.equal(demo.finalizeFastNarrativeText(finalized, plan.packet), finalized);
  assert.equal(
    demo.finalizeFastNarrativeText('你收起短刀，起身继续向前。', plan.packet),
    first,
  );
  assert.deepEqual(demo.wrapFastNarrativeGmResponse(first), {
    text: first,
    mid_term_memory: '',
    tavern_commands: [],
    action_options: [],
  });
});

test('render validation and trusted coda follow the three locally settled knife states', async () => {
  const demo = await loadDemo();
  const cases = [
    {
      outcome: 'success', location: 'scene_held',
      valid: '你从尸体僵硬的指间抽出短刀，翻滚避箭后仍把刀握在手中。',
      conflict: '你没能拿到短刀，只得翻滚避箭。',
      coda: /凡品短刀仍被你握在手中/,
    },
    {
      outcome: 'partial', location: 'on_ground',
      valid: '你从尸体指间抽出短刀，翻滚时刀锋脱手落进草丛。',
      conflict: '你翻滚避箭后仍攥紧手里的短刀。',
      coda: /凡品短刀已从你手中脱落，留在身后的乱草与泥地间/,
    },
    {
      outcome: 'failure', location: 'at_corpse',
      valid: '你伸手去够尸体手里的短刀，却没能取到，随即翻滚避开箭矢。',
      conflict: '你从尸体指间抽出短刀，握紧刀柄翻滚避箭。',
      coda: /凡品短刀仍留在最近的尸体手中/,
    },
  ];
  for (const item of cases) {
    const { save, resolution } = await eligibleFixture({ resolve: { testOutcome: item.outcome } });
    const plan = demo.planFastNarrativeDemo(planInput(save, resolution));
    assert.equal(plan.packet.adjudication.location, item.location);
    assert.equal(demo.isValidFastNarrativeText(item.valid, plan.packet), true, item.outcome);
    assert.equal(demo.isValidFastNarrativeText(item.conflict, plan.packet), false, item.outcome);
    const finalized = demo.finalizeFastNarrativeText(item.valid, plan.packet);
    assert.match(finalized, item.coda);
    assert.equal(demo.finalizeFastNarrativeText(item.conflict, plan.packet), demo.buildFastNarrativeFallback(plan.packet));
  }
});

test('source path takes one text generate call and default-off keeps the legacy body', async () => {
  const demo = await loadDemo();
  const bidirectional = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const processFn = bidirectional.slice(
    bidirectional.indexOf('public async processPlayerAction'),
    bidirectional.indexOf('public async generateInitialMessage'),
  );
  const tryFn = bidirectional.slice(
    bidirectional.indexOf('private async tryFastNarrativeDemo'),
    bidirectional.indexOf('public async processPlayerAction'),
  );
  assert.ok(processFn.includes('tryFastNarrativeDemo'));
  assert.ok(processFn.indexOf('tryFastNarrativeDemo') < processFn.indexOf('createScenarioPromptState(v3'));
  assert.ok(processFn.includes('if (!fastNarrativeResponse)'));
  assert.match(tryFn, /FAST_NARRATIVE_GENERATE_OPTIONS/);
  assert.match(tryFn, /FAST_NARRATIVE_DEADLINE_MS/);
  assert.match(tryFn, /hasOtherActionContract/);
  assert.match(tryFn, /aiService\.generate\(/);
  assert.match(tryFn, /new AbortController\(\)/);
  assert.match(tryFn, /setTimeout\(/);
  assert.match(tryFn, /setInterval\(/);
  assert.match(tryFn, /signal: controller\.signal/);
  assert.match(tryFn, /clearTimeout\(deadline\)/);
  assert.match(tryFn, /clearInterval\(cancelWatcher\)/);
  assert.match(tryFn, /finalizeFastNarrativeText/);
  assert.equal(tryFn.includes('onStreamChunk'), false);
  assert.equal(tryFn.includes('vectorMemoryService'), false);
  assert.equal(tryFn.includes('narrativeRagService'), false);
  assert.equal(tryFn.includes('characterRagService'), false);
  assert.equal(tryFn.includes('optimizeText'), false);
  assert.equal(tryFn.includes('shouldActuallySplit'), false);
  assert.ok(tryFn.indexOf('if (!plan) return null') < tryFn.indexOf('aiService.generate'));
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.usageType, 'main');
  assert.equal(demo.FAST_NARRATIVE_MAX_TOKENS, 1024);
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.maxTokens, 1024);
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.maxTokens, demo.FAST_NARRATIVE_MAX_TOKENS);
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.requestMaxRetries, 0);
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.responseMode, 'text');
  assert.equal(demo.FAST_NARRATIVE_GENERATE_OPTIONS.should_stream, false);
  assert.equal(demo.FAST_NARRATIVE_DEADLINE_MS, 35_000);

  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /options\.judgementResolution = structuredClone\(execution\.resolution\)/);
  assert.equal(panel.includes('planFastNarrativeDemo'), false);
  assert.equal(panel.includes('buildFastNarrativeFallback'), false);
});

test('actorless core rejects invented facts and appends trusted codas once', async () => {
  const demo = await loadDemo();
  const { save, resolution } = await eligibleFixture();
  const plan = demo.planFastNarrativeDemo(planInput(save, resolution));
  const prompt = `${plan.systemPrompt}\n${plan.userPrompt}`;
  const presenceCoda = '乱草的缝隙里，段强仍在你视线可及之处，却谁也没有替你做出下一步选择。';
  const knifeCoda = '这一阵动作过去，那柄从尸体手中夺来的凡品短刀仍被你握在手中，但尚未收进正式背包。';
  const playerOnly = '你猛地扑向最近的一具尸体，从僵硬指间抽出短刀，随即借着草丛翻滚，箭矢擦着耳畔钉进泥土。泥土的腥气灌进鼻腔，你把身体压进草根里，听着风声从草尖掠过。';

  assert.equal(prompt.includes('段强'), false);
  assert.match(prompt, /只写“你”和由该行动直接引起的可感知环境/);
  assert.match(prompt, /不得提及任何其他人、生物或行动者/);
  assert.equal(demo.isValidFastNarrativeText('你伏在草间。段强仍在附近。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你滚进草丛。段强无声地朝你比了个手势。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你半跪在草里。段强的身影也从草叶间直起腰来。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你握紧短刀。段强还在原处，脸色铁青，嘴唇在动却听不见声音。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你滚入草丛。半兽人的嚎叫还在逼近。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你伏低身子。弓手正在重新拉弦。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你屏住呼吸。骑兵在草线外徘徊。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你贴进草根。追兵未远。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你握紧短刀，足够切开下一个扑上来的敌人。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你蹲伏在草中，看见逼近的人影。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你听见他们的狼骑从草丛间穿行。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你半跪在草丛里。另一具尸体的腰带上别着一块皮甲护腕。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你翻滚时撕破了衣袖，小臂上蹭出了血痕。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('刃口割进你的掌心。血。你掌心全是血。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你贴在草窝里。半兽人的追兵从你左侧二十步外掠过。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你抬头辨认前方，距离最近的敌人还有约二十步。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText('你把身体压进草根，听着二十步外的动静。', plan.packet), false);
  assert.equal(demo.isValidFastNarrativeText(playerOnly, plan.packet), true);

  const finalized = demo.finalizeFastNarrativeText(playerOnly, plan.packet);
  assert.equal(finalized.includes(presenceCoda), true);
  assert.equal(finalized.includes(knifeCoda), true);
  assert.equal(finalized.split(presenceCoda).length - 1, 1);
  assert.equal(finalized.split(knifeCoda).length - 1, 1);
  assert.equal(finalized.startsWith(playerOnly), true);
  assert.equal(demo.finalizeFastNarrativeText(finalized, plan.packet), finalized);
  assert.equal(demo.isValidFastNarrativeText(finalized, plan.packet), true);

  const fallback = demo.buildFastNarrativeFallback(plan.packet);
  assert.equal(fallback, demo.buildFastNarrativeFallback(plan.packet));
  assert.ok(demo.isValidFastNarrativeText(fallback, plan.packet));
  assert.equal(fallback.split(presenceCoda).length - 1, 1);
  assert.equal(fallback.split(knifeCoda).length - 1, 1);
  assert.equal(fallback.includes('半兽人'), false);
  assert.equal(fallback.includes('皮甲护腕'), false);
  assert.equal(fallback.includes('tavern_commands'), false);
  assert.equal(fallback.includes('lcq.event'), false);
  assert.equal(fallback.includes('judge-'), false);
  assert.equal(demo.finalizeFastNarrativeText(fallback, plan.packet), fallback);
});

test('AIService responseMode stays compatible, text overrides forceJson, json_object forces JSON', async () => {
  const { resolveGenerateResponseFormat, aiService } = await loadTs('../src/services/aiService.ts');
  assert.equal(resolveGenerateResponseFormat({}, { forceJsonOutput: true }), 'json_object');
  assert.equal(resolveGenerateResponseFormat({ responseMode: 'configured' }, { forceJsonOutput: true }), 'json_object');
  assert.equal(resolveGenerateResponseFormat({ responseMode: 'text' }, { forceJsonOutput: true }), undefined);
  assert.equal(resolveGenerateResponseFormat({ responseMode: 'text', responseFormat: 'json_object' }, { forceJsonOutput: true }), undefined);
  assert.equal(resolveGenerateResponseFormat({ responseMode: 'json_object' }, { forceJsonOutput: false }), 'json_object');
  assert.equal(resolveGenerateResponseFormat({ responseFormat: 'json_object' }, null), 'json_object');
  assert.equal(resolveGenerateResponseFormat({}, null), undefined);

  const originalPost = axios.post;
  const bodies = [];
  axios.post = (_url, body) => {
    bodies.push(body);
    return Promise.resolve({ data: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } });
  };
  const apiConfig = {
    provider: 'openai',
    url: 'https://example.test/v1',
    apiKey: 'key',
    model: 'deepseek/deepseek-v4-flash-0731',
    temperature: 0.6,
    maxTokens: 20000,
  };
  try {
    await aiService.generateWithAPIConfig(
      { user_input: 'default', should_stream: false, requestMaxRetries: 0 },
      apiConfig,
    );
    await aiService.generateWithAPIConfig(
      { user_input: 'text', should_stream: false, requestMaxRetries: 0, responseMode: 'text' },
      apiConfig,
    );
    await aiService.generateWithAPIConfig(
      { user_input: 'json', should_stream: false, requestMaxRetries: 0, responseMode: 'json_object' },
      apiConfig,
    );
  } finally {
    axios.post = originalPost;
  }
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0].response_format, undefined);
  assert.equal(bodies[1].response_format, undefined);
  assert.deepEqual(bodies[2].response_format, { type: 'json_object' });
});
